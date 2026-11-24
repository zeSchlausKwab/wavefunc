use std::time::Duration;

use futures_util::StreamExt;
use nostr_sdk::prelude::*;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

use crate::config::CONTEXTVM_KIND;
use crate::error::{Result, WavefuncError};
use crate::models::NowPlayingMetadata;

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
