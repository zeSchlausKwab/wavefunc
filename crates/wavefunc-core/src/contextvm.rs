use std::time::Duration;

use futures_util::StreamExt;
use nostr_sdk::prelude::*;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

use crate::config::CONTEXTVM_KIND;
use crate::error::{Result, WavefuncError};
use crate::models::{
    MusicBrainzRecording, NowPlayingMetadata, PreparedMedia, UploadedMedia, YouTubeSearchResult,
};

#[derive(Debug, Serialize)]
struct JsonRpcRequest {
    jsonrpc: &'static str,
    id: String,
    method: &'static str,
    params: Value,
}

#[derive(Debug, Deserialize)]
struct JsonRpcResponse {
    #[allow(dead_code)]
    id: Option<Value>,
    result: Option<Value>,
    error: Option<JsonRpcError>,
}

#[derive(Debug, Deserialize)]
struct JsonRpcError {
    message: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct RawMetadataWrapper {
    result: RawStreamMetadata,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct RawStreamMetadata {
    title: Option<String>,
    artist: Option<String>,
    song: Option<String>,
    station: Option<String>,
    genre: Option<String>,
    bitrate: Option<String>,
    description: Option<String>,
    listeners: Option<u32>,
    source: Option<String>,
    enriched: Option<RawEnrichedMetadata>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct RawEnrichedMetadata {
    artist: Option<String>,
    title: Option<String>,
    album: Option<String>,
    release_date: Option<String>,
    duration: Option<u64>,
    mbid: Option<String>,
    confidence: Option<String>,
}

/// Build the JSON-RPC 2.0 `tools/call` payload for ContextVM `extract_stream_metadata`.
pub fn build_extract_metadata_payload(
    request_id: &str,
    stream_url: &str,
    station_address: Option<&str>,
    session_id: Option<&str>,
) -> Result<String> {
    let mut arguments = serde_json::Map::new();
    arguments.insert("url".to_string(), json!(stream_url));
    if let Some(addr) = station_address {
        arguments.insert("stationAddress".to_string(), json!(addr));
    }
    if let Some(sid) = session_id {
        arguments.insert("sessionId".to_string(), json!(sid));
    }
    arguments.insert(
        "observedAt".to_string(),
        json!(Timestamp::now().as_secs()),
    );

    let rpc = JsonRpcRequest {
        jsonrpc: "2.0",
        id: request_id.to_string(),
        method: "tools/call",
        params: json!({
            "name": "extract_stream_metadata",
            "arguments": Value::Object(arguments),
        }),
    };

    Ok(serde_json::to_string(&rpc)?)
}

/// Parse a ContextVM JSON-RPC response payload into `NowPlayingMetadata`.
pub fn parse_metadata_response(content: &str) -> Result<NowPlayingMetadata> {
    let response: JsonRpcResponse = serde_json::from_str(content)?;

    if let Some(err) = response.error {
        return Err(WavefuncError::ContextVm(err.message));
    }

    let result = response
        .result
        .ok_or_else(|| WavefuncError::ContextVm("Empty ContextVM response".to_string()))?;

    if result.get("isError").and_then(Value::as_bool) == Some(true) {
        let message = result
            .get("content")
            .and_then(Value::as_array)
            .and_then(|arr| arr.first())
            .and_then(|item| item.get("text"))
            .and_then(Value::as_str)
            .and_then(|raw| serde_json::from_str::<Value>(raw).ok())
            .and_then(|v| v.get("error").and_then(Value::as_str).map(str::to_string))
            .unwrap_or_else(|| "Metadata tool returned an error".to_string());
        return Err(WavefuncError::ContextVm(message));
    }

    let wrapper: RawMetadataWrapper = if let Some(structured) = result.get("structuredContent") {
        serde_json::from_value(structured.clone())?
    } else if let Some(text) = result
        .get("content")
        .and_then(Value::as_array)
        .and_then(|arr| arr.first())
        .and_then(|item| item.get("text"))
        .and_then(Value::as_str)
    {
        serde_json::from_str(text)?
    } else {
        return Err(WavefuncError::ContextVm(
            "Missing structuredContent or text payload".to_string(),
        ));
    };

    let raw = wrapper.result;
    let enriched = raw.enriched;

    let song = enriched
        .as_ref()
        .and_then(|e| e.title.clone())
        .filter(|s| !s.trim().is_empty())
        .or(raw.song);

    let artist = enriched
        .as_ref()
        .and_then(|e| e.artist.clone())
        .filter(|s| !s.trim().is_empty())
        .or(raw.artist);

    Ok(NowPlayingMetadata {
        title: raw.title,
        artist,
        song,
        station: raw.station,
        genre: raw.genre,
        bitrate: raw.bitrate,
        description: raw.description,
        listeners: raw.listeners,
        source: raw.source,
        album: enriched.as_ref().and_then(|e| e.album.clone()),
        release_date: enriched.as_ref().and_then(|e| e.release_date.clone()),
        duration_ms: enriched.as_ref().and_then(|e| e.duration),
        mbid: enriched.as_ref().and_then(|e| e.mbid.clone()),
        confidence: enriched.and_then(|e| e.confidence),
    })
}

/// Parse a generic ContextVM JSON-RPC tool response, returning its structured JSON value.
pub fn parse_tool_response_value(content: &str) -> Result<Value> {
    let response: JsonRpcResponse = serde_json::from_str(content)?;

    if let Some(err) = response.error {
        return Err(WavefuncError::ContextVm(err.message));
    }

    let result = response
        .result
        .ok_or_else(|| WavefuncError::ContextVm("Empty ContextVM response".to_string()))?;

    if result.get("isError").and_then(Value::as_bool) == Some(true) {
        let message = result
            .get("content")
            .and_then(Value::as_array)
            .and_then(|arr| arr.first())
            .and_then(|item| item.get("text"))
            .and_then(Value::as_str)
            .and_then(|raw| serde_json::from_str::<Value>(raw).ok())
            .and_then(|v| v.get("error").and_then(Value::as_str).map(str::to_string))
            .unwrap_or_else(|| "ContextVM tool returned an error".to_string());
        return Err(WavefuncError::ContextVm(message));
    }

    if let Some(structured) = result.get("structuredContent") {
        return Ok(structured.clone());
    }
    if let Some(text) = result
        .get("content")
        .and_then(Value::as_array)
        .and_then(|arr| arr.first())
        .and_then(|item| item.get("text"))
        .and_then(Value::as_str)
    {
        return Ok(serde_json::from_str(text)?);
    }

    Err(WavefuncError::ContextVm(
        "Missing structuredContent or text payload".to_string(),
    ))
}

/// Generic ContextVM `tools/call` invocation over Nostr kind `25910`.
pub async fn call_tool(
    client: &Client,
    client_keys: &Keys,
    server_pubkey_hex: &str,
    tool_name: &str,
    arguments: Value,
    timeout_secs: u64,
) -> Result<Value> {
    let server_pubkey = PublicKey::from_hex(server_pubkey_hex)?;
    let request_id = uuid::Uuid::new_v4().to_string();
    let rpc = JsonRpcRequest {
        jsonrpc: "2.0",
        id: request_id,
        method: "tools/call",
        params: json!({
            "name": tool_name,
            "arguments": arguments,
        }),
    };
    let payload = serde_json::to_string(&rpc)?;

    let request_event = EventBuilder::new(Kind::Custom(CONTEXTVM_KIND), payload)
        .tag(Tag::public_key(server_pubkey))
        .finalize(client_keys)?;
    let request_event_id = request_event.id;

    let filter = Filter::new()
        .kind(Kind::Custom(CONTEXTVM_KIND))
        .author(server_pubkey)
        .pubkey(client_keys.public_key())
        .event(request_event_id);

    let sub_output = client.subscribe(filter).await?;
    let sub_id = sub_output.value;
    let mut notifications = client.notifications();

    client.send_event(&request_event).await?;

    let deadline = Duration::from_secs(timeout_secs);
    let outcome = tokio::time::timeout(deadline, async {
        while let Some(notification) = notifications.next().await {
            if let ClientNotification::Event {
                subscription_id,
                event,
                ..
            } = notification
            {
                if subscription_id == sub_id && event.pubkey == server_pubkey {
                    // Skip progress notifications (JSON-RPC notifications have "method", no "result"/"error").
                    if let Ok(v) = serde_json::from_str::<Value>(&event.content) {
                        if v.get("result").is_none() && v.get("error").is_none() {
                            continue;
                        }
                    }
                    return parse_tool_response_value(&event.content);
                }
            }
        }
        Err(WavefuncError::ContextVm(
            "Notification stream ended before response".to_string(),
        ))
    })
    .await;

    let _ = client.unsubscribe(&sub_id).await;

    match outcome {
        Ok(result) => result,
        Err(_) => Err(WavefuncError::Timeout(timeout_secs)),
    }
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct RawRecordingsWrapper {
    #[serde(default)]
    result: Vec<RawRecordingItem>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct RawRecordingItem {
    id: String,
    title: String,
    artist: String,
    artist_id: Option<String>,
    release: Option<String>,
    release_id: Option<String>,
    release_date: Option<String>,
    duration: Option<f64>,
    #[serde(default)]
    score: u32,
    #[serde(default)]
    tags: Vec<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct RawYouTubeWrapper {
    #[serde(default)]
    results: Vec<RawYouTubeItem>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct RawYouTubeItem {
    #[serde(alias = "id")]
    video_id: String,
    #[serde(default)]
    url: String,
    #[serde(default)]
    title: String,
    duration: Option<f64>,
    #[serde(alias = "uploader")]
    channel: Option<String>,
    #[serde(alias = "thumbnail")]
    thumbnail_url: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct RawPrepareDownload {
    temp_id: String,
    sha256: String,
    size: u64,
    mime_type: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct RawUploadBlossom {
    url: String,
    sha256: String,
    size: u64,
    mime_type: String,
}

/// Search MusicBrainz recordings via ContextVM `search_recordings`.
pub async fn search_recordings(
    client: &Client,
    client_keys: &Keys,
    server_pubkey_hex: &str,
    query: &str,
    artist: Option<&str>,
    limit: u32,
    timeout_secs: u64,
) -> Result<Vec<MusicBrainzRecording>> {
    let mut args = serde_json::Map::new();
    args.insert("query".to_string(), json!(query.trim()));
    if let Some(a) = artist.map(str::trim).filter(|s| !s.is_empty()) {
        args.insert("artist".to_string(), json!(a));
    }
    args.insert("limit".to_string(), json!(limit.clamp(1, 25)));

    let val = call_tool(
        client,
        client_keys,
        server_pubkey_hex,
        "search_recordings",
        Value::Object(args),
        timeout_secs,
    )
    .await?;

    let parsed: RawRecordingsWrapper = serde_json::from_value(val)?;
    Ok(parsed
        .result
        .into_iter()
        .map(|r| MusicBrainzRecording {
            id: r.id,
            title: r.title,
            artist: r.artist,
            artist_id: r.artist_id,
            release: r.release,
            release_id: r.release_id,
            release_date: r.release_date,
            duration_ms: r.duration.map(|d| d.max(0.0).round() as u64),
            score: r.score,
            tags: r.tags,
        })
        .collect())
}

/// Search YouTube videos via ContextVM `search_youtube`.
pub async fn search_youtube(
    client: &Client,
    client_keys: &Keys,
    server_pubkey_hex: &str,
    query: &str,
    limit: u32,
    timeout_secs: u64,
) -> Result<Vec<YouTubeSearchResult>> {
    let val = call_tool(
        client,
        client_keys,
        server_pubkey_hex,
        "search_youtube",
        json!({
            "query": query.trim(),
            "limit": limit.clamp(1, 10),
        }),
        timeout_secs,
    )
    .await?;

    let parsed: RawYouTubeWrapper = serde_json::from_value(val)?;
    Ok(parsed
        .results
        .into_iter()
        .filter(|y| !y.video_id.trim().is_empty())
        .map(|y| {
            let url = if y.url.starts_with("http") {
                y.url
            } else {
                format!("https://www.youtube.com/watch?v={}", y.video_id)
            };
            YouTubeSearchResult {
                video_id: y.video_id,
                url,
                title: y.title,
                duration_secs: y.duration.map(|d| d.max(0.0).round() as u64),
                channel: y.channel,
                thumbnail_url: y.thumbnail_url,
            }
        })
        .collect())
}

/// Direct HTTPS fallback that scrapes `ytInitialData` from YouTube search results
/// when ContextVM and local `yt-dlp` are unavailable (works on Android & Desktop).
pub async fn search_youtube_web_fallback(
    http: &reqwest::Client,
    query: &str,
    limit: u32,
) -> Result<Vec<YouTubeSearchResult>> {
    let mut url = reqwest::Url::parse("https://www.youtube.com/results")
        .map_err(|e| WavefuncError::InvalidInput(e.to_string()))?;
    url.query_pairs_mut().append_pair("search_query", query.trim());

    let html = http
        .get(url)
        .header(
            reqwest::header::USER_AGENT,
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
        )
        .header(reqwest::header::ACCEPT_LANGUAGE, "en-US,en;q=0.9")
        .send()
        .await?
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
        .ok_or_else(|| WavefuncError::ContextVm("YouTube search page returned no data".into()))?;
    let rest = &html[start..];
    let end = rest
        .find(";</script>")
        .or_else(|| rest.find(";\n"))
        .ok_or_else(|| WavefuncError::ContextVm("Could not parse YouTube search JSON".into()))?;

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

/// Prepare a YouTube download remotely via ContextVM `prepare_download` (used on Android or when local yt-dlp is absent).
pub async fn prepare_download_remote(
    client: &Client,
    client_keys: &Keys,
    server_pubkey_hex: &str,
    video_id: &str,
    format: &str,
    timeout_secs: u64,
) -> Result<PreparedMedia> {
    let normalized_fmt = match format {
        "p360" | "360p" => "360p",
        "p480" | "480p" => "480p",
        "p720" | "720p" => "720p",
        _ => "audio",
    };
    let val = call_tool(
        client,
        client_keys,
        server_pubkey_hex,
        "prepare_download",
        json!({
            "videoId": video_id.trim(),
            "format": normalized_fmt,
        }),
        timeout_secs,
    )
    .await?;

    let parsed: RawPrepareDownload = serde_json::from_value(val)?;
    Ok(PreparedMedia {
        job_id: format!("remote:{}", parsed.temp_id),
        sha256: parsed.sha256,
        size: parsed.size,
        mime_type: parsed.mime_type,
    })
}

/// Upload a remotely prepared file to Blossom via ContextVM `upload_to_blossom`.
pub async fn upload_to_blossom_remote(
    client: &Client,
    client_keys: &Keys,
    server_pubkey_hex: &str,
    temp_id: &str,
    blossom_url: &str,
    signed_auth_event: &str,
    timeout_secs: u64,
) -> Result<UploadedMedia> {
    let val = call_tool(
        client,
        client_keys,
        server_pubkey_hex,
        "upload_to_blossom",
        json!({
            "tempId": temp_id,
            "blossomUrl": blossom_url.trim(),
            "signedAuthEvent": signed_auth_event,
        }),
        timeout_secs,
    )
    .await?;

    let parsed: RawUploadBlossom = serde_json::from_value(val)?;
    Ok(UploadedMedia {
        url: parsed.url,
        sha256: parsed.sha256,
        size: parsed.size,
        mime_type: parsed.mime_type,
    })
}

/// Invoke `extract_stream_metadata` on the WaveFunc ContextVM server over Nostr kind `25910`.
pub async fn extract_stream_metadata(
    client: &Client,
    client_keys: &Keys,
    server_pubkey_hex: &str,
    stream_url: &str,
    station_address: Option<&str>,
    session_id: Option<&str>,
    timeout_secs: u64,
) -> Result<NowPlayingMetadata> {
    let server_pubkey = PublicKey::from_hex(server_pubkey_hex)?;
    let request_id = uuid::Uuid::new_v4().to_string();
    let payload =
        build_extract_metadata_payload(&request_id, stream_url, station_address, session_id)?;

    let request_event = EventBuilder::new(Kind::Custom(CONTEXTVM_KIND), payload)
        .tag(Tag::public_key(server_pubkey))
        .finalize(client_keys)?;
    let request_event_id = request_event.id;

    // Subscribe to correlated replies BEFORE publishing the request so no fast reply is missed.
    let filter = Filter::new()
        .kind(Kind::Custom(CONTEXTVM_KIND))
        .author(server_pubkey)
        .pubkey(client_keys.public_key())
        .event(request_event_id);

    let sub_output = client.subscribe(filter).await?;
    let sub_id = sub_output.value;
    let mut notifications = client.notifications();

    client.send_event(&request_event).await?;

    let deadline = Duration::from_secs(timeout_secs);
    let outcome = tokio::time::timeout(deadline, async {
        while let Some(notification) = notifications.next().await {
            if let ClientNotification::Event {
                subscription_id,
                event,
                ..
            } = notification
            {
                if subscription_id == sub_id && event.pubkey == server_pubkey {
                    return parse_metadata_response(&event.content);
                }
            }
        }
        Err(WavefuncError::ContextVm(
            "Notification stream ended before response".to_string(),
        ))
    })
    .await;

    let _ = client.unsubscribe(&sub_id).await;

    match outcome {
        Ok(result) => result,
        Err(_) => Err(WavefuncError::Timeout(timeout_secs)),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_structured_contextvm_metadata_response() {
        let raw = r#"{
            "jsonrpc": "2.0",
            "id": "abc-123",
            "result": {
                "structuredContent": {
                    "result": {
                        "title": "Boards of Canada - Roygbiv",
                        "artist": "Boards of Canada",
                        "song": "Roygbiv",
                        "source": "ICY",
                        "bitrate": "128",
                        "enriched": {
                            "artist": "Boards of Canada",
                            "title": "Roygbiv",
                            "album": "Music Has the Right to Children",
                            "releaseDate": "1998-04-20",
                            "duration": 151000,
                            "mbid": "mbid-test",
                            "confidence": "high",
                            "source": "musicbrainz"
                        }
                    }
                }
            }
        }"#;

        let parsed = parse_metadata_response(raw).expect("valid response");
        assert_eq!(parsed.artist.as_deref(), Some("Boards of Canada"));
        assert_eq!(parsed.song.as_deref(), Some("Roygbiv"));
        assert_eq!(
            parsed.album.as_deref(),
            Some("Music Has the Right to Children")
        );
        assert_eq!(parsed.release_date.as_deref(), Some("1998-04-20"));
        assert_eq!(parsed.confidence.as_deref(), Some("high"));
    }

    #[test]
    fn parses_error_contextvm_response() {
        let raw = r#"{
            "jsonrpc": "2.0",
            "id": "abc-123",
            "result": {
                "isError": true,
                "content": [{ "type": "text", "text": "{\"error\":\"Stream unreachable\"}" }]
            }
        }"#;

        let err = parse_metadata_response(raw).expect_err("should fail");
        assert!(err.to_string().contains("Stream unreachable"));
    }
}
