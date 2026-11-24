use serde::{Deserialize, Serialize};

/// Stream audio quality parameters encoded inside a station's `stream` tag or JSON content.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StreamQuality {
    #[serde(default)]
    pub bitrate: u32,
    #[serde(default)]
    pub codec: String,
    #[serde(default)]
    pub sample_rate: u32,
}

/// Single playable audio stream endpoint for a radio station.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StationStream {
    pub url: String,
    pub format: String,
    pub quality: StreamQuality,
    #[serde(default)]
    pub primary: bool,
}

impl StationStream {
    /// Human-readable short format badge matching the web UI (e.g. "MP3 128K", "HLS").
    pub fn format_badge(&self) -> String {
        let lower = self.format.to_lowercase();
        let name = match lower.as_str() {
            "audio/mpeg" | "audio/mp3" => "MP3".to_string(),
            "audio/aac" | "audio/mp4" | "audio/aacp" => "AAC".to_string(),
            "audio/ogg" | "application/ogg" => "OGG".to_string(),
            "audio/flac" => "FLAC".to_string(),
            "audio/wav" | "audio/x-wav" => "WAV".to_string(),
            "application/x-mpegurl" | "application/vnd.apple.mpegurl" | "audio/x-hls" => {
                "HLS".to_string()
            }
            _ => self
                .format
                .split('/')
                .next_back()
                .unwrap_or(&self.format)
                .to_uppercase(),
        };

        let kbps = if self.quality.bitrate >= 1000 {
            Some(self.quality.bitrate / 1000)
        } else if self.quality.bitrate > 0 {
            Some(self.quality.bitrate)
        } else {
            None
        };

        match kbps {
            Some(rate) => format!("{name} {rate}K"),
            None => name,
        }
    }
}

/// Parsed NIP-XX Internet Radio station (Nostr kind `31237`).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Station {
    pub id: String,
    pub pubkey: String,
    pub station_id: String,
    pub address: String,
    pub naddr: String,
    pub created_at: u64,
    pub name: String,
    pub description: Option<String>,
    pub thumbnail: Option<String>,
    pub website: Option<String>,
    pub location: Option<String>,
    pub country_code: Option<String>,
    pub genres: Vec<String>,
    pub languages: Vec<String>,
    pub streams: Vec<StationStream>,
    pub streaming_server_url: Option<String>,
}

/// Aggregated facet item (genre, language, or country) with station count.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FacetCount {
    pub name: String,
    pub count: u32,
}

/// Aggregated station discovery facets.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StationFacets {
    pub genres: Vec<FacetCount>,
    pub languages: Vec<FacetCount>,
    pub countries: Vec<FacetCount>,
}

/// Curated favorites list (kind `30078` with label `wavefunc_user_favourite_list`).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FeaturedList {
    pub id: String,
    pub pubkey: String,
    pub favorites_id: String,
    pub address: String,
    pub name: String,
    pub description: Option<String>,
    pub image: Option<String>,
    pub banner: Option<String>,
    pub station_addresses: Vec<String>,
}

/// Enriched now-playing metadata returned by ContextVM `extract_stream_metadata`.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NowPlayingMetadata {
    pub title: Option<String>,
    pub artist: Option<String>,
    pub song: Option<String>,
    pub station: Option<String>,
    pub genre: Option<String>,
    pub bitrate: Option<String>,
    pub description: Option<String>,
    pub listeners: Option<u32>,
    pub source: Option<String>,
    pub album: Option<String>,
    pub release_date: Option<String>,
    pub duration_ms: Option<u64>,
    pub mbid: Option<String>,
    pub confidence: Option<String>,
}

/// Connection and catalog summary returned to the UI.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RelayStatus {
    pub relay_url: String,
    pub connected: bool,
    pub total_station_count: Option<u64>,
}

// ─── Phase 2: Identity, Social, Favorites & Song Crates ──────────────────────

/// Active signer backing the logged-in account.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum SignerKind {
    LocalKey,
    Bunker,
    Amber,
}

/// Newly generated Nostr keypair returned during onboarding.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GeneratedAccount {
    pub pubkey: String,
    pub npub: String,
    pub nsec: String,
}

/// Parsed Nostr kind-0 profile metadata.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NostrProfile {
    pub pubkey: String,
    pub npub: String,
    pub name: Option<String>,
    pub display_name: Option<String>,
    pub picture: Option<String>,
    pub nip05: Option<String>,
    pub about: Option<String>,
    pub lud16: Option<String>,
    pub lud06: Option<String>,
}

impl NostrProfile {
    pub fn label(&self) -> String {
        if let Some(d) = self.display_name.as_deref().filter(|s| !s.trim().is_empty()) {
            return d.trim().to_string();
        }
        if let Some(n) = self.name.as_deref().filter(|s| !s.trim().is_empty()) {
            return n.trim().to_string();
        }
        if self.npub.len() > 16 {
            format!("{}...{}", &self.npub[..10], &self.npub[self.npub.len() - 6..])
        } else {
            self.npub.clone()
        }
    }
}

/// Active signed-in session state exposed to Flutter.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AccountSessionInfo {
    pub pubkey: String,
    pub npub: String,
    pub signer_kind: SignerKind,
    pub profile: Option<NostrProfile>,
}

/// Result of a NIP-46 bunker connection (contains credentials to persist securely).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BunkerLoginResult {
    pub session: AccountSessionInfo,
    pub bunker_uri: String,
    pub app_nsec: String,
}

/// Pending NIP-46 `nostrconnect://` QR pairing challenge.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NostrConnectChallenge {
    pub session_id: String,
    pub connect_uri: String,
    pub app_nsec: String,
}

/// Result of any write operation: either signed & published directly (LocalKey / Bunker),
/// or returned as an unsigned event JSON ready for Android NIP-55 Amber signing.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ActionOutcome {
    pub published: bool,
    pub event_id: Option<String>,
    pub unsigned_event_json: Option<String>,
    pub target_address: Option<String>,
}

/// Flattened NIP-22 station comment node with indentation depth.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StationComment {
    pub id: String,
    pub pubkey: String,
    pub author_name: String,
    pub author_picture: Option<String>,
    pub content: String,
    pub created_at: u64,
    pub parent_id: Option<String>,
    pub depth: u32,
}

/// Aggregated reactions, zaps, and threaded comments for a radio station.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StationSocialSummary {
    pub station_address: String,
    pub reaction_count: u32,
    pub user_reacted: bool,
    pub comment_count: u32,
    pub zap_count: u32,
    pub zap_sats: u64,
    pub user_zapped: bool,
    pub comments: Vec<StationComment>,
}

/// Lightweight per-station social telemetry for station cards on discovery/list views.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StationCardCounts {
    pub station_address: String,
    pub reaction_count: u32,
    pub user_reacted: bool,
    pub comment_count: u32,
    pub zap_count: u32,
    pub zap_sats: u64,
    pub user_zapped: bool,
}

/// Connected NWC (NIP-47) Lightning wallet state.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NwcWalletStatus {
    pub connected: bool,
    pub wallet_pubkey: Option<String>,
    pub relay: Option<String>,
    pub lud16: Option<String>,
    pub balance_sats: Option<u64>,
}

/// Prepared Lightning zap invoice (either ready to pay or awaiting Amber signing of kind 9734).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ZapInvoiceResult {
    pub bolt11: Option<String>,
    pub amount_sats: u64,
    pub recipient_lud16: String,
    pub allows_nostr: bool,
    pub callback_url: String,
    pub unsigned_zap_request_json: Option<String>,
}

/// Result of paying a Lightning invoice via NWC.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ZapPaymentResult {
    pub preimage: String,
    pub amount_sats: u64,
    pub bolt11: String,
}

// ─── Phase 4: Cashu CDK Wallet (NIP-60/61) & Desktop Media Acquisition ──────

/// Balance for a single configured Cashu mint.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CashuMintBalance {
    pub mint_url: String,
    pub balance_sats: u64,
}

/// Overall state of the embedded Cashu (`cdk`) wallet.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CashuWalletStatus {
    pub initialized: bool,
    pub total_balance_sats: u64,
    pub mints: Vec<CashuMintBalance>,
}

/// NUT-04 Lightning deposit quote for minting Cashu ecash.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CashuMintQuoteInfo {
    pub mint_url: String,
    pub quote_id: String,
    pub bolt11: String,
    pub amount_sats: u64,
}

/// Result of redeeming a Cashu token (`cashuA...` / `cashuB...`).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CashuReceiveResult {
    pub received_sats: u64,
    pub mint_url: String,
    pub status: CashuWalletStatus,
}

/// Result of creating an outbound Cashu token.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CashuSendResult {
    pub token: String,
    pub amount_sats: u64,
    pub mint_url: String,
    pub status: CashuWalletStatus,
}

/// Recipient NIP-61 `kind 10019` Nutzap configuration.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RecipientNutzapInfo {
    pub pubkey: String,
    pub p2pk_pubkey: Option<String>,
    pub mints: Vec<String>,
    pub relays: Vec<String>,
}

/// Locally prepared audio/video file ready for Blossom upload.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PreparedMedia {
    pub job_id: String,
    pub sha256: String,
    pub size: u64,
    pub mime_type: String,
}

/// Result of uploading a prepared media file to a Blossom server.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UploadedMedia {
    pub url: String,
    pub sha256: String,
    pub size: u64,
    pub mime_type: String,
}

/// Parsed WaveFunc community feed note (`kind 1` or legacy `kind 1111` tagged `#wavefunc`).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CommunityPost {
    pub id: String,
    pub pubkey: String,
    pub author_name: String,
    pub author_picture: Option<String>,
    pub content: String,
    pub created_at: u64,
    pub categories: Vec<String>,
    pub is_reply: bool,
    pub parent_id: Option<String>,
    pub root_id: Option<String>,
    pub reply_count: u32,
}

/// Parsed WaveFunc saved song (`kind 31337`).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SavedSong {
    pub id: String,
    pub pubkey: String,
    pub song_id: String,
    pub address: String,
    pub title: String,
    pub artist: Option<String>,
    pub album: Option<String>,
    pub cover_art: Option<String>,
    pub thumb: Option<String>,
    pub duration_secs: Option<u32>,
    pub release_year: Option<u32>,
    pub mbid: Option<String>,
    pub audio_url: Option<String>,
    pub genres: Vec<String>,
    pub created_at: u64,
}

/// User's synced song crate (`kind 30078` label `wavefunc_user_song_list`).
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SongCrate {
    pub list_id: String,
    pub address: String,
    pub name: String,
    pub description: Option<String>,
    pub song_addresses: Vec<String>,
    pub songs: Vec<SavedSong>,
}
