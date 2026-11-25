use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::process::Stdio;
use std::sync::Mutex;

use base64::{engine::general_purpose::URL_SAFE_NO_PAD as BASE64, Engine as _};
use reqwest::header::{AUTHORIZATION, CONTENT_LENGTH, CONTENT_TYPE};
use serde_json::Value;
use sha2::{Digest, Sha256};
use tokio::fs;
use tokio::io::AsyncReadExt;
use tokio::process::Command;
use tokio_util::io::ReaderStream;
use url::Url;

use crate::error::{Result, WavefuncError};
use crate::models::{PreparedMedia, UploadedMedia, YouTubeSearchResult};

#[derive(Clone)]
struct MediaJob {
    dir: PathBuf,
    file: PathBuf,
    sha256: String,
    size: u64,
    mime_type: String,
}

/// Desktop media acquisition engine (`yt-dlp` download -> SHA-256 -> Blossom upload),
/// ported cleanly out of `src-tauri/plugins/media-acquisition/src/desktop.rs` with zero Tauri dependency.
pub struct MediaAcquisitionManager {
    jobs: Mutex<HashMap<String, MediaJob>>,
}

impl Default for MediaAcquisitionManager {
    fn default() -> Self {
        Self::new()
    }
}

impl MediaAcquisitionManager {
    pub fn new() -> Self {
        Self {
            jobs: Mutex::new(HashMap::new()),
        }
    }

    /// Fast local `yt-dlp --flat-playlist --dump-single-json ytsearchN:<query>` search on desktop.
    pub async fn search_youtube_local(
        &self,
        query: &str,
        limit: u32,
    ) -> Result<Vec<YouTubeSearchResult>> {
        let trimmed = query.trim();
        if trimmed.is_empty() {
            return Ok(Vec::new());
        }
        let ytdlp = resolve_ytdlp_binary();
        let count = limit.clamp(1, 10);
        let output = Command::new(&ytdlp)
            .kill_on_drop(true)
            .stdin(Stdio::null())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .arg("--flat-playlist")
            .arg("--dump-single-json")
            .arg("--no-warnings")
            .arg(format!("ytsearch{count}:{trimmed}"))
            .output()
            .await
            .map_err(|e| WavefuncError::InvalidInput(format!("yt-dlp search failed: {e}")))?;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            return Err(WavefuncError::InvalidInput(format!(
                "yt-dlp search failed: {}",
                stderr.lines().last().unwrap_or("unknown error")
            )));
        }

        let val: serde_json::Value = serde_json::from_slice(&output.stdout)?;
        let entries = val
            .get("entries")
            .and_then(|v| v.as_array())
            .cloned()
            .unwrap_or_default();

        let mut results = Vec::new();
        for e in entries {
            let Some(id) = e.get("id").and_then(|v| v.as_str()) else {
                continue;
            };
            let title = e
                .get("title")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();
            let url = e
                .get("url")
                .and_then(|v| v.as_str())
                .filter(|u| u.starts_with("http"))
                .map(str::to_string)
                .unwrap_or_else(|| format!("https://www.youtube.com/watch?v={id}"));
            let duration_secs = e
                .get("duration")
                .and_then(|v| v.as_f64())
                .map(|d| d.max(0.0).round() as u64);
            let channel = e
                .get("channel")
                .or_else(|| e.get("uploader"))
                .and_then(|v| v.as_str())
                .map(str::to_string);
            let thumbnail_url = e
                .get("thumbnail")
                .and_then(|v| v.as_str())
                .or_else(|| {
                    e.get("thumbnails")
                        .and_then(|v| v.as_array())
                        .and_then(|arr| arr.last())
                        .and_then(|t| t.get("url"))
                        .and_then(|v| v.as_str())
                })
                .map(str::to_string);
            results.push(YouTubeSearchResult {
                video_id: id.to_string(),
                url,
                title,
                duration_secs,
                channel,
                thumbnail_url,
            });
        }
        Ok(results)
    }

    pub async fn prepare_youtube_media(
        &self,
        cache_root: &str,
        video_id: &str,
        format: &str,
    ) -> Result<PreparedMedia> {
        validate_video_id(video_id)?;
        let job_id = uuid::Uuid::new_v4().to_string();
        let dir = PathBuf::from(cache_root).join("media-jobs").join(&job_id);
        fs::create_dir_all(&dir)
            .await
            .map_err(|e| WavefuncError::InvalidInput(format!("Cache dir error: {e}")))?;

        let result = self
            .download_and_register(&dir, &job_id, video_id, format)
            .await;
        if result.is_err() {
            let _ = fs::remove_dir_all(&dir).await;
        }
        result
    }

    async fn download_and_register(
        &self,
        dir: &Path,
        job_id: &str,
        video_id: &str,
        format: &str,
    ) -> Result<PreparedMedia> {
        let ytdlp = resolve_ytdlp_binary();
        let output_template = dir.join("media.%(ext)s");
        let video_url = format!("https://www.youtube.com/watch?v={video_id}");

        let mut cmd = Command::new(&ytdlp);
        // GUI launchers may omit the directory where the user's package manager
        // installed yt-dlp and its companions (ffmpeg and Deno).
        if let Some(bin) = Path::new(&ytdlp).parent().filter(|p| p.is_absolute()) {
            let path = std::env::var_os("PATH").unwrap_or_default();
            let dirs = std::iter::once(bin.to_owned()).chain(std::env::split_paths(&path));
            if let Ok(path) = std::env::join_paths(dirs) {
                cmd.env("PATH", path);
            }
        }
        cmd.kill_on_drop(true)
            .stdin(Stdio::null())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .arg("--no-playlist")
            .arg("--no-warnings")
            .arg("--newline")
            .args(["--merge-output-format", "mp4"])
            .arg("--output")
            .arg(&output_template);

        if let Ok(deno) = std::env::var("WAVEFUNC_DENO_PATH") {
            if !deno.trim().is_empty() {
                cmd.arg("--js-runtimes").arg(format!("deno:{deno}"));
            }
        }

        let fmt_spec = match format {
            "p360" | "360p" => {
                "bestvideo[height<=360][ext=mp4]+bestaudio[ext=m4a]/best[height<=360][ext=mp4]"
            }
            "p480" | "480p" => {
                "bestvideo[height<=480][ext=mp4]+bestaudio[ext=m4a]/best[height<=480][ext=mp4]"
            }
            "p720" | "720p" => {
                "bestvideo[height<=720][ext=mp4]+bestaudio[ext=m4a]/best[height<=720][ext=mp4]"
            }
            "audio" => "bestaudio[ext=m4a]/bestaudio",
            _ => return Err(WavefuncError::InvalidInput("Invalid media format".into())),
        };
        cmd.arg("--format").arg(fmt_spec).arg(&video_url);

        let output = cmd.output().await.map_err(|e| {
            WavefuncError::InvalidInput(if e.kind() == std::io::ErrorKind::NotFound {
                "Install yt-dlp on this computer, or set WAVEFUNC_YTDLP_PATH to its executable."
                    .to_string()
            } else {
                format!("Could not launch yt-dlp ({ytdlp}): {e}")
            })
        })?;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            let tail: String = stderr
                .lines()
                .rev()
                .take(4)
                .collect::<Vec<_>>()
                .into_iter()
                .rev()
                .collect::<Vec<_>>()
                .join(" | ");
            return Err(WavefuncError::InvalidInput(format!(
                "yt-dlp download failed: {tail}"
            )));
        }

        let file = find_downloaded_file(dir, format).await?;
        self.register_job(job_id, dir, file).await
    }

    /// Adopt a completed Android download from the app's private cache. The bridge
    /// accepts a job ID and format so the caller cannot nominate an arbitrary file.
    pub async fn register_downloaded_media(
        &self,
        cache_root: &str,
        job_id: &str,
        format: &str,
    ) -> Result<PreparedMedia> {
        if !uuid::Uuid::parse_str(job_id).is_ok_and(|id| id.to_string() == job_id) {
            return Err(WavefuncError::InvalidInput("Invalid media job ID".into()));
        }
        let filename = match format {
            "audio" => "media.m4a",
            "360p" | "480p" | "720p" => "media.mp4",
            _ => return Err(WavefuncError::InvalidInput("Invalid media format".into())),
        };
        let root = fs::canonicalize(cache_root)
            .await
            .map_err(|e| WavefuncError::InvalidInput(format!("Media cache unavailable: {e}")))?;
        let dir = root.join("media-jobs").join(job_id);
        let file = dir.join(filename);
        let actual = fs::canonicalize(&file).await.map_err(|e| {
            WavefuncError::InvalidInput(format!("Downloaded media unavailable: {e}"))
        })?;
        if actual != file {
            return Err(WavefuncError::InvalidInput(
                "Unexpected media cache path".into(),
            ));
        }
        self.register_job(job_id, &dir, file).await
    }

    async fn register_job(&self, job_id: &str, dir: &Path, file: PathBuf) -> Result<PreparedMedia> {
        let meta = fs::metadata(&file)
            .await
            .map_err(|e| WavefuncError::InvalidInput(format!("Media metadata error: {e}")))?;
        if !meta.is_file() || meta.len() == 0 {
            return Err(WavefuncError::InvalidInput(
                "Downloaded media file is empty or invalid".into(),
            ));
        }
        let size = meta.len();
        let sha256 = hash_file(&file).await?;
        let mime_type = guess_mime(&file);

        let prepared = PreparedMedia {
            job_id: job_id.to_owned(),
            sha256: sha256.clone(),
            size,
            mime_type: mime_type.clone(),
        };
        let job = MediaJob {
            dir: dir.to_owned(),
            file,
            sha256,
            size,
            mime_type,
        };
        self.jobs
            .lock()
            .map_err(|_| WavefuncError::InvalidInput("Media job store unavailable".into()))?
            .insert(job_id.to_owned(), job);
        Ok(prepared)
    }

    pub async fn upload_to_blossom(
        &self,
        http: &reqwest::Client,
        job_id: &str,
        blossom_url: &str,
        signed_auth_event_json: &str,
    ) -> Result<UploadedMedia> {
        let job = self
            .jobs
            .lock()
            .ok()
            .and_then(|g| g.get(job_id).cloned())
            .ok_or_else(|| {
                WavefuncError::InvalidInput("Prepared media job not found".to_string())
            })?;

        let mut upload_url = Url::parse(blossom_url.trim())
            .map_err(|e| WavefuncError::InvalidInput(format!("Invalid Blossom URL: {e}")))?;
        upload_url.set_path(&format!(
            "{}/upload",
            upload_url.path().trim_end_matches('/')
        ));

        let file = fs::File::open(&job.file)
            .await
            .map_err(|e| WavefuncError::InvalidInput(format!("Open media file failed: {e}")))?;
        let stream = ReaderStream::new(file);
        let auth = format!("Nostr {}", BASE64.encode(signed_auth_event_json.as_bytes()));

        let resp = http
            .put(upload_url)
            // Media uploads can span minutes on a phone. Match the lifetime of
            // the Blossom authorization instead of the metadata client's timeout.
            .timeout(std::time::Duration::from_secs(600))
            .header(AUTHORIZATION, auth)
            .header(CONTENT_TYPE, &job.mime_type)
            .header(CONTENT_LENGTH, job.size)
            .header("X-SHA-256", &job.sha256)
            .body(reqwest::Body::wrap_stream(stream))
            .send()
            .await;

        let result = match resp {
            Ok(r) if r.status().is_success() => {
                let val: serde_json::Value = r.json().await?;
                let url = val.get("url").and_then(|v| v.as_str()).ok_or_else(|| {
                    WavefuncError::InvalidInput("Blossom response missing url".to_string())
                })?;
                Ok(UploadedMedia {
                    url: url.to_string(),
                    sha256: val
                        .get("sha256")
                        .and_then(|v| v.as_str())
                        .unwrap_or(&job.sha256)
                        .to_string(),
                    size: val.get("size").and_then(|v| v.as_u64()).unwrap_or(job.size),
                    mime_type: job.mime_type.clone(),
                })
            }
            Ok(r) => {
                let code = r.status().as_u16();
                let body = r.text().await.unwrap_or_default();
                Err(WavefuncError::InvalidInput(format!(
                    "Blossom upload failed ({code}): {}",
                    body.chars().take(240).collect::<String>()
                )))
            }
            Err(e) => Err(WavefuncError::Http(e)),
        };

        let _ = self.discard_job(job_id).await;
        result
    }

    pub async fn discard_job(&self, job_id: &str) -> Result<()> {
        let removed = self.jobs.lock().ok().and_then(|mut g| g.remove(job_id));
        if let Some(job) = removed {
            let _ = fs::remove_dir_all(job.dir).await;
        }
        Ok(())
    }
}

fn resolve_ytdlp_binary() -> String {
    if let Ok(explicit) = std::env::var("WAVEFUNC_YTDLP_PATH") {
        let trimmed = explicit.trim();
        if !trimmed.is_empty() {
            return trimmed.to_string();
        }
    }
    if cfg!(windows) {
        return "yt-dlp.exe".to_string();
    }
    for candidate in [
        "/opt/homebrew/bin/yt-dlp",
        "/usr/local/bin/yt-dlp",
        "/usr/bin/yt-dlp",
        "/Library/Frameworks/Python.framework/Versions/3.13/bin/yt-dlp",
        "/Library/Frameworks/Python.framework/Versions/3.12/bin/yt-dlp",
        "/Library/Frameworks/Python.framework/Versions/3.11/bin/yt-dlp",
    ] {
        if Path::new(candidate).is_file() {
            return candidate.to_string();
        }
    }
    "yt-dlp".to_string()
}

fn validate_video_id(video_id: &str) -> Result<()> {
    if video_id.len() == 11
        && video_id
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || b == b'_' || b == b'-')
    {
        Ok(())
    } else {
        Err(WavefuncError::InvalidInput(
            "Invalid YouTube video ID".to_string(),
        ))
    }
}

async fn find_downloaded_file(dir: &Path, format: &str) -> Result<PathBuf> {
    // Exclude unmerged streams, partial downloads and sidecar files.
    let filenames: &[&str] = if format == "audio" {
        &["media.m4a", "media.webm", "media.opus", "media.ogg", "media.mp3"]
    } else {
        &["media.mp4"]
    };
    for filename in filenames {
        let path = dir.join(filename);
        if fs::metadata(&path).await.is_ok_and(|meta| meta.is_file()) {
            return Ok(path);
        }
    }
    Err(WavefuncError::InvalidInput(
        "yt-dlp did not produce a finished media file. Install ffmpeg to combine video and audio tracks.".to_string(),
    ))
}

async fn hash_file(path: &Path) -> Result<String> {
    let mut file = fs::File::open(path)
        .await
        .map_err(|e| WavefuncError::InvalidInput(format!("Hash open error: {e}")))?;
    let mut hasher = Sha256::new();
    let mut buf = vec![0u8; 64 * 1024];
    loop {
        let n = file
            .read(&mut buf)
            .await
            .map_err(|e| WavefuncError::InvalidInput(format!("Hash read error: {e}")))?;
        if n == 0 {
            break;
        }
        hasher.update(&buf[..n]);
    }
    let digest = hasher.finalize();
    Ok(digest.iter().map(|b| format!("{b:02x}")).collect())
}

fn guess_mime(path: &Path) -> String {
    match path
        .extension()
        .and_then(|e| e.to_str())
        .map(|e| e.to_ascii_lowercase())
        .as_deref()
    {
        Some("m4a") | Some("mp4a") => "audio/mp4".to_string(),
        Some("mp3") => "audio/mpeg".to_string(),
        Some("opus") | Some("ogg") => "audio/ogg".to_string(),
        Some("webm") => "audio/webm".to_string(),
        Some("mp4") => "video/mp4".to_string(),
        _ => "application/octet-stream".to_string(),
    }
}

pub(crate) async fn search_youtube_web(
    http: &reqwest::Client,
    query: &str,
    limit: u32,
) -> Result<Vec<YouTubeSearchResult>> {
    let mut url = reqwest::Url::parse("https://www.youtube.com/results")
        .map_err(|e| WavefuncError::InvalidInput(e.to_string()))?;
    url.query_pairs_mut()
        .append_pair("search_query", query.trim());

    let html = http
        .get(url)
        .header(
            reqwest::header::USER_AGENT,
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
        )
        .header(reqwest::header::ACCEPT_LANGUAGE, "en-US,en;q=0.9")
        .send()
        .await?
        .error_for_status()?
        .text()
        .await?;

    let marker = "var ytInitialData = ";
    let start = html
        .find(marker)
        .map(|i| i + marker.len())
        .or_else(|| {
            html.find("ytInitialData = ")
                .map(|i| i + "ytInitialData = ".len())
        })
        .ok_or_else(|| {
            WavefuncError::InvalidInput("YouTube search page returned no data".into())
        })?;
    let rest = &html[start..];
    let end = rest
        .find(";</script>")
        .or_else(|| rest.find(";\n"))
        .ok_or_else(|| WavefuncError::InvalidInput("Could not parse YouTube search JSON".into()))?;

    let root: Value = serde_json::from_str(&rest[..end])?;
    let mut out = Vec::new();
    let max_items = limit.clamp(1, 10) as usize;
    collect_video_renderers(&root, &mut out, max_items);
    Ok(out)
}

fn parse_duration_text(text: &str) -> Option<u64> {
    let parts: Vec<u64> = text
        .trim()
        .split(':')
        .map(|p| p.trim().parse::<u64>().ok())
        .collect::<Option<Vec<_>>>()?;
    match parts.as_slice() {
        [m, s] => Some(m * 60 + s),
        [h, m, s] => Some(h * 3600 + m * 60 + s),
        _ => None,
    }
}

fn collect_video_renderers(val: &Value, out: &mut Vec<YouTubeSearchResult>, max_items: usize) {
    if out.len() >= max_items {
        return;
    }
    match val {
        Value::Object(map) => {
            if let Some(vr) = map.get("videoRenderer").and_then(Value::as_object) {
                if let Some(video_id) = vr.get("videoId").and_then(Value::as_str) {
                    if !video_id.is_empty() && !out.iter().any(|x| x.video_id == video_id) {
                        let title = vr
                            .get("title")
                            .and_then(|t| t.get("runs"))
                            .and_then(Value::as_array)
                            .and_then(|arr| arr.first())
                            .and_then(|r| r.get("text"))
                            .and_then(Value::as_str)
                            .unwrap_or("")
                            .to_string();
                        if !title.is_empty() {
                            let channel = vr
                                .get("ownerText")
                                .and_then(|t| t.get("runs"))
                                .and_then(Value::as_array)
                                .and_then(|arr| arr.first())
                                .and_then(|r| r.get("text"))
                                .and_then(Value::as_str)
                                .map(str::to_string);
                            let duration_secs = vr
                                .get("lengthText")
                                .and_then(|t| t.get("simpleText"))
                                .and_then(Value::as_str)
                                .and_then(parse_duration_text);
                            let thumbnail_url = vr
                                .get("thumbnail")
                                .and_then(|t| t.get("thumbnails"))
                                .and_then(Value::as_array)
                                .and_then(|arr| arr.last())
                                .and_then(|t| t.get("url"))
                                .and_then(Value::as_str)
                                .map(str::to_string);
                            out.push(YouTubeSearchResult {
                                video_id: video_id.to_string(),
                                url: format!("https://www.youtube.com/watch?v={video_id}"),
                                title,
                                duration_secs,
                                channel,
                                thumbnail_url,
                            });
                        }
                    }
                }
            }
            for child in map.values() {
                if out.len() >= max_items {
                    break;
                }
                collect_video_renderers(child, out, max_items);
            }
        }
        Value::Array(arr) => {
            for child in arr {
                if out.len() >= max_items {
                    break;
                }
                collect_video_renderers(child, out, max_items);
            }
        }
        _ => {}
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn desktop_video_requires_a_finished_container() {
        let dir = std::env::temp_dir().join(uuid::Uuid::new_v4().to_string());
        fs::create_dir(&dir).await.unwrap();
        for name in ["media.f137.mp4", "media.f140.m4a", "media.part", "media.jpg"] {
            fs::write(dir.join(name), b"sidecar").await.unwrap();
        }
        assert!(find_downloaded_file(&dir, "720p").await.is_err());
        let finished = dir.join("media.mp4");
        fs::write(&finished, b"merged").await.unwrap();
        assert_eq!(find_downloaded_file(&dir, "720p").await.unwrap(), finished);
        fs::remove_dir_all(dir).await.unwrap();
    }

    #[tokio::test]
    async fn registers_finished_android_downloads_for_local_upload_and_discard() {
        let root = std::env::temp_dir().join(uuid::Uuid::new_v4().to_string());
        let core = crate::WavefuncCore::new(crate::CoreConfig::default());
        for (format, filename, mime) in [
            ("audio", "media.m4a", "audio/mp4"),
            ("720p", "media.mp4", "video/mp4"),
        ] {
            let job_id = uuid::Uuid::new_v4().to_string();
            let dir = root.join("media-jobs").join(&job_id);
            fs::create_dir_all(&dir).await.unwrap();
            fs::write(dir.join(filename), b"abc").await.unwrap();
            let prepared = core
                .register_downloaded_media(root.to_str().unwrap(), &job_id, format)
                .await
                .unwrap();
            assert_eq!(prepared.job_id, format!("local:{job_id}"));
            assert_eq!(prepared.mime_type, mime);
            assert_eq!(prepared.size, 3);
            assert_eq!(
                prepared.sha256,
                "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
            );

            core.discard_media_job(&prepared.job_id).await.unwrap();
            assert!(!dir.exists());
        }
        fs::remove_dir_all(root).await.unwrap();
    }

    #[tokio::test]
    async fn rejects_paths_outside_job_and_incomplete_android_downloads() {
        let root = std::env::temp_dir().join(uuid::Uuid::new_v4().to_string());
        let cache = root.to_str().unwrap();
        let job_id = uuid::Uuid::new_v4().to_string();
        let dir = root.join("media-jobs").join(&job_id);
        fs::create_dir_all(&dir).await.unwrap();
        let manager = MediaAcquisitionManager::new();
        assert!(manager
            .register_downloaded_media(cache, "../x", "audio")
            .await
            .is_err());
        fs::write(dir.join("source.m4a"), b"unprocessed")
            .await
            .unwrap();
        assert!(manager
            .register_downloaded_media(cache, &job_id, "audio")
            .await
            .is_err());
        fs::write(dir.join("media.mp4"), b"").await.unwrap();
        assert!(manager
            .register_downloaded_media(cache, &job_id, "360p")
            .await
            .is_err());
        #[cfg(unix)]
        {
            std::os::unix::fs::symlink(dir.join("source.m4a"), dir.join("media.m4a")).unwrap();
            assert!(manager
                .register_downloaded_media(cache, &job_id, "audio")
                .await
                .is_err());
        }
        assert!(manager.jobs.lock().unwrap().is_empty());
        fs::remove_dir_all(root).await.unwrap();
    }
}
