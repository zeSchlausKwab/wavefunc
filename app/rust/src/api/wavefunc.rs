use std::sync::Arc;

use once_cell::sync::OnceCell;
use wavefunc_core::{
    AccountSessionInfo, ActionOutcome, AudioSpectrumSnapshot, BlossomAuthResult, BunkerLoginResult,
    CashuMintBalance, CashuMintQuoteInfo, CashuReceiveResult, CashuSendResult, CashuWalletStatus,
    CommunityPost, CoreConfig, FacetCount, FeaturedList, GeneratedAccount, MusicBrainzRecording,
    Nip60DecryptedTokenEvent, Nip60RawEvents, Nip60RawTokenEvent, NostrConnectChallenge,
    NostrProfile, NowPlayingMetadata, NwcWalletStatus, PreparedMedia, RecipientNutzapInfo,
    RelayStatus, SavedSong, SignalChartsData, SignerKind, SongCrate, Station, StationCardCounts,
    StationComment, StationFacets, StationHealthSummary, StationRankingEntry,
    StationRankingSnapshot, StationSocialSummary, StationStream, StreamQuality, UploadedMedia,
    WavefuncCore, YouTubeSearchResult, ZapInvoiceResult, ZapPaymentResult,
};

static CORE: OnceCell<Arc<WavefuncCore>> = OnceCell::new();

fn core() -> Arc<WavefuncCore> {
    CORE.get_or_init(|| WavefuncCore::new(CoreConfig::default()))
        .clone()
}

// ─── Phase 1 DTOs ────────────────────────────────────────────────────────────

pub struct FrbStreamQuality {
    pub bitrate: u32,
    pub codec: String,
    pub sample_rate: u32,
}

pub struct FrbStationStream {
    pub url: String,
    pub format: String,
    pub quality: FrbStreamQuality,
    pub primary: bool,
}

pub struct FrbStation {
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
    pub streams: Vec<FrbStationStream>,
    pub streaming_server_url: Option<String>,
}

pub struct FrbFacetCount {
    pub name: String,
    pub count: u32,
}

pub struct FrbStationFacets {
    pub genres: Vec<FrbFacetCount>,
    pub languages: Vec<FrbFacetCount>,
    pub countries: Vec<FrbFacetCount>,
}

pub struct FrbFeaturedList {
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

pub struct FrbNowPlayingMetadata {
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

pub struct FrbRelayStatus {
    pub relay_url: String,
    pub connected: bool,
    pub total_station_count: Option<u64>,
}

// ─── Phase 2 DTOs ────────────────────────────────────────────────────────────

pub enum FrbSignerKind {
    LocalKey,
    Bunker,
    Amber,
}

pub struct FrbGeneratedAccount {
    pub pubkey: String,
    pub npub: String,
    pub nsec: String,
}

pub struct FrbNostrProfile {
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

pub struct FrbAccountSessionInfo {
    pub pubkey: String,
    pub npub: String,
    pub signer_kind: FrbSignerKind,
    pub profile: Option<FrbNostrProfile>,
}

pub struct FrbBunkerLoginResult {
    pub session: FrbAccountSessionInfo,
    pub bunker_uri: String,
    pub app_nsec: String,
}

pub struct FrbNostrConnectChallenge {
    pub session_id: String,
    pub connect_uri: String,
    pub app_nsec: String,
}

pub struct FrbActionOutcome {
    pub published: bool,
    pub event_id: Option<String>,
    pub unsigned_event_json: Option<String>,
    pub target_address: Option<String>,
}

pub struct FrbStationComment {
    pub id: String,
    pub pubkey: String,
    pub author_name: String,
    pub author_picture: Option<String>,
    pub content: String,
    pub created_at: u64,
    pub parent_id: Option<String>,
    pub depth: u32,
}

pub struct FrbStationSocialSummary {
    pub station_address: String,
    pub reaction_count: u32,
    pub user_reacted: bool,
    pub comment_count: u32,
    pub zap_count: u32,
    pub zap_sats: u64,
    pub user_zapped: bool,
    pub comments: Vec<FrbStationComment>,
}

pub struct FrbStationCardCounts {
    pub station_address: String,
    pub reaction_count: u32,
    pub user_reacted: bool,
    pub comment_count: u32,
    pub zap_count: u32,
    pub zap_sats: u64,
    pub user_zapped: bool,
}

pub struct FrbNwcWalletStatus {
    pub connected: bool,
    pub wallet_pubkey: Option<String>,
    pub relay: Option<String>,
    pub lud16: Option<String>,
    pub balance_sats: Option<u64>,
}

pub struct FrbZapInvoiceResult {
    pub bolt11: Option<String>,
    pub amount_sats: u64,
    pub recipient_lud16: String,
    pub allows_nostr: bool,
    pub callback_url: String,
    pub unsigned_zap_request_json: Option<String>,
}

pub struct FrbZapPaymentResult {
    pub preimage: String,
    pub amount_sats: u64,
    pub bolt11: String,
}

pub struct FrbCommunityPost {
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

pub struct FrbSavedSong {
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

pub struct FrbSongCrate {
    pub list_id: String,
    pub address: String,
    pub name: String,
    pub description: Option<String>,
    pub song_addresses: Vec<String>,
    pub songs: Vec<FrbSavedSong>,
}

// ─── Conversions ─────────────────────────────────────────────────────────────

impl From<StreamQuality> for FrbStreamQuality {
    fn from(v: StreamQuality) -> Self {
        Self {
            bitrate: v.bitrate,
            codec: v.codec,
            sample_rate: v.sample_rate,
        }
    }
}

impl From<StationStream> for FrbStationStream {
    fn from(v: StationStream) -> Self {
        Self {
            url: v.url,
            format: v.format,
            quality: v.quality.into(),
            primary: v.primary,
        }
    }
}

impl From<Station> for FrbStation {
    fn from(v: Station) -> Self {
        Self {
            id: v.id,
            pubkey: v.pubkey,
            station_id: v.station_id,
            address: v.address,
            naddr: v.naddr,
            created_at: v.created_at,
            name: v.name,
            description: v.description,
            thumbnail: v.thumbnail,
            website: v.website,
            location: v.location,
            country_code: v.country_code,
            genres: v.genres,
            languages: v.languages,
            streams: v.streams.into_iter().map(Into::into).collect(),
            streaming_server_url: v.streaming_server_url,
        }
    }
}

impl From<FacetCount> for FrbFacetCount {
    fn from(v: FacetCount) -> Self {
        Self {
            name: v.name,
            count: v.count,
        }
    }
}

impl From<StationFacets> for FrbStationFacets {
    fn from(v: StationFacets) -> Self {
        Self {
            genres: v.genres.into_iter().map(Into::into).collect(),
            languages: v.languages.into_iter().map(Into::into).collect(),
            countries: v.countries.into_iter().map(Into::into).collect(),
        }
    }
}

impl From<FeaturedList> for FrbFeaturedList {
    fn from(v: FeaturedList) -> Self {
        Self {
            id: v.id,
            pubkey: v.pubkey,
            favorites_id: v.favorites_id,
            address: v.address,
            name: v.name,
            description: v.description,
            image: v.image,
            banner: v.banner,
            station_addresses: v.station_addresses,
        }
    }
}

impl From<NowPlayingMetadata> for FrbNowPlayingMetadata {
    fn from(v: NowPlayingMetadata) -> Self {
        Self {
            title: v.title,
            artist: v.artist,
            song: v.song,
            station: v.station,
            genre: v.genre,
            bitrate: v.bitrate,
            description: v.description,
            listeners: v.listeners,
            source: v.source,
            album: v.album,
            release_date: v.release_date,
            duration_ms: v.duration_ms,
            mbid: v.mbid,
            confidence: v.confidence,
        }
    }
}

impl From<RelayStatus> for FrbRelayStatus {
    fn from(v: RelayStatus) -> Self {
        Self {
            relay_url: v.relay_url,
            connected: v.connected,
            total_station_count: v.total_station_count,
        }
    }
}

impl From<SignerKind> for FrbSignerKind {
    fn from(v: SignerKind) -> Self {
        match v {
            SignerKind::LocalKey => Self::LocalKey,
            SignerKind::Bunker => Self::Bunker,
            SignerKind::Amber => Self::Amber,
        }
    }
}

impl From<GeneratedAccount> for FrbGeneratedAccount {
    fn from(v: GeneratedAccount) -> Self {
        Self {
            pubkey: v.pubkey,
            npub: v.npub,
            nsec: v.nsec,
        }
    }
}

impl From<NostrProfile> for FrbNostrProfile {
    fn from(v: NostrProfile) -> Self {
        Self {
            pubkey: v.pubkey,
            npub: v.npub,
            name: v.name,
            display_name: v.display_name,
            picture: v.picture,
            nip05: v.nip05,
            about: v.about,
            lud16: v.lud16,
            lud06: v.lud06,
        }
    }
}

impl From<AccountSessionInfo> for FrbAccountSessionInfo {
    fn from(v: AccountSessionInfo) -> Self {
        Self {
            pubkey: v.pubkey,
            npub: v.npub,
            signer_kind: v.signer_kind.into(),
            profile: v.profile.map(Into::into),
        }
    }
}

impl From<BunkerLoginResult> for FrbBunkerLoginResult {
    fn from(v: BunkerLoginResult) -> Self {
        Self {
            session: v.session.into(),
            bunker_uri: v.bunker_uri,
            app_nsec: v.app_nsec,
        }
    }
}

impl From<NostrConnectChallenge> for FrbNostrConnectChallenge {
    fn from(v: NostrConnectChallenge) -> Self {
        Self {
            session_id: v.session_id,
            connect_uri: v.connect_uri,
            app_nsec: v.app_nsec,
        }
    }
}

impl From<ActionOutcome> for FrbActionOutcome {
    fn from(v: ActionOutcome) -> Self {
        Self {
            published: v.published,
            event_id: v.event_id,
            unsigned_event_json: v.unsigned_event_json,
            target_address: v.target_address,
        }
    }
}

impl From<StationComment> for FrbStationComment {
    fn from(v: StationComment) -> Self {
        Self {
            id: v.id,
            pubkey: v.pubkey,
            author_name: v.author_name,
            author_picture: v.author_picture,
            content: v.content,
            created_at: v.created_at,
            parent_id: v.parent_id,
            depth: v.depth,
        }
    }
}

impl From<StationSocialSummary> for FrbStationSocialSummary {
    fn from(v: StationSocialSummary) -> Self {
        Self {
            station_address: v.station_address,
            reaction_count: v.reaction_count,
            user_reacted: v.user_reacted,
            comment_count: v.comment_count,
            zap_count: v.zap_count,
            zap_sats: v.zap_sats,
            user_zapped: v.user_zapped,
            comments: v.comments.into_iter().map(Into::into).collect(),
        }
    }
}

impl From<StationCardCounts> for FrbStationCardCounts {
    fn from(v: StationCardCounts) -> Self {
        Self {
            station_address: v.station_address,
            reaction_count: v.reaction_count,
            user_reacted: v.user_reacted,
            comment_count: v.comment_count,
            zap_count: v.zap_count,
            zap_sats: v.zap_sats,
            user_zapped: v.user_zapped,
        }
    }
}

impl From<NwcWalletStatus> for FrbNwcWalletStatus {
    fn from(v: NwcWalletStatus) -> Self {
        Self {
            connected: v.connected,
            wallet_pubkey: v.wallet_pubkey,
            relay: v.relay,
            lud16: v.lud16,
            balance_sats: v.balance_sats,
        }
    }
}

impl From<ZapInvoiceResult> for FrbZapInvoiceResult {
    fn from(v: ZapInvoiceResult) -> Self {
        Self {
            bolt11: v.bolt11,
            amount_sats: v.amount_sats,
            recipient_lud16: v.recipient_lud16,
            allows_nostr: v.allows_nostr,
            callback_url: v.callback_url,
            unsigned_zap_request_json: v.unsigned_zap_request_json,
        }
    }
}

impl From<ZapPaymentResult> for FrbZapPaymentResult {
    fn from(v: ZapPaymentResult) -> Self {
        Self {
            preimage: v.preimage,
            amount_sats: v.amount_sats,
            bolt11: v.bolt11,
        }
    }
}

impl From<CommunityPost> for FrbCommunityPost {
    fn from(v: CommunityPost) -> Self {
        Self {
            id: v.id,
            pubkey: v.pubkey,
            author_name: v.author_name,
            author_picture: v.author_picture,
            content: v.content,
            created_at: v.created_at,
            categories: v.categories,
            is_reply: v.is_reply,
            parent_id: v.parent_id,
            root_id: v.root_id,
            reply_count: v.reply_count,
        }
    }
}

impl From<SavedSong> for FrbSavedSong {
    fn from(v: SavedSong) -> Self {
        Self {
            id: v.id,
            pubkey: v.pubkey,
            song_id: v.song_id,
            address: v.address,
            title: v.title,
            artist: v.artist,
            album: v.album,
            cover_art: v.cover_art,
            thumb: v.thumb,
            duration_secs: v.duration_secs,
            release_year: v.release_year,
            mbid: v.mbid,
            audio_url: v.audio_url,
            genres: v.genres,
            created_at: v.created_at,
        }
    }
}

impl From<SongCrate> for FrbSongCrate {
    fn from(v: SongCrate) -> Self {
        Self {
            list_id: v.list_id,
            address: v.address,
            name: v.name,
            description: v.description,
            song_addresses: v.song_addresses,
            songs: v.songs.into_iter().map(Into::into).collect(),
        }
    }
}

// ─── Phase 1 Functions ───────────────────────────────────────────────────────

pub async fn connect_relay(relay_url: String) -> Result<FrbRelayStatus, String> {
    core()
        .set_relay(&relay_url)
        .await
        .map(Into::into)
        .map_err(|e| e.to_string())
}

pub async fn get_relay_status() -> Result<FrbRelayStatus, String> {
    core()
        .relay_status()
        .await
        .map(Into::into)
        .map_err(|e| e.to_string())
}

pub async fn fetch_stations(limit: u32) -> Result<Vec<FrbStation>, String> {
    core()
        .fetch_stations(limit as usize)
        .await
        .map(|list| list.into_iter().map(Into::into).collect())
        .map_err(|e| e.to_string())
}

pub async fn search_stations(
    query: Option<String>,
    genre: Option<String>,
    country: Option<String>,
    language: Option<String>,
    limit: u32,
) -> Result<Vec<FrbStation>, String> {
    core()
        .search_stations(
            query.as_deref(),
            genre.as_deref(),
            country.as_deref(),
            language.as_deref(),
            limit as usize,
        )
        .await
        .map(|list| list.into_iter().map(Into::into).collect())
        .map_err(|e| e.to_string())
}

pub async fn fetch_station_by_address(address: String) -> Result<Option<FrbStation>, String> {
    core()
        .fetch_station_by_address(&address)
        .await
        .map(|opt| opt.map(Into::into))
        .map_err(|e| e.to_string())
}

pub async fn fetch_stations_by_addresses(addresses: Vec<String>) -> Result<Vec<FrbStation>, String> {
    core()
        .fetch_stations_by_addresses(&addresses)
        .await
        .map(|list| list.into_iter().map(Into::into).collect())
        .map_err(|e| e.to_string())
}

pub async fn fetch_featured_lists() -> Result<Vec<FrbFeaturedList>, String> {
    core()
        .fetch_featured_lists()
        .await
        .map(|list| list.into_iter().map(Into::into).collect())
        .map_err(|e| e.to_string())
}

pub async fn get_station_facets() -> FrbStationFacets {
    core().get_facets().await.into()
}

pub async fn extract_stream_metadata(
    stream_url: String,
    station_address: Option<String>,
    session_id: Option<String>,
) -> Result<FrbNowPlayingMetadata, String> {
    core()
        .extract_stream_metadata(
            &stream_url,
            station_address.as_deref(),
            session_id.as_deref(),
        )
        .await
        .map(Into::into)
        .map_err(|e| e.to_string())
}

// ─── Phase 2 Functions: Auth, Favorites, Social, Community, Crate, NIP-38 ───

pub fn generate_account() -> Result<FrbGeneratedAccount, String> {
    WavefuncCore::generate_account()
        .map(Into::into)
        .map_err(|e| e.to_string())
}

pub async fn login_with_nsec(secret: String) -> Result<FrbAccountSessionInfo, String> {
    core()
        .login_with_nsec(&secret)
        .await
        .map(Into::into)
        .map_err(|e| e.to_string())
}

pub async fn login_with_bunker(
    bunker_uri: String,
    app_nsec: Option<String>,
) -> Result<FrbBunkerLoginResult, String> {
    core()
        .login_with_bunker(&bunker_uri, app_nsec.as_deref())
        .await
        .map(Into::into)
        .map_err(|e| e.to_string())
}

pub async fn login_with_amber(pubkey_or_npub: String) -> Result<FrbAccountSessionInfo, String> {
    core()
        .login_with_amber(&pubkey_or_npub)
        .await
        .map(Into::into)
        .map_err(|e| e.to_string())
}

pub async fn start_nostr_connect_session(
    relay_url: Option<String>,
    client_name: Option<String>,
) -> Result<FrbNostrConnectChallenge, String> {
    core()
        .start_nostr_connect_session(relay_url.as_deref(), client_name.as_deref())
        .await
        .map(Into::into)
        .map_err(|e| e.to_string())
}

pub async fn await_nostr_connect_session(
    session_id: String,
) -> Result<FrbBunkerLoginResult, String> {
    core()
        .await_nostr_connect_session(&session_id)
        .await
        .map(Into::into)
        .map_err(|e| e.to_string())
}

pub async fn cancel_nostr_connect_session(session_id: String) {
    core().cancel_nostr_connect_session(&session_id).await;
}

pub async fn publish_profile(
    name: Option<String>,
    about: Option<String>,
    picture: Option<String>,
    lud16: Option<String>,
) -> Result<FrbActionOutcome, String> {
    core()
        .publish_profile(
            name.as_deref(),
            about.as_deref(),
            picture.as_deref(),
            lud16.as_deref(),
        )
        .await
        .map(Into::into)
        .map_err(|e| e.to_string())
}

pub async fn logout_account() {
    core().logout().await;
}

pub async fn current_account() -> Option<FrbAccountSessionInfo> {
    core().current_account().await.map(Into::into)
}

pub async fn publish_signed_event(signed_event_json: String) -> Result<FrbActionOutcome, String> {
    core()
        .publish_signed_event(&signed_event_json)
        .await
        .map(Into::into)
        .map_err(|e| e.to_string())
}

pub async fn fetch_user_favorites() -> Result<Vec<FrbFeaturedList>, String> {
    core()
        .fetch_user_favorites()
        .await
        .map(|list| list.into_iter().map(Into::into).collect())
        .map_err(|e| e.to_string())
}

pub async fn toggle_favorite_station(
    station_address: String,
    add: bool,
) -> Result<FrbActionOutcome, String> {
    core()
        .toggle_favorite_station(&station_address, add)
        .await
        .map(Into::into)
        .map_err(|e| e.to_string())
}

pub async fn create_favorites_list(
    name: String,
    description: Option<String>,
    station_addresses: Vec<String>,
) -> Result<FrbActionOutcome, String> {
    core()
        .create_favorites_list(&name, description.as_deref(), &station_addresses)
        .await
        .map(Into::into)
        .map_err(|e| e.to_string())
}

pub async fn update_favorites_list(
    favorites_id: String,
    name: String,
    description: Option<String>,
) -> Result<FrbActionOutcome, String> {
    core()
        .update_favorites_list(&favorites_id, &name, description.as_deref())
        .await
        .map(Into::into)
        .map_err(|e| e.to_string())
}

pub async fn delete_favorites_list(
    event_id: String,
    favorites_id: String,
) -> Result<FrbActionOutcome, String> {
    core()
        .delete_favorites_list(&event_id, &favorites_id)
        .await
        .map(Into::into)
        .map_err(|e| e.to_string())
}

pub async fn toggle_station_in_favorites_list(
    favorites_id: Option<String>,
    station_address: String,
    add: bool,
) -> Result<FrbActionOutcome, String> {
    core()
        .toggle_station_in_favorites_list(favorites_id.as_deref(), &station_address, add)
        .await
        .map(Into::into)
        .map_err(|e| e.to_string())
}

pub async fn fetch_station_social(
    station_address: String,
    station_event_id: String,
) -> Result<FrbStationSocialSummary, String> {
    core()
        .fetch_station_social(&station_address, &station_event_id)
        .await
        .map(Into::into)
        .map_err(|e| e.to_string())
}

pub async fn react_to_station(
    station_id: String,
    station_pubkey: String,
    station_address: String,
) -> Result<FrbActionOutcome, String> {
    core()
        .react_to_station(&station_id, &station_pubkey, &station_address)
        .await
        .map(Into::into)
        .map_err(|e| e.to_string())
}

pub async fn post_station_comment(
    station_event_id: String,
    station_pubkey: String,
    station_address: String,
    content: String,
    reply_to_id: Option<String>,
    reply_to_pubkey: Option<String>,
) -> Result<FrbActionOutcome, String> {
    core()
        .post_station_comment(
            &station_event_id,
            &station_pubkey,
            &station_address,
            &content,
            reply_to_id.as_deref(),
            reply_to_pubkey.as_deref(),
        )
        .await
        .map(Into::into)
        .map_err(|e| e.to_string())
}

pub async fn fetch_community_posts(limit: u32) -> Result<Vec<FrbCommunityPost>, String> {
    core()
        .fetch_community_posts(limit as usize)
        .await
        .map(|list| list.into_iter().map(Into::into).collect())
        .map_err(|e| e.to_string())
}

pub async fn post_community_note(
    content: String,
    category: Option<String>,
    reply_to_id: Option<String>,
    reply_to_pubkey: Option<String>,
    root_id: Option<String>,
    root_pubkey: Option<String>,
) -> Result<FrbActionOutcome, String> {
    core()
        .post_community_note(
            &content,
            category.as_deref(),
            reply_to_id.as_deref(),
            reply_to_pubkey.as_deref(),
            root_id.as_deref(),
            root_pubkey.as_deref(),
        )
        .await
        .map(Into::into)
        .map_err(|e| e.to_string())
}

pub async fn fetch_song_crate() -> Result<FrbSongCrate, String> {
    core()
        .fetch_song_crate()
        .await
        .map(Into::into)
        .map_err(|e| e.to_string())
}

#[allow(clippy::too_many_arguments)]
pub async fn create_song_event(
    title: String,
    artist: Option<String>,
    album: Option<String>,
    mbid: Option<String>,
    release_id: Option<String>,
    release_date: Option<String>,
    duration_ms: Option<u64>,
    genres: Vec<String>,
) -> Result<FrbActionOutcome, String> {
    core()
        .create_song_event(
            &title,
            artist.as_deref(),
            album.as_deref(),
            mbid.as_deref(),
            release_id.as_deref(),
            release_date.as_deref(),
            duration_ms,
            &genres,
        )
        .await
        .map(Into::into)
        .map_err(|e| e.to_string())
}

pub async fn update_song_crate(
    song_address: String,
    add: bool,
) -> Result<FrbActionOutcome, String> {
    core()
        .update_song_crate(&song_address, add)
        .await
        .map(Into::into)
        .map_err(|e| e.to_string())
}

pub async fn publish_listening_status(
    title: Option<String>,
    artist: Option<String>,
    station_address: Option<String>,
    station_url: Option<String>,
) -> Result<FrbActionOutcome, String> {
    core()
        .publish_listening_status(
            title.as_deref(),
            artist.as_deref(),
            station_address.as_deref(),
            station_url.as_deref(),
        )
        .await
        .map(Into::into)
        .map_err(|e| e.to_string())
}

// ─── Batch Social Counts, NWC Wallet & NIP-57 Lightning Zaps ────────────────

pub async fn fetch_stations_social_counts(
    addresses: Vec<String>,
) -> Result<Vec<FrbStationCardCounts>, String> {
    core()
        .fetch_stations_social_counts(&addresses)
        .await
        .map(|list| list.into_iter().map(Into::into).collect())
        .map_err(|e| e.to_string())
}

pub async fn connect_nwc(nwc_uri: String) -> Result<FrbNwcWalletStatus, String> {
    core()
        .connect_nwc(&nwc_uri)
        .await
        .map(Into::into)
        .map_err(|e| e.to_string())
}

pub async fn disconnect_nwc() {
    core().disconnect_nwc().await;
}

pub async fn get_nwc_status() -> FrbNwcWalletStatus {
    core().get_nwc_status().await.into()
}

pub async fn refresh_nwc_balance() -> Result<FrbNwcWalletStatus, String> {
    core()
        .refresh_nwc_balance()
        .await
        .map(Into::into)
        .map_err(|e| e.to_string())
}

pub async fn prepare_station_zap(
    station_event_id: String,
    station_pubkey: String,
    station_address: String,
    amount_sats: u64,
    comment: Option<String>,
) -> Result<FrbZapInvoiceResult, String> {
    core()
        .prepare_station_zap(
            &station_event_id,
            &station_pubkey,
            &station_address,
            amount_sats,
            comment.as_deref(),
        )
        .await
        .map(Into::into)
        .map_err(|e| e.to_string())
}

pub async fn complete_station_zap_with_signed_request(
    callback_url: String,
    amount_sats: u64,
    comment: Option<String>,
    signed_zap_request_json: String,
    recipient_lud16: String,
) -> Result<FrbZapInvoiceResult, String> {
    core()
        .complete_station_zap_with_signed_request(
            &callback_url,
            amount_sats,
            comment.as_deref(),
            &signed_zap_request_json,
            &recipient_lud16,
        )
        .await
        .map(Into::into)
        .map_err(|e| e.to_string())
}

pub async fn pay_invoice_nwc(
    bolt11: String,
    amount_sats: u64,
) -> Result<FrbZapPaymentResult, String> {
    core()
        .pay_invoice_nwc(&bolt11, amount_sats)
        .await
        .map(Into::into)
        .map_err(|e| e.to_string())
}

pub async fn check_station_zap_receipt(
    station_event_id: String,
    station_address: String,
    bolt11: String,
    since_unix: u64,
) -> Result<bool, String> {
    core()
        .check_station_zap_receipt(&station_event_id, &station_address, &bolt11, since_unix)
        .await
        .map_err(|e| e.to_string())
}

// ─── Phase 4 DTOs: Embedded Cashu Ecash Wallet, NIP-61 Nutzaps & Media ──────

pub struct FrbCashuMintBalance {
    pub mint_url: String,
    pub balance_sats: u64,
}

impl From<CashuMintBalance> for FrbCashuMintBalance {
    fn from(m: CashuMintBalance) -> Self {
        Self {
            mint_url: m.mint_url,
            balance_sats: m.balance_sats,
        }
    }
}

pub struct FrbCashuWalletStatus {
    pub initialized: bool,
    pub total_balance_sats: u64,
    pub mints: Vec<FrbCashuMintBalance>,
    pub nip60_synced: bool,
    pub wallet_relays: Vec<String>,
    pub token_event_count: u32,
}

impl From<CashuWalletStatus> for FrbCashuWalletStatus {
    fn from(s: CashuWalletStatus) -> Self {
        Self {
            initialized: s.initialized,
            total_balance_sats: s.total_balance_sats,
            mints: s.mints.into_iter().map(Into::into).collect(),
            nip60_synced: s.nip60_synced,
            wallet_relays: s.wallet_relays,
            token_event_count: s.token_event_count,
        }
    }
}

pub struct FrbNip60RawTokenEvent {
    pub id: String,
    pub created_at: u64,
    pub content: String,
}

impl From<Nip60RawTokenEvent> for FrbNip60RawTokenEvent {
    fn from(e: Nip60RawTokenEvent) -> Self {
        Self {
            id: e.id,
            created_at: e.created_at,
            content: e.content,
        }
    }
}

pub struct FrbNip60RawEvents {
    pub wallet_event_content: Option<String>,
    pub token_events: Vec<FrbNip60RawTokenEvent>,
    pub deleted_ids: Vec<String>,
    pub wallet_relays: Vec<String>,
    pub discovered_mints: Vec<String>,
}

impl From<Nip60RawEvents> for FrbNip60RawEvents {
    fn from(r: Nip60RawEvents) -> Self {
        Self {
            wallet_event_content: r.wallet_event_content,
            token_events: r.token_events.into_iter().map(Into::into).collect(),
            deleted_ids: r.deleted_ids,
            wallet_relays: r.wallet_relays,
            discovered_mints: r.discovered_mints,
        }
    }
}

pub struct FrbNip60DecryptedTokenEvent {
    pub id: String,
    pub plaintext: String,
}

impl From<FrbNip60DecryptedTokenEvent> for Nip60DecryptedTokenEvent {
    fn from(e: FrbNip60DecryptedTokenEvent) -> Self {
        Self {
            id: e.id,
            plaintext: e.plaintext,
        }
    }
}

pub struct FrbCashuMintQuoteInfo {
    pub mint_url: String,
    pub quote_id: String,
    pub bolt11: String,
    pub amount_sats: u64,
}

impl From<CashuMintQuoteInfo> for FrbCashuMintQuoteInfo {
    fn from(q: CashuMintQuoteInfo) -> Self {
        Self {
            mint_url: q.mint_url,
            quote_id: q.quote_id,
            bolt11: q.bolt11,
            amount_sats: q.amount_sats,
        }
    }
}

pub struct FrbCashuReceiveResult {
    pub received_sats: u64,
    pub mint_url: String,
    pub status: FrbCashuWalletStatus,
}

impl From<CashuReceiveResult> for FrbCashuReceiveResult {
    fn from(r: CashuReceiveResult) -> Self {
        Self {
            received_sats: r.received_sats,
            mint_url: r.mint_url,
            status: r.status.into(),
        }
    }
}

pub struct FrbCashuSendResult {
    pub token: String,
    pub amount_sats: u64,
    pub mint_url: String,
    pub status: FrbCashuWalletStatus,
}

impl From<CashuSendResult> for FrbCashuSendResult {
    fn from(r: CashuSendResult) -> Self {
        Self {
            token: r.token,
            amount_sats: r.amount_sats,
            mint_url: r.mint_url,
            status: r.status.into(),
        }
    }
}

pub struct FrbRecipientNutzapInfo {
    pub pubkey: String,
    pub p2pk_pubkey: Option<String>,
    pub mints: Vec<String>,
    pub relays: Vec<String>,
}

impl From<RecipientNutzapInfo> for FrbRecipientNutzapInfo {
    fn from(i: RecipientNutzapInfo) -> Self {
        Self {
            pubkey: i.pubkey,
            p2pk_pubkey: i.p2pk_pubkey,
            mints: i.mints,
            relays: i.relays,
        }
    }
}

pub struct FrbPreparedMedia {
    pub job_id: String,
    pub sha256: String,
    pub size: u64,
    pub mime_type: String,
}

impl From<PreparedMedia> for FrbPreparedMedia {
    fn from(m: PreparedMedia) -> Self {
        Self {
            job_id: m.job_id,
            sha256: m.sha256,
            size: m.size,
            mime_type: m.mime_type,
        }
    }
}

pub struct FrbUploadedMedia {
    pub url: String,
    pub sha256: String,
    pub size: u64,
    pub mime_type: String,
}

impl From<UploadedMedia> for FrbUploadedMedia {
    fn from(m: UploadedMedia) -> Self {
        Self {
            url: m.url,
            sha256: m.sha256,
            size: m.size,
            mime_type: m.mime_type,
        }
    }
}

// ─── Phase 4 Functions: Embedded Cashu Wallet, NIP-61 Nutzaps & Media ────────

pub async fn init_cashu_wallet(
    db_dir: String,
    seed_material: String,
    mints: Vec<String>,
) -> Result<FrbCashuWalletStatus, String> {
    core()
        .init_cashu_wallet(&db_dir, &seed_material, &mints)
        .await
        .map(Into::into)
        .map_err(|e| e.to_string())
}

pub async fn close_cashu_wallet() {
    core().close_cashu_wallet().await;
}

pub async fn fetch_nip60_raw_events() -> Result<FrbNip60RawEvents, String> {
    core()
        .fetch_nip60_raw_events()
        .await
        .map(Into::into)
        .map_err(|e| e.to_string())
}

pub async fn sync_nip60_wallet() -> Result<FrbCashuWalletStatus, String> {
    core()
        .sync_nip60_wallet()
        .await
        .map(Into::into)
        .map_err(|e| e.to_string())
}

pub async fn apply_decrypted_nip60_events(
    wallet_content_plain: Option<String>,
    decrypted_tokens: Vec<FrbNip60DecryptedTokenEvent>,
    deleted_ids: Vec<String>,
    discovered_mints: Vec<String>,
    wallet_relays: Vec<String>,
) -> Result<FrbCashuWalletStatus, String> {
    let tokens: Vec<Nip60DecryptedTokenEvent> =
        decrypted_tokens.into_iter().map(Into::into).collect();
    core()
        .apply_decrypted_nip60_events(
            wallet_content_plain.as_deref(),
            &tokens,
            &deleted_ids,
            &discovered_mints,
            &wallet_relays,
        )
        .await
        .map(Into::into)
        .map_err(|e| e.to_string())
}

pub async fn get_cashu_status() -> FrbCashuWalletStatus {
    core().get_cashu_status().await.into()
}

pub async fn add_cashu_mint(mint_url: String) -> Result<FrbCashuWalletStatus, String> {
    core()
        .add_cashu_mint(&mint_url)
        .await
        .map(Into::into)
        .map_err(|e| e.to_string())
}

pub async fn create_cashu_mint_quote(
    mint_url: String,
    amount_sats: u64,
) -> Result<FrbCashuMintQuoteInfo, String> {
    core()
        .create_cashu_mint_quote(&mint_url, amount_sats)
        .await
        .map(Into::into)
        .map_err(|e| e.to_string())
}

pub async fn claim_cashu_mint_quote(
    mint_url: String,
    quote_id: String,
) -> Result<FrbCashuWalletStatus, String> {
    core()
        .claim_cashu_mint_quote(&mint_url, &quote_id)
        .await
        .map(Into::into)
        .map_err(|e| e.to_string())
}

pub async fn receive_cashu_token(token: String) -> Result<FrbCashuReceiveResult, String> {
    core()
        .receive_cashu_token(&token)
        .await
        .map(Into::into)
        .map_err(|e| e.to_string())
}

pub async fn send_cashu_token(
    mint_url: Option<String>,
    amount_sats: u64,
    memo: Option<String>,
) -> Result<FrbCashuSendResult, String> {
    core()
        .send_cashu_token(mint_url.as_deref(), amount_sats, memo.as_deref())
        .await
        .map(Into::into)
        .map_err(|e| e.to_string())
}

pub async fn pay_invoice_cashu(
    mint_url: Option<String>,
    bolt11: String,
    amount_sats: u64,
) -> Result<FrbZapPaymentResult, String> {
    core()
        .pay_invoice_cashu(mint_url.as_deref(), &bolt11, amount_sats)
        .await
        .map(Into::into)
        .map_err(|e| e.to_string())
}

pub async fn fetch_recipient_nutzap_info(
    pubkey_hex: String,
) -> Result<Option<FrbRecipientNutzapInfo>, String> {
    core()
        .fetch_recipient_nutzap_info(&pubkey_hex)
        .await
        .map(|opt| opt.map(Into::into))
        .map_err(|e| e.to_string())
}

pub async fn pending_station_nutzap_amounts(station_address: String) -> Result<Vec<u64>, String> {
    core()
        .pending_station_nutzap_amounts(&station_address)
        .await
        .map_err(|e| e.to_string())
}

pub async fn send_station_nutzap(
    station_event_id: String,
    station_pubkey: String,
    station_address: String,
    amount_sats: u64,
    comment: Option<String>,
    retry_only: bool,
) -> Result<FrbActionOutcome, String> {
    let result = if retry_only {
        core()
            .retry_station_nutzap(&station_address, amount_sats)
            .await
    } else {
        core()
            .send_station_nutzap(
                &station_event_id,
                &station_pubkey,
                &station_address,
                amount_sats,
                comment.as_deref(),
            )
            .await
    };
    result.map(Into::into).map_err(|e| e.to_string())
}

pub async fn prepare_youtube_media(
    cache_root: String,
    video_id: String,
    format: String,
) -> Result<FrbPreparedMedia, String> {
    core()
        .prepare_youtube_media(&cache_root, &video_id, &format)
        .await
        .map(Into::into)
        .map_err(|e| e.to_string())
}

pub async fn register_downloaded_media(
    cache_root: String,
    job_id: String,
    format: String,
) -> Result<FrbPreparedMedia, String> {
    core()
        .register_downloaded_media(&cache_root, &job_id, &format)
        .await
        .map(Into::into)
        .map_err(|e| e.to_string())
}

pub async fn upload_media_to_blossom(
    job_id: String,
    blossom_url: String,
    signed_auth_event_json: String,
) -> Result<FrbUploadedMedia, String> {
    core()
        .upload_media_to_blossom(&job_id, &blossom_url, &signed_auth_event_json)
        .await
        .map(Into::into)
        .map_err(|e| e.to_string())
}

pub async fn discard_media_job(job_id: String) -> Result<(), String> {
    core()
        .discard_media_job(&job_id)
        .await
        .map_err(|e| e.to_string())
}

// ─── Song Search (MusicBrainz), YouTube Search & Blossom Auth ────────────────

pub struct FrbMusicBrainzRecording {
    pub id: String,
    pub title: String,
    pub artist: String,
    pub artist_id: Option<String>,
    pub release: Option<String>,
    pub release_id: Option<String>,
    pub release_date: Option<String>,
    pub duration_ms: Option<u64>,
    pub score: u32,
    pub tags: Vec<String>,
}

impl From<MusicBrainzRecording> for FrbMusicBrainzRecording {
    fn from(r: MusicBrainzRecording) -> Self {
        Self {
            id: r.id,
            title: r.title,
            artist: r.artist,
            artist_id: r.artist_id,
            release: r.release,
            release_id: r.release_id,
            release_date: r.release_date,
            duration_ms: r.duration_ms,
            score: r.score,
            tags: r.tags,
        }
    }
}

pub struct FrbYouTubeSearchResult {
    pub video_id: String,
    pub url: String,
    pub title: String,
    pub duration_secs: Option<u64>,
    pub channel: Option<String>,
    pub thumbnail_url: Option<String>,
}

impl From<YouTubeSearchResult> for FrbYouTubeSearchResult {
    fn from(y: YouTubeSearchResult) -> Self {
        Self {
            video_id: y.video_id,
            url: y.url,
            title: y.title,
            duration_secs: y.duration_secs,
            channel: y.channel,
            thumbnail_url: y.thumbnail_url,
        }
    }
}

pub struct FrbBlossomAuthResult {
    pub signed_event_json: Option<String>,
    pub unsigned_event_json: Option<String>,
}

impl From<BlossomAuthResult> for FrbBlossomAuthResult {
    fn from(r: BlossomAuthResult) -> Self {
        Self {
            signed_event_json: r.signed_event_json,
            unsigned_event_json: r.unsigned_event_json,
        }
    }
}

pub async fn search_recordings(
    query: String,
    artist: Option<String>,
    limit: u32,
) -> Result<Vec<FrbMusicBrainzRecording>, String> {
    core()
        .search_recordings(&query, artist.as_deref(), limit)
        .await
        .map(|list| list.into_iter().map(Into::into).collect())
        .map_err(|e| e.to_string())
}

pub async fn search_youtube(
    query: String,
    limit: u32,
) -> Result<Vec<FrbYouTubeSearchResult>, String> {
    core()
        .search_youtube(&query, limit)
        .await
        .map(|list| list.into_iter().map(Into::into).collect())
        .map_err(|e| e.to_string())
}

pub async fn sign_blossom_upload_auth(
    sha256: String,
    blossom_url: String,
    format: String,
) -> Result<FrbBlossomAuthResult, String> {
    core()
        .sign_blossom_upload_auth(&sha256, &blossom_url, &format)
        .await
        .map(Into::into)
        .map_err(|e| e.to_string())
}

pub async fn attach_song_audio_url(
    song_id: String,
    audio_url: String,
    youtube_id: Option<String>,
) -> Result<FrbActionOutcome, String> {
    core()
        .attach_song_audio_url(&song_id, &audio_url, youtube_id.as_deref())
        .await
        .map(Into::into)
        .map_err(|e| e.to_string())
}

pub async fn fetch_user_profile(pubkey_or_npub: String) -> Result<FrbNostrProfile, String> {
    core()
        .fetch_user_profile(&pubkey_or_npub)
        .await
        .map(Into::into)
        .map_err(|e| e.to_string())
}

pub async fn fetch_signal_songs(limit: u32) -> Result<Vec<FrbSavedSong>, String> {
    core()
        .fetch_signal_songs(limit as usize)
        .await
        .map(|list| list.into_iter().map(Into::into).collect())
        .map_err(|e| e.to_string())
}

#[allow(clippy::too_many_arguments)]
pub async fn publish_station(
    name: String,
    stream_url: String,
    format: String,
    bitrate_bps: u32,
    description: Option<String>,
    website: Option<String>,
    country_code: Option<String>,
    thumbnail: Option<String>,
    genres: Vec<String>,
) -> Result<FrbActionOutcome, String> {
    core()
        .publish_station(
            &name,
            &stream_url,
            &format,
            bitrate_bps,
            description.as_deref(),
            website.as_deref(),
            country_code.as_deref(),
            thumbnail.as_deref(),
            &genres,
        )
        .await
        .map(Into::into)
        .map_err(|e| e.to_string())
}

// ─── Observer Signal Charts (kind 31240 + kind 31238 + recent Blossom songs) ─

pub struct FrbStationRankingEntry {
    pub station_address: String,
    pub value: f64,
    pub label: Option<String>,
    pub title: Option<String>,
    pub artist: Option<String>,
    pub observed_at: Option<u64>,
}

impl From<StationRankingEntry> for FrbStationRankingEntry {
    fn from(e: StationRankingEntry) -> Self {
        Self {
            station_address: e.station_address,
            value: e.value,
            label: e.label,
            title: e.title,
            artist: e.artist,
            observed_at: e.observed_at,
        }
    }
}

pub struct FrbStationRankingSnapshot {
    pub metric: String,
    pub window: String,
    pub generated_at: u64,
    pub entries: Vec<FrbStationRankingEntry>,
}

impl From<StationRankingSnapshot> for FrbStationRankingSnapshot {
    fn from(s: StationRankingSnapshot) -> Self {
        Self {
            metric: s.metric,
            window: s.window,
            generated_at: s.generated_at,
            entries: s.entries.into_iter().map(Into::into).collect(),
        }
    }
}

pub struct FrbStationHealthSummary {
    pub station_address: String,
    pub status: String,
    pub score: u32,
    pub checked_at: u64,
    pub latency_ms: Option<u32>,
    pub consecutive_failures: u32,
    pub insecure: bool,
}

impl From<StationHealthSummary> for FrbStationHealthSummary {
    fn from(h: StationHealthSummary) -> Self {
        Self {
            station_address: h.station_address,
            status: h.status,
            score: h.score,
            checked_at: h.checked_at,
            latency_ms: h.latency_ms,
            consecutive_failures: h.consecutive_failures,
            insecure: h.insecure,
        }
    }
}

pub struct FrbSignalChartsData {
    pub rankings: Vec<FrbStationRankingSnapshot>,
    pub stations: Vec<FrbStation>,
    pub health: Vec<FrbStationHealthSummary>,
    pub recent_downloads: Vec<FrbSavedSong>,
}

impl From<SignalChartsData> for FrbSignalChartsData {
    fn from(d: SignalChartsData) -> Self {
        Self {
            rankings: d.rankings.into_iter().map(Into::into).collect(),
            stations: d.stations.into_iter().map(Into::into).collect(),
            health: d.health.into_iter().map(Into::into).collect(),
            recent_downloads: d.recent_downloads.into_iter().map(Into::into).collect(),
        }
    }
}

pub async fn fetch_signal_charts() -> Result<FrbSignalChartsData, String> {
    core()
        .fetch_signal_charts()
        .await
        .map(Into::into)
        .map_err(|e| e.to_string())
}

pub async fn publish_song_share_note(
    content: String,
    song_address: Option<String>,
    audio_url: Option<String>,
    hashtags: Vec<String>,
) -> Result<FrbActionOutcome, String> {
    core()
        .publish_song_share_note(
            &content,
            song_address.as_deref(),
            audio_url.as_deref(),
            &hashtags,
        )
        .await
        .map(Into::into)
        .map_err(|e| e.to_string())
}

pub struct FrbAudioSpectrum {
    pub bands: Vec<f32>,
    pub is_live: bool,
}

impl From<AudioSpectrumSnapshot> for FrbAudioSpectrum {
    fn from(s: AudioSpectrumSnapshot) -> Self {
        Self {
            bands: s.bands,
            is_live: s.is_live,
        }
    }
}

pub async fn prepare_audio_proxy_url(upstream_url: String) -> String {
    core().prepare_audio_proxy_url(&upstream_url).await
}

#[flutter_rust_bridge::frb(sync)]
pub fn reset_audio_spectrum() {
    core().reset_audio_spectrum();
}

#[flutter_rust_bridge::frb(sync)]
pub fn get_audio_spectrum() -> FrbAudioSpectrum {
    core().get_audio_spectrum().into()
}
