//! `wavefunc-core` — shared native Rust engine for WaveFunc Radio.
//!
//! Owns Nostr relay transport, NIP-XX station discovery/search, featured lists,
//! ContextVM metadata extraction, authentication (local nsec / NIP-46 bunker /
//! external NIP-55 Amber), synced favorites, song crates, social feeds, and
//! NIP-38 listening status.

pub mod cashu;
pub mod client;
pub mod config;
pub mod contextvm;
pub mod error;
pub mod media;
pub mod models;
pub mod parser;
pub mod social;
pub mod wallet;

pub use client::WavefuncCore;
pub use config::{
    CoreConfig, APP_DATA_KIND, COMMENT_KIND, COMMUNITY_POST_KIND, COMMUNITY_TOPIC, CONTEXTVM_KIND,
    DEFAULT_CASHU_MINTS, DEFAULT_DEV_RELAY, DEFAULT_IDENTITY_RELAYS, DEFAULT_PRODUCTION_RELAY,
    DEFAULT_SOCIAL_RELAYS, DEVELOPMENT_METADATA_SERVER_PUBKEY, DEV_ADMIN_PUBKEY,
    FAVORITES_LIST_LABEL, LISTENING_STATUS_KIND, NUTZAP_INFO_KIND, NUTZAP_KIND,
    PRODUCTION_METADATA_SERVER_PUBKEY, PROD_ADMIN_PUBKEYS, REACTION_KIND, SONG_KIND,
    SONG_LIST_LABEL, STATION_KIND, ZAP_RECEIPT_KIND, ZAP_REQUEST_KIND,
};
pub use error::{Result, WavefuncError};
pub use models::{
    AccountSessionInfo, ActionOutcome, BunkerLoginResult, CashuMintBalance, CashuMintQuoteInfo,
    CashuReceiveResult, CashuSendResult, CashuWalletStatus, CommunityPost, FacetCount,
    FeaturedList, GeneratedAccount, NostrConnectChallenge, NostrProfile, NowPlayingMetadata,
    NwcWalletStatus, PreparedMedia, RecipientNutzapInfo, RelayStatus, SavedSong, SignerKind,
    SongCrate, Station, StationCardCounts, StationComment, StationFacets, StationSocialSummary,
    StationStream, StreamQuality, UploadedMedia, ZapInvoiceResult, ZapPaymentResult,
};
