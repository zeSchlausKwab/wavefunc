use std::collections::{HashMap, HashSet};
use std::sync::Arc;
use std::time::Duration;

use nostr::prelude::*;
use nostr_connect::prelude::NostrConnect;
use nostr_sdk::prelude::*;
use tokio::sync::RwLock;

use crate::cashu::{
    build_station_nutzap_builder, parse_nip60_wallet_content, parse_nutzap_info_event,
    CashuWalletManager,
};
use crate::config::{
    CoreConfig, ADMIN_FEATURED_LISTS_LABEL, APP_DATA_KIND, COMMENT_KIND, COMMUNITY_POST_KIND,
    COMMUNITY_TOPIC, DEFAULT_IDENTITY_RELAYS, DEFAULT_SOCIAL_RELAYS, DEFAULT_WALLET_RELAYS,
    DELETION_KIND, DEV_ADMIN_PUBKEY, FAVORITES_LIST_LABEL, NUTZAP_INFO_KIND, NUTZAP_KIND,
    PROD_ADMIN_PUBKEYS, REACTION_KIND, RELAY_LIST_KIND, SONG_KIND, SONG_LIST_LABEL,
    STATION_HEALTH_KIND, STATION_KIND, STATION_RANKING_KIND, WALLET_KIND, WALLET_TOKEN_KIND,
    ZAP_RECEIPT_KIND,
};
use crate::contextvm;
use crate::error::{Result, WavefuncError};
use crate::media::MediaAcquisitionManager;
use crate::models::{
    AccountSessionInfo, ActionOutcome, BlossomAuthResult, BunkerLoginResult, CashuMintQuoteInfo,
    CashuReceiveResult, CashuSendResult, CashuWalletStatus, CommunityPost, FeaturedList,
    GeneratedAccount, MusicBrainzRecording, Nip60DecryptedTokenEvent, Nip60RawEvents,
    Nip60RawTokenEvent, NostrConnectChallenge, NostrProfile, NowPlayingMetadata, NwcWalletStatus,
    PreparedMedia, RecipientNutzapInfo, RelayStatus, SavedSong, SignalChartsData, SignerKind,
    SongCrate, Station, StationCardCounts, StationFacets, StationHealthSummary,
    StationRankingSnapshot, StationSocialSummary, UploadedMedia, YouTubeSearchResult,
    ZapInvoiceResult, ZapPaymentResult,
};
use crate::parser::{
    compute_facets, deduplicate_stations, matches_station_search, parse_admin_featured_list_refs,
    parse_favorites_list_event, parse_station_event,
};
use crate::social::{
    build_blossom_auth_builder, build_comment_tree, build_community_post_builder,
    build_delete_favorites_list_builder, build_favorites_list_builder,
    build_listening_status_builder, build_new_favorites_list_builder, build_profile_event_builder,
    build_song_audio_update_builder, build_song_event_builder, build_song_list_builder,
    build_song_share_note_builder, build_station_comment_builder, build_station_event_builder,
    build_station_reaction_builder, build_update_favorites_list_builder, build_zap_request_builder,
    parse_community_posts, parse_profile_event, parse_song_event, parse_station_health_event,
    parse_station_ranking_event, summarize_station_social_counts, VALID_RANKING_METRICS,
};
use crate::spectrum::{AudioSpectrumProxy, AudioSpectrumSnapshot};
use crate::wallet::{fetch_lnurl_pay_params, request_lnurl_invoice, ActiveNwcSession};

enum ActiveSigner {
    LocalKey(Keys),
    Bunker {
        signer: Arc<NostrConnect>,
        pubkey: PublicKey,
    },
    Amber {
        pubkey: PublicKey,
    },
}

impl ActiveSigner {
    fn pubkey(&self) -> PublicKey {
        match self {
            Self::LocalKey(keys) => keys.public_key(),
            Self::Bunker { pubkey, .. } => *pubkey,
            Self::Amber { pubkey } => *pubkey,
        }
    }

    fn kind(&self) -> SignerKind {
        match self {
            Self::LocalKey(_) => SignerKind::LocalKey,
            Self::Bunker { .. } => SignerKind::Bunker,
            Self::Amber { .. } => SignerKind::Amber,
        }
    }
}

struct PendingNostrConnect {
    signer: Arc<NostrConnect>,
    app_nsec: String,
}

/// Main WaveFunc Rust protocol client.
///
/// Owns a `nostr_sdk::Client` connection pool, active user signer session
/// (Local nsec, NIP-46 Bunker, or external NIP-55 Amber), profile cache, and
/// in-memory station cache.
pub struct WavefuncCore {
    config: RwLock<CoreConfig>,
    client: Client,
    identity_client: Client,
    wallet_client: Client,
    http: reqwest::Client,
    ephemeral_keys: Keys,
    cached_stations: RwLock<Vec<Station>>,
    profile_cache: RwLock<HashMap<String, NostrProfile>>,
    signer: RwLock<Option<ActiveSigner>>,
    pending_connects: RwLock<HashMap<String, PendingNostrConnect>>,
    nwc: RwLock<Option<ActiveNwcSession>>,
    cashu: RwLock<Option<CashuWalletManager>>,
    media: MediaAcquisitionManager,
    spectrum: AudioSpectrumProxy,
}

impl WavefuncCore {
    /// Create a new core instance using the given configuration.
    pub fn new(config: CoreConfig) -> Arc<Self> {
        let http = reqwest::Client::builder()
            .user_agent("WaveFunc-Native/0.2")
            .timeout(Duration::from_secs(15))
            .build()
            .unwrap_or_else(|_| reqwest::Client::new());

        // Live radio streams must NOT have a total request timeout.
        let stream_http = reqwest::Client::builder()
            .user_agent("WaveFunc Radio Native/0.2.0")
            .connect_timeout(Duration::from_secs(12))
            .build()
            .unwrap_or_else(|_| reqwest::Client::new());

        Arc::new(Self {
            config: RwLock::new(config),
            client: Client::new(),
            identity_client: Client::new(),
            wallet_client: Client::new(),
            http,
            ephemeral_keys: Keys::generate(),
            cached_stations: RwLock::new(Vec::new()),
            profile_cache: RwLock::new(HashMap::new()),
            signer: RwLock::new(None),
            pending_connects: RwLock::new(HashMap::new()),
            nwc: RwLock::new(None),
            cashu: RwLock::new(None),
            media: MediaAcquisitionManager::new(),
            spectrum: AudioSpectrumProxy::new(stream_http),
        })
    }

    /// Connect to the configured relay URL.
    pub async fn connect(&self) -> Result<RelayStatus> {
        let relay_url = self.config.read().await.relay_url.clone();
        self.set_relay(&relay_url).await
    }

    /// Switch the active app data relay URL and reconnect cleanly.
    pub async fn set_relay(&self, relay_url: &str) -> Result<RelayStatus> {
        let trimmed = relay_url.trim();
        let parsed = RelayUrl::parse(trimmed)
            .map_err(|e| WavefuncError::InvalidRelayUrl(trimmed.to_string(), e.to_string()))?;

        let _ = self.client.remove_all_relays().force().await;
        self.client.add_relay(parsed.clone()).await?;
        self.client.connect().and_wait(Duration::from_secs(5)).await;

        {
            let mut cfg = self.config.write().await;
            *cfg = CoreConfig::for_relay(trimmed);
        }
        self.cached_stations.write().await.clear();

        self.relay_status().await
    }

    /// Ensure public identity & social relays are connected (used for kind-0 profiles and NIP-57 zaps).
    async fn ensure_identity_relays(&self) {
        let relays = self.identity_client.relays().await;
        if !relays.is_empty() {
            return;
        }
        let mut seen = HashSet::new();
        for url in DEFAULT_IDENTITY_RELAYS
            .iter()
            .chain(DEFAULT_SOCIAL_RELAYS.iter())
        {
            if seen.insert(*url) {
                let _ = self.identity_client.add_relay(*url).await;
            }
        }
        self.identity_client
            .connect()
            .and_wait(Duration::from_secs(3))
            .await;
    }

    /// Inspect current relay connection status and optional NIP-45 total station count.
    pub async fn relay_status(&self) -> Result<RelayStatus> {
        let relay_url = self.config.read().await.relay_url.clone();
        let relay = self.client.relay(&relay_url).await?;
        let connected = relay
            .as_ref()
            .is_some_and(|r| r.status().is_connected());
        let total_station_count = self.fetch_station_count().await.ok().flatten();

        Ok(RelayStatus {
            relay_url,
            connected,
            total_station_count,
        })
    }

    /// Query NIP-45 `COUNT` for total `kind 31237` stations on the active relay.
    pub async fn fetch_station_count(&self) -> Result<Option<u64>> {
        let relay_url = self.config.read().await.relay_url.clone();
        let Some(relay) = self.client.relay(&relay_url).await? else {
            return Ok(None);
        };
        let filter = Filter::new().kind(Kind::Custom(STATION_KIND));
        match relay.count_events(filter, Duration::from_secs(6)).await {
            Ok(count) => Ok(Some(count as u64)),
            Err(_) => Ok(None),
        }
    }

    // ─── Authentication & Profiles ───────────────────────────────────────────

    /// Generate a fresh Nostr keypair for onboarding.
    pub fn generate_account() -> Result<GeneratedAccount> {
        let keys = Keys::generate();
        Ok(GeneratedAccount {
            pubkey: keys.public_key().to_hex(),
            npub: keys.public_key().to_bech32().unwrap(),
            nsec: keys.secret_key().to_bech32().unwrap(),
        })
    }

    /// Sign in with a local `nsec1...` or 64-char hex private key.
    pub async fn login_with_nsec(&self, secret: &str) -> Result<AccountSessionInfo> {
        let keys = Keys::parse(secret.trim())?;
        let pubkey = keys.public_key();
        *self.signer.write().await = Some(ActiveSigner::LocalKey(keys));
        self.build_session_info(pubkey, SignerKind::LocalKey).await
    }

    /// Sign in with a NIP-46 `bunker://...` remote signer URI.
    pub async fn login_with_bunker(
        &self,
        bunker_uri: &str,
        app_nsec: Option<&str>,
    ) -> Result<BunkerLoginResult> {
        let uri = NostrConnectUri::parse(bunker_uri.trim())?;
        let app_keys = match app_nsec.map(str::trim).filter(|s| !s.is_empty()) {
            Some(sec) => Keys::parse(sec)?,
            None => Keys::generate(),
        };
        let app_nsec_out = app_keys.secret_key().to_bech32().unwrap();

        let signer = NostrConnect::new(uri, app_keys, Duration::from_secs(60), None)?;
        let pubkey = signer.get_public_key_async().await?;
        let canonical_uri = signer
            .bunker_uri()
            .await
            .map(|u| u.to_string())
            .unwrap_or_else(|_| bunker_uri.trim().to_string());

        *self.signer.write().await = Some(ActiveSigner::Bunker {
            signer: Arc::new(signer),
            pubkey,
        });

        let session = self.build_session_info(pubkey, SignerKind::Bunker).await?;
        Ok(BunkerLoginResult {
            session,
            bunker_uri: canonical_uri,
            app_nsec: app_nsec_out,
        })
    }

    /// Sign in using an external Android NIP-55 Amber signer public key (`npub` or hex).
    pub async fn login_with_amber(&self, pubkey_or_npub: &str) -> Result<AccountSessionInfo> {
        let pubkey = PublicKey::parse(pubkey_or_npub.trim())?;
        *self.signer.write().await = Some(ActiveSigner::Amber { pubkey });
        self.build_session_info(pubkey, SignerKind::Amber).await
    }

    /// Start a client-initiated NIP-46 `nostrconnect://` QR pairing session.
    pub async fn start_nostr_connect_session(
        &self,
        relay_url: Option<&str>,
        client_name: Option<&str>,
    ) -> Result<NostrConnectChallenge> {
        let relay_str = relay_url
            .map(str::trim)
            .filter(|s| !s.is_empty())
            .unwrap_or("wss://relay.primal.net");
        let relay = RelayUrl::parse(relay_str)
            .map_err(|e| WavefuncError::InvalidInput(format!("Invalid NIP-46 relay: {e}")))?;

        let resolved_name = client_name
            .map(str::trim)
            .filter(|s| !s.is_empty())
            .unwrap_or("Wavefunc Radio");

        let mut metadata = NostrConnectMetadata::new(resolved_name)
            .description("Decentralized Internet Radio on Nostr");
        if let Ok(app_url) = Url::parse("https://wavefunc.live") {
            metadata = metadata.url(app_url);
        }

        let app_keys = Keys::generate();
        let app_nsec = app_keys.secret_key().to_bech32().unwrap();
        let secret = uuid::Uuid::new_v4().simple().to_string();
        let uri = NostrConnectUri::Client {
            public_key: app_keys.public_key(),
            relays: vec![relay],
            metadata,
            secret,
        };
        let connect_uri = uri.to_string();
        let signer = Arc::new(NostrConnect::new(
            uri,
            app_keys,
            Duration::from_secs(180),
            None,
        )?);
        let session_id = uuid::Uuid::new_v4().to_string();
        self.pending_connects.write().await.insert(
            session_id.clone(),
            PendingNostrConnect {
                signer,
                app_nsec: app_nsec.clone(),
            },
        );
        Ok(NostrConnectChallenge {
            session_id,
            connect_uri,
            app_nsec,
        })
    }

    /// Await completion of a pending NIP-46 `nostrconnect://` QR pairing session.
    pub async fn await_nostr_connect_session(
        &self,
        session_id: &str,
    ) -> Result<BunkerLoginResult> {
        let pending = self
            .pending_connects
            .write()
            .await
            .remove(session_id)
            .ok_or_else(|| {
                WavefuncError::InvalidInput("Pairing session expired or cancelled".to_string())
            })?;

        let pubkey = pending.signer.get_public_key_async().await?;
        let canonical_uri = pending
            .signer
            .bunker_uri()
            .await
            .map(|u| u.to_string())
            .unwrap_or_default();

        *self.signer.write().await = Some(ActiveSigner::Bunker {
            signer: pending.signer,
            pubkey,
        });
        let session = self.build_session_info(pubkey, SignerKind::Bunker).await?;
        Ok(BunkerLoginResult {
            session,
            bunker_uri: canonical_uri,
            app_nsec: pending.app_nsec,
        })
    }

    /// Cancel a pending NIP-46 QR pairing session.
    pub async fn cancel_nostr_connect_session(&self, session_id: &str) {
        self.pending_connects.write().await.remove(session_id);
    }

    /// Publish a `kind 0` profile metadata event for the signed-in user (and broadcast
    /// to public identity relays as well as the active app relay).
    pub async fn publish_profile(
        &self,
        name: Option<&str>,
        about: Option<&str>,
        picture: Option<&str>,
        lud16: Option<&str>,
    ) -> Result<ActionOutcome> {
        let builder = build_profile_event_builder(name, about, picture, lud16)?;
        let signer_mode = {
            let guard = self.signer.read().await;
            match guard.as_ref() {
                None => {
                    return Err(WavefuncError::AuthRequired(
                        "Sign in first to update your profile.".to_string(),
                    ));
                }
                Some(ActiveSigner::LocalKey(keys)) => Err(keys.clone()),
                Some(ActiveSigner::Bunker { signer, .. }) => Ok((Some(signer.clone()), None)),
                Some(ActiveSigner::Amber { pubkey }) => Ok((None, Some(*pubkey))),
            }
        };

        let signed_event = match signer_mode {
            Err(keys) => builder.finalize(&keys)?,
            Ok((Some(bunker), _)) => builder.finalize_async(bunker.as_ref()).await?,
            Ok((None, Some(pubkey))) => {
                let unsigned = builder.finalize_unsigned(pubkey);
                return Ok(ActionOutcome {
                    published: false,
                    event_id: None,
                    unsigned_event_json: Some(unsigned.as_json()),
                    target_address: None,
                });
            }
            Ok((None, None)) => {
                return Err(WavefuncError::AuthRequired("No active signer".to_string()));
            }
        };

        // Broadcast kind 0 to public identity relays + app relay so other Nostr apps see it too.
        self.ensure_identity_relays().await;
        let (app_res, id_res) = tokio::join!(
            self.client.send_event(&signed_event),
            self.identity_client.send_event(&signed_event),
        );

        if let Some(parsed) = parse_profile_event(&signed_event) {
            self.profile_cache
                .write()
                .await
                .insert(parsed.pubkey.clone(), parsed);
        }

        let app_ok = app_res.as_ref().is_ok_and(|o| !o.success.is_empty());
        let id_ok = id_res.as_ref().is_ok_and(|o| !o.success.is_empty());
        if !app_ok && !id_ok {
            return Err(WavefuncError::PublishRejected(
                "No relay accepted the profile event".to_string(),
            ));
        }

        Ok(ActionOutcome {
            published: true,
            event_id: Some(signed_event.id.to_hex()),
            unsigned_event_json: None,
            target_address: None,
        })
    }

    /// Clear active user session.
    pub async fn logout(&self) {
        *self.signer.write().await = None;
    }

    /// Return currently signed-in account info, if any.
    pub async fn current_account(&self) -> Option<AccountSessionInfo> {
        let (pubkey, kind) = {
            let guard = self.signer.read().await;
            let active = guard.as_ref()?;
            (active.pubkey(), active.kind())
        };
        let profile = self.profile_cache.read().await.get(&pubkey.to_hex()).cloned();
        Some(AccountSessionInfo {
            pubkey: pubkey.to_hex(),
            npub: pubkey.to_bech32().unwrap_or_else(|_| pubkey.to_hex()),
            signer_kind: kind,
            profile,
        })
    }

    async fn build_session_info(
        &self,
        pubkey: PublicKey,
        signer_kind: SignerKind,
    ) -> Result<AccountSessionInfo> {
        let hex = pubkey.to_hex();
        let npub = pubkey.to_bech32().unwrap();
        let profiles = self.fetch_profiles(&[hex.clone()]).await.unwrap_or_default();
        Ok(AccountSessionInfo {
            pubkey: hex.clone(),
            npub,
            signer_kind,
            profile: profiles.get(&hex).cloned(),
        })
    }

    /// Batch-fetch and cache `kind 0` profiles from the app relay and public identity relays.
    pub async fn fetch_profiles(&self, pubkeys_hex: &[String]) -> Result<HashMap<String, NostrProfile>> {
        let mut result: HashMap<String, NostrProfile> = HashMap::new();
        let mut missing: Vec<PublicKey> = Vec::new();

        {
            let cache = self.profile_cache.read().await;
            for pk_hex in pubkeys_hex {
                if let Some(p) = cache.get(pk_hex) {
                    result.insert(pk_hex.clone(), p.clone());
                } else if let Ok(pk) = PublicKey::from_hex(pk_hex) {
                    missing.push(pk);
                }
            }
        }

        if missing.is_empty() {
            return Ok(result);
        }

        let filter = Filter::new()
            .kind(Kind::Metadata)
            .authors(missing.clone())
            .limit(missing.len().saturating_mul(2).max(10));

        // Try app relay first, then public identity relays for anything still missing.
        let mut fetched_events: Vec<Event> = Vec::new();
        if let Ok(app_events) = self
            .client
            .fetch_events(filter.clone())
            .timeout(Duration::from_secs(5))
            .await
        {
            fetched_events.extend(app_events.into_iter());
        }

        let found_pks: HashSet<PublicKey> = fetched_events.iter().map(|e| e.pubkey).collect();
        let still_missing: Vec<PublicKey> = missing
            .into_iter()
            .filter(|pk| !found_pks.contains(pk))
            .collect();

        if !still_missing.is_empty() {
            self.ensure_identity_relays().await;
            let id_filter = Filter::new()
                .kind(Kind::Metadata)
                .authors(still_missing.clone())
                .limit(still_missing.len().saturating_mul(2).max(10));
            if let Ok(id_events) = self
                .identity_client
                .fetch_events(id_filter)
                .timeout(Duration::from_secs(5))
                .await
            {
                fetched_events.extend(id_events.into_iter());
            }
        }

        // Keep newest kind-0 event per author.
        let mut latest_by_pk: HashMap<String, (Timestamp, NostrProfile)> = HashMap::new();
        for ev in fetched_events {
            if let Some(profile) = parse_profile_event(&ev) {
                let hex = profile.pubkey.clone();
                match latest_by_pk.get(&hex) {
                    Some((ts, _)) if *ts >= ev.created_at => {}
                    _ => {
                        latest_by_pk.insert(hex, (ev.created_at, profile));
                    }
                }
            }
        }

        {
            let mut cache = self.profile_cache.write().await;
            for (hex, (_, profile)) in latest_by_pk {
                cache.insert(hex.clone(), profile.clone());
                result.insert(hex, profile);
            }
        }

        Ok(result)
    }

    /// Sign and publish an `EventBuilder` using the active signer, OR return an
    /// unsigned event JSON when using external Android NIP-55 Amber signing.
    async fn sign_or_prepare(
        &self,
        builder: EventBuilder,
        target_address: Option<String>,
    ) -> Result<ActionOutcome> {
        let mode = {
            let guard = self.signer.read().await;
            match guard.as_ref() {
                None => {
                    return Err(WavefuncError::AuthRequired(
                        "Sign in with a Nostr key, Bunker, or Amber first.".to_string(),
                    ));
                }
                Some(ActiveSigner::LocalKey(keys)) => Err(keys.clone()),
                Some(ActiveSigner::Bunker { signer, .. }) => Ok((Some(signer.clone()), None)),
                Some(ActiveSigner::Amber { pubkey }) => Ok((None, Some(*pubkey))),
            }
        };

        let signed_event = match mode {
            Err(keys) => builder.finalize(&keys)?,
            Ok((Some(bunker), _)) => builder.finalize_async(bunker.as_ref()).await?,
            Ok((None, Some(pubkey))) => {
                let unsigned = builder.finalize_unsigned(pubkey);
                return Ok(ActionOutcome {
                    published: false,
                    event_id: None,
                    unsigned_event_json: Some(unsigned.as_json()),
                    target_address,
                });
            }
            Ok((None, None)) => {
                return Err(WavefuncError::AuthRequired("No active signer".to_string()));
            }
        };

        self.send_verified_event(&signed_event, target_address).await
    }

    async fn send_verified_event(
        &self,
        event: &Event,
        target_address: Option<String>,
    ) -> Result<ActionOutcome> {
        let is_social = matches!(
            event.kind.as_u16(),
            REACTION_KIND | COMMENT_KIND | COMMUNITY_POST_KIND | NUTZAP_KIND
        );

        let output = self.client.send_event(event).await?;
        let mut accepted = !output.success.is_empty();

        // Mirror WaveFunc relayPolicy.ts: social events publish to both the app relay
        // and public social relays so comments, likes, and nutzaps stay discoverable.
        if is_social {
            self.ensure_identity_relays().await;
            if let Ok(pub_out) = self.identity_client.send_event(event).await {
                if !pub_out.success.is_empty() {
                    accepted = true;
                }
            }
        }

        if !accepted {
            let reason = output
                .failed
                .values()
                .next()
                .cloned()
                .unwrap_or_else(|| "No relay accepted the event".to_string());
            return Err(WavefuncError::PublishRejected(reason));
        }
        Ok(ActionOutcome {
            published: true,
            event_id: Some(event.id.to_hex()),
            unsigned_event_json: None,
            target_address,
        })
    }

    /// Verify and publish an already-signed event JSON (returned by Android NIP-55 Amber).
    pub async fn publish_signed_event(&self, signed_event_json: &str) -> Result<ActionOutcome> {
        let event = Event::from_json(signed_event_json)?;
        event.verify()?;
        self.send_verified_event(&event, None).await
    }

    // ─── Station Discovery & Search ──────────────────────────────────────────

    /// Fetch radio stations (`kind 31237`) from the active relay.
    pub async fn fetch_stations(&self, limit: usize) -> Result<Vec<Station>> {
        let cfg = self.config.read().await.clone();
        let filter = Filter::new()
            .kind(Kind::Custom(STATION_KIND))
            .limit(limit.clamp(1, 500));

        let events = self
            .client
            .fetch_events(filter)
            .timeout(Duration::from_secs(cfg.request_timeout_secs))
            .await?;

        let relay_hints = vec![cfg.relay_url];
        let parsed: Vec<Station> = events
            .iter()
            .filter_map(|ev| parse_station_event(ev, &relay_hints))
            .collect();
        let deduped = deduplicate_stations(parsed);

        *self.cached_stations.write().await = deduped.clone();
        Ok(deduped)
    }

    /// Search stations using NIP-50 full-text search plus optional genre/country/language filters.
    pub async fn search_stations(
        &self,
        query: Option<&str>,
        genre: Option<&str>,
        country: Option<&str>,
        language: Option<&str>,
        limit: usize,
    ) -> Result<Vec<Station>> {
        let cfg = self.config.read().await.clone();
        let mut filter = Filter::new()
            .kind(Kind::Custom(STATION_KIND))
            .limit(limit.clamp(1, 300));

        let clean_query = query.map(str::trim).filter(|q| !q.is_empty());
        if let Some(q) = clean_query {
            filter = filter.search(q);
        }
        if let Some(g) = genre.map(str::trim).filter(|v| !v.is_empty()) {
            filter = filter.custom_tag(SingleLetterTag::from_char('c').unwrap(), g);
        }
        if let Some(l) = language.map(str::trim).filter(|v| !v.is_empty()) {
            filter = filter.custom_tag(SingleLetterTag::from_char('l').unwrap(), l);
        }

        let events = self
            .client
            .fetch_events(filter)
            .timeout(Duration::from_secs(cfg.request_timeout_secs))
            .await?;

        let relay_hints = vec![cfg.relay_url];
        let mut stations = deduplicate_stations(
            events
                .iter()
                .filter_map(|ev| parse_station_event(ev, &relay_hints))
                .collect(),
        );

        let country_upper = country
            .map(|c| c.trim().to_uppercase())
            .filter(|c| !c.is_empty());
        let genre_lower = genre
            .map(|g| g.trim().to_lowercase())
            .filter(|g| !g.is_empty());
        let lang_lower = language
            .map(|l| l.trim().to_lowercase())
            .filter(|l| !l.is_empty());

        stations.retain(|station| {
            if let Some(ref q) = clean_query {
                if !matches_station_search(station, q) {
                    return false;
                }
            }
            if let Some(ref cc) = country_upper {
                if station
                    .country_code
                    .as_deref()
                    .map(str::to_uppercase)
                    .as_deref()
                    != Some(cc.as_str())
                {
                    return false;
                }
            }
            if let Some(ref g) = genre_lower {
                if !station.genres.iter().any(|sg| sg.to_lowercase() == *g) {
                    return false;
                }
            }
            if let Some(ref l) = lang_lower {
                if !station.languages.iter().any(|sl| sl.to_lowercase() == *l) {
                    return false;
                }
            }
            true
        });

        Ok(stations)
    }

    /// Fetch a single station by its addressable coordinate (`31237:<pubkey>:<d>`).
    pub async fn fetch_station_by_address(&self, address: &str) -> Result<Option<Station>> {
        let mut parts = address.splitn(3, ':');
        let kind_str = parts
            .next()
            .ok_or_else(|| WavefuncError::InvalidStationAddress(address.to_string()))?;
        let pubkey_hex = parts
            .next()
            .ok_or_else(|| WavefuncError::InvalidStationAddress(address.to_string()))?;
        let d_tag = parts
            .next()
            .ok_or_else(|| WavefuncError::InvalidStationAddress(address.to_string()))?;

        if kind_str != STATION_KIND.to_string() || d_tag.is_empty() {
            return Err(WavefuncError::InvalidStationAddress(address.to_string()));
        }

        let author = PublicKey::from_hex(pubkey_hex)?;
        let cfg = self.config.read().await.clone();
        let filter = Filter::new()
            .kind(Kind::Custom(STATION_KIND))
            .author(author)
            .identifier(d_tag)
            .limit(1);

        let events = self
            .client
            .fetch_events(filter)
            .timeout(Duration::from_secs(cfg.request_timeout_secs))
            .await?;

        let relay_hints = vec![cfg.relay_url];
        let parsed = deduplicate_stations(
            events
                .iter()
                .filter_map(|ev| parse_station_event(ev, &relay_hints))
                .collect(),
        );
        Ok(parsed.into_iter().next())
    }

    /// Batch-fetch stations by addressable coordinates (`31237:<pubkey>:<d>`) in one relay query.
    pub async fn fetch_stations_by_addresses(&self, addresses: &[String]) -> Result<Vec<Station>> {
        if addresses.is_empty() {
            return Ok(Vec::new());
        }

        let mut by_addr: HashMap<String, Station> = HashMap::new();
        {
            let cached = self.cached_stations.read().await;
            for s in cached.iter() {
                if addresses.iter().any(|a| a == &s.address) {
                    by_addr.insert(s.address.clone(), s.clone());
                }
            }
        }

        let missing: Vec<&String> = addresses
            .iter()
            .filter(|a| !by_addr.contains_key(*a))
            .collect();

        if !missing.is_empty() {
            let mut authors: Vec<PublicKey> = Vec::new();
            let mut seen_authors: HashSet<PublicKey> = HashSet::new();
            let mut identifiers: Vec<String> = Vec::new();
            let mut seen_ids: HashSet<String> = HashSet::new();

            for addr in missing {
                let mut parts = addr.splitn(3, ':');
                let kind_str = parts.next();
                let pk_str = parts.next();
                let d_str = parts.next();
                if kind_str == Some(&STATION_KIND.to_string()) {
                    if let (Some(pk_hex), Some(d)) = (pk_str, d_str) {
                        if let Ok(pk) = PublicKey::from_hex(pk_hex) {
                            if seen_authors.insert(pk) {
                                authors.push(pk);
                            }
                            if !d.is_empty() && seen_ids.insert(d.to_string()) {
                                identifiers.push(d.to_string());
                            }
                        }
                    }
                }
            }

            if !authors.is_empty() && !identifiers.is_empty() {
                let cfg = self.config.read().await.clone();
                let filter = Filter::new()
                    .kind(Kind::Custom(STATION_KIND))
                    .authors(authors)
                    .identifiers(identifiers)
                    .limit(addresses.len().saturating_mul(2).clamp(10, 300));

                if let Ok(events) = self
                    .client
                    .fetch_events(filter)
                    .timeout(Duration::from_secs(cfg.request_timeout_secs))
                    .await
                {
                    let relay_hints = vec![cfg.relay_url];
                    let parsed = deduplicate_stations(
                        events
                            .iter()
                            .filter_map(|ev| parse_station_event(ev, &relay_hints))
                            .collect(),
                    );
                    for s in parsed {
                        by_addr.insert(s.address.clone(), s);
                    }
                }
            }
        }

        let mut ordered = Vec::new();
        for addr in addresses {
            if let Some(s) = by_addr.get(addr) {
                ordered.push(s.clone());
            }
        }
        Ok(ordered)
    }

    /// Fetch curated featured station collections advertised via `wavefunc:featured:lists`.
    pub async fn fetch_featured_lists(&self) -> Result<Vec<FeaturedList>> {
        let cfg = self.config.read().await.clone();
        let is_local = cfg.relay_url.contains("localhost")
            || cfg.relay_url.contains("127.0.0.1")
            || cfg.relay_url.contains("10.0.2.2");

        let mut admin_pks: Vec<PublicKey> = PROD_ADMIN_PUBKEYS
            .iter()
            .filter_map(|hex| PublicKey::from_hex(hex).ok())
            .collect();
        if is_local {
            if let Ok(dev_pk) = PublicKey::from_hex(DEV_ADMIN_PUBKEY) {
                admin_pks.push(dev_pk);
            }
        }

        let mut admin_filter = Filter::new()
            .kind(Kind::Custom(APP_DATA_KIND))
            .custom_tag(
                SingleLetterTag::from_char('l').unwrap(),
                ADMIN_FEATURED_LISTS_LABEL,
            )
            .limit(20);
        if !admin_pks.is_empty() {
            admin_filter = admin_filter.authors(admin_pks);
        }

        let admin_events = self
            .client
            .fetch_events(admin_filter)
            .timeout(Duration::from_secs(cfg.request_timeout_secs))
            .await?;

        // Sort newest admin curation events first so curated list ordering stays current.
        let mut sorted_admin: Vec<Event> = admin_events.into_iter().collect();
        sorted_admin.sort_by(|a, b| b.created_at.cmp(&a.created_at));

        let mut list_refs: Vec<String> = Vec::new();
        let mut seen_refs: HashSet<String> = HashSet::new();
        for ev in &sorted_admin {
            for addr in parse_admin_featured_list_refs(ev) {
                if seen_refs.insert(addr.clone()) {
                    list_refs.push(addr);
                }
            }
        }

        let list_events = if list_refs.is_empty() {
            let fallback = Filter::new()
                .kind(Kind::Custom(APP_DATA_KIND))
                .custom_tag(
                    SingleLetterTag::from_char('l').unwrap(),
                    FAVORITES_LIST_LABEL,
                )
                .limit(12);
            self.client
                .fetch_events(fallback)
                .timeout(Duration::from_secs(cfg.request_timeout_secs))
                .await?
        } else {
            let authors: Vec<PublicKey> = list_refs
                .iter()
                .filter_map(|r| r.split(':').nth(1))
                .filter_map(|pk| PublicKey::from_hex(pk).ok())
                .collect::<HashSet<_>>()
                .into_iter()
                .collect();
            let identifiers: Vec<String> = list_refs
                .iter()
                .filter_map(|r| r.splitn(3, ':').nth(2).map(str::to_string))
                .collect::<HashSet<_>>()
                .into_iter()
                .collect();

            // `relay.wavefunc.live` requires the `#l` application label on all kind 30078 queries.
            let filter = Filter::new()
                .kind(Kind::Custom(APP_DATA_KIND))
                .custom_tag(
                    SingleLetterTag::from_char('l').unwrap(),
                    FAVORITES_LIST_LABEL,
                )
                .authors(authors)
                .identifiers(identifiers)
                .limit(30);
            self.client
                .fetch_events(filter)
                .timeout(Duration::from_secs(cfg.request_timeout_secs))
                .await?
        };

        let mut by_addr: HashMap<String, (Timestamp, FeaturedList)> = HashMap::new();
        for ev in list_events.iter() {
            if let Some(list) = parse_favorites_list_event(ev) {
                if list.station_addresses.is_empty() {
                    continue;
                }
                match by_addr.get(&list.address) {
                    Some((ts, _)) if *ts >= ev.created_at => {}
                    _ => {
                        by_addr.insert(list.address.clone(), (ev.created_at, list));
                    }
                }
            }
        }

        let mut lists: Vec<FeaturedList> = Vec::new();
        if !list_refs.is_empty() {
            for addr in &list_refs {
                if let Some((_, list)) = by_addr.remove(addr) {
                    lists.push(list);
                }
            }
        }
        let mut remaining: Vec<FeaturedList> = by_addr.into_values().map(|(_, l)| l).collect();
        remaining.sort_by(|a, b| b.station_addresses.len().cmp(&a.station_addresses.len()));
        lists.extend(remaining);
        Ok(lists)
    }

    /// Compute discovery facets (genres, languages, countries) from the cached station list.
    pub async fn get_facets(&self) -> StationFacets {
        let stations = self.cached_stations.read().await;
        compute_facets(&stations)
    }

    // ─── Synced User Favorites Lists (kind 30078) ────────────────────────────

    async fn fetch_latest_user_app_list(&self, pubkey: PublicKey, label: &str) -> Result<Option<Event>> {
        let cfg = self.config.read().await.clone();
        let filter = Filter::new()
            .kind(Kind::Custom(APP_DATA_KIND))
            .author(pubkey)
            .custom_tag(SingleLetterTag::from_char('l').unwrap(), label)
            .limit(10);

        let events = self
            .client
            .fetch_events(filter)
            .timeout(Duration::from_secs(cfg.request_timeout_secs))
            .await?;

        Ok(events.into_iter().max_by_key(|ev| ev.created_at))
    }

    async fn fetch_user_favorites_event_by_id(
        &self,
        pubkey: PublicKey,
        favorites_id: &str,
    ) -> Result<Option<Event>> {
        let cfg = self.config.read().await.clone();
        let filter = Filter::new()
            .kind(Kind::Custom(APP_DATA_KIND))
            .author(pubkey)
            .custom_tag(
                SingleLetterTag::from_char('l').unwrap(),
                FAVORITES_LIST_LABEL,
            )
            .identifier(favorites_id)
            .limit(5);
        let events = self
            .client
            .fetch_events(filter)
            .timeout(Duration::from_secs(cfg.request_timeout_secs))
            .await?;
        Ok(events.into_iter().max_by_key(|ev| ev.created_at))
    }

    /// Fetch the signed-in user's synced Nostr favorites lists (`kind 30078`).
    pub async fn fetch_user_favorites(&self) -> Result<Vec<FeaturedList>> {
        let pubkey = {
            let guard = self.signer.read().await;
            guard.as_ref().map(ActiveSigner::pubkey)
        };
        let Some(pubkey) = pubkey else {
            return Ok(Vec::new());
        };

        let cfg = self.config.read().await.clone();
        let filter = Filter::new()
            .kind(Kind::Custom(APP_DATA_KIND))
            .author(pubkey)
            .custom_tag(
                SingleLetterTag::from_char('l').unwrap(),
                FAVORITES_LIST_LABEL,
            )
            .limit(30);

        let del_filter = Filter::new()
            .kind(Kind::EventDeletion)
            .author(pubkey)
            .limit(100);

        let timeout = Duration::from_secs(cfg.request_timeout_secs);
        let (events_res, del_res) = tokio::join!(
            self.client.fetch_events(filter).timeout(timeout),
            self.client.fetch_events(del_filter).timeout(timeout),
        );
        let events = events_res?;

        // Track NIP-09 deleted event IDs and addressable coordinates with deletion timestamps.
        let mut deleted_event_ids: HashSet<String> = HashSet::new();
        let mut deleted_addresses: HashMap<String, Timestamp> = HashMap::new();
        if let Ok(del_events) = del_res {
            for del in del_events.iter() {
                for tag in del.tags.iter() {
                    let s = tag.as_slice();
                    if s.first().map(|x| x.as_str()) == Some("e") {
                        if let Some(eid) = s.get(1) {
                            deleted_event_ids.insert(eid.clone());
                        }
                    } else if s.first().map(|x| x.as_str()) == Some("a") {
                        if let Some(addr) = s.get(1) {
                            deleted_addresses
                                .entry(addr.clone())
                                .and_modify(|ts| {
                                    if del.created_at > *ts {
                                        *ts = del.created_at;
                                    }
                                })
                                .or_insert(del.created_at);
                        }
                    }
                }
            }
        }

        // Deduplicate by `favorites_id` keeping newest non-deleted event.
        let mut by_id: HashMap<String, (Timestamp, FeaturedList)> = HashMap::new();
        for ev in events.iter() {
            if deleted_event_ids.contains(&ev.id.to_hex()) {
                continue;
            }
            if let Some(list) = parse_favorites_list_event(ev) {
                if let Some(del_ts) = deleted_addresses.get(&list.address) {
                    if *del_ts >= ev.created_at {
                        continue;
                    }
                }
                match by_id.get(&list.favorites_id) {
                    Some((ts, _)) if *ts >= ev.created_at => {}
                    _ => {
                        by_id.insert(list.favorites_id.clone(), (ev.created_at, list));
                    }
                }
            }
        }
        let mut out: Vec<FeaturedList> = by_id.into_values().map(|(_, list)| list).collect();
        out.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
        Ok(out)
    }

    /// Create a brand-new Nostr favorites list (`kind 30078`).
    pub async fn create_favorites_list(
        &self,
        name: &str,
        description: Option<&str>,
        station_addresses: &[String],
    ) -> Result<ActionOutcome> {
        let pubkey = {
            let guard = self.signer.read().await;
            guard
                .as_ref()
                .map(ActiveSigner::pubkey)
                .ok_or_else(|| WavefuncError::AuthRequired("Sign in to create lists.".into()))?
        };
        let (favorites_id, builder) =
            build_new_favorites_list_builder(name, description, station_addresses)?;
        let address = format!("{APP_DATA_KIND}:{}:{favorites_id}", pubkey.to_hex());
        self.sign_or_prepare(builder, Some(address)).await
    }

    /// Rename / update description of an existing favorites list.
    pub async fn update_favorites_list(
        &self,
        favorites_id: &str,
        name: &str,
        description: Option<&str>,
    ) -> Result<ActionOutcome> {
        let pubkey = {
            let guard = self.signer.read().await;
            guard
                .as_ref()
                .map(ActiveSigner::pubkey)
                .ok_or_else(|| WavefuncError::AuthRequired("Sign in to edit lists.".into()))?
        };
        let existing = self
            .fetch_user_favorites_event_by_id(pubkey, favorites_id)
            .await?
            .ok_or_else(|| WavefuncError::InvalidInput("Favorites list not found".into()))?;
        let builder = build_update_favorites_list_builder(&existing, name, description)?;
        let address = format!("{APP_DATA_KIND}:{}:{favorites_id}", pubkey.to_hex());
        self.sign_or_prepare(builder, Some(address)).await
    }

    /// Delete a user favorites list via NIP-09 (`kind 5`).
    pub async fn delete_favorites_list(
        &self,
        event_id: &str,
        favorites_id: &str,
    ) -> Result<ActionOutcome> {
        let pubkey = {
            let guard = self.signer.read().await;
            guard
                .as_ref()
                .map(ActiveSigner::pubkey)
                .ok_or_else(|| WavefuncError::AuthRequired("Sign in to delete lists.".into()))?
        };
        let pubkey_hex = pubkey.to_hex();
        let builder = build_delete_favorites_list_builder(event_id, &pubkey_hex, favorites_id)?;
        let address = format!("{APP_DATA_KIND}:{pubkey_hex}:{favorites_id}");
        self.sign_or_prepare(builder, Some(address)).await
    }

    /// Add or remove a station from a specific user favorites list (or default list if `None`).
    pub async fn toggle_station_in_favorites_list(
        &self,
        favorites_id: Option<&str>,
        station_address: &str,
        add: bool,
    ) -> Result<ActionOutcome> {
        let pubkey = {
            let guard = self.signer.read().await;
            guard
                .as_ref()
                .map(ActiveSigner::pubkey)
                .ok_or_else(|| WavefuncError::AuthRequired("Sign in to sync favorites.".into()))?
        };

        let existing = match favorites_id.map(str::trim).filter(|s| !s.is_empty()) {
            Some(id) => self.fetch_user_favorites_event_by_id(pubkey, id).await?,
            None => {
                self.fetch_latest_user_app_list(pubkey, FAVORITES_LIST_LABEL)
                    .await?
            }
        };
        let builder = build_favorites_list_builder(existing.as_ref(), station_address, add)?;
        self.sign_or_prepare(builder, Some(station_address.to_string()))
            .await
    }

    /// Backwards-compatible helper targeting the user's primary favorites list.
    pub async fn toggle_favorite_station(
        &self,
        station_address: &str,
        add: bool,
    ) -> Result<ActionOutcome> {
        self.toggle_station_in_favorites_list(None, station_address, add)
            .await
    }

    // ─── Station Social: Reactions (kind 7), Comments (1111) & Zaps (9735/9321)

    /// Batch-fetch social counts (likes, comments, zaps/nutzaps) for a set of station addresses.
    pub async fn fetch_stations_social_counts(
        &self,
        addresses: &[String],
    ) -> Result<Vec<StationCardCounts>> {
        let unique_addrs: Vec<String> = addresses
            .iter()
            .filter(|a| a.starts_with(&format!("{STATION_KIND}:")))
            .cloned()
            .collect::<HashSet<_>>()
            .into_iter()
            .collect();
        if unique_addrs.is_empty() {
            return Ok(Vec::new());
        }

        // Map cached station event IDs -> addresses so `#e` queries on `relay.wavefunc.live`
        // (which indexes kind 1111 comments by `#e`) hydrate counts cleanly.
        let mut id_to_addr: HashMap<String, String> = HashMap::new();
        let mut event_ids: Vec<EventId> = Vec::new();
        {
            let cached = self.cached_stations.read().await;
            let wanted: HashSet<&str> = unique_addrs.iter().map(String::as_str).collect();
            for s in cached.iter() {
                if wanted.contains(s.address.as_str()) {
                    if let Ok(eid) = EventId::from_hex(&s.id) {
                        id_to_addr.insert(s.id.clone(), s.address.clone());
                        event_ids.push(eid);
                    }
                }
            }
        }

        let current_pk = {
            let guard = self.signer.read().await;
            guard.as_ref().map(|s| s.pubkey().to_hex())
        };

        let social_lower = Filter::new()
            .kinds([
                Kind::Custom(REACTION_KIND),
                Kind::Custom(COMMENT_KIND),
                Kind::Custom(ZAP_RECEIPT_KIND),
                Kind::Custom(NUTZAP_KIND),
            ])
            .custom_tags(SingleLetterTag::from_char('a').unwrap(), unique_addrs.clone())
            .limit(400);

        let comment_upper = Filter::new()
            .kind(Kind::Custom(COMMENT_KIND))
            .custom_tags(SingleLetterTag::from_char('A').unwrap(), unique_addrs.clone())
            .limit(200);

        let social_by_event = if !event_ids.is_empty() {
            Some(
                Filter::new()
                    .kinds([
                        Kind::Custom(REACTION_KIND),
                        Kind::Custom(COMMENT_KIND),
                        Kind::Custom(ZAP_RECEIPT_KIND),
                        Kind::Custom(NUTZAP_KIND),
                    ])
                    .events(event_ids.clone())
                    .limit(400),
            )
        } else {
            None
        };

        let public_zaps_filter = Filter::new()
            .kinds([
                Kind::Custom(ZAP_RECEIPT_KIND),
                Kind::Custom(NUTZAP_KIND),
                Kind::Custom(REACTION_KIND),
                Kind::Custom(COMMENT_KIND),
            ])
            .custom_tags(SingleLetterTag::from_char('a').unwrap(), unique_addrs.clone())
            .limit(250);

        self.ensure_identity_relays().await;

        let timeout = Duration::from_secs(6);
        let app_ev_fut = async {
            if let Some(f) = social_by_event {
                self.client.fetch_events(f).timeout(timeout).await.ok()
            } else {
                None
            }
        };

        let (app_lo, app_up, app_ev, pub_res) = tokio::join!(
            self.client.fetch_events(social_lower).timeout(timeout),
            self.client.fetch_events(comment_upper).timeout(timeout),
            app_ev_fut,
            self.identity_client
                .fetch_events(public_zaps_filter)
                .timeout(Duration::from_secs(5)),
        );

        let mut all_events: Vec<Event> = Vec::new();
        if let Ok(evs) = app_lo {
            all_events.extend(evs.into_iter());
        }
        if let Ok(evs) = app_up {
            all_events.extend(evs.into_iter());
        }
        if let Some(evs) = app_ev {
            all_events.extend(evs.into_iter());
        }
        if let Ok(evs) = pub_res {
            all_events.extend(evs.into_iter());
        }

        let summary_map = summarize_station_social_counts(
            &unique_addrs,
            &id_to_addr,
            &all_events,
            current_pk.as_deref(),
        );
        let mut ordered = Vec::with_capacity(addresses.len());
        let mut emitted = HashSet::new();
        for addr in addresses {
            if emitted.insert(addr.clone()) {
                if let Some(counts) = summary_map.get(addr) {
                    ordered.push(counts.clone());
                }
            }
        }
        Ok(ordered)
    }

    pub async fn fetch_station_social(
        &self,
        station_address: &str,
        station_event_id: &str,
    ) -> Result<StationSocialSummary> {
        let cfg = self.config.read().await.clone();
        let current_pk = {
            let guard = self.signer.read().await;
            guard.as_ref().map(|s| s.pubkey().to_hex())
        };

        let social_lower = Filter::new()
            .kinds([
                Kind::Custom(REACTION_KIND),
                Kind::Custom(COMMENT_KIND),
                Kind::Custom(ZAP_RECEIPT_KIND),
                Kind::Custom(NUTZAP_KIND),
            ])
            .custom_tag(SingleLetterTag::from_char('a').unwrap(), station_address)
            .limit(250);

        let comment_upper = Filter::new()
            .kind(Kind::Custom(COMMENT_KIND))
            .custom_tag(SingleLetterTag::from_char('A').unwrap(), station_address)
            .limit(100);

        let station_eid = EventId::from_hex(station_event_id).ok();
        let social_by_event = station_eid.map(|eid| {
            Filter::new()
                .kinds([
                    Kind::Custom(REACTION_KIND),
                    Kind::Custom(COMMENT_KIND),
                    Kind::Custom(ZAP_RECEIPT_KIND),
                    Kind::Custom(NUTZAP_KIND),
                ])
                .event(eid)
                .limit(200)
        });

        let public_social = Filter::new()
            .kinds([
                Kind::Custom(REACTION_KIND),
                Kind::Custom(COMMENT_KIND),
                Kind::Custom(ZAP_RECEIPT_KIND),
                Kind::Custom(NUTZAP_KIND),
            ])
            .custom_tag(SingleLetterTag::from_char('a').unwrap(), station_address)
            .limit(150);

        self.ensure_identity_relays().await;

        let timeout = Duration::from_secs(cfg.request_timeout_secs);
        let social_by_event_pub = social_by_event.clone();
        let ev_app_fut = async move {
            if let Some(f) = social_by_event {
                self.client.fetch_events(f).timeout(timeout).await.ok()
            } else {
                None
            }
        };
        let ev_pub_fut = async move {
            if let Some(f) = social_by_event_pub {
                self.identity_client
                    .fetch_events(f)
                    .timeout(Duration::from_secs(5))
                    .await
                    .ok()
            } else {
                None
            }
        };

        let (lo_res, up_res, ev_app_res, ev_pub_res, pub_res) = tokio::join!(
            self.client.fetch_events(social_lower).timeout(timeout),
            self.client.fetch_events(comment_upper).timeout(timeout),
            ev_app_fut,
            ev_pub_fut,
            self.identity_client
                .fetch_events(public_social)
                .timeout(Duration::from_secs(5)),
        );

        let mut all_events: Vec<Event> = Vec::new();
        let mut comment_events: Vec<Event> = Vec::new();
        let mut seen_comment_ids: HashSet<String> = HashSet::new();

        let mut push_event = |ev: Event| {
            if ev.kind == Kind::Custom(COMMENT_KIND)
                && seen_comment_ids.insert(ev.id.to_hex())
            {
                comment_events.push(ev.clone());
            }
            all_events.push(ev);
        };

        if let Ok(events) = lo_res {
            for ev in events.into_iter() {
                push_event(ev);
            }
        }
        if let Ok(events) = up_res {
            for ev in events.into_iter() {
                push_event(ev);
            }
        }
        if let Some(events) = ev_app_res {
            for ev in events.into_iter() {
                push_event(ev);
            }
        }
        if let Some(events) = ev_pub_res {
            for ev in events.into_iter() {
                push_event(ev);
            }
        }
        if let Ok(events) = pub_res {
            for ev in events.into_iter() {
                push_event(ev);
            }
        }

        let author_pks: Vec<String> = comment_events
            .iter()
            .map(|e| e.pubkey.to_hex())
            .collect::<HashSet<_>>()
            .into_iter()
            .collect();
        let profiles = self.fetch_profiles(&author_pks).await.unwrap_or_default();

        let comments = build_comment_tree(&comment_events, station_event_id, &profiles);
        let id_to_addr = HashMap::from([(
            station_event_id.to_string(),
            station_address.to_string(),
        )]);
        let counts_map = summarize_station_social_counts(
            &[station_address.to_string()],
            &id_to_addr,
            &all_events,
            current_pk.as_deref(),
        );
        let counts = counts_map.get(station_address).cloned().unwrap_or_default();

        Ok(StationSocialSummary {
            station_address: station_address.to_string(),
            reaction_count: counts.reaction_count,
            user_reacted: counts.user_reacted,
            comment_count: comments.len() as u32,
            zap_count: counts.zap_count,
            zap_sats: counts.zap_sats,
            user_zapped: counts.user_zapped,
            comments,
        })
    }

    /// Check relays for a NIP-57 `kind 9735` zap receipt matching an issued BOLT11 invoice
    /// (used to auto-confirm external wallet payments such as Minibits / Phoenix / Zeus).
    pub async fn check_station_zap_receipt(
        &self,
        station_address: &str,
        bolt11: &str,
        since_unix: u64,
    ) -> Result<bool> {
        let needle = bolt11.trim().to_ascii_lowercase();
        if needle.is_empty() {
            return Ok(false);
        }

        let filter = Filter::new()
            .kind(Kind::Custom(ZAP_RECEIPT_KIND))
            .custom_tag(SingleLetterTag::from_char('a').unwrap(), station_address)
            .since(Timestamp::from(since_unix.saturating_sub(30)))
            .limit(25);

        self.ensure_identity_relays().await;
        let timeout = Duration::from_secs(4);
        let (app_res, pub_res) = tokio::join!(
            self.client.fetch_events(filter.clone()).timeout(timeout),
            self.identity_client.fetch_events(filter).timeout(timeout),
        );

        let matches_bolt11 = |ev: &Event| -> bool {
            ev.tags.iter().any(|tag| {
                let s = tag.as_slice();
                s.first().map(|x| x.as_str()) == Some("bolt11")
                    && s.get(1)
                        .is_some_and(|v| v.trim().to_ascii_lowercase() == needle)
            })
        };

        if let Ok(events) = app_res {
            if events.iter().any(matches_bolt11) {
                return Ok(true);
            }
        }
        if let Ok(events) = pub_res {
            if events.iter().any(matches_bolt11) {
                return Ok(true);
            }
        }
        Ok(false)
    }

    pub async fn react_to_station(
        &self,
        station_id: &str,
        station_pubkey: &str,
        station_address: &str,
    ) -> Result<ActionOutcome> {
        let builder =
            build_station_reaction_builder(station_id, station_pubkey, station_address, "❤️")?;
        self.sign_or_prepare(builder, Some(station_address.to_string()))
            .await
    }

    pub async fn post_station_comment(
        &self,
        station_event_id: &str,
        station_pubkey: &str,
        station_address: &str,
        content: &str,
        reply_to_id: Option<&str>,
        reply_to_pubkey: Option<&str>,
    ) -> Result<ActionOutcome> {
        let builder = build_station_comment_builder(
            station_event_id,
            station_pubkey,
            station_address,
            content,
            reply_to_id,
            reply_to_pubkey,
        )?;
        self.sign_or_prepare(builder, Some(station_address.to_string()))
            .await
    }

    // ─── Community Feed (#wavefunc) ──────────────────────────────────────────

    pub async fn fetch_community_posts(&self, limit: usize) -> Result<Vec<CommunityPost>> {
        let cfg = self.config.read().await.clone();
        let filter = Filter::new()
            .kinds([
                Kind::Custom(COMMUNITY_POST_KIND),
                Kind::Custom(COMMENT_KIND),
            ])
            .hashtag(COMMUNITY_TOPIC)
            .limit(limit.clamp(1, 200));

        let events = self
            .client
            .fetch_events(filter)
            .timeout(Duration::from_secs(cfg.request_timeout_secs))
            .await?;

        let raw: Vec<Event> = events.into_iter().collect();
        let author_pks: Vec<String> = raw
            .iter()
            .map(|e| e.pubkey.to_hex())
            .collect::<HashSet<_>>()
            .into_iter()
            .collect();
        let profiles = self.fetch_profiles(&author_pks).await.unwrap_or_default();

        Ok(parse_community_posts(&raw, &profiles))
    }

    pub async fn post_community_note(
        &self,
        content: &str,
        category: Option<&str>,
        reply_to_id: Option<&str>,
        reply_to_pubkey: Option<&str>,
        root_id: Option<&str>,
        root_pubkey: Option<&str>,
    ) -> Result<ActionOutcome> {
        let builder = build_community_post_builder(
            content,
            category,
            reply_to_id,
            reply_to_pubkey,
            root_id,
            root_pubkey,
        )?;
        self.sign_or_prepare(builder, None).await
    }

    // ─── Song Crates (kind 31337 + kind 30078 wavefunc_user_song_list) ───────

    pub async fn fetch_song_crate(&self) -> Result<SongCrate> {
        let pubkey = {
            let guard = self.signer.read().await;
            guard.as_ref().map(ActiveSigner::pubkey)
        };
        let Some(pubkey) = pubkey else {
            return Ok(SongCrate::default());
        };

        let existing = self
            .fetch_latest_user_app_list(pubkey, SONG_LIST_LABEL)
            .await?;
        let Some(list_event) = existing else {
            return Ok(SongCrate {
                list_id: "liked-songs".to_string(),
                address: format!("{APP_DATA_KIND}:{}:liked-songs", pubkey.to_hex()),
                name: "Liked Songs".to_string(),
                description: None,
                song_addresses: Vec::new(),
                songs: Vec::new(),
            });
        };

        let list_id = list_event
            .tags
            .iter()
            .find_map(|t| {
                let s = t.as_slice();
                (s.first().map(|x| x.as_str()) == Some("d"))
                    .then(|| s.get(1).cloned())
                    .flatten()
            })
            .unwrap_or_else(|| "liked-songs".to_string());
        let name = list_event
            .tags
            .iter()
            .find_map(|t| {
                let s = t.as_slice();
                (s.first().map(|x| x.as_str()) == Some("name"))
                    .then(|| s.get(1).cloned())
                    .flatten()
            })
            .unwrap_or_else(|| "Liked Songs".to_string());

        let song_addresses: Vec<String> = list_event
            .tags
            .iter()
            .filter_map(|tag| {
                let s = tag.as_slice();
                if s.first().map(|x| x.as_str()) == Some("a") {
                    s.get(1)
                        .filter(|v| v.starts_with(&format!("{SONG_KIND}:")))
                        .cloned()
                } else {
                    None
                }
            })
            .collect();

        let mut songs: Vec<SavedSong> = Vec::new();
        if !song_addresses.is_empty() {
            let authors: Vec<PublicKey> = song_addresses
                .iter()
                .filter_map(|a| a.split(':').nth(1))
                .filter_map(|pk| PublicKey::from_hex(pk).ok())
                .collect::<HashSet<_>>()
                .into_iter()
                .collect();
            let identifiers: Vec<String> = song_addresses
                .iter()
                .filter_map(|a| a.splitn(3, ':').nth(2).map(str::to_string))
                .collect::<HashSet<_>>()
                .into_iter()
                .collect();

            let cfg = self.config.read().await.clone();
            let filter = Filter::new()
                .kind(Kind::Custom(SONG_KIND))
                .authors(authors)
                .identifiers(identifiers)
                .limit(200);
            if let Ok(events) = self
                .client
                .fetch_events(filter)
                .timeout(Duration::from_secs(cfg.request_timeout_secs))
                .await
            {
                let mut by_addr: HashMap<String, SavedSong> = HashMap::new();
                for ev in events.iter() {
                    if let Some(song) = parse_song_event(ev) {
                        match by_addr.get(&song.address) {
                            Some(existing) if existing.created_at >= song.created_at => {}
                            _ => {
                                by_addr.insert(song.address.clone(), song);
                            }
                        }
                    }
                }
                for addr in &song_addresses {
                    if let Some(song) = by_addr.remove(addr) {
                        songs.push(song);
                    }
                }
            }
        }

        Ok(SongCrate {
            address: format!("{APP_DATA_KIND}:{}:{list_id}", pubkey.to_hex()),
            list_id,
            name,
            description: None,
            song_addresses,
            songs,
        })
    }

    #[allow(clippy::too_many_arguments)]
    pub async fn create_song_event(
        &self,
        title: &str,
        artist: Option<&str>,
        album: Option<&str>,
        mbid: Option<&str>,
        release_id: Option<&str>,
        release_date: Option<&str>,
        duration_ms: Option<u64>,
        genres: &[String],
    ) -> Result<ActionOutcome> {
        let pubkey = {
            let guard = self.signer.read().await;
            guard
                .as_ref()
                .map(ActiveSigner::pubkey)
                .ok_or_else(|| WavefuncError::AuthRequired("Sign in to save songs.".into()))?
        };
        let (song_id, builder) = build_song_event_builder(
            title,
            artist,
            album,
            mbid,
            release_id,
            release_date,
            duration_ms,
            genres,
        )?;
        let song_address = format!("{SONG_KIND}:{}:{song_id}", pubkey.to_hex());
        self.sign_or_prepare(builder, Some(song_address)).await
    }

    pub async fn update_song_crate(
        &self,
        song_address: &str,
        add: bool,
    ) -> Result<ActionOutcome> {
        let pubkey = {
            let guard = self.signer.read().await;
            guard
                .as_ref()
                .map(ActiveSigner::pubkey)
                .ok_or_else(|| WavefuncError::AuthRequired("Sign in to edit song crate.".into()))?
        };
        let existing = self
            .fetch_latest_user_app_list(pubkey, SONG_LIST_LABEL)
            .await?;
        let builder = build_song_list_builder(existing.as_ref(), song_address, add)?;
        self.sign_or_prepare(builder, Some(song_address.to_string()))
            .await
    }

    // ─── NIP-38 Live Music Listening Status (kind 30315) ─────────────────────

    pub async fn publish_listening_status(
        &self,
        title: Option<&str>,
        artist: Option<&str>,
        station_address: Option<&str>,
        station_url: Option<&str>,
    ) -> Result<ActionOutcome> {
        let builder =
            build_listening_status_builder(title, artist, station_address, station_url)?;
        self.sign_or_prepare(builder, station_address.map(str::to_string))
            .await
    }

    // ─── ContextVM Metadata ──────────────────────────────────────────────────

    /// Query the ContextVM metadata server over Nostr for live song/artist/album metadata.
    pub async fn extract_stream_metadata(
        &self,
        stream_url: &str,
        station_address: Option<&str>,
        session_id: Option<&str>,
    ) -> Result<NowPlayingMetadata> {
        let cfg = self.config.read().await.clone();
        contextvm::extract_stream_metadata(
            &self.client,
            &self.ephemeral_keys,
            &cfg.metadata_server_pubkey,
            stream_url,
            station_address,
            session_id,
            cfg.request_timeout_secs,
        )
        .await
    }

    // ─── Wallet (NIP-47 NWC) & NIP-57 Lightning Zaps ─────────────────────────

    /// Connect an NWC (NIP-47) Lightning wallet from a `nostr+walletconnect://` URI.
    pub async fn connect_nwc(&self, nwc_uri: &str) -> Result<NwcWalletStatus> {
        let mut session = ActiveNwcSession::connect(nwc_uri)?;
        let _ = session.refresh_balance().await;
        let status = session.status();

        let previous = {
            let mut guard = self.nwc.write().await;
            guard.replace(session)
        };
        if let Some(old) = previous {
            old.shutdown().await;
        }
        Ok(status)
    }

    /// Disconnect the active NWC Lightning wallet.
    pub async fn disconnect_nwc(&self) {
        let previous = {
            let mut guard = self.nwc.write().await;
            guard.take()
        };
        if let Some(old) = previous {
            old.shutdown().await;
        }
    }

    /// Return the current NWC wallet connection state (without forcing a network call).
    pub async fn get_nwc_status(&self) -> NwcWalletStatus {
        let guard = self.nwc.read().await;
        match guard.as_ref() {
            Some(s) => s.status(),
            None => NwcWalletStatus::default(),
        }
    }

    /// Refresh the connected NWC wallet's balance over NIP-47 `get_balance`.
    pub async fn refresh_nwc_balance(&self) -> Result<NwcWalletStatus> {
        let mut guard = self.nwc.write().await;
        let Some(session) = guard.as_mut() else {
            return Ok(NwcWalletStatus::default());
        };
        let _ = session.refresh_balance().await?;
        Ok(session.status())
    }

    /// Resolve a station owner's Lightning address (`lud16`), build a NIP-57 `kind 9734`
    /// zap request (signed immediately for LocalKey/Bunker, or returned unsigned for Amber),
    /// and request a BOLT11 invoice from the LNURL callback.
    pub async fn prepare_station_zap(
        &self,
        station_pubkey: &str,
        station_address: &str,
        amount_sats: u64,
        comment: Option<&str>,
    ) -> Result<ZapInvoiceResult> {
        if amount_sats == 0 {
            return Err(WavefuncError::InvalidInput(
                "Zap amount must be at least 1 sat".to_string(),
            ));
        }

        let profiles = self
            .fetch_profiles(&[station_pubkey.to_string()])
            .await
            .unwrap_or_default();
        let owner = profiles.get(station_pubkey);
        let lud16 = owner.and_then(|p| p.lud16.as_deref());
        let lud06 = owner.and_then(|p| p.lud06.as_deref());

        let lnurl = fetch_lnurl_pay_params(&self.http, lud16, lud06).await?;
        let amount_msat = amount_sats.saturating_mul(1000);
        if amount_msat < lnurl.min_sendable_msat {
            return Err(WavefuncError::Wallet(format!(
                "Amount too low. Minimum: {} sats",
                lnurl.min_sendable_msat.div_ceil(1000)
            )));
        }
        if amount_msat > lnurl.max_sendable_msat {
            return Err(WavefuncError::Wallet(format!(
                "Amount too high. Maximum: {} sats",
                lnurl.max_sendable_msat / 1000
            )));
        }

        let mut receipt_relays: Vec<String> = DEFAULT_SOCIAL_RELAYS
            .iter()
            .map(|s| (*s).to_string())
            .collect();
        let app_relay = self.config.read().await.relay_url.clone();
        if app_relay.starts_with("wss://") && !receipt_relays.contains(&app_relay) {
            receipt_relays.insert(0, app_relay);
        }

        let signed_zap_json: Option<String> = if lnurl.allows_nostr {
            let builder = build_zap_request_builder(
                station_pubkey,
                station_address,
                amount_msat,
                comment,
                &receipt_relays,
            )?;

            let signer_mode = {
                let guard = self.signer.read().await;
                match guard.as_ref() {
                    None => None,
                    Some(ActiveSigner::LocalKey(keys)) => Some(Err(keys.clone())),
                    Some(ActiveSigner::Bunker { signer, .. }) => {
                        Some(Ok((Some(signer.clone()), None)))
                    }
                    Some(ActiveSigner::Amber { pubkey }) => Some(Ok((None, Some(*pubkey)))),
                }
            };

            match signer_mode {
                None => None, // Anonymous LNURL zap if user isn't logged in
                Some(Err(keys)) => Some(builder.finalize(&keys)?.as_json()),
                Some(Ok((Some(bunker), _))) => {
                    Some(builder.finalize_async(bunker.as_ref()).await?.as_json())
                }
                Some(Ok((None, Some(pubkey)))) => {
                    // External NIP-55 Amber signing: return unsigned kind 9734 first.
                    let unsigned = builder.finalize_unsigned(pubkey);
                    return Ok(ZapInvoiceResult {
                        bolt11: None,
                        amount_sats,
                        recipient_lud16: lnurl.recipient_lud16,
                        allows_nostr: true,
                        callback_url: lnurl.callback,
                        unsigned_zap_request_json: Some(unsigned.as_json()),
                    });
                }
                Some(Ok((None, None))) => None,
            }
        } else {
            None
        };

        let bolt11 = request_lnurl_invoice(
            &self.http,
            &lnurl.callback,
            amount_msat,
            comment,
            signed_zap_json.as_deref(),
        )
        .await?;

        Ok(ZapInvoiceResult {
            bolt11: Some(bolt11),
            amount_sats,
            recipient_lud16: lnurl.recipient_lud16,
            allows_nostr: lnurl.allows_nostr,
            callback_url: lnurl.callback,
            unsigned_zap_request_json: None,
        })
    }

    /// Finish requesting a BOLT11 invoice after Amber has signed the `kind 9734` zap request.
    pub async fn complete_station_zap_with_signed_request(
        &self,
        callback_url: &str,
        amount_sats: u64,
        comment: Option<&str>,
        signed_zap_request_json: &str,
        recipient_lud16: &str,
    ) -> Result<ZapInvoiceResult> {
        let event = Event::from_json(signed_zap_request_json)?;
        event.verify()?;

        let bolt11 = request_lnurl_invoice(
            &self.http,
            callback_url,
            amount_sats.saturating_mul(1000),
            comment,
            Some(&event.as_json()),
        )
        .await?;

        Ok(ZapInvoiceResult {
            bolt11: Some(bolt11),
            amount_sats,
            recipient_lud16: recipient_lud16.to_string(),
            allows_nostr: true,
            callback_url: callback_url.to_string(),
            unsigned_zap_request_json: None,
        })
    }

    /// Pay a BOLT11 invoice using the connected NIP-47 NWC wallet.
    pub async fn pay_invoice_nwc(
        &self,
        bolt11: &str,
        amount_sats: u64,
    ) -> Result<ZapPaymentResult> {
        let mut guard = self.nwc.write().await;
        let Some(session) = guard.as_mut() else {
            return Err(WavefuncError::Wallet(
                "No NWC wallet connected. Connect one in System settings or pay the QR invoice."
                    .to_string(),
            ));
        };
        session.pay_invoice(bolt11, amount_sats).await
    }

    // ─── Embedded Cashu Ecash Wallet (`cdk` + `cdk-redb`) & NIP-60/61 ─────

    /// Initialize or reopen the embedded multi-mint Cashu wallet stored in `db_dir`.
    pub async fn init_cashu_wallet(
        &self,
        db_dir: &str,
        seed_material: &str,
        mints: &[String],
    ) -> Result<CashuWalletStatus> {
        let mgr = CashuWalletManager::open(db_dir, seed_material, mints).await?;
        let status = mgr.status().await;
        let mut guard = self.cashu.write().await;
        *guard = Some(mgr);
        Ok(status)
    }

    /// Close the in-memory Cashu wallet and stop NIP-60 wallet relay connections.
    pub async fn close_cashu_wallet(&self) {
        {
            let mut guard = self.cashu.write().await;
            *guard = None;
        }
        let _ = self.wallet_client.disconnect().await;
    }

    /// Return current Cashu wallet balances across all configured mints.
    pub async fn get_cashu_status(&self) -> CashuWalletStatus {
        let guard = self.cashu.read().await;
        match guard.as_ref() {
            Some(mgr) => mgr.status().await,
            None => CashuWalletStatus::default(),
        }
    }

    async fn ensure_wallet_relays(&self, extra_relays: &[String]) -> Vec<String> {
        let mut urls: Vec<String> = DEFAULT_WALLET_RELAYS
            .iter()
            .map(|s| (*s).to_string())
            .collect();
        let app_relay = self.config.read().await.relay_url.clone();
        if app_relay.starts_with("wss://") && !urls.contains(&app_relay) {
            urls.push(app_relay);
        }
        for r in extra_relays {
            let trimmed = r.trim().trim_end_matches('/').to_string();
            if (trimmed.starts_with("wss://") || trimmed.starts_with("ws://"))
                && !urls.contains(&trimmed)
            {
                urls.push(trimmed);
            }
        }
        for url in &urls {
            let _ = self.wallet_client.add_relay(url.as_str()).await;
        }
        self.wallet_client.connect().await;
        urls
    }

    async fn nip44_decrypt_self(&self, ciphertext: &str) -> Result<String> {
        let mode = {
            let guard = self.signer.read().await;
            match guard.as_ref() {
                None => {
                    return Err(WavefuncError::AuthRequired(
                        "Sign in to sync your NIP-60 wallet.".to_string(),
                    ))
                }
                Some(ActiveSigner::LocalKey(keys)) => Err(keys.clone()),
                Some(ActiveSigner::Bunker { signer, pubkey }) => Ok((Some(signer.clone()), *pubkey)),
                Some(ActiveSigner::Amber { pubkey }) => Ok((None, *pubkey)),
            }
        };

        match mode {
            Err(keys) => nostr::nips::nip44::decrypt(keys.secret_key(), &keys.public_key(), ciphertext)
                .map_err(|e| WavefuncError::Wallet(format!("NIP-44 decrypt failed: {e}"))),
            Ok((Some(bunker), pubkey)) => bunker
                .nip44_decrypt_async(&pubkey, ciphertext)
                .await
                .map_err(|e| WavefuncError::Wallet(format!("Bunker NIP-44 decrypt failed: {e}"))),
            Ok((None, _)) => Err(WavefuncError::Wallet(
                "External Amber signer requires Flutter NIP-55 decryption".to_string(),
            )),
        }
    }

    async fn nip44_encrypt_self(&self, plaintext: &str) -> Result<String> {
        let mode = {
            let guard = self.signer.read().await;
            match guard.as_ref() {
                None => {
                    return Err(WavefuncError::AuthRequired(
                        "Sign in to publish NIP-60 wallet updates.".to_string(),
                    ))
                }
                Some(ActiveSigner::LocalKey(keys)) => Err(keys.clone()),
                Some(ActiveSigner::Bunker { signer, pubkey }) => Ok((Some(signer.clone()), *pubkey)),
                Some(ActiveSigner::Amber { pubkey }) => Ok((None, *pubkey)),
            }
        };

        match mode {
            Err(keys) => nostr::nips::nip44::encrypt(
                keys.secret_key(),
                &keys.public_key(),
                plaintext,
                nostr::nips::nip44::Version::V2,
            )
            .map_err(|e| WavefuncError::Wallet(format!("NIP-44 encrypt failed: {e}"))),
            Ok((Some(bunker), pubkey)) => bunker
                .nip44_encrypt_async(&pubkey, plaintext)
                .await
                .map_err(|e| WavefuncError::Wallet(format!("Bunker NIP-44 encrypt failed: {e}"))),
            Ok((None, _)) => Err(WavefuncError::Wallet(
                "External Amber signer cannot encrypt inside Rust".to_string(),
            )),
        }
    }

    /// Fetch raw NIP-60 events (`kind 17375`, `kind 7375`, `kind 5`, `kind 10019`, `kind 10002`)
    /// for the active account from default + user-configured wallet relays.
    pub async fn fetch_nip60_raw_events(&self) -> Result<Nip60RawEvents> {
        let pubkey = {
            let guard = self.signer.read().await;
            guard
                .as_ref()
                .map(ActiveSigner::pubkey)
                .ok_or_else(|| {
                    WavefuncError::AuthRequired("Sign in to sync your NIP-60 wallet.".to_string())
                })?
        };

        let mut relays = self.ensure_wallet_relays(&[]).await;
        let timeout = Duration::from_secs(7);

        let meta_filter = Filter::new()
            .author(pubkey)
            .kinds([
                Kind::Custom(WALLET_KIND),
                Kind::Custom(NUTZAP_INFO_KIND),
                Kind::Custom(RELAY_LIST_KIND),
            ])
            .limit(30);
        let token_filter = Filter::new()
            .author(pubkey)
            .kind(Kind::Custom(WALLET_TOKEN_KIND))
            .limit(250);
        let del_filter = Filter::new()
            .author(pubkey)
            .kind(Kind::Custom(DELETION_KIND))
            .limit(500);

        let (meta_res, tok_res, del_res) = tokio::join!(
            self.wallet_client.fetch_events(meta_filter.clone()).timeout(timeout),
            self.wallet_client.fetch_events(token_filter.clone()).timeout(timeout),
            self.wallet_client.fetch_events(del_filter.clone()).timeout(timeout),
        );

        let mut all_meta: Vec<Event> = meta_res.map(|e| e.into_iter().collect()).unwrap_or_default();
        let mut all_tokens: HashMap<String, Event> = HashMap::new();
        if let Ok(evs) = tok_res {
            for ev in evs.into_iter() {
                all_tokens.insert(ev.id.to_hex(), ev);
            }
        }
        let mut deleted_ids: HashSet<String> = HashSet::new();
        if let Ok(evs) = del_res {
            for ev in evs.into_iter() {
                for tag in ev.tags.iter() {
                    let s = tag.as_slice();
                    if s.first().map(|x| x.as_str()) == Some("e") {
                        if let Some(id) = s.get(1) {
                            deleted_ids.insert(id.clone());
                        }
                    }
                }
            }
        }

        // Discover user-specific wallet relays & mints from kind 10002, 10019, and clear-text 17375 tags.
        let mut extra_relays: Vec<String> = Vec::new();
        let mut discovered_mints: Vec<String> = Vec::new();
        for ev in &all_meta {
            for tag in ev.tags.iter() {
                let s = tag.as_slice();
                match s.first().map(|x| x.as_str()) {
                    Some("r") | Some("relay") => {
                        if let Some(url) = s.get(1).map(|v| v.trim().trim_end_matches('/')) {
                            if (url.starts_with("wss://") || url.starts_with("ws://"))
                                && !relays.contains(&url.to_string())
                                && !extra_relays.contains(&url.to_string())
                            {
                                extra_relays.push(url.to_string());
                            }
                        }
                    }
                    Some("mint") => {
                        if let Some(url) = s.get(1).map(|v| crate::cashu::normalize_mint_url(v)) {
                            if url.starts_with("http") && !discovered_mints.contains(&url) {
                                discovered_mints.push(url);
                            }
                        }
                    }
                    _ => {}
                }
            }
        }

        // Second pass if user has custom write/wallet relays we hadn't queried yet.
        if !extra_relays.is_empty() {
            relays = self.ensure_wallet_relays(&extra_relays).await;
            let (meta2, tok2, del2) = tokio::join!(
                self.wallet_client.fetch_events(meta_filter).timeout(Duration::from_secs(6)),
                self.wallet_client.fetch_events(token_filter).timeout(Duration::from_secs(6)),
                self.wallet_client.fetch_events(del_filter).timeout(Duration::from_secs(6)),
            );
            if let Ok(evs) = meta2 {
                all_meta.extend(evs.into_iter());
            }
            if let Ok(evs) = tok2 {
                for ev in evs.into_iter() {
                    all_tokens.insert(ev.id.to_hex(), ev);
                }
            }
            if let Ok(evs) = del2 {
                for ev in evs.into_iter() {
                    for tag in ev.tags.iter() {
                        let s = tag.as_slice();
                        if s.first().map(|x| x.as_str()) == Some("e") {
                            if let Some(id) = s.get(1) {
                                deleted_ids.insert(id.clone());
                            }
                        }
                    }
                }
            }
        }

        // Pick newest kind 17375 replaceable wallet event.
        let latest_wallet = all_meta
            .iter()
            .filter(|e| e.kind == Kind::Custom(WALLET_KIND))
            .max_by_key(|e| e.created_at);

        let wallet_event_content = latest_wallet
            .map(|e| e.content.clone())
            .filter(|c| !c.trim().is_empty());

        let mut token_events: Vec<Nip60RawTokenEvent> = all_tokens
            .into_values()
            .filter(|ev| !deleted_ids.contains(&ev.id.to_hex()) && !ev.content.trim().is_empty())
            .map(|ev| Nip60RawTokenEvent {
                id: ev.id.to_hex(),
                created_at: ev.created_at.as_secs(),
                content: ev.content,
            })
            .collect();
        token_events.sort_by(|a, b| b.created_at.cmp(&a.created_at));

        Ok(Nip60RawEvents {
            wallet_event_content,
            token_events,
            deleted_ids: deleted_ids.into_iter().collect(),
            wallet_relays: relays,
            discovered_mints,
        })
    }

    /// Sync NIP-60 wallet events directly in Rust (for LocalKey & NIP-46 Bunker sessions).
    pub async fn sync_nip60_wallet(&self) -> Result<CashuWalletStatus> {
        let raw = self.fetch_nip60_raw_events().await?;

        let mut wallet_cfg = None;
        if let Some(enc) = raw.wallet_event_content.as_deref() {
            if let Ok(plain) = self.nip44_decrypt_self(enc).await {
                wallet_cfg = Some(parse_nip60_wallet_content(&plain));
            }
        }

        // If decrypted kind 17375 specifies additional private wallet relays, fetch from them too.
        let mut all_relays = raw.wallet_relays.clone();
        let mut all_token_raw = raw.token_events;
        let mut all_deleted: HashSet<String> = raw.deleted_ids.into_iter().collect();

        if let Some(cfg) = &wallet_cfg {
            let new_relays: Vec<String> = cfg
                .relays
                .iter()
                .filter(|r| !all_relays.contains(r))
                .cloned()
                .collect();
            if !new_relays.is_empty() {
                all_relays = self.ensure_wallet_relays(&new_relays).await;
                if let Some(pubkey) = self.signer.read().await.as_ref().map(ActiveSigner::pubkey) {
                    let tf = Filter::new()
                        .author(pubkey)
                        .kind(Kind::Custom(WALLET_TOKEN_KIND))
                        .limit(250);
                    let df = Filter::new()
                        .author(pubkey)
                        .kind(Kind::Custom(DELETION_KIND))
                        .limit(500);
                    let (tr, dr) = tokio::join!(
                        self.wallet_client.fetch_events(tf).timeout(Duration::from_secs(6)),
                        self.wallet_client.fetch_events(df).timeout(Duration::from_secs(6)),
                    );
                    if let Ok(evs) = dr {
                        for ev in evs.into_iter() {
                            for tag in ev.tags.iter() {
                                let s = tag.as_slice();
                                if s.first().map(|x| x.as_str()) == Some("e") {
                                    if let Some(id) = s.get(1) {
                                        all_deleted.insert(id.clone());
                                    }
                                }
                            }
                        }
                    }
                    let mut existing_ids: HashSet<String> =
                        all_token_raw.iter().map(|t| t.id.clone()).collect();
                    if let Ok(evs) = tr {
                        for ev in evs.into_iter() {
                            let id = ev.id.to_hex();
                            if !all_deleted.contains(&id)
                                && !ev.content.trim().is_empty()
                                && existing_ids.insert(id.clone())
                            {
                                all_token_raw.push(Nip60RawTokenEvent {
                                    id,
                                    created_at: ev.created_at.as_secs(),
                                    content: ev.content,
                                });
                            }
                        }
                    }
                }
            }
        }

        let mut decrypted_tokens: Vec<Nip60DecryptedTokenEvent> = Vec::new();
        for tok in all_token_raw {
            if all_deleted.contains(&tok.id) {
                continue;
            }
            if let Ok(plaintext) = self.nip44_decrypt_self(&tok.content).await {
                decrypted_tokens.push(Nip60DecryptedTokenEvent {
                    id: tok.id,
                    plaintext,
                });
            }
        }

        let deleted_vec: Vec<String> = all_deleted.into_iter().collect();
        let mut guard = self.cashu.write().await;
        let mgr = guard
            .as_mut()
            .ok_or_else(|| WavefuncError::Wallet("Cashu wallet not initialized".to_string()))?;
        mgr.apply_nip60_sync(
            wallet_cfg.as_ref(),
            &decrypted_tokens,
            &deleted_vec,
            &raw.discovered_mints,
            &all_relays,
        )
        .await
    }

    /// Apply NIP-60 events decrypted externally by Android NIP-55 Amber.
    pub async fn apply_decrypted_nip60_events(
        &self,
        wallet_content_plain: Option<&str>,
        decrypted_tokens: &[Nip60DecryptedTokenEvent],
        deleted_ids: &[String],
        discovered_mints: &[String],
        wallet_relays: &[String],
    ) -> Result<CashuWalletStatus> {
        let wallet_cfg = wallet_content_plain.map(parse_nip60_wallet_content);
        let mut guard = self.cashu.write().await;
        let mgr = guard
            .as_mut()
            .ok_or_else(|| WavefuncError::Wallet("Cashu wallet not initialized".to_string()))?;
        mgr.apply_nip60_sync(
            wallet_cfg.as_ref(),
            decrypted_tokens,
            deleted_ids,
            discovered_mints,
            wallet_relays,
        )
        .await
    }

    /// Best-effort NIP-60 rollover publisher after a Cashu spend/receive/mint when using
    /// LocalKey or NIP-46 Bunker so other NIP-60 clients stay in sync.
    async fn publish_nip60_rollover_for_mint(&self, mint_url: &str) {
        let (should_sync, relays, payload_opt, old_ids) = {
            let guard = self.cashu.read().await;
            let Some(mgr) = guard.as_ref() else {
                return;
            };
            if !mgr.is_nip60_synced() {
                return;
            }
            let Ok((payload_opt, old_ids)) = mgr.build_nip60_rollover_payload(mint_url).await else {
                return;
            };
            (true, mgr.wallet_relays().to_vec(), payload_opt, old_ids)
        };
        if !should_sync {
            return;
        }
        // Only LocalKey / Bunker can encrypt & sign in background without interrupting UI.
        let can_bg_sign = {
            let guard = self.signer.read().await;
            matches!(
                guard.as_ref(),
                Some(ActiveSigner::LocalKey(_)) | Some(ActiveSigner::Bunker { .. })
            )
        };
        if !can_bg_sign {
            return;
        }

        let _ = self.ensure_wallet_relays(&relays).await;

        let mut new_event_id: Option<String> = None;
        if let Some(plaintext) = payload_opt {
            if let Ok(ciphertext) = self.nip44_encrypt_self(&plaintext).await {
                let builder = EventBuilder::new(Kind::Custom(WALLET_TOKEN_KIND), ciphertext);
                if let Ok(event) = self.sign_event_in_background(builder).await {
                    let id_hex = event.id.to_hex();
                    if self.wallet_client.send_event(&event).await.is_ok() {
                        new_event_id = Some(id_hex);
                    }
                }
            }
        }

        if !old_ids.is_empty() {
            let mut tags: Vec<Tag> = Vec::with_capacity(old_ids.len() + 1);
            for id in &old_ids {
                if let Ok(t) = Tag::parse(["e", id.as_str()]) {
                    tags.push(t);
                }
            }
            if let Ok(kt) = Tag::parse(["k", &WALLET_TOKEN_KIND.to_string()]) {
                tags.push(kt);
            }
            let del_builder = EventBuilder::new(Kind::Custom(DELETION_KIND), "").tags(tags);
            if let Ok(del_event) = self.sign_event_in_background(del_builder).await {
                let _ = self.wallet_client.send_event(&del_event).await;
            }
        }

        let mut guard = self.cashu.write().await;
        if let Some(mgr) = guard.as_mut() {
            mgr.record_nip60_token_event(mint_url, new_event_id);
        }
    }

    async fn sign_event_in_background(&self, builder: EventBuilder) -> Result<Event> {
        let mode = {
            let guard = self.signer.read().await;
            match guard.as_ref() {
                Some(ActiveSigner::LocalKey(keys)) => Err(keys.clone()),
                Some(ActiveSigner::Bunker { signer, .. }) => Ok(signer.clone()),
                _ => {
                    return Err(WavefuncError::Wallet(
                        "Background signing unavailable".to_string(),
                    ))
                }
            }
        };
        match mode {
            Err(keys) => Ok(builder.finalize(&keys)?),
            Ok(bunker) => Ok(builder.finalize_async(bunker.as_ref()).await?),
        }
    }

    /// Add a Cashu mint URL to the embedded wallet and return refreshed status.
    pub async fn add_cashu_mint(&self, mint_url: &str) -> Result<CashuWalletStatus> {
        let mut guard = self.cashu.write().await;
        let mgr = guard
            .as_mut()
            .ok_or_else(|| WavefuncError::Wallet("Cashu wallet not initialized".to_string()))?;
        mgr.ensure_mint(mint_url).await?;
        Ok(mgr.status().await)
    }

    /// Request a NUT-04 Lightning deposit invoice (`bolt11`) for minting Cashu ecash.
    pub async fn create_cashu_mint_quote(
        &self,
        mint_url: &str,
        amount_sats: u64,
    ) -> Result<CashuMintQuoteInfo> {
        let mut guard = self.cashu.write().await;
        let mgr = guard
            .as_mut()
            .ok_or_else(|| WavefuncError::Wallet("Cashu wallet not initialized".to_string()))?;
        mgr.create_mint_quote(mint_url, amount_sats).await
    }

    /// Claim newly minted Cashu proofs once the NUT-04 Lightning invoice has been paid.
    pub async fn claim_cashu_mint_quote(
        &self,
        mint_url: &str,
        quote_id: &str,
    ) -> Result<CashuWalletStatus> {
        let status = {
            let mut guard = self.cashu.write().await;
            let mgr = guard
                .as_mut()
                .ok_or_else(|| WavefuncError::Wallet("Cashu wallet not initialized".to_string()))?;
            mgr.claim_mint_quote(mint_url, quote_id).await?
        };
        self.publish_nip60_rollover_for_mint(mint_url).await;
        Ok(status)
    }

    /// Redeem an encoded `cashuA...` / `cashuB...` token into the embedded wallet.
    pub async fn receive_cashu_token(&self, token: &str) -> Result<CashuReceiveResult> {
        let res = {
            let mut guard = self.cashu.write().await;
            let mgr = guard
                .as_mut()
                .ok_or_else(|| WavefuncError::Wallet("Cashu wallet not initialized".to_string()))?;
            mgr.receive_token(token).await?
        };
        self.publish_nip60_rollover_for_mint(&res.mint_url).await;
        Ok(res)
    }

    /// Create a shareable `cashuB...` token from the embedded wallet.
    pub async fn send_cashu_token(
        &self,
        mint_url: Option<&str>,
        amount_sats: u64,
        memo: Option<&str>,
    ) -> Result<CashuSendResult> {
        let res = {
            let mut guard = self.cashu.write().await;
            let mgr = guard
                .as_mut()
                .ok_or_else(|| WavefuncError::Wallet("Cashu wallet not initialized".to_string()))?;
            mgr.send_token(mint_url, amount_sats, memo).await?
        };
        self.publish_nip60_rollover_for_mint(&res.mint_url).await;
        Ok(res)
    }

    /// Melt Cashu ecash to pay a BOLT11 Lightning invoice (e.g. NIP-57 station zap).
    pub async fn pay_invoice_cashu(
        &self,
        mint_url: Option<&str>,
        bolt11: &str,
        amount_sats: u64,
    ) -> Result<ZapPaymentResult> {
        let (used_mint, res) = {
            let mut guard = self.cashu.write().await;
            let mgr = guard
                .as_mut()
                .ok_or_else(|| WavefuncError::Wallet("Cashu wallet not initialized".to_string()))?;
            mgr.pay_invoice_with_mint(mint_url, bolt11, amount_sats).await?
        };
        self.publish_nip60_rollover_for_mint(&used_mint).await;
        Ok(res)
    }

    /// Fetch a recipient's NIP-61 `kind 10019` nutzap info (P2PK pubkey + accepted mints + relays).
    pub async fn fetch_recipient_nutzap_info(
        &self,
        pubkey_hex: &str,
    ) -> Result<Option<RecipientNutzapInfo>> {
        let pk = PublicKey::from_hex(pubkey_hex.trim())
            .map_err(|e| WavefuncError::InvalidInput(format!("Invalid pubkey: {e}")))?;
        let filter = Filter::new()
            .author(pk)
            .kind(Kind::Custom(NUTZAP_INFO_KIND))
            .limit(5);

        self.ensure_identity_relays().await;

        let timeout = Duration::from_secs(5);
        let (app_res, pub_res) = tokio::join!(
            self.client.fetch_events(filter.clone()).timeout(timeout),
            self.identity_client.fetch_events(filter).timeout(timeout),
        );

        let mut latest: Option<Event> = None;
        for res in [app_res, pub_res] {
            if let Ok(events) = res {
                for ev in events.into_iter() {
                    if latest
                        .as_ref()
                        .map(|cur| ev.created_at > cur.created_at)
                        .unwrap_or(true)
                    {
                        latest = Some(ev);
                    }
                }
            }
        }

        Ok(latest.as_ref().and_then(parse_nutzap_info_event))
    }

    /// Send an instant P2PK-locked NIP-61 Nutzap (`kind 9321`) to a WaveFunc station.
    pub async fn send_station_nutzap(
        &self,
        station_event_id: &str,
        station_pubkey: &str,
        station_address: &str,
        amount_sats: u64,
        comment: Option<&str>,
    ) -> Result<ActionOutcome> {
        let info = self
            .fetch_recipient_nutzap_info(station_pubkey)
            .await?
            .ok_or_else(|| {
                WavefuncError::Wallet(
                    "Station owner has not published NIP-61 Nutzap info (kind 10019)".to_string(),
                )
            })?;

        let recipient_p2pk = info
            .p2pk_pubkey
            .as_deref()
            .filter(|s| !s.is_empty())
            .unwrap_or(station_pubkey);

        let (mint_url, proof_jsons) = {
            let mut guard = self.cashu.write().await;
            let mgr = guard
                .as_mut()
                .ok_or_else(|| WavefuncError::Wallet("Cashu wallet not initialized".to_string()))?;
            mgr.create_p2pk_nutzap_proofs(recipient_p2pk, &info.mints, amount_sats)
                .await?
        };

        let builder = build_station_nutzap_builder(
            station_event_id,
            station_pubkey,
            station_address,
            &mint_url,
            &proof_jsons,
            comment,
        )?;
        let outcome = self
            .sign_or_prepare(builder, Some(station_address.to_string()))
            .await?;
        self.publish_nip60_rollover_for_mint(&mint_url).await;
        Ok(outcome)
    }

    // ─── Song Search (MusicBrainz), YouTube Search & Blossom Media Forge ──

    /// Search MusicBrainz recordings via ContextVM (`search_recordings`), with direct MusicBrainz REST fallback.
    pub async fn search_recordings(
        &self,
        query: &str,
        artist: Option<&str>,
        limit: u32,
    ) -> Result<Vec<MusicBrainzRecording>> {
        let trimmed = query.trim();
        if trimmed.is_empty() {
            return Ok(Vec::new());
        }

        let cfg = self.config.read().await.clone();
        if let Ok(results) = contextvm::search_recordings(
            &self.client,
            &self.ephemeral_keys,
            &cfg.metadata_server_pubkey,
            trimmed,
            artist,
            limit,
            10,
        )
        .await
        {
            if !results.is_empty() {
                return Ok(results);
            }
        }

        // Direct multi-provider HTTP fallback if ContextVM is busy, offline, or empty:
        // MusicBrainz WS2 → Deezer Public API → Apple iTunes Search API.
        self.search_recordings_direct_hop(trimmed, artist, limit)
            .await
    }

    async fn search_recordings_direct_hop(
        &self,
        query: &str,
        artist: Option<&str>,
        limit: u32,
    ) -> Result<Vec<MusicBrainzRecording>> {
        let mut last_err: Option<WavefuncError> = None;

        match self
            .search_recordings_musicbrainz_http(query, artist, limit)
            .await
        {
            Ok(results) if !results.is_empty() => return Ok(results),
            Ok(_) => {}
            Err(err) => {
                last_err = Some(err);
            }
        }

        match self
            .search_recordings_deezer_http(query, artist, limit)
            .await
        {
            Ok(results) if !results.is_empty() => return Ok(results),
            Ok(_) => {}
            Err(err) => {
                last_err = Some(err);
            }
        }

        match self
            .search_recordings_itunes_http(query, artist, limit)
            .await
        {
            Ok(results) => Ok(results),
            Err(err) => Err(last_err.unwrap_or(err)),
        }
    }

    async fn search_recordings_musicbrainz_http(
        &self,
        query: &str,
        artist: Option<&str>,
        limit: u32,
    ) -> Result<Vec<MusicBrainzRecording>> {
        let escaped_title = escape_lucene_phrase(query);
        let mb_query = match artist.map(str::trim).filter(|s| !s.is_empty()) {
            Some(a) => format!(
                "recording:\"{escaped_title}\" AND artist:\"{}\"",
                escape_lucene_phrase(a)
            ),
            None => format!("recording:\"{escaped_title}\""),
        };
        let mut url = url::Url::parse("https://musicbrainz.org/ws/2/recording/")
            .map_err(|e| WavefuncError::InvalidInput(e.to_string()))?;
        url.query_pairs_mut()
            .append_pair("query", &mb_query)
            .append_pair("limit", &limit.clamp(1, 25).to_string())
            .append_pair("fmt", "json");

        let resp = self
            .http
            .get(url)
            .header(
                reqwest::header::USER_AGENT,
                "WaveFuncRadio/0.2 (https://wavefunc.live)",
            )
            .header(reqwest::header::ACCEPT, "application/json")
            .timeout(Duration::from_secs(7))
            .send()
            .await?;
        if !resp.status().is_success() {
            return Err(WavefuncError::InvalidInput(format!(
                "MusicBrainz search failed (HTTP {})",
                resp.status().as_u16()
            )));
        }
        let body: serde_json::Value = resp.json().await?;
        let Some(recordings) = body.get("recordings").and_then(|v| v.as_array()) else {
            return Ok(Vec::new());
        };

        let mut out = Vec::with_capacity(recordings.len());
        for rec in recordings {
            let Some(id) = rec.get("id").and_then(|v| v.as_str()) else {
                continue;
            };
            let Some(title) = rec.get("title").and_then(|v| v.as_str()) else {
                continue;
            };
            let first_credit = rec
                .get("artist-credit")
                .and_then(|v| v.as_array())
                .and_then(|arr| arr.first());
            let artist_name = first_credit
                .and_then(|c| c.get("name").and_then(|v| v.as_str()))
                .or_else(|| {
                    first_credit
                        .and_then(|c| c.get("artist"))
                        .and_then(|a| a.get("name"))
                        .and_then(|v| v.as_str())
                })
                .unwrap_or("Unknown Artist")
                .to_string();
            let artist_id = first_credit
                .and_then(|c| c.get("artist"))
                .and_then(|a| a.get("id"))
                .and_then(|v| v.as_str())
                .map(str::to_string);
            let first_rel = rec
                .get("releases")
                .and_then(|v| v.as_array())
                .and_then(|arr| arr.first());
            let release = first_rel
                .and_then(|r| r.get("title"))
                .and_then(|v| v.as_str())
                .map(str::to_string);
            let release_id = first_rel
                .and_then(|r| r.get("id"))
                .and_then(|v| v.as_str())
                .map(str::to_string);
            let release_date = first_rel
                .and_then(|r| r.get("date"))
                .and_then(|v| v.as_str())
                .or_else(|| rec.get("first-release-date").and_then(|v| v.as_str()))
                .map(str::to_string);
            let duration_ms = rec.get("length").and_then(|v| v.as_u64());
            let score = rec.get("score").and_then(|v| v.as_u64()).unwrap_or(0) as u32;
            let tags: Vec<String> = rec
                .get("tags")
                .and_then(|v| v.as_array())
                .map(|arr| {
                    arr.iter()
                        .filter_map(|t| t.get("name").and_then(|v| v.as_str()).map(str::to_string))
                        .take(5)
                        .collect()
                })
                .unwrap_or_default();

            out.push(MusicBrainzRecording {
                id: id.to_string(),
                title: title.to_string(),
                artist: artist_name,
                artist_id,
                release,
                release_id,
                release_date,
                duration_ms,
                score,
                tags,
            });
        }
        Ok(out)
    }

    async fn search_recordings_deezer_http(
        &self,
        query: &str,
        artist: Option<&str>,
        limit: u32,
    ) -> Result<Vec<MusicBrainzRecording>> {
        let q = match artist.map(str::trim).filter(|s| !s.is_empty()) {
            Some(a) => format!(
                "artist:\"{}\" track:\"{}\"",
                a.replace('"', " "),
                query.replace('"', " ")
            ),
            None => query.to_string(),
        };
        let mut url = url::Url::parse("https://api.deezer.com/search")
            .map_err(|e| WavefuncError::InvalidInput(e.to_string()))?;
        url.query_pairs_mut()
            .append_pair("q", &q)
            .append_pair("limit", &limit.clamp(1, 25).to_string());

        let resp = self
            .http
            .get(url)
            .header(
                reqwest::header::USER_AGENT,
                "WaveFuncRadio/0.2 (https://wavefunc.live)",
            )
            .header(reqwest::header::ACCEPT, "application/json")
            .timeout(Duration::from_secs(7))
            .send()
            .await?;
        if !resp.status().is_success() {
            return Err(WavefuncError::InvalidInput(format!(
                "Deezer search failed (HTTP {})",
                resp.status().as_u16()
            )));
        }
        let body: serde_json::Value = resp.json().await?;
        if let Some(err) = body.get("error") {
            return Err(WavefuncError::InvalidInput(format!("Deezer error: {err}")));
        }
        let Some(items) = body.get("data").and_then(|v| v.as_array()) else {
            return Ok(Vec::new());
        };

        let mut out = Vec::with_capacity(items.len());
        for (idx, track) in items.iter().enumerate() {
            let Some(title) = track.get("title").and_then(|v| v.as_str()) else {
                continue;
            };
            let id = track
                .get("id")
                .and_then(|v| v.as_u64())
                .map(|n| format!("deezer:{n}"))
                .unwrap_or_else(|| format!("deezer:idx:{idx}"));
            let artist_name = track
                .get("artist")
                .and_then(|a| a.get("name"))
                .and_then(|v| v.as_str())
                .unwrap_or("Unknown Artist")
                .to_string();
            let artist_id = track
                .get("artist")
                .and_then(|a| a.get("id"))
                .and_then(|v| v.as_u64())
                .map(|n| format!("deezer:artist:{n}"));
            let release = track
                .get("album")
                .and_then(|a| a.get("title"))
                .and_then(|v| v.as_str())
                .map(str::to_string);
            let release_id = track
                .get("album")
                .and_then(|a| a.get("id"))
                .and_then(|v| v.as_u64())
                .map(|n| format!("deezer:album:{n}"));
            let duration_ms = track
                .get("duration")
                .and_then(|v| v.as_u64())
                .map(|secs| secs * 1000);
            let score = 95u32.saturating_sub((idx as u32) * 3).max(50);

            out.push(MusicBrainzRecording {
                id,
                title: title.to_string(),
                artist: artist_name,
                artist_id,
                release,
                release_id,
                release_date: None,
                duration_ms,
                score,
                tags: Vec::new(),
            });
        }
        Ok(out)
    }

    async fn search_recordings_itunes_http(
        &self,
        query: &str,
        artist: Option<&str>,
        limit: u32,
    ) -> Result<Vec<MusicBrainzRecording>> {
        let term = match artist.map(str::trim).filter(|s| !s.is_empty()) {
            Some(a) => format!("{a} {query}"),
            None => query.to_string(),
        };
        let mut url = url::Url::parse("https://itunes.apple.com/search")
            .map_err(|e| WavefuncError::InvalidInput(e.to_string()))?;
        url.query_pairs_mut()
            .append_pair("term", &term)
            .append_pair("entity", "song")
            .append_pair("media", "music")
            .append_pair("limit", &limit.clamp(1, 25).to_string());

        let resp = self
            .http
            .get(url)
            .header(
                reqwest::header::USER_AGENT,
                "WaveFuncRadio/0.2 (https://wavefunc.live)",
            )
            .header(reqwest::header::ACCEPT, "application/json")
            .timeout(Duration::from_secs(7))
            .send()
            .await?;
        if !resp.status().is_success() {
            return Err(WavefuncError::InvalidInput(format!(
                "iTunes search failed (HTTP {})",
                resp.status().as_u16()
            )));
        }
        let body: serde_json::Value = resp.json().await?;
        let Some(items) = body.get("results").and_then(|v| v.as_array()) else {
            return Ok(Vec::new());
        };

        let mut out = Vec::with_capacity(items.len());
        for (idx, item) in items.iter().enumerate() {
            let Some(title) = item.get("trackName").and_then(|v| v.as_str()) else {
                continue;
            };
            let id = item
                .get("trackId")
                .and_then(|v| v.as_u64())
                .map(|n| format!("itunes:{n}"))
                .unwrap_or_else(|| format!("itunes:idx:{idx}"));
            let artist_name = item
                .get("artistName")
                .and_then(|v| v.as_str())
                .unwrap_or("Unknown Artist")
                .to_string();
            let artist_id = item
                .get("artistId")
                .and_then(|v| v.as_u64())
                .map(|n| format!("itunes:artist:{n}"));
            let release = item
                .get("collectionName")
                .and_then(|v| v.as_str())
                .map(str::to_string);
            let release_id = item
                .get("collectionId")
                .and_then(|v| v.as_u64())
                .map(|n| format!("itunes:collection:{n}"));
            let release_date = item
                .get("releaseDate")
                .and_then(|v| v.as_str())
                .map(|d| d.chars().take(10).collect());
            let duration_ms = item.get("trackTimeMillis").and_then(|v| v.as_u64());
            let tags = item
                .get("primaryGenreName")
                .and_then(|v| v.as_str())
                .map(|g| vec![g.to_string()])
                .unwrap_or_default();
            let score = 92u32.saturating_sub((idx as u32) * 3).max(50);

            out.push(MusicBrainzRecording {
                id,
                title: title.to_string(),
                artist: artist_name,
                artist_id,
                release,
                release_id,
                release_date,
                duration_ms,
                score,
                tags,
            });
        }
        Ok(out)
    }

    /// Search YouTube videos **on-device first**:
    /// - Desktop: local `yt-dlp` → direct on-device YouTube HTTPS → ContextVM fallback
    /// - Android: direct on-device YouTube HTTPS → ContextVM fallback
    pub async fn search_youtube(
        &self,
        query: &str,
        limit: u32,
    ) -> Result<Vec<YouTubeSearchResult>> {
        let trimmed = query.trim();
        if trimmed.is_empty() {
            return Ok(Vec::new());
        }

        #[cfg(not(target_os = "android"))]
        {
            if let Ok(results) = self.media.search_youtube_local(trimmed, limit).await {
                if !results.is_empty() {
                    return Ok(results);
                }
            }
        }

        if let Ok(results) =
            contextvm::search_youtube_web_fallback(&self.http, trimmed, limit).await
        {
            if !results.is_empty() {
                return Ok(results);
            }
        }

        let cfg = self.config.read().await.clone();
        contextvm::search_youtube(
            &self.client,
            &self.ephemeral_keys,
            &cfg.metadata_server_pubkey,
            trimmed,
            limit,
            15,
        )
        .await
    }

    /// Download a YouTube video/audio locally via `yt-dlp` when available (desktop),
    /// or via the WaveFunc ContextVM `prepare_download` service (Android / no local yt-dlp).
    pub async fn prepare_youtube_media(
        &self,
        cache_root: &str,
        video_id: &str,
        format: &str,
    ) -> Result<PreparedMedia> {
        #[cfg(not(target_os = "android"))]
        {
            if let Ok(mut prepared) = self
                .media
                .prepare_youtube_media(cache_root, video_id, format)
                .await
            {
                prepared.job_id = format!("local:{}", prepared.job_id);
                return Ok(prepared);
            }
        }

        let _ = cache_root;
        let cfg = self.config.read().await.clone();
        contextvm::prepare_download_remote(
            &self.client,
            &self.ephemeral_keys,
            &cfg.metadata_server_pubkey,
            video_id,
            format,
            180,
        )
        .await
    }

    /// Sign a BUD-02 Blossom upload authorization event (`kind 24242`) WITHOUT publishing to relays.
    /// Returns `signed_event_json` for LocalKey/Bunker, or `unsigned_event_json` for Amber.
    pub async fn sign_blossom_upload_auth(
        &self,
        sha256: &str,
        blossom_url: &str,
        format: &str,
    ) -> Result<BlossomAuthResult> {
        let builder = build_blossom_auth_builder(sha256, blossom_url, format)?;
        let mode = {
            let guard = self.signer.read().await;
            match guard.as_ref() {
                None => {
                    return Err(WavefuncError::AuthRequired(
                        "Sign in to authorize Blossom uploads.".to_string(),
                    ))
                }
                Some(ActiveSigner::LocalKey(keys)) => Err(keys.clone()),
                Some(ActiveSigner::Bunker { signer, .. }) => Ok((Some(signer.clone()), None)),
                Some(ActiveSigner::Amber { pubkey }) => Ok((None, Some(*pubkey))),
            }
        };

        match mode {
            Err(keys) => {
                let ev = builder.finalize(&keys)?;
                Ok(BlossomAuthResult {
                    signed_event_json: Some(ev.as_json()),
                    unsigned_event_json: None,
                })
            }
            Ok((Some(bunker), _)) => {
                let ev = builder.finalize_async(bunker.as_ref()).await?;
                Ok(BlossomAuthResult {
                    signed_event_json: Some(ev.as_json()),
                    unsigned_event_json: None,
                })
            }
            Ok((None, Some(pubkey))) => {
                let unsigned = builder.finalize_unsigned(pubkey);
                Ok(BlossomAuthResult {
                    signed_event_json: None,
                    unsigned_event_json: Some(unsigned.as_json()),
                })
            }
            Ok((None, None)) => Err(WavefuncError::AuthRequired(
                "No active signer available.".to_string(),
            )),
        }
    }

    /// Upload a prepared media job (`local:<id>` or `remote:<id>`) to a Blossom server.
    pub async fn upload_media_to_blossom(
        &self,
        job_id: &str,
        blossom_url: &str,
        signed_auth_event_json: &str,
    ) -> Result<UploadedMedia> {
        if let Some(remote_id) = job_id.strip_prefix("remote:") {
            let cfg = self.config.read().await.clone();
            return contextvm::upload_to_blossom_remote(
                &self.client,
                &self.ephemeral_keys,
                &cfg.metadata_server_pubkey,
                remote_id,
                blossom_url,
                signed_auth_event_json,
                180,
            )
            .await;
        }
        let local_id = job_id.strip_prefix("local:").unwrap_or(job_id);
        self.media
            .upload_to_blossom(&self.http, local_id, blossom_url, signed_auth_event_json)
            .await
    }

    /// Clean up a prepared media acquisition job directory.
    pub async fn discard_media_job(&self, job_id: &str) -> Result<()> {
        if job_id.starts_with("remote:") {
            return Ok(());
        }
        let local_id = job_id.strip_prefix("local:").unwrap_or(job_id);
        self.media.discard_job(local_id).await
    }

    /// Attach a Blossom `audio_url` (and optional `youtube:<id>`) to an existing user `kind 31337` song event.
    pub async fn attach_song_audio_url(
        &self,
        song_id: &str,
        audio_url: &str,
        youtube_id: Option<&str>,
    ) -> Result<ActionOutcome> {
        let pubkey = {
            let guard = self.signer.read().await;
            guard
                .as_ref()
                .map(ActiveSigner::pubkey)
                .ok_or_else(|| {
                    WavefuncError::AuthRequired("Sign in to update saved songs.".to_string())
                })?
        };

        let filter = Filter::new()
            .author(pubkey)
            .kind(Kind::Custom(SONG_KIND))
            .identifier(song_id.trim())
            .limit(5);
        let events = self
            .client
            .fetch_events(filter)
            .timeout(Duration::from_secs(6))
            .await?;
        let existing = events
            .into_iter()
            .max_by_key(|e| e.created_at)
            .ok_or_else(|| {
                WavefuncError::InvalidInput("Saved song event not found on relay".to_string())
            })?;

        let builder = build_song_audio_update_builder(&existing, audio_url, youtube_id)?;
        let address = format!("{SONG_KIND}:{}:{}", pubkey.to_hex(), song_id.trim());
        self.sign_or_prepare(builder, Some(address)).await
    }

    // ─── Public Profiles, Global Song Signals (kind 31337) & Station Submit ─

    /// Fetch a single public Nostr profile (`kind 0`) by hex pubkey or npub.
    pub async fn fetch_user_profile(&self, pubkey_or_npub: &str) -> Result<NostrProfile> {
        let pk = PublicKey::parse(pubkey_or_npub.trim())
            .map_err(|e| WavefuncError::InvalidInput(format!("Invalid pubkey: {e}")))?;
        let hex = pk.to_hex();
        let map = self.fetch_profiles(&[hex.clone()]).await?;
        if let Some(p) = map.get(&hex) {
            return Ok(p.clone());
        }
        Ok(NostrProfile {
            pubkey: hex,
            npub: pk.to_bech32().unwrap_or_default(),
            name: None,
            display_name: None,
            picture: None,
            nip05: None,
            about: None,
            lud16: None,
            lud06: None,
        })
    }

    /// Fetch the global stream of recent `kind 31337` saved songs ("Signals") across WaveFunc.
    pub async fn fetch_signal_songs(&self, limit: usize) -> Result<Vec<SavedSong>> {
        let cfg = self.config.read().await.clone();
        let filter = Filter::new()
            .kind(Kind::Custom(SONG_KIND))
            .limit(limit.clamp(1, 150));

        let events = self
            .client
            .fetch_events(filter)
            .timeout(Duration::from_secs(cfg.request_timeout_secs))
            .await?;

        let mut by_addr: HashMap<String, SavedSong> = HashMap::new();
        for ev in events.iter() {
            if let Some(song) = parse_song_event(ev) {
                match by_addr.get(&song.address) {
                    Some(existing) if existing.created_at >= song.created_at => {}
                    _ => {
                        by_addr.insert(song.address.clone(), song);
                    }
                }
            }
        }
        let mut songs: Vec<SavedSong> = by_addr.into_values().collect();
        songs.sort_by(|a, b| b.created_at.cmp(&a.created_at));
        Ok(songs)
    }

    /// Publish a new NIP-XX Internet Radio station (`kind 31237`) to the WaveFunc relay.
    #[allow(clippy::too_many_arguments)]
    pub async fn publish_station(
        &self,
        name: &str,
        stream_url: &str,
        format: &str,
        bitrate_bps: u32,
        description: Option<&str>,
        website: Option<&str>,
        country_code: Option<&str>,
        thumbnail: Option<&str>,
        genres: &[String],
    ) -> Result<ActionOutcome> {
        let pubkey = {
            let guard = self.signer.read().await;
            guard
                .as_ref()
                .map(ActiveSigner::pubkey)
                .ok_or_else(|| {
                    WavefuncError::AuthRequired("Sign in to submit a radio station.".to_string())
                })?
        };
        let (station_id, builder) = build_station_event_builder(
            name,
            stream_url,
            format,
            bitrate_bps,
            description,
            website,
            country_code,
            thumbnail,
            genres,
        )?;
        let address = format!("{STATION_KIND}:{}:{station_id}", pubkey.to_hex());
        self.sign_or_prepare(builder, Some(address)).await
    }

    /// Fetch observer-signed aggregate station rankings (`kind 31240`), resolved `kind 31237`
    /// stations, `kind 31238` health snapshots, and recent Blossom-backed `kind 31337` downloads
    /// for the main-page `SIGNAL_CHARTS` section.
    pub async fn fetch_signal_charts(&self) -> Result<SignalChartsData> {
        let cfg = self.config.read().await.clone();
        let timeout = Duration::from_secs(cfg.request_timeout_secs);
        let observer_pk = PublicKey::from_hex(&cfg.metadata_server_pubkey).ok();

        let ranking_fut = async {
            let Some(pk) = observer_pk else {
                return Vec::new();
            };
            let filter = Filter::new()
                .kind(Kind::Custom(STATION_RANKING_KIND))
                .author(pk)
                .limit(30);
            match self.client.fetch_events(filter).timeout(timeout).await {
                Ok(events) => events.into_iter().collect::<Vec<_>>(),
                Err(_) => Vec::new(),
            }
        };

        let songs_fut = async {
            let filter = Filter::new().kind(Kind::Custom(SONG_KIND)).limit(100);
            match self.client.fetch_events(filter).timeout(timeout).await {
                Ok(events) => events.into_iter().collect::<Vec<_>>(),
                Err(_) => Vec::new(),
            }
        };

        let (mut ranking_events, song_events) = tokio::join!(ranking_fut, songs_fut);

        let now_secs = Timestamp::now().as_secs();
        ranking_events.sort_by(|a, b| b.created_at.cmp(&a.created_at));
        let mut by_metric: HashMap<String, StationRankingSnapshot> = HashMap::new();
        for ev in &ranking_events {
            if let Some(pk) = observer_pk {
                if ev.pubkey != pk {
                    continue;
                }
            }
            if let Some(snap) = parse_station_ranking_event(ev, now_secs) {
                by_metric.entry(snap.metric.clone()).or_insert(snap);
            }
        }

        let mut rankings = Vec::new();
        for metric in VALID_RANKING_METRICS {
            if let Some(snap) = by_metric.remove(*metric) {
                rankings.push(snap);
            }
        }

        // Collect all referenced station addresses across rankings (top 8 per chart).
        let mut needed_addresses: Vec<String> = Vec::new();
        let mut seen_addrs: HashSet<String> = HashSet::new();
        for snap in &rankings {
            for entry in snap.entries.iter().take(8) {
                if seen_addrs.insert(entry.station_address.clone()) {
                    needed_addresses.push(entry.station_address.clone());
                }
            }
        }

        let mut stations: Vec<Station> = Vec::new();
        let mut health: Vec<StationHealthSummary> = Vec::new();

        if !needed_addresses.is_empty() {
            let authors: Vec<PublicKey> = needed_addresses
                .iter()
                .filter_map(|a| a.split(':').nth(1))
                .filter_map(|pk| PublicKey::from_hex(pk).ok())
                .collect::<HashSet<_>>()
                .into_iter()
                .collect();
            let identifiers: Vec<String> = needed_addresses
                .iter()
                .filter_map(|a| a.splitn(3, ':').nth(2).map(str::to_string))
                .collect::<HashSet<_>>()
                .into_iter()
                .collect();

            let station_fut = async {
                if authors.is_empty() || identifiers.is_empty() {
                    return Vec::new();
                }
                let filter = Filter::new()
                    .kind(Kind::Custom(STATION_KIND))
                    .authors(authors)
                    .identifiers(identifiers)
                    .limit(200);
                match self.client.fetch_events(filter).timeout(timeout).await {
                    Ok(events) => events.into_iter().collect::<Vec<_>>(),
                    Err(_) => Vec::new(),
                }
            };

            let health_fut = async {
                let Some(pk) = observer_pk else {
                    return Vec::new();
                };
                let filter = Filter::new()
                    .kind(Kind::Custom(STATION_HEALTH_KIND))
                    .author(pk)
                    .custom_tags(
                        SingleLetterTag::from_char('a').unwrap(),
                        needed_addresses.clone(),
                    )
                    .limit(200);
                match self.client.fetch_events(filter).timeout(timeout).await {
                    Ok(events) => events.into_iter().collect::<Vec<_>>(),
                    Err(_) => Vec::new(),
                }
            };

            let (station_events, mut health_events) = tokio::join!(station_fut, health_fut);

            let relay_hints = vec![cfg.relay_url.clone()];
            let mut station_by_addr: HashMap<String, Station> = HashMap::new();
            for ev in &station_events {
                if let Some(st) = parse_station_event(ev, &relay_hints) {
                    if !seen_addrs.contains(&st.address) {
                        continue;
                    }
                    match station_by_addr.get(&st.address) {
                        Some(existing) if existing.created_at >= st.created_at => {}
                        _ => {
                            station_by_addr.insert(st.address.clone(), st);
                        }
                    }
                }
            }
            stations = station_by_addr.into_values().collect();

            health_events.sort_by(|a, b| b.created_at.cmp(&a.created_at));
            let mut health_by_addr: HashMap<String, StationHealthSummary> = HashMap::new();
            for ev in &health_events {
                if let Some(h) = parse_station_health_event(ev, now_secs) {
                    health_by_addr.entry(h.station_address.clone()).or_insert(h);
                }
            }
            health = health_by_addr.into_values().collect();
        }

        // Recent Blossom-backed songs (`kind 31337` with `audio_url`).
        let mut downloads_by_addr: HashMap<String, SavedSong> = HashMap::new();
        for ev in &song_events {
            if let Some(song) = parse_song_event(ev) {
                let has_audio = song
                    .audio_url
                    .as_deref()
                    .is_some_and(|u| !u.trim().is_empty());
                if !has_audio {
                    continue;
                }
                match downloads_by_addr.get(&song.address) {
                    Some(existing) if existing.created_at >= song.created_at => {}
                    _ => {
                        downloads_by_addr.insert(song.address.clone(), song);
                    }
                }
            }
        }
        let mut recent_downloads: Vec<SavedSong> = downloads_by_addr.into_values().collect();
        recent_downloads.sort_by(|a, b| b.created_at.cmp(&a.created_at));
        recent_downloads.truncate(6);

        Ok(SignalChartsData {
            rankings,
            stations,
            health,
            recent_downloads,
        })
    }

    /// Publish a `kind 1` song share note (`#wavefunc #songstr #tunestr`) with Blossom media URL.
    pub async fn publish_song_share_note(
        &self,
        content: &str,
        song_address: Option<&str>,
        audio_url: Option<&str>,
        hashtags: &[String],
    ) -> Result<ActionOutcome> {
        let builder = build_song_share_note_builder(content, song_address, audio_url, hashtags)?;
        self.sign_or_prepare(builder, song_address.map(str::to_string))
            .await
    }

    /// Return a localhost proxy URL for real-time FFT spectrum analysis while playing audio.
    pub async fn prepare_audio_proxy_url(&self, upstream_url: &str) -> String {
        self.spectrum.prepare_proxy_url(upstream_url).await
    }

    /// Reset real-time audio spectrum bands when playback pauses or stops.
    pub fn reset_audio_spectrum(&self) {
        self.spectrum.reset_spectrum();
    }

    /// Read the current 16-band FFT spectrum magnitudes (`0.0..1.0`) without blocking.
    pub fn get_audio_spectrum(&self) -> AudioSpectrumSnapshot {
        self.spectrum.snapshot()
    }

    /// Gracefully shut down relay connections.
    pub async fn shutdown(&self) {
        self.disconnect_nwc().await;
        self.close_cashu_wallet().await;
        self.client.shutdown().await;
        self.identity_client.shutdown().await;
        self.wallet_client.shutdown().await;
    }
}

/// Escape Lucene special characters inside a quoted MusicBrainz phrase query.
fn escape_lucene_phrase(value: &str) -> String {
    let mut out = String::with_capacity(value.len());
    for ch in value.trim().chars() {
        if matches!(
            ch,
            '+' | '-'
                | '&'
                | '|'
                | '!'
                | '('
                | ')'
                | '{'
                | '}'
                | '['
                | ']'
                | '^'
                | '"'
                | '~'
                | '*'
                | '?'
                | ':'
                | '\\'
                | '/'
        ) {
            out.push('\\');
        }
        out.push(ch);
    }
    out
}

#[cfg(test)]
mod metadata_escape_tests {
    use super::escape_lucene_phrase;

    #[test]
    fn escapes_lucene_punctuation_in_track_titles() {
        assert_eq!(
            escape_lucene_phrase("54-46 Was My Number (Remix)"),
            r"54\-46 Was My Number \(Remix\)"
        );
        assert_eq!(escape_lucene_phrase("AC/DC: Back in Black"), r"AC\/DC\: Back in Black");
    }
}
