//! Passive localhost audio proxy + pure-Rust `symphonia` PCM decoder + 16-band
//! logarithmic FFT spectrum analyzer.
//!
//! Works identically across macOS, Android, Linux, Windows, and iOS with **zero**
//! microphone permissions (`RECORD_AUDIO` not needed) and **zero** playback blocking:
//! `just_audio` pulls raw bytes through `http://127.0.0.1:<port>/stream/<id>` while
//! a side-tap strips any inline ICY metadata, decodes audio frames on a background
//! thread, and publishes real-time 16-band FFT magnitudes for Flutter's spectrometer.

use std::collections::HashMap;
use std::f32::consts::PI;
use std::io::{self, Read, Seek, SeekFrom};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{mpsc, Arc, Mutex, RwLock};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

use futures_util::StreamExt;
use reqwest::header::{ACCEPT, CONTENT_TYPE, RANGE, USER_AGENT};
use symphonia::core::audio::SampleBuffer;
use symphonia::core::codecs::{DecoderOptions, CODEC_TYPE_NULL};
use symphonia::core::errors::Error as SymphoniaError;
use symphonia::core::formats::FormatOptions;
use symphonia::core::io::{MediaSource, MediaSourceStream};
use symphonia::core::meta::MetadataOptions;
use symphonia::core::probe::Hint;
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::{TcpListener, TcpStream};

pub const SPECTRUM_BANDS: usize = 16;
const FFT_SIZE: usize = 512;

#[derive(Debug, Clone)]
pub struct AudioSpectrumSnapshot {
    pub bands: Vec<f32>,
    pub is_live: bool,
}

#[derive(Default)]
struct SharedSpectrum {
    bands: [f32; SPECTRUM_BANDS],
    updated_at_ms: u64,
    generation: u64,
}

fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

pub struct AudioSpectrumProxy {
    http: reqwest::Client,
    port: tokio::sync::Mutex<Option<u16>>,
    routes: Arc<RwLock<HashMap<u64, String>>>,
    generation: Arc<AtomicU64>,
    spectrum: Arc<RwLock<SharedSpectrum>>,
}

impl AudioSpectrumProxy {
    pub fn new(http: reqwest::Client) -> Self {
        Self {
            http,
            port: tokio::sync::Mutex::new(None),
            routes: Arc::new(RwLock::new(HashMap::new())),
            generation: Arc::new(AtomicU64::new(0)),
            spectrum: Arc::new(RwLock::new(SharedSpectrum::default())),
        }
    }

    /// Returns a localhost proxy URL (`http://127.0.0.1:<port>/stream/<gen>`) for
    /// standard HTTP/HTTPS MP3/AAC/OGG/FLAC streams, or returns `upstream_url`
    /// unchanged for HLS playlists (`.m3u8`) and non-HTTP URLs.
    pub async fn prepare_proxy_url(&self, upstream_url: &str) -> String {
        let trimmed = upstream_url.trim();
        let lower = trimmed.to_ascii_lowercase();
        if !(lower.starts_with("http://") || lower.starts_with("https://")) {
            return trimmed.to_string();
        }
        // HLS playlists have relative segments; let ExoPlayer/AVPlayer handle them directly.
        if lower.contains(".m3u8") || lower.contains(".pls") {
            self.reset_spectrum();
            return trimmed.to_string();
        }

        let port = match self.ensure_listener().await {
            Ok(p) => p,
            Err(_) => return trimmed.to_string(),
        };

        let gen = self.generation.fetch_add(1, Ordering::SeqCst) + 1;
        if let Ok(mut map) = self.routes.write() {
            map.clear();
            map.insert(gen, trimmed.to_string());
        }
        if let Ok(mut spec) = self.spectrum.write() {
            spec.bands = [0.0; SPECTRUM_BANDS];
            spec.updated_at_ms = 0;
            spec.generation = gen;
        }

        format!("http://127.0.0.1:{port}/stream/{gen}")
    }

    pub fn reset_spectrum(&self) {
        let gen = self.generation.fetch_add(1, Ordering::SeqCst) + 1;
        if let Ok(mut spec) = self.spectrum.write() {
            spec.bands = [0.0; SPECTRUM_BANDS];
            spec.updated_at_ms = 0;
            spec.generation = gen;
        }
    }

    /// Fast, non-blocking read of the current 16-band real FFT magnitudes.
    pub fn snapshot(&self) -> AudioSpectrumSnapshot {
        let now = now_ms();
        let guard = match self.spectrum.read() {
            Ok(g) => g,
            Err(_) => {
                return AudioSpectrumSnapshot {
                    bands: vec![0.0; SPECTRUM_BANDS],
                    is_live: false,
                };
            }
        };
        let fresh = guard.updated_at_ms > 0 && now.saturating_sub(guard.updated_at_ms) <= 1500;
        AudioSpectrumSnapshot {
            bands: if fresh {
                guard.bands.to_vec()
            } else {
                vec![0.0; SPECTRUM_BANDS]
            },
            is_live: fresh,
        }
    }

    async fn ensure_listener(&self) -> io::Result<u16> {
        let mut guard = self.port.lock().await;
        if let Some(p) = *guard {
            return Ok(p);
        }
        let listener = TcpListener::bind("127.0.0.1:0").await?;
        let local_port = listener.local_addr()?.port();
        *guard = Some(local_port);

        let http = self.http.clone();
        let routes = self.routes.clone();
        let generation = self.generation.clone();
        let spectrum = self.spectrum.clone();

        tokio::spawn(async move {
            loop {
                let Ok((socket, _)) = listener.accept().await else {
                    break;
                };
                let http = http.clone();
                let routes = routes.clone();
                let generation = generation.clone();
                let spectrum = spectrum.clone();
                tokio::spawn(async move {
                    let _ = handle_client(socket, http, routes, generation, spectrum).await;
                });
            }
        });

        Ok(local_port)
    }
}

async fn handle_client(
    mut socket: TcpStream,
    http: reqwest::Client,
    routes: Arc<RwLock<HashMap<u64, String>>>,
    generation: Arc<AtomicU64>,
    spectrum: Arc<RwLock<SharedSpectrum>>,
) -> io::Result<()> {
    let mut header_buf = vec![0u8; 4096];
    let n = socket.read(&mut header_buf).await?;
    if n == 0 {
        return Ok(());
    }
    let req_text = String::from_utf8_lossy(&header_buf[..n]);
    let first_line = req_text.lines().next().unwrap_or("");
    let mut parts = first_line.split_whitespace();
    let method = parts.next().unwrap_or("GET");
    let path = parts.next().unwrap_or("");

    let Some(gen_str) = path.strip_prefix("/stream/") else {
        let _ = socket
            .write_all(b"HTTP/1.1 404 Not Found\r\nContent-Length: 0\r\n\r\n")
            .await;
        return Ok(());
    };
    let Ok(req_gen) = gen_str.split('?').next().unwrap_or("").parse::<u64>() else {
        let _ = socket
            .write_all(b"HTTP/1.1 400 Bad Request\r\nContent-Length: 0\r\n\r\n")
            .await;
        return Ok(());
    };

    let upstream_url = routes
        .read()
        .ok()
        .and_then(|m| m.get(&req_gen).cloned());
    let Some(upstream_url) = upstream_url else {
        let _ = socket
            .write_all(b"HTTP/1.1 404 Not Found\r\nContent-Length: 0\r\n\r\n")
            .await;
        return Ok(());
    };

    let mut wants_icy = false;
    let mut range_hdr: Option<String> = None;
    for line in req_text.lines().skip(1) {
        if let Some((k, v)) = line.split_once(':') {
            let key = k.trim().to_ascii_lowercase();
            let val = v.trim();
            if key == "icy-metadata" && val == "1" {
                wants_icy = true;
            } else if key == "range" {
                range_hdr = Some(val.to_string());
            }
        }
    }

    let mut req = if method.eq_ignore_ascii_case("HEAD") {
        http.head(&upstream_url)
    } else {
        http.get(&upstream_url)
    };
    req = req
        .header(USER_AGENT, "WaveFunc Radio Native/0.2.0")
        .header(ACCEPT, "*/*");
    if wants_icy {
        req = req.header("Icy-MetaData", "1");
    }
    if let Some(ref r) = range_hdr {
        req = req.header(RANGE, r);
    }

    let resp = match req.send().await {
        Ok(r) => r,
        Err(_) => {
            let _ = socket
                .write_all(b"HTTP/1.1 502 Bad Gateway\r\nContent-Length: 0\r\n\r\n")
                .await;
            return Ok(());
        }
    };

    let status = resp.status();
    let content_type = resp
        .headers()
        .get(CONTENT_TYPE)
        .and_then(|v| v.to_str().ok())
        .unwrap_or("audio/mpeg")
        .to_string();
    let icy_metaint: usize = resp
        .headers()
        .get("icy-metaint")
        .and_then(|v| v.to_str().ok())
        .and_then(|s| s.trim().parse::<usize>().ok())
        .unwrap_or(0);

    let mut response_head = format!(
        "HTTP/1.1 {} {}\r\nContent-Type: {}\r\nConnection: close\r\n",
        status.as_u16(),
        status.canonical_reason().unwrap_or("OK"),
        content_type
    );
    for forward_key in [
        "icy-metaint",
        "icy-name",
        "icy-genre",
        "icy-br",
        "icy-url",
        "content-length",
        "content-range",
        "accept-ranges",
    ] {
        if let Some(val) = resp.headers().get(forward_key).and_then(|v| v.to_str().ok()) {
            response_head.push_str(&format!("{forward_key}: {val}\r\n"));
        }
    }
    response_head.push_str("\r\n");
    socket.write_all(response_head.as_bytes()).await?;

    if method.eq_ignore_ascii_case("HEAD") || !status.is_success() {
        return Ok(());
    }

    // Spawn passive FFT decoder thread fed by a bounded non-blocking channel.
    let (tx, rx) = mpsc::sync_channel::<Vec<u8>>(48);
    let hint_ct = content_type.clone();
    let hint_url = upstream_url.clone();
    let spec_arc = spectrum.clone();
    let gen_arc = generation.clone();
    std::thread::Builder::new()
        .name(format!("wf-fft-{req_gen}"))
        .spawn(move || {
            run_decoder_thread(rx, icy_metaint, &hint_ct, &hint_url, req_gen, gen_arc, spec_arc);
        })
        .ok();

    let mut byte_stream = resp.bytes_stream();
    while let Some(chunk_res) = byte_stream.next().await {
        let Ok(chunk) = chunk_res else {
            break;
        };
        if chunk.is_empty() {
            continue;
        }
        // Forward to player first; never block playback on FFT channel.
        if socket.write_all(&chunk).await.is_err() {
            break;
        }
        let _ = tx.try_send(chunk.to_vec());
    }
    drop(tx);
    Ok(())
}

/// Non-seekable `MediaSource` backed by an `mpsc::Receiver<Vec<u8>>` that
/// transparently strips inline Shoutcast/Icecast ICY metadata blocks.
struct ChannelAudioSource {
    rx: Mutex<mpsc::Receiver<Vec<u8>>>,
    pending: Vec<u8>,
    pending_pos: usize,
    metaint: usize,
    audio_until_meta: usize,
    meta_bytes_remaining: usize,
    expect_meta_len: bool,
}

impl ChannelAudioSource {
    fn new(rx: mpsc::Receiver<Vec<u8>>, metaint: usize) -> Self {
        Self {
            rx: Mutex::new(rx),
            pending: Vec::new(),
            pending_pos: 0,
            metaint,
            audio_until_meta: metaint,
            meta_bytes_remaining: 0,
            expect_meta_len: false,
        }
    }

    fn pull_raw(&mut self) -> Option<u8> {
        while self.pending_pos >= self.pending.len() {
            let chunk = self.rx.lock().ok()?.recv().ok()?;
            self.pending = chunk;
            self.pending_pos = 0;
        }
        let b = self.pending[self.pending_pos];
        self.pending_pos += 1;
        Some(b)
    }
}

impl Read for ChannelAudioSource {
    fn read(&mut self, buf: &mut [u8]) -> io::Result<usize> {
        if buf.is_empty() {
            return Ok(0);
        }
        if self.metaint == 0 {
            if self.pending_pos >= self.pending.len() {
                match self.rx.lock().ok().and_then(|rx| rx.recv().ok()) {
                    Some(chunk) => {
                        self.pending = chunk;
                        self.pending_pos = 0;
                    }
                    None => return Ok(0),
                }
            }
            let avail = self.pending.len() - self.pending_pos;
            let to_copy = avail.min(buf.len());
            buf[..to_copy].copy_from_slice(&self.pending[self.pending_pos..self.pending_pos + to_copy]);
            self.pending_pos += to_copy;
            return Ok(to_copy);
        }

        let mut written = 0;
        while written < buf.len() {
            if self.expect_meta_len {
                let Some(len_byte) = self.pull_raw() else {
                    break;
                };
                self.expect_meta_len = false;
                self.meta_bytes_remaining = (len_byte as usize) * 16;
                if self.meta_bytes_remaining == 0 {
                    self.audio_until_meta = self.metaint;
                }
                continue;
            }
            if self.meta_bytes_remaining > 0 {
                let Some(_) = self.pull_raw() else {
                    break;
                };
                self.meta_bytes_remaining -= 1;
                if self.meta_bytes_remaining == 0 {
                    self.audio_until_meta = self.metaint;
                }
                continue;
            }
            if self.audio_until_meta == 0 {
                self.expect_meta_len = true;
                continue;
            }
            let Some(b) = self.pull_raw() else {
                break;
            };
            buf[written] = b;
            written += 1;
            self.audio_until_meta -= 1;
            if written >= 512 && self.pending_pos >= self.pending.len() {
                break;
            }
        }
        Ok(written)
    }
}

impl Seek for ChannelAudioSource {
    fn seek(&mut self, _pos: SeekFrom) -> io::Result<u64> {
        Err(io::Error::new(
            io::ErrorKind::Unsupported,
            "live stream is not seekable",
        ))
    }
}

impl MediaSource for ChannelAudioSource {
    fn is_seekable(&self) -> bool {
        false
    }
    fn byte_len(&self) -> Option<u64> {
        None
    }
}

fn run_decoder_thread(
    rx: mpsc::Receiver<Vec<u8>>,
    icy_metaint: usize,
    content_type: &str,
    url: &str,
    req_gen: u64,
    generation: Arc<AtomicU64>,
    spectrum: Arc<RwLock<SharedSpectrum>>,
) {
    let source = ChannelAudioSource::new(rx, icy_metaint);
    let mss = MediaSourceStream::new(Box::new(source), Default::default());

    let mut hint = Hint::new();
    let ct_clean = content_type.split(';').next().unwrap_or("").trim().to_ascii_lowercase();
    if !ct_clean.is_empty() {
        hint.mime_type(&ct_clean);
    }
    let lower_url = url.to_ascii_lowercase();
    if ct_clean.contains("mpeg") || lower_url.contains("mp3") {
        hint.with_extension("mp3");
    } else if ct_clean.contains("aac") || lower_url.contains("aac") {
        hint.with_extension("aac");
    } else if ct_clean.contains("ogg") || lower_url.contains("ogg") {
        hint.with_extension("ogg");
    } else if ct_clean.contains("mp4") || lower_url.contains(".m4a") {
        hint.with_extension("m4a");
    } else if ct_clean.contains("flac") || lower_url.contains("flac") {
        hint.with_extension("flac");
    }

    let Ok(probed) = symphonia::default::get_probe().format(
        &hint,
        mss,
        &FormatOptions::default(),
        &MetadataOptions::default(),
    ) else {
        return;
    };

    let mut format = probed.format;
    let Some(track) = format
        .tracks()
        .iter()
        .find(|t| t.codec_params.codec != CODEC_TYPE_NULL)
    else {
        return;
    };
    let track_id = track.id;
    let sample_rate = track.codec_params.sample_rate.unwrap_or(44100) as f32;
    let Ok(mut decoder) =
        symphonia::default::get_codecs().make(&track.codec_params, &DecoderOptions::default())
    else {
        return;
    };

    let mut mono_ring: Vec<f32> = Vec::with_capacity(FFT_SIZE * 2);
    let mut smoothed = [0.0f32; SPECTRUM_BANDS];
    let mut last_emit = Instant::now();
    let frame_interval = Duration::from_millis(24);

    while generation.load(Ordering::Relaxed) == req_gen {
        let packet = match format.next_packet() {
            Ok(p) => p,
            Err(SymphoniaError::IoError(_)) => break,
            Err(_) => continue,
        };
        if packet.track_id() != track_id {
            continue;
        }
        let decoded = match decoder.decode(&packet) {
            Ok(d) => d,
            Err(SymphoniaError::DecodeError(_)) => continue,
            Err(_) => break,
        };

        let spec = *decoded.spec();
        let channels = spec.channels.count().max(1);
        let mut sbuf = SampleBuffer::<f32>::new(decoded.capacity() as u64, spec);
        sbuf.copy_interleaved_ref(decoded);
        let samples = sbuf.samples();

        for frame in samples.chunks_exact(channels) {
            let sum: f32 = frame.iter().copied().sum();
            mono_ring.push(sum / channels as f32);
        }

        while mono_ring.len() >= FFT_SIZE {
            let bands = compute_spectrum_bands(&mono_ring[..FFT_SIZE], sample_rate);
            // 50% overlap for smooth responsiveness.
            mono_ring.drain(..FFT_SIZE / 2);

            for i in 0..SPECTRUM_BANDS {
                let target = bands[i];
                let cur = smoothed[i];
                let alpha = if target > cur { 0.58 } else { 0.24 };
                smoothed[i] = cur + (target - cur) * alpha;
            }

            let elapsed = last_emit.elapsed();
            if elapsed < frame_interval {
                std::thread::sleep(frame_interval - elapsed);
            }
            last_emit = Instant::now();

            if generation.load(Ordering::Relaxed) != req_gen {
                return;
            }
            if let Ok(mut guard) = spectrum.write() {
                if guard.generation == req_gen {
                    guard.bands = smoothed;
                    guard.updated_at_ms = now_ms();
                }
            }
        }
    }
}

/// Computes 16 perceptually spaced logarithmic frequency bands (`0.0..1.0`)
/// from a 512-sample mono PCM window using a Hann window + radix-2 Cooley-Tukey FFT.
pub fn compute_spectrum_bands(samples: &[f32], sample_rate: f32) -> [f32; SPECTRUM_BANDS] {
    debug_assert_eq!(samples.len(), FFT_SIZE);
    let mut re = [0.0f32; FFT_SIZE];
    let mut im = [0.0f32; FFT_SIZE];

    for i in 0..FFT_SIZE {
        let w = 0.5 * (1.0 - (2.0 * PI * i as f32 / (FFT_SIZE - 1) as f32).cos());
        re[i] = samples[i] * w;
    }

    fft_radix2(&mut re, &mut im);

    let nyquist = (sample_rate * 0.5).max(8000.0);
    let bin_hz = sample_rate / FFT_SIZE as f32;
    let min_hz = 55.0f32;
    let max_hz = nyquist.min(14000.0);
    let ratio = (max_hz / min_hz).powf(1.0 / SPECTRUM_BANDS as f32);

    let mut out = [0.0f32; SPECTRUM_BANDS];
    let norm = 2.0 / FFT_SIZE as f32;

    for b in 0..SPECTRUM_BANDS {
        let f_lo = min_hz * ratio.powi(b as i32);
        let f_hi = f_lo * ratio;
        let idx_lo = ((f_lo / bin_hz).floor() as usize).clamp(1, FFT_SIZE / 2 - 1);
        let idx_hi = ((f_hi / bin_hz).ceil() as usize).clamp(idx_lo + 1, FFT_SIZE / 2);

        let mut energy = 0.0f32;
        for k in idx_lo..idx_hi {
            let mag = (re[k] * re[k] + im[k] * im[k]).sqrt() * norm;
            if mag > energy {
                energy = mag;
            }
        }

        // Mild treble tilt (+6dB across spectrum) so cymbals & vocals shine alongside bass.
        let tilt = 1.0 + (b as f32 / SPECTRUM_BANDS as f32) * 1.35;
        let db = 20.0 * (energy * tilt + 1e-6).log10();
        // Map [-56 dB .. -8 dB] -> [0.0 .. 1.0].
        out[b] = ((db + 56.0) / 48.0).clamp(0.0, 1.0);
    }

    out
}

fn fft_radix2(re: &mut [f32; FFT_SIZE], im: &mut [f32; FFT_SIZE]) {
    let n = FFT_SIZE;
    let mut j = 0usize;
    for i in 1..n {
        let mut bit = n >> 1;
        while j & bit != 0 {
            j ^= bit;
            bit >>= 1;
        }
        j ^= bit;
        if i < j {
            re.swap(i, j);
            im.swap(i, j);
        }
    }

    let mut len = 2usize;
    while len <= n {
        let ang = -2.0 * PI / len as f32;
        let wlen_re = ang.cos();
        let wlen_im = ang.sin();
        let half = len / 2;
        let mut i = 0;
        while i < n {
            let mut w_re = 1.0f32;
            let mut w_im = 0.0f32;
            for k in 0..half {
                let u_re = re[i + k];
                let u_im = im[i + k];
                let v_re = re[i + k + half] * w_re - im[i + k + half] * w_im;
                let v_im = re[i + k + half] * w_im + im[i + k + half] * w_re;
                re[i + k] = u_re + v_re;
                im[i + k] = u_im + v_im;
                re[i + k + half] = u_re - v_re;
                im[i + k + half] = u_im - v_im;
                let next_re = w_re * wlen_re - w_im * wlen_im;
                let next_im = w_re * wlen_im + w_im * wlen_re;
                w_re = next_re;
                w_im = next_im;
            }
            i += len;
        }
        len <<= 1;
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn fft_isolates_low_and_high_sine_tones() {
        let sr = 44100.0f32;
        let mut bass_buf = [0.0f32; FFT_SIZE];
        let mut treble_buf = [0.0f32; FFT_SIZE];
        for i in 0..FFT_SIZE {
            let t = i as f32 / sr;
            bass_buf[i] = 0.6 * (2.0 * PI * 110.0 * t).sin();
            treble_buf[i] = 0.6 * (2.0 * PI * 6000.0 * t).sin();
        }
        let bass_bands = compute_spectrum_bands(&bass_buf, sr);
        let treble_bands = compute_spectrum_bands(&treble_buf, sr);

        let low_peak = bass_bands[0..4].iter().copied().fold(0.0f32, f32::max);
        let bass_high_leak = bass_bands[10..16].iter().copied().fold(0.0f32, f32::max);
        assert!(low_peak > 0.65, "expected strong bass peak, got {low_peak}");
        assert!(bass_high_leak < 0.15, "unexpected treble leak: {bass_high_leak}");

        let high_peak = treble_bands[11..16].iter().copied().fold(0.0f32, f32::max);
        let treble_low_leak = treble_bands[0..5].iter().copied().fold(0.0f32, f32::max);
        assert!(high_peak > 0.65, "expected strong treble peak, got {high_peak}");
        assert!(treble_low_leak < 0.15, "unexpected bass leak: {treble_low_leak}");
    }
}
