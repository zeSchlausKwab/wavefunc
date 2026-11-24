use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::process::Stdio;
use std::sync::Mutex;

use base64::{engine::general_purpose::URL_SAFE_NO_PAD as BASE64, Engine as _};
use reqwest::header::{AUTHORIZATION, CONTENT_LENGTH, CONTENT_TYPE};
use sha2::{Digest, Sha256};
use tokio::fs;
use tokio::io::AsyncReadExt;
use tokio::process::Command;
use tokio_util::io::ReaderStream;
use url::Url;

use crate::error::{Result, WavefuncError};
use crate::models::{PreparedMedia, UploadedMedia};

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

        let ytdlp = std::env::var("WAVEFUNC_YTDLP_PATH").unwrap_or_else(|_| {
            if cfg!(windows) {
                "yt-dlp.exe".to_string()
            } else {
                "yt-dlp".to_string()
            }
        });
        let output_template = dir.join("media.%(ext)s");
        let video_url = format!("https://www.youtube.com/watch?v={video_id}");

        let mut cmd = Command::new(&ytdlp);
        cmd.kill_on_drop(true)
            .stdin(Stdio::null())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .arg("--no-playlist")
            .arg("--no-warnings")
            .arg("--newline")
            .arg("--output")
            .arg(&output_template);

        if let Ok(deno) = std::env::var("WAVEFUNC_DENO_PATH") {
            if !deno.trim().is_empty() {
                cmd.arg("--js-runtimes").arg(format!("deno:{deno}"));
            }
        }

        let fmt_spec = match format {
            "p360" => "bestvideo[height<=360][ext=mp4]+bestaudio[ext=m4a]/best[height<=360]/best",
            "p480" => "bestvideo[height<=480][ext=mp4]+bestaudio[ext=m4a]/best[height<=480]/best",
            "p720" => "bestvideo[height<=720][ext=mp4]+bestaudio[ext=m4a]/best[height<=720]/best",
            _ => "bestaudio[ext=m4a]/bestaudio",
        };
        cmd.arg("--format").arg(fmt_spec).arg(&video_url);

        let output = cmd.output().await.map_err(|e| {
            WavefuncError::InvalidInput(format!(
                "Could not launch yt-dlp ({ytdlp}): {e}"
            ))
        })?;

        if !output.status.success() {
            let _ = fs::remove_dir_all(&dir).await;
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

        let file = find_downloaded_file(&dir).await?;
        let meta = fs::metadata(&file)
            .await
            .map_err(|e| WavefuncError::InvalidInput(format!("Metadata error: {e}")))?;
        let size = meta.len();
        let sha256 = hash_file(&file).await?;
        let mime_type = guess_mime(&file);

        let prepared = PreparedMedia {
            job_id: job_id.clone(),
            sha256: sha256.clone(),
            size,
            mime_type: mime_type.clone(),
        };

        if let Ok(mut guard) = self.jobs.lock() {
            guard.insert(
                job_id,
                MediaJob {
                    dir,
                    file,
                    sha256,
                    size,
                    mime_type,
                },
            );
        }

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
                let url = val
                    .get("url")
                    .and_then(|v| v.as_str())
                    .ok_or_else(|| {
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

async fn find_downloaded_file(dir: &Path) -> Result<PathBuf> {
    let mut entries = fs::read_dir(dir)
        .await
        .map_err(|e| WavefuncError::InvalidInput(format!("Read dir error: {e}")))?;
    while let Some(entry) = entries
        .next_entry()
        .await
        .map_err(|e| WavefuncError::InvalidInput(format!("Dir entry error: {e}")))?
    {
        let path = entry.path();
        if path.is_file() {
            return Ok(path);
        }
    }
    Err(WavefuncError::InvalidInput(
        "No downloaded media file produced".to_string(),
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
