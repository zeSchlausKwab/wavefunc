use std::{
    collections::HashMap,
    path::{Path, PathBuf},
    process::Stdio,
    sync::{Arc, Mutex},
};

use base64::{engine::general_purpose::URL_SAFE_NO_PAD as BASE64, Engine as _};
use reqwest::header::{AUTHORIZATION, CONTENT_LENGTH, CONTENT_TYPE};
use serde::de::DeserializeOwned;
use sha2::{Digest, Sha256};
use tauri::{ipc::Channel, plugin::PluginApi, AppHandle, Manager, Runtime};
use tokio::{fs, io::AsyncReadExt, process::Command};
use tokio_util::io::ReaderStream;
use url::Url;

use crate::{
    Error, MediaFormat, PreparationState, PreparationStatus, PrepareRequest, PreparedMedia, Result,
    UploadRequest, UploadedMedia,
};

#[derive(Clone)]
struct Job {
    dir: PathBuf,
    file: PathBuf,
    sha256: String,
    size: u64,
    mime_type: String,
}

pub fn init<R: Runtime, C: DeserializeOwned>(
    app: &AppHandle<R>,
    _api: PluginApi<R, C>,
) -> Result<WavefuncMedia<R>> {
    Ok(WavefuncMedia {
        app: app.clone(),
        jobs: Arc::new(Mutex::new(HashMap::new())),
        preparations: Arc::new(Mutex::new(HashMap::new())),
    })
}

pub struct WavefuncMedia<R: Runtime> {
    app: AppHandle<R>,
    jobs: Arc<Mutex<HashMap<String, Job>>>,
    preparations: Arc<Mutex<HashMap<String, PreparationStatus>>>,
}

impl<R: Runtime> WavefuncMedia<R> {
    pub async fn prepare(&self, payload: PrepareRequest) -> Result<PreparedMedia> {
        validate_video_id(&payload.video_id)?;
        validate_job_id(&payload.job_id)?;

        let job_id = payload.job_id.clone();
        self.preparations
            .lock()
            .map_err(|_| Error::Message("Media preparation store is unavailable.".into()))?
            .insert(
                job_id.clone(),
                PreparationStatus {
                    state: PreparationState::Preparing,
                    media: None,
                    error: None,
                },
            );
        let cache_root = self
            .app
            .path()
            .app_cache_dir()
            .map_err(|error| Error::Message(error.to_string()))?
            .join("media-jobs");
        let dir = cache_root.join(&job_id);
        fs::create_dir_all(&dir).await?;

        let result = self.download(&payload, &dir).await;
        let (file, sha256, size, mime_type) = match result {
            Ok(result) => result,
            Err(error) => {
                let _ = fs::remove_dir_all(&dir).await;
                self.preparations
                    .lock()
                    .map_err(|_| Error::Message("Media preparation store is unavailable.".into()))?
                    .insert(
                        job_id,
                        PreparationStatus {
                            state: PreparationState::Failed,
                            media: None,
                            error: Some(error.to_string()),
                        },
                    );
                return Err(error);
            }
        };

        let job = Job {
            dir,
            file,
            sha256: sha256.clone(),
            size,
            mime_type: mime_type.clone(),
        };
        self.jobs
            .lock()
            .map_err(|_| Error::Message("Media job store is unavailable.".into()))?
            .insert(job_id.clone(), job);

        let prepared = PreparedMedia {
            job_id,
            sha256,
            size,
            mime_type,
        };
        self.preparations
            .lock()
            .map_err(|_| Error::Message("Media preparation store is unavailable.".into()))?
            .insert(
                prepared.job_id.clone(),
                PreparationStatus {
                    state: PreparationState::Prepared,
                    media: Some(prepared.clone()),
                    error: None,
                },
            );
        Ok(prepared)
    }

    pub async fn status(&self, job_id: String) -> Result<PreparationStatus> {
        validate_job_id(&job_id)?;
        Ok(self
            .preparations
            .lock()
            .map_err(|_| Error::Message("Media preparation store is unavailable.".into()))?
            .get(&job_id)
            .cloned()
            .unwrap_or(PreparationStatus {
                state: PreparationState::Missing,
                media: None,
                error: None,
            }))
    }

    async fn download(
        &self,
        payload: &PrepareRequest,
        dir: &Path,
    ) -> Result<(PathBuf, String, u64, String)> {
        let binary = resolve_executable(
            &self.app,
            "WAVEFUNC_YTDLP_PATH",
            if cfg!(windows) {
                "yt-dlp.exe"
            } else {
                "yt-dlp"
            },
            Some(repo_development_binary("contextvm/bin/yt-dlp")),
        )?;
        let output_template = dir.join("media.%(ext)s");
        let deno = resolve_executable(&self.app, "WAVEFUNC_DENO_PATH", bundled_deno_name(), None)?;
        let video_url = format!("https://www.youtube.com/watch?v={}", payload.video_id);

        let mut command = Command::new(binary);
        command
            .kill_on_drop(true)
            .stdin(Stdio::null())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .arg("--no-playlist")
            .arg("--no-warnings")
            .arg("--newline")
            .arg("--js-runtimes")
            .arg(format!("deno:{}", deno.display()))
            .arg("--print")
            .arg("after_move:filepath")
            .arg("--output")
            .arg(&output_template);

        match payload.format {
            MediaFormat::Audio => {
                command.arg("--format").arg("bestaudio[ext=m4a]/bestaudio");
            }
            MediaFormat::P360 => {
                command
                    .arg("--format")
                    .arg("bestvideo[height<=360][ext=mp4]+bestaudio[ext=m4a]/bestvideo[height<=360]+bestaudio/best[height<=360]/bestvideo+bestaudio/best");
            }
            MediaFormat::P480 => {
                command
                    .arg("--format")
                    .arg("bestvideo[height<=480][ext=mp4]+bestaudio[ext=m4a]/bestvideo[height<=480]+bestaudio/best[height<=480]/bestvideo+bestaudio/best");
            }
            MediaFormat::P720 => {
                command
                    .arg("--format")
                    .arg("bestvideo[height<=720][ext=mp4]+bestaudio[ext=m4a]/bestvideo[height<=720]+bestaudio/best[height<=720]/bestvideo+bestaudio/best");
            }
        }
        command.arg(video_url);

        let output = command.output().await.map_err(|error| {
            Error::Message(format!("Could not start the local media engine: {error}"))
        })?;
        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            let detail = useful_error_tail(&stderr);
            return Err(Error::Message(format!(
                "Local media download failed: {detail}"
            )));
        }

        let file = find_downloaded_file(dir).await?;
        let metadata = fs::metadata(&file).await?;
        let size = metadata.len();
        let sha256 = hash_file(&file).await?;
        let mime_type = mime_guess::from_path(&file)
            .first_or_octet_stream()
            .essence_str()
            .to_owned();
        Ok((file, sha256, size, mime_type))
    }

    pub async fn upload(&self, payload: UploadRequest) -> Result<UploadedMedia> {
        let job = self
            .jobs
            .lock()
            .map_err(|_| Error::Message("Media job store is unavailable.".into()))?
            .get(&payload.job_id)
            .cloned()
            .ok_or_else(|| {
                Error::Message("Local media file was not found. Download it again.".into())
            })?;

        let upload_url = blossom_upload_url(&payload.blossom_url)?;
        validate_auth_event(
            &payload.signed_auth_event,
            &job.sha256,
            upload_url.host_str().unwrap_or_default(),
        )?;

        let file = fs::File::open(&job.file).await?;
        let stream = ReaderStream::new(file);
        let auth = format!(
            "Nostr {}",
            BASE64.encode(payload.signed_auth_event.as_bytes())
        );
        let response = reqwest::Client::new()
            .put(upload_url)
            .header(AUTHORIZATION, auth)
            .header(CONTENT_TYPE, &job.mime_type)
            .header(CONTENT_LENGTH, job.size)
            .header("X-SHA-256", &job.sha256)
            .body(reqwest::Body::wrap_stream(stream))
            .send()
            .await;

        let result = match response {
            Ok(response) if response.status().is_success() => {
                let value: serde_json::Value = response.json().await?;
                let url = value
                    .get("url")
                    .and_then(|value| value.as_str())
                    .ok_or_else(|| Error::Message("Blossom returned no media URL.".into()))?;
                Ok(UploadedMedia {
                    url: url.to_owned(),
                    sha256: value
                        .get("sha256")
                        .and_then(|value| value.as_str())
                        .unwrap_or(&job.sha256)
                        .to_owned(),
                    size: value
                        .get("size")
                        .and_then(|value| value.as_u64())
                        .unwrap_or(job.size),
                    mime_type: job.mime_type.clone(),
                })
            }
            Ok(response) => {
                let status = response.status();
                let body = response.text().await.unwrap_or_default();
                Err(Error::Message(format!(
                    "Blossom upload failed ({status}): {}",
                    body.chars().take(300).collect::<String>()
                )))
            }
            Err(error) => Err(Error::Http(error)),
        };

        // A failed upload must start from a fresh hash and authorization. This
        // also guarantees large files do not linger in the application cache.
        let _ = self.discard(payload.job_id).await;
        result
    }

    pub async fn discard(&self, job_id: String) -> Result<()> {
        self.preparations
            .lock()
            .map_err(|_| Error::Message("Media preparation store is unavailable.".into()))?
            .remove(&job_id);
        let job = self
            .jobs
            .lock()
            .map_err(|_| Error::Message("Media job store is unavailable.".into()))?
            .remove(&job_id);
        if let Some(job) = job {
            match fs::remove_dir_all(job.dir).await {
                Ok(()) => {}
                Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
                Err(error) => return Err(error.into()),
            }
        }
        Ok(())
    }

    pub async fn cancel(&self, job_id: String) -> Result<()> {
        self.discard(job_id).await
    }

    pub fn register_listener(&self, _event: String, _handler: Channel<()>) -> Result<()> {
        Ok(())
    }

    pub fn remove_listener(&self, _event: String, _channel_id: u32) -> Result<()> {
        Ok(())
    }
}

fn validate_video_id(video_id: &str) -> Result<()> {
    if video_id.len() == 11
        && video_id
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || byte == b'_' || byte == b'-')
    {
        Ok(())
    } else {
        Err(Error::Message("Invalid YouTube video ID.".into()))
    }
}

fn validate_job_id(job_id: &str) -> Result<()> {
    if (8..=80).contains(&job_id.len())
        && job_id
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || byte == b'_' || byte == b'-')
    {
        Ok(())
    } else {
        Err(Error::Message("Invalid media job ID.".into()))
    }
}

fn blossom_upload_url(base: &str) -> Result<Url> {
    let base = Url::parse(base)?;
    if base.scheme() != "https" {
        return Err(Error::Message(
            "Blossom uploads require an HTTPS server.".into(),
        ));
    }
    Url::parse(&format!("{}/upload", base.as_str().trim_end_matches('/'))).map_err(Into::into)
}

fn validate_auth_event(raw: &str, hash: &str, server: &str) -> Result<()> {
    let event: serde_json::Value = serde_json::from_str(raw)?;
    if event.get("kind").and_then(|value| value.as_u64()) != Some(24242) {
        return Err(Error::Message("Invalid Blossom authorization kind.".into()));
    }
    let tags = event
        .get("tags")
        .and_then(|value| value.as_array())
        .ok_or_else(|| Error::Message("Invalid Blossom authorization tags.".into()))?;
    let tag_value = |name: &str| {
        tags.iter().find_map(|tag| {
            let values = tag.as_array()?;
            if values.first().and_then(|value| value.as_str()) == Some(name) {
                values.get(1)?.as_str()
            } else {
                None
            }
        })
    };
    if tag_value("t") != Some("upload")
        || tag_value("x") != Some(hash)
        || tag_value("server") != Some(server)
    {
        return Err(Error::Message(
            "Blossom authorization does not match this file and server.".into(),
        ));
    }
    let expiration = tag_value("expiration")
        .and_then(|value| value.parse::<u64>().ok())
        .ok_or_else(|| Error::Message("Invalid Blossom authorization expiration.".into()))?;
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_err(|error| Error::Message(error.to_string()))?
        .as_secs();
    if expiration <= now {
        return Err(Error::Message("Blossom authorization has expired.".into()));
    }
    for field in ["id", "pubkey", "sig"] {
        if event
            .get(field)
            .and_then(|value| value.as_str())
            .map_or(true, str::is_empty)
        {
            return Err(Error::Message(
                "The Blossom authorization was not signed.".into(),
            ));
        }
    }
    Ok(())
}

fn resolve_executable<R: Runtime>(
    app: &AppHandle<R>,
    env_name: &str,
    bundled_name: &str,
    development: Option<PathBuf>,
) -> Result<PathBuf> {
    if let Some(path) = std::env::var_os(env_name).filter(|value| !value.is_empty()) {
        return Ok(PathBuf::from(path));
    }
    if let Ok(resource_dir) = app.path().resource_dir() {
        let bundled = resource_dir.join("bin").join(bundled_name);
        if bundled.is_file() {
            return Ok(bundled);
        }
    }
    if let Some(path) = development.filter(|path| path.is_file()) {
        return Ok(path);
    }
    Ok(PathBuf::from(bundled_name))
}

fn repo_development_binary(relative: &str) -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("../../..")
        .join(relative)
}

fn bundled_deno_name() -> &'static str {
    if cfg!(windows) {
        "deno.exe"
    } else if cfg!(target_os = "macos") && cfg!(target_arch = "aarch64") {
        "deno-aarch64"
    } else if cfg!(target_os = "macos") {
        "deno-x86_64"
    } else {
        "deno"
    }
}

async fn find_downloaded_file(dir: &Path) -> Result<PathBuf> {
    let mut entries = fs::read_dir(dir).await?;
    while let Some(entry) = entries.next_entry().await? {
        let path = entry.path();
        let incomplete = path
            .extension()
            .and_then(|value| value.to_str())
            .is_some_and(|value| value == "part" || value == "ytdl");
        if entry.file_type().await?.is_file() && !incomplete {
            return Ok(path);
        }
    }
    Err(Error::Message(
        "The local media engine produced no output file.".into(),
    ))
}

async fn hash_file(path: &Path) -> Result<String> {
    let mut file = fs::File::open(path).await?;
    let mut hasher = Sha256::new();
    let mut buffer = vec![0_u8; 1024 * 1024];
    loop {
        let read = file.read(&mut buffer).await?;
        if read == 0 {
            break;
        }
        hasher.update(&buffer[..read]);
    }
    Ok(hex::encode(hasher.finalize()))
}

fn useful_error_tail(stderr: &str) -> String {
    let lines = stderr
        .lines()
        .filter(|line| !line.trim().is_empty())
        .collect::<Vec<_>>();
    lines
        .iter()
        .rev()
        .take(8)
        .rev()
        .copied()
        .collect::<Vec<_>>()
        .join("\n")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn only_accepts_a_plain_video_id() {
        assert!(validate_video_id("dQw4w9WgXcQ").is_ok());
        assert!(validate_video_id("https://youtube.com/watch?v=dQw4w9WgXcQ").is_err());
    }

    #[test]
    fn upload_url_is_https_and_normalized() {
        assert_eq!(
            blossom_upload_url("https://blossom.example/")
                .unwrap()
                .as_str(),
            "https://blossom.example/upload"
        );
        assert!(blossom_upload_url("http://blossom.example").is_err());
    }
}
