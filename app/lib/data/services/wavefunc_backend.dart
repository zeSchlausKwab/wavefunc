import '../../domain/models/now_playing.dart';
import '../../domain/models/social.dart';
import '../../domain/models/station.dart';

/// Shared protocol backend contract implemented by:
/// - `RustBridgeBackend` (`crates/wavefunc-core` via `flutter_rust_bridge`)
/// - `RelayWebSocketBackend` (pure-Dart NIP-01/45/50 fallback when FRB native lib is absent)
abstract class WavefuncBackend {
  static const String defaultProductionRelay = 'wss://relay.wavefunc.live';
  static const String defaultAndroidEmulatorRelay = 'ws://10.0.2.2:3334';
  static const String defaultLocalRelay = 'ws://localhost:3334';

  String get engineLabel;
  bool get supportsSigning => false;

  // ── Phase 1: Relay & Radio Discovery ──────────────────────────────────────

  Future<RelayStatus> connectRelay(String relayUrl);

  Future<RelayStatus> getRelayStatus();

  Future<List<Station>> fetchStations({int limit = 250});

  Future<List<Station>> searchStations({
    String? query,
    String? genre,
    String? country,
    String? language,
    int limit = 150,
  });

  Future<Station?> fetchStationByAddress(String address);

  Future<List<Station>> fetchStationsByAddresses(List<String> addresses);

  Future<List<FeaturedList>> fetchFeaturedLists();

  Future<StationFacets> getStationFacets();

  Future<NowPlayingMetadata?> extractStreamMetadata({
    required String streamUrl,
    String? stationAddress,
    String? sessionId,
  });

  // ── Phase 2: Identity, Favorites, Social, Community, Crate & NIP-38 ──────

  Future<GeneratedAccount> generateAccount();

  Future<AccountSession> loginWithNsec(String secret);

  Future<BunkerLoginResult> loginWithBunker(
    String bunkerUri, {
    String? appNsec,
  });

  Future<AccountSession> loginWithAmber(String pubkeyOrNpub);

  Future<NostrConnectChallenge> startNostrConnectSession({
    String? relayUrl,
    String? clientName,
  });

  Future<BunkerLoginResult> awaitNostrConnectSession(String sessionId);

  Future<void> cancelNostrConnectSession(String sessionId);

  Future<ActionOutcome> publishProfile({
    String? name,
    String? about,
    String? picture,
    String? lud16,
  });

  Future<void> logoutAccount();

  Future<AccountSession?> currentAccount();

  Future<ActionOutcome> publishSignedEvent(String signedEventJson);

  Future<List<FeaturedList>> fetchUserFavorites();

  Future<ActionOutcome> toggleFavoriteStation(
    String stationAddress, {
    required bool add,
  });

  Future<ActionOutcome> createFavoritesList({
    required String name,
    String? description,
    List<String> stationAddresses = const [],
  });

  Future<ActionOutcome> updateFavoritesList({
    required String favoritesId,
    required String name,
    String? description,
  });

  Future<ActionOutcome> deleteFavoritesList({
    required String eventId,
    required String favoritesId,
  });

  Future<ActionOutcome> toggleStationInFavoritesList({
    String? favoritesId,
    required String stationAddress,
    required bool add,
  });

  Future<StationSocialSummary> fetchStationSocial({
    required String stationAddress,
    required String stationEventId,
  });

  Future<ActionOutcome> reactToStation({
    required String stationId,
    required String stationPubkey,
    required String stationAddress,
  });

  Future<ActionOutcome> postStationComment({
    required String stationEventId,
    required String stationPubkey,
    required String stationAddress,
    required String content,
    String? replyToId,
    String? replyToPubkey,
  });

  Future<List<CommunityPost>> fetchCommunityPosts({int limit = 80});

  Future<ActionOutcome> postCommunityNote({
    required String content,
    String? category,
    String? replyToId,
    String? replyToPubkey,
    String? rootId,
    String? rootPubkey,
  });

  Future<SongCrate> fetchSongCrate();

  Future<ActionOutcome> createSongEvent({
    required String title,
    String? artist,
    String? album,
    String? mbid,
    String? releaseId,
    String? releaseDate,
    int? durationMs,
    List<String> genres = const [],
  });

  Future<ActionOutcome> updateSongCrate({
    required String songAddress,
    required bool add,
  });

  Future<ActionOutcome> publishListeningStatus({
    String? title,
    String? artist,
    String? stationAddress,
    String? stationUrl,
  });

  // ── Batch Social Counts, NWC Wallet & NIP-57 Zaps ─────────────────────────

  Future<List<StationCardCounts>> fetchStationsSocialCounts(
    List<String> addresses,
  );

  Future<NwcWalletStatus> connectNwc(String nwcUri);

  Future<void> disconnectNwc();

  Future<NwcWalletStatus> getNwcStatus();

  Future<NwcWalletStatus> refreshNwcBalance();

  Future<ZapInvoiceResult> prepareStationZap({
    required String stationPubkey,
    required String stationAddress,
    required int amountSats,
    String? comment,
  });

  Future<ZapInvoiceResult> completeStationZapWithSignedRequest({
    required String callbackUrl,
    required int amountSats,
    String? comment,
    required String signedZapRequestJson,
    required String recipientLud16,
  });

  Future<ZapPaymentResult> payInvoiceNwc({
    required String bolt11,
    required int amountSats,
  });

  Future<bool> checkStationZapReceipt({
    required String stationAddress,
    required String bolt11,
    required int sinceUnix,
  });

  // ── Phase 4: Embedded Cashu Ecash Wallet & NIP-61 Nutzaps ─────────────────

  Future<CashuWalletStatus> initCashuWallet({
    required String dbDir,
    required String seedMaterial,
    List<String> mints = const [],
  });

  Future<void> closeCashuWallet();

  Future<Nip60RawEvents> fetchNip60RawEvents();

  Future<CashuWalletStatus> syncNip60Wallet();

  Future<CashuWalletStatus> applyDecryptedNip60Events({
    String? walletContentPlain,
    required List<Nip60DecryptedTokenEvent> decryptedTokens,
    required List<String> deletedIds,
    required List<String> discoveredMints,
    required List<String> walletRelays,
  });

  Future<CashuWalletStatus> getCashuStatus();

  Future<CashuWalletStatus> addCashuMint(String mintUrl);

  Future<CashuMintQuoteInfo> createCashuMintQuote({
    required String mintUrl,
    required int amountSats,
  });

  Future<CashuWalletStatus> claimCashuMintQuote({
    required String mintUrl,
    required String quoteId,
  });

  Future<CashuReceiveResult> receiveCashuToken(String token);

  Future<CashuSendResult> sendCashuToken({
    String? mintUrl,
    required int amountSats,
    String? memo,
  });

  Future<ZapPaymentResult> payInvoiceCashu({
    String? mintUrl,
    required String bolt11,
    required int amountSats,
  });

  Future<RecipientNutzapInfo?> fetchRecipientNutzapInfo(String pubkeyHex);

  Future<ActionOutcome> sendStationNutzap({
    required String stationEventId,
    required String stationPubkey,
    required String stationAddress,
    required int amountSats,
    String? comment,
  });

  // ── Song Search (MusicBrainz), YouTube Search & Blossom Media Forge ───────

  Future<List<MusicBrainzRecording>> searchRecordings({
    required String query,
    String? artist,
    int limit = 15,
  });

  Future<List<YouTubeSearchResult>> searchYouTube({
    required String query,
    int limit = 5,
  });

  Future<PreparedMedia> prepareYouTubeMedia({
    required String cacheRoot,
    required String videoId,
    required String format,
  });

  Future<BlossomAuthResult> signBlossomUploadAuth({
    required String sha256,
    required String blossomUrl,
    required String format,
  });

  Future<UploadedMedia> uploadMediaToBlossom({
    required String jobId,
    required String blossomUrl,
    required String signedAuthEventJson,
  });

  Future<void> discardMediaJob(String jobId);

  Future<ActionOutcome> attachSongAudioUrl({
    required String songId,
    required String audioUrl,
    String? youtubeId,
  });

  // ── Public Profiles, Global Song Signals & Station Publishing ─────────────

  Future<NostrProfile> fetchUserProfile(String pubkeyOrNpub);

  Future<List<SavedSong>> fetchSignalSongs({int limit = 80});

  Future<ActionOutcome> publishStation({
    required String name,
    required String streamUrl,
    String format = 'mp3',
    int bitrateBps = 128000,
    String? description,
    String? website,
    String? countryCode,
    String? thumbnail,
    List<String> genres = const [],
  });

  Future<SignalChartsData> fetchSignalCharts();

  Future<void> dispose();
}
