//! Shared configuration defaults for WaveFunc native clients.

/// Primary public WaveFunc Nostr relay.
pub const DEFAULT_PRODUCTION_RELAY: &str = "wss://relay.wavefunc.live";

/// Local development relay (Go relay on port 3334).
pub const DEFAULT_DEV_RELAY: &str = "ws://localhost:3334";

/// Public relays consulted for kind-0 profile discovery alongside the app relay.
pub const DEFAULT_IDENTITY_RELAYS: &[&str] = &[
    "wss://purplepag.es",
    "wss://relay.damus.io",
    "wss://nos.lol",
    "wss://relay.primal.net",
];

/// Public relays consulted for NIP-57 zap receipts and social events alongside the app relay.
pub const DEFAULT_SOCIAL_RELAYS: &[&str] = &[
    "wss://relay.primal.net",
    "wss://relay.damus.io",
    "wss://nos.lol",
    "wss://relay.nostr.net",
];

/// Hardcoded WaveFunc admin pubkeys (hex) allowed to curate `wavefunc:featured:lists`.
pub const PROD_ADMIN_PUBKEYS: &[&str] = &[
    "210f31b6019f5ae13c995c8d83faa41a129f1296842e4c3313ab8a4abb09d1a2",
];

/// Local development admin pubkey (hex).
pub const DEV_ADMIN_PUBKEY: &str =
    "79be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798";

/// Public key of the production ContextVM metadata server.
pub const PRODUCTION_METADATA_SERVER_PUBKEY: &str =
    "bb0707242a17a4be881919b3dcfea63f42aacedc3ff898a66be30af195ff32b2";

/// Public key of the local development ContextVM metadata server.
pub const DEVELOPMENT_METADATA_SERVER_PUBKEY: &str =
    "79be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798";

/// Nostr addressable event kind for NIP-XX Internet Radio stations.
pub const STATION_KIND: u16 = 31237;

/// Nostr addressable event kind for WaveFunc favorites lists, song lists, and admin features.
pub const APP_DATA_KIND: u16 = 30078;

/// Nostr addressable event kind for WaveFunc saved songs.
pub const SONG_KIND: u16 = 31337;

/// NIP-22 comment event kind.
pub const COMMENT_KIND: u16 = 1111;

/// NIP-25 reaction event kind.
pub const REACTION_KIND: u16 = 7;

/// NIP-10 community note event kind.
pub const COMMUNITY_POST_KIND: u16 = 1;

/// NIP-38 user status event kind.
pub const LISTENING_STATUS_KIND: u16 = 30315;

/// NIP-57 Lightning zap request event kind.
pub const ZAP_REQUEST_KIND: u16 = 9734;

/// NIP-57 Lightning zap receipt event kind.
pub const ZAP_RECEIPT_KIND: u16 = 9735;

/// NIP-61 Cashu nutzap event kind.
pub const NUTZAP_KIND: u16 = 9321;

/// NIP-61 Nutzap mint & P2PK info event kind.
pub const NUTZAP_INFO_KIND: u16 = 10019;

/// NIP-60 Cashu wallet replaceable metadata event kind.
pub const WALLET_KIND: u16 = 17375;

/// NIP-60 Cashu unspent token proofs event kind.
pub const WALLET_TOKEN_KIND: u16 = 7375;

/// NIP-60 Cashu wallet spending history event kind.
pub const WALLET_HISTORY_KIND: u16 = 7376;

/// NIP-65 user relay list metadata event kind.
pub const RELAY_LIST_KIND: u16 = 10002;

/// NIP-09 event deletion kind.
pub const DELETION_KIND: u16 = 5;

/// Public relays consulted for NIP-60 Cashu wallet sync (`kind 17375` / `7375` / `10019`).
pub const DEFAULT_WALLET_RELAYS: &[&str] = &[
    "wss://relay.primal.net",
    "wss://relay.damus.io",
    "wss://nos.lol",
    "wss://nostr.wine",
    "wss://relay.minibits.cash",
    "wss://relay.coinos.io",
];

/// Default Cashu mints offered when initializing a fresh wallet.
pub const DEFAULT_CASHU_MINTS: &[&str] = &[
    "https://mint.minibits.cash/Bitcoin",
    "https://mint.coinos.io",
];

/// Hashtag identifying WaveFunc community feed posts.
pub const COMMUNITY_TOPIC: &str = "wavefunc";

/// Label tag value for user favorites lists (`["l", "wavefunc_user_favourite_list"]`).
pub const FAVORITES_LIST_LABEL: &str = "wavefunc_user_favourite_list";

/// Label tag value for user song crates (`["l", "wavefunc_user_song_list"]`).
pub const SONG_LIST_LABEL: &str = "wavefunc_user_song_list";

/// Label tag value for admin featured lists (`["l", "wavefunc:featured:lists"]`).
pub const ADMIN_FEATURED_LISTS_LABEL: &str = "wavefunc:featured:lists";

/// ContextVM ephemeral JSON-RPC event kind.
pub const CONTEXTVM_KIND: u16 = 25910;

/// Blossom BUD-02 upload authorization event kind.
pub const BLOSSOM_AUTH_KIND: u16 = 24242;

/// Runtime configuration for `WavefuncCore`.
#[derive(Debug, Clone)]
pub struct CoreConfig {
    pub relay_url: String,
    pub metadata_server_pubkey: String,
    pub request_timeout_secs: u64,
}

impl Default for CoreConfig {
    fn default() -> Self {
        Self {
            relay_url: DEFAULT_PRODUCTION_RELAY.to_string(),
            metadata_server_pubkey: PRODUCTION_METADATA_SERVER_PUBKEY.to_string(),
            request_timeout_secs: 12,
        }
    }
}

impl CoreConfig {
    pub fn for_relay(relay_url: impl Into<String>) -> Self {
        let relay = relay_url.into();
        let is_local = relay.contains("localhost")
            || relay.contains("127.0.0.1")
            || relay.contains("10.0.2.2");
        Self {
            relay_url: relay,
            metadata_server_pubkey: if is_local {
                DEVELOPMENT_METADATA_SERVER_PUBKEY.to_string()
            } else {
                PRODUCTION_METADATA_SERVER_PUBKEY.to_string()
            },
            request_timeout_secs: 12,
        }
    }
}
