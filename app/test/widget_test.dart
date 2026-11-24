import 'dart:async';

import 'package:flutter_test/flutter_test.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:material_ui/material_ui.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:wavefunc_app/app.dart';
import 'package:wavefunc_app/data/repositories/auth_repository.dart';
import 'package:wavefunc_app/data/repositories/station_repository.dart';
import 'package:wavefunc_app/data/services/amber_signer_service.dart';
import 'package:wavefunc_app/data/services/preferences_service.dart';
import 'package:wavefunc_app/data/services/radio_audio_handler.dart';
import 'package:wavefunc_app/data/services/secure_auth_storage.dart';
import 'package:wavefunc_app/data/services/wavefunc_backend.dart';
import 'package:wavefunc_app/domain/models/now_playing.dart';
import 'package:wavefunc_app/domain/models/social.dart';
import 'package:wavefunc_app/domain/models/station.dart';
import 'package:wavefunc_app/ui/features/auth/view_models/auth_view_model.dart';
import 'package:wavefunc_app/ui/features/crate/view_models/crate_view_model.dart';
import 'package:wavefunc_app/ui/features/discover/view_models/discover_view_model.dart';
import 'package:wavefunc_app/ui/features/player/view_models/player_view_model.dart';
import 'package:wavefunc_app/ui/features/social/view_models/community_view_model.dart';
import 'package:wavefunc_app/ui/features/wallet/views/zap_sheet.dart';

class _InMemoryAuthStorage extends SecureAuthStorage {
  StoredSessionVault _vault = const StoredSessionVault();
  String? _nwcUri;
  final String _cashuSeed =
      '00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff';
  List<String> _cashuMints = const [];

  @override
  Future<String?> readNwcUri() async => _nwcUri;

  @override
  Future<void> saveNwcUri(String? uri) async {
    _nwcUri = uri;
  }

  @override
  Future<String> readOrCreateCashuSeed() async => _cashuSeed;

  @override
  Future<List<String>> readCashuMints() async => _cashuMints;

  @override
  Future<void> saveCashuMints(List<String> mints) async {
    _cashuMints = List<String>.from(mints);
  }

  @override
  Future<StoredSessionVault> readVault() async => _vault;

  @override
  Future<StoredSessionVault> upsertAndActivate(
    StoredAuthCredentials credentials,
  ) async {
    final filtered =
        _vault.accounts.where((a) => a.pubkey != credentials.pubkey).toList();
    filtered.insert(0, credentials);
    _vault = StoredSessionVault(
      activePubkey: credentials.pubkey,
      accounts: filtered,
    );
    return _vault;
  }

  @override
  Future<StoredSessionVault> setActivePubkey(String? pubkey) async {
    _vault = StoredSessionVault(
      activePubkey: pubkey,
      accounts: _vault.accounts,
    );
    return _vault;
  }

  @override
  Future<StoredSessionVault> removeAccount(String pubkey) async {
    final remaining =
        _vault.accounts.where((a) => a.pubkey != pubkey).toList();
    _vault = StoredSessionVault(
      activePubkey: remaining.isNotEmpty ? remaining.first.pubkey : null,
      accounts: remaining,
    );
    return _vault;
  }

  @override
  Future<void> clearAll() async {
    _vault = const StoredSessionVault();
  }
}

class _FakeBackend implements WavefuncBackend {
  _FakeBackend(this._stations);

  final List<Station> _stations;
  String _relayUrl = WavefuncBackend.defaultProductionRelay;
  AccountSession? _session;
  final List<FeaturedList> _userLists = [
    const FeaturedList(
      id: 'ev-list-1',
      pubkey: 'deadbeef',
      favoritesId: 'late-night',
      address: '30078:deadbeef:late-night',
      name: 'Late Night Dub',
      description: 'Deep bass & ambient signals',
      stationAddresses: ['31237:pk-1:soma-groove'],
    ),
  ];
  final List<CommunityPost> _communityPosts = [
    const CommunityPost(
      id: 'post-1',
      pubkey: 'pk-1',
      authorName: 'alice',
      content: 'Loving the new native WaveFunc client!',
      createdAt: 1760000200,
      categories: ['greeting'],
    ),
  ];

  @override
  String get engineLabel => 'FAKE_TEST_CORE';

  @override
  bool get supportsSigning => true;

  @override
  Future<RelayStatus> connectRelay(String relayUrl) async {
    _relayUrl = relayUrl;
    return getRelayStatus();
  }

  @override
  Future<RelayStatus> getRelayStatus() async => RelayStatus(
        relayUrl: _relayUrl,
        connected: true,
        totalStationCount: _stations.length,
        engineLabel: engineLabel,
      );

  @override
  Future<List<Station>> fetchStations({int limit = 250}) async => _stations;

  @override
  Future<List<Station>> searchStations({
    String? query,
    String? genre,
    String? country,
    String? language,
    int limit = 150,
  }) async {
    return _stations.where((s) {
      if (genre != null &&
          !s.genres.any((g) => g.toLowerCase() == genre.toLowerCase())) {
        return false;
      }
      if (query != null &&
          !s.name.toLowerCase().contains(query.toLowerCase())) {
        return false;
      }
      return true;
    }).toList();
  }

  @override
  Future<Station?> fetchStationByAddress(String address) async {
    for (final s in _stations) {
      if (s.address == address) return s;
    }
    return null;
  }

  @override
  Future<List<Station>> fetchStationsByAddresses(List<String> addresses) async {
    return _stations.where((s) => addresses.contains(s.address)).toList();
  }

  @override
  Future<List<FeaturedList>> fetchFeaturedLists() async => const [
        FeaturedList(
          id: 'feat-1',
          pubkey: 'admin',
          favoritesId: 'curated-ambient',
          address: '30078:admin:curated-ambient',
          name: 'Deep Space Ambient',
          stationAddresses: ['31237:pk-1:soma-groove'],
        ),
      ];

  @override
  Future<StationFacets> getStationFacets() async => const StationFacets(
        genres: [
          FacetCount(name: 'ambient', count: 1),
          FacetCount(name: 'electronic', count: 1),
        ],
        languages: [FacetCount(name: 'english', count: 2)],
        countries: [FacetCount(name: 'US', count: 2)],
      );

  @override
  Future<NowPlayingMetadata?> extractStreamMetadata({
    required String streamUrl,
    String? stationAddress,
    String? sessionId,
  }) async =>
      null;

  @override
  Future<GeneratedAccount> generateAccount() async => const GeneratedAccount(
        pubkey: 'deadbeef',
        npub: 'npub1testaccount1234567890',
        nsec: 'nsec1testsecret1234567890',
      );

  @override
  Future<AccountSession> loginWithNsec(String secret) async {
    _session = const AccountSession(
      pubkey: 'deadbeef',
      npub: 'npub1testaccount1234567890',
      signerKind: SignerKind.localKey,
      profile: NostrProfile(
        pubkey: 'deadbeef',
        npub: 'npub1testaccount1234567890',
        name: 'RadioOperator',
      ),
    );
    return _session!;
  }

  @override
  Future<BunkerLoginResult> loginWithBunker(
    String bunkerUri, {
    String? appNsec,
  }) async {
    final s = await loginWithNsec('bunker');
    return BunkerLoginResult(
      session: s,
      bunkerUri: bunkerUri,
      appNsec: appNsec ?? 'nsec1app',
    );
  }

  @override
  Future<AccountSession> loginWithAmber(String pubkeyOrNpub) async =>
      loginWithNsec('amber');

  @override
  Future<NostrConnectChallenge> startNostrConnectSession({
    String? relayUrl,
    String? clientName,
  }) async =>
      NostrConnectChallenge(
        sessionId: 'qr-1',
        connectUri:
            'nostrconnect://deadbeef?relay=${Uri.encodeComponent(relayUrl ?? 'wss://relay.primal.net')}&name=${Uri.encodeComponent(clientName ?? 'Wavefunc Radio')}',
        appNsec: 'nsec1app',
      );

  @override
  Future<BunkerLoginResult> awaitNostrConnectSession(String sessionId) =>
      loginWithBunker('bunker://deadbeef');

  @override
  Future<void> cancelNostrConnectSession(String sessionId) async {}

  @override
  Future<ActionOutcome> publishProfile({
    String? name,
    String? about,
    String? picture,
    String? lud16,
  }) async {
    if (_session != null) {
      _session = AccountSession(
        pubkey: _session!.pubkey,
        npub: _session!.npub,
        signerKind: _session!.signerKind,
        profile: NostrProfile(
          pubkey: _session!.pubkey,
          npub: _session!.npub,
          name: name ?? _session!.profile?.name,
          displayName: name ?? _session!.profile?.displayName,
          about: about,
          picture: picture,
          lud16: lud16,
        ),
      );
    }
    return const ActionOutcome(published: true, eventId: 'evt-profile');
  }

  @override
  Future<void> logoutAccount() async {
    _session = null;
  }

  @override
  Future<AccountSession?> currentAccount() async => _session;

  @override
  Future<ActionOutcome> publishSignedEvent(String signedEventJson) async =>
      const ActionOutcome(published: true, eventId: 'evt-signed');

  @override
  Future<List<FeaturedList>> fetchUserFavorites() async =>
      _session == null ? const [] : List<FeaturedList>.from(_userLists);

  @override
  Future<ActionOutcome> toggleFavoriteStation(
    String stationAddress, {
    required bool add,
  }) async =>
      ActionOutcome(
        published: true,
        eventId: 'evt-fav',
        targetAddress: stationAddress,
      );

  @override
  Future<ActionOutcome> createFavoritesList({
    required String name,
    String? description,
    List<String> stationAddresses = const [],
  }) async {
    _userLists.add(
      FeaturedList(
        id: 'ev-new',
        pubkey: 'deadbeef',
        favoritesId: 'new-list',
        address: '30078:deadbeef:new-list',
        name: name,
        description: description,
        stationAddresses: stationAddresses,
      ),
    );
    return const ActionOutcome(published: true, eventId: 'ev-new');
  }

  @override
  Future<ActionOutcome> updateFavoritesList({
    required String favoritesId,
    required String name,
    String? description,
  }) async =>
      const ActionOutcome(published: true, eventId: 'ev-upd');

  @override
  Future<ActionOutcome> deleteFavoritesList({
    required String eventId,
    required String favoritesId,
  }) async {
    _userLists.removeWhere((l) => l.favoritesId == favoritesId);
    return const ActionOutcome(published: true, eventId: 'ev-del');
  }

  @override
  Future<ActionOutcome> toggleStationInFavoritesList({
    String? favoritesId,
    required String stationAddress,
    required bool add,
  }) async =>
      const ActionOutcome(published: true, eventId: 'ev-tog');

  @override
  Future<StationSocialSummary> fetchStationSocial({
    required String stationAddress,
    required String stationEventId,
  }) async =>
      StationSocialSummary(
        stationAddress: stationAddress,
        reactionCount: 3,
        commentCount: 1,
        comments: const [
          StationComment(
            id: 'c-1',
            pubkey: 'pk-1',
            authorName: 'alice',
            content: 'Clean signal!',
            createdAt: 1760000100,
          ),
        ],
      );

  @override
  Future<ActionOutcome> reactToStation({
    required String stationId,
    required String stationPubkey,
    required String stationAddress,
  }) async =>
      const ActionOutcome(published: true, eventId: 'evt-rx');

  @override
  Future<ActionOutcome> postStationComment({
    required String stationEventId,
    required String stationPubkey,
    required String stationAddress,
    required String content,
    String? replyToId,
    String? replyToPubkey,
  }) async =>
      const ActionOutcome(published: true, eventId: 'evt-comment');

  @override
  Future<List<CommunityPost>> fetchCommunityPosts({int limit = 80}) async =>
      _communityPosts;

  @override
  Future<ActionOutcome> postCommunityNote({
    required String content,
    String? category,
    String? replyToId,
    String? replyToPubkey,
    String? rootId,
    String? rootPubkey,
  }) async {
    _communityPosts.insert(
      0,
      CommunityPost(
        id: 'post-new',
        pubkey: 'deadbeef',
        authorName: 'RadioOperator',
        content: content,
        createdAt: 1760000900,
        categories: category != null && category != 'general' ? [category] : [],
      ),
    );
    return const ActionOutcome(published: true, eventId: 'post-new');
  }

  @override
  Future<SongCrate> fetchSongCrate() async => const SongCrate(
        songs: [
          SavedSong(
            id: 's1',
            pubkey: 'deadbeef',
            songId: 'roygbiv',
            address: '31337:deadbeef:roygbiv',
            title: 'Roygbiv',
            artist: 'Boards of Canada',
            album: 'Music Has the Right to Children',
          ),
        ],
      );

  @override
  Future<ActionOutcome> createSongEvent({
    required String title,
    String? artist,
    String? album,
    String? mbid,
    String? releaseId,
    String? releaseDate,
    int? durationMs,
    List<String> genres = const [],
  }) async =>
      const ActionOutcome(
        published: true,
        eventId: 'evt-song',
        targetAddress: '31337:deadbeef:roygbiv',
      );

  @override
  Future<ActionOutcome> updateSongCrate({
    required String songAddress,
    required bool add,
  }) async =>
      const ActionOutcome(published: true, eventId: 'evt-crate');

  @override
  Future<ActionOutcome> publishListeningStatus({
    String? title,
    String? artist,
    String? stationAddress,
    String? stationUrl,
  }) async =>
      const ActionOutcome(published: true, eventId: 'evt-nip38');

  NwcWalletStatus _nwc = const NwcWalletStatus();

  @override
  Future<List<StationCardCounts>> fetchStationsSocialCounts(
    List<String> addresses,
  ) async =>
      [
        for (final addr in addresses)
          StationCardCounts(
            stationAddress: addr,
            reactionCount: addr.contains('soma') ? 3 : 0,
            commentCount: addr.contains('soma') ? 1 : 0,
            zapCount: addr.contains('soma') ? 1 : 0,
            zapSats: addr.contains('soma') ? 21 : 0,
          ),
      ];

  @override
  Future<NwcWalletStatus> connectNwc(String nwcUri) async {
    _nwc = const NwcWalletStatus(
      connected: true,
      walletPubkey: 'walletpk',
      relay: 'wss://relay.getalby.com/v1',
      lud16: 'radio@getalby.com',
      balanceSats: 5000,
    );
    return _nwc;
  }

  @override
  Future<void> disconnectNwc() async {
    _nwc = const NwcWalletStatus();
  }

  @override
  Future<NwcWalletStatus> getNwcStatus() async => _nwc;

  @override
  Future<NwcWalletStatus> refreshNwcBalance() async => _nwc;

  @override
  Future<ZapInvoiceResult> prepareStationZap({
    required String stationPubkey,
    required String stationAddress,
    required int amountSats,
    String? comment,
  }) async =>
      ZapInvoiceResult(
        bolt11: 'lnbc1000n1pjfakeinvoice',
        amountSats: amountSats,
        recipientLud16: 'station@wavefunc.live',
        allowsNostr: true,
        callbackUrl: 'https://wavefunc.live/lnurlp/cb',
      );

  @override
  Future<ZapInvoiceResult> completeStationZapWithSignedRequest({
    required String callbackUrl,
    required int amountSats,
    String? comment,
    required String signedZapRequestJson,
    required String recipientLud16,
  }) async =>
      ZapInvoiceResult(
        bolt11: 'lnbc1000n1pjfakeinvoice',
        amountSats: amountSats,
        recipientLud16: recipientLud16,
        allowsNostr: true,
        callbackUrl: callbackUrl,
      );

  @override
  Future<ZapPaymentResult> payInvoiceNwc({
    required String bolt11,
    required int amountSats,
  }) async {
    _nwc = NwcWalletStatus(
      connected: true,
      walletPubkey: _nwc.walletPubkey,
      relay: _nwc.relay,
      lud16: _nwc.lud16,
      balanceSats: (_nwc.balanceSats ?? 5000) - amountSats,
    );
    return ZapPaymentResult(
      preimage: '00112233445566778899aabbccddeeff',
      amountSats: amountSats,
      bolt11: bolt11,
    );
  }

  // ── Zap receipts + in-memory Cashu wallet ────────────────────────────────

  bool zapReceiptPublished = false;
  int receiptChecks = 0;
  int cashuBalance = 0;
  int nip60SyncedBalance = 689;
  int nip60SyncCalls = 0;
  bool cashuClosed = false;
  final List<String> sentNutzaps = [];
  RecipientNutzapInfo? nutzapInfo;

  static const _mint = 'https://mint.minibits.cash/Bitcoin';

  CashuWalletStatus get _cashuStatus => CashuWalletStatus(
        initialized: true,
        totalBalanceSats: cashuBalance,
        mints: [CashuMintBalance(mintUrl: _mint, balanceSats: cashuBalance)],
        nip60Synced: nip60SyncCalls > 0,
      );

  @override
  Future<bool> checkStationZapReceipt({
    required String stationAddress,
    required String bolt11,
    required int sinceUnix,
  }) async {
    receiptChecks++;
    return zapReceiptPublished;
  }

  @override
  Future<CashuWalletStatus> initCashuWallet({
    required String dbDir,
    required String seedMaterial,
    List<String> mints = const [],
  }) async {
    cashuClosed = false;
    return _cashuStatus;
  }

  @override
  Future<void> closeCashuWallet() async {
    cashuClosed = true;
  }

  @override
  Future<Nip60RawEvents> fetchNip60RawEvents() async => const Nip60RawEvents();

  @override
  Future<CashuWalletStatus> syncNip60Wallet() async {
    nip60SyncCalls++;
    cashuBalance = nip60SyncedBalance;
    return _cashuStatus;
  }

  @override
  Future<CashuWalletStatus> applyDecryptedNip60Events({
    String? walletContentPlain,
    required List<Nip60DecryptedTokenEvent> decryptedTokens,
    required List<String> deletedIds,
    required List<String> discoveredMints,
    required List<String> walletRelays,
  }) async {
    nip60SyncCalls++;
    cashuBalance = nip60SyncedBalance;
    return _cashuStatus;
  }

  @override
  Future<CashuWalletStatus> getCashuStatus() async => _cashuStatus;

  @override
  Future<CashuWalletStatus> addCashuMint(String mintUrl) async => _cashuStatus;

  @override
  Future<CashuMintQuoteInfo> createCashuMintQuote({
    required String mintUrl,
    required int amountSats,
  }) async =>
      CashuMintQuoteInfo(
        mintUrl: mintUrl,
        quoteId: 'quote-1',
        bolt11: 'lnbc${amountSats}n1fakequote',
        amountSats: amountSats,
      );

  @override
  Future<CashuWalletStatus> claimCashuMintQuote({
    required String mintUrl,
    required String quoteId,
  }) async {
    cashuBalance += 1000;
    return _cashuStatus;
  }

  @override
  Future<CashuReceiveResult> receiveCashuToken(String token) async {
    cashuBalance += 21;
    return CashuReceiveResult(
      receivedSats: 21,
      mintUrl: _mint,
      status: _cashuStatus,
    );
  }

  @override
  Future<CashuSendResult> sendCashuToken({
    String? mintUrl,
    required int amountSats,
    String? memo,
  }) async {
    cashuBalance -= amountSats;
    return CashuSendResult(
      token: 'cashuBfaketoken',
      amountSats: amountSats,
      mintUrl: _mint,
      status: _cashuStatus,
    );
  }

  @override
  Future<ZapPaymentResult> payInvoiceCashu({
    String? mintUrl,
    required String bolt11,
    required int amountSats,
  }) async {
    cashuBalance -= amountSats;
    return ZapPaymentResult(
      preimage: 'cashu-preimage',
      amountSats: amountSats,
      bolt11: bolt11,
    );
  }

  @override
  Future<RecipientNutzapInfo?> fetchRecipientNutzapInfo(
    String pubkeyHex,
  ) async =>
      nutzapInfo;

  @override
  Future<ActionOutcome> sendStationNutzap({
    required String stationEventId,
    required String stationPubkey,
    required String stationAddress,
    required int amountSats,
    String? comment,
  }) async {
    cashuBalance -= amountSats;
    sentNutzaps.add('$stationAddress:$amountSats');
    return ActionOutcome(
      published: true,
      eventId: 'nutzap-event-1',
      targetAddress: stationAddress,
    );
  }

  final List<String> attachedBlossomUrls = [];

  @override
  Future<List<MusicBrainzRecording>> searchRecordings({
    required String query,
    String? artist,
    int limit = 15,
  }) async =>
      const [
        MusicBrainzRecording(
          id: 'mb-rec-roygbiv',
          title: 'Roygbiv',
          artist: 'Boards of Canada',
          release: 'Music Has the Right to Children',
          releaseDate: '1998-04-20',
          durationMs: 151000,
          score: 100,
          tags: ['electronic', 'ambient'],
        ),
      ];

  @override
  Future<List<YouTubeSearchResult>> searchYouTube({
    required String query,
    int limit = 5,
  }) async =>
      const [
        YouTubeSearchResult(
          videoId: 'yT0gRc2c2wQ',
          url: 'https://www.youtube.com/watch?v=yT0gRc2c2wQ',
          title: 'Boards of Canada - Roygbiv (Official Audio)',
          durationSecs: 151,
          channel: 'Warp Records',
        ),
      ];

  @override
  Future<PreparedMedia> prepareYouTubeMedia({
    required String cacheRoot,
    required String videoId,
    required String format,
  }) async =>
      const PreparedMedia(
        jobId: 'local:job-1',
        sha256: 'deadbeef00112233445566778899aabbccddeeff00112233445566778899aabb',
        size: 2048000,
        mimeType: 'audio/mp4',
      );

  @override
  Future<BlossomAuthResult> signBlossomUploadAuth({
    required String sha256,
    required String blossomUrl,
    required String format,
  }) async =>
      const BlossomAuthResult(
        signedEventJson: '{"id":"auth1","kind":24242,"sig":"sig1"}',
      );

  @override
  Future<UploadedMedia> uploadMediaToBlossom({
    required String jobId,
    required String blossomUrl,
    required String signedAuthEventJson,
  }) async =>
      const UploadedMedia(
        url: 'https://blossom.band/deadbeef.m4a',
        sha256: 'deadbeef00112233445566778899aabbccddeeff00112233445566778899aabb',
        size: 2048000,
        mimeType: 'audio/mp4',
      );

  @override
  Future<void> discardMediaJob(String jobId) async {}

  @override
  Future<ActionOutcome> attachSongAudioUrl({
    required String songId,
    required String audioUrl,
    String? youtubeId,
  }) async {
    attachedBlossomUrls.add('$songId->$audioUrl');
    return ActionOutcome(
      published: true,
      eventId: 'ev-song-audio-1',
      targetAddress: '31337:deadbeef:$songId',
    );
  }

  @override
  Future<NostrProfile> fetchUserProfile(String pubkeyOrNpub) async =>
      NostrProfile(
        pubkey: pubkeyOrNpub,
        npub: 'npub1testprofile',
        name: 'alice',
        displayName: 'Alice Signal',
        about: 'Independent radio curator on Nostr',
        lud16: 'alice@getalby.com',
      );

  @override
  Future<List<SavedSong>> fetchSignalSongs({int limit = 80}) async => const [
        SavedSong(
          id: 'sig-1',
          pubkey: 'pk-1',
          songId: 'mb-roygbiv',
          address: '31337:pk-1:mb-roygbiv',
          title: 'Roygbiv',
          artist: 'Boards of Canada',
          album: 'Music Has the Right to Children',
          audioUrl: 'https://blossom.band/roygbiv.m4a',
        ),
      ];

  final List<String> publishedStations = [];

  @override
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
  }) async {
    publishedStations.add('$name|$streamUrl');
    return const ActionOutcome(
      published: true,
      eventId: 'ev-new-station-1',
      targetAddress: '31237:deadbeef:new-station',
    );
  }

  SignalChartsData signalChartsData = const SignalChartsData();

  @override
  Future<SignalChartsData> fetchSignalCharts() async => signalChartsData;

  final List<String> sharedSongNotes = [];

  @override
  Future<ActionOutcome> publishSongShareNote({
    required String content,
    String? songAddress,
    String? audioUrl,
    List<String> hashtags = const ['wavefunc', 'songstr', 'tunestr'],
  }) async {
    sharedSongNotes.add(content);
    return ActionOutcome(
      published: true,
      eventId: 'ev-share-song-1',
      targetAddress: songAddress,
    );
  }

  @override
  Future<void> dispose() async {}
}

class _FakeAudioEngine implements RadioPlaybackEngine {
  final _controller = StreamController<PlayerSnapshot>.broadcast();
  PlayerSnapshot _snapshot = const PlayerSnapshot();

  @override
  PlayerSnapshot get currentSnapshot => _snapshot;

  @override
  Stream<PlayerSnapshot> get snapshotStream => _controller.stream;

  void _emit(PlayerSnapshot next) {
    _snapshot = next;
    _controller.add(next);
  }

  @override
  Future<void> playStation(Station station, {int streamIndex = 0}) async {
    _emit(
      _snapshot.copyWith(
        station: station,
        activeStream: station.streams[streamIndex],
        streamIndex: streamIndex,
        phase: PlayerPhase.playing,
      ),
    );
  }

  @override
  Future<void> selectStream(int streamIndex) async {}

  @override
  Future<void> pause() async {
    _emit(_snapshot.copyWith(phase: PlayerPhase.paused));
  }

  @override
  Future<void> resume() async {
    _emit(_snapshot.copyWith(phase: PlayerPhase.playing));
  }

  @override
  Future<void> stopPlayback() async {
    _emit(
      _snapshot.copyWith(
        phase: PlayerPhase.idle,
        clearStation: true,
        clearStream: true,
      ),
    );
  }

  @override
  Future<void> retry() async {}

  @override
  Future<void> setVolume(double volume) async {
    _emit(_snapshot.copyWith(volume: volume));
  }

  @override
  Future<void> toggleMute() async {
    _emit(_snapshot.copyWith(isMuted: !_snapshot.isMuted));
  }

  @override
  void setSleepTimer(Duration? duration) {}

  @override
  void updateEnrichedMetadata(NowPlayingMetadata metadata) {
    _emit(_snapshot.copyWith(metadata: metadata));
  }

  @override
  Future<void> disposeEngine() => _controller.close();
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  setUp(() {
    GoogleFonts.config.allowRuntimeFetching = false;
    SharedPreferences.setMockInitialValues({
      'wavefunc_onboarding_done_v1': true,
    });
  });

  final testStations = [
    const Station(
      id: 'id-1',
      pubkey: 'pk-1',
      stationId: 'soma-groove',
      address: '31237:pk-1:soma-groove',
      naddr: 'naddr1test1',
      createdAt: 1760000100,
      name: 'SomaFM Groove Salad',
      description: 'Ambient downtempo beats from San Francisco',
      countryCode: 'US',
      genres: ['ambient', 'downtempo'],
      languages: ['english'],
      streams: [
        StationStream(
          url: 'https://ice1.somafm.com/groovesalad-128-mp3',
          format: 'audio/mpeg',
          quality: StreamQuality(
            bitrate: 128000,
            codec: 'mp3',
            sampleRate: 44100,
          ),
          primary: true,
        ),
      ],
    ),
    const Station(
      id: 'id-2',
      pubkey: 'pk-2',
      stationId: 'nts-1',
      address: '31237:pk-2:nts-1',
      naddr: 'naddr1test2',
      createdAt: 1760000050,
      name: 'NTS Radio 1',
      description: 'Underground electronic radio',
      countryCode: 'GB',
      genres: ['electronic'],
      languages: ['english'],
      streams: [
        StationStream(
          url: 'https://stream-relay-geo.ntslive.net/stream',
          format: 'audio/mpeg',
          quality: StreamQuality(
            bitrate: 192000,
            codec: 'mp3',
            sampleRate: 44100,
          ),
          primary: true,
        ),
      ],
    ),
  ];

  testWidgets(
      'mobile shell: compact featured strip, social bar, zap sheet, favorites & crate',
      (tester) async {
    tester.view.physicalSize = const Size(412, 915);
    tester.view.devicePixelRatio = 1.0;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);

    final prefs = await SharedPreferences.getInstance();
    final prefService = PreferencesService(prefs);
    final backend = _FakeBackend(testStations);
    final authRepo = AuthRepository(
      backend: backend,
      storage: _InMemoryAuthStorage(),
      amber: AmberSignerService(),
      preferences: prefService,
    );
    final authVm = AuthViewModel(authRepository: authRepo);
    final stationRepo = StationRepository(
      backend: backend,
      preferences: prefService,
    );
    final discoverVm = DiscoverViewModel(
      repository: stationRepo,
      authViewModel: authVm,
    );
    final audioEngine = _FakeAudioEngine();
    final playerVm = PlayerViewModel(
      engine: audioEngine,
      repository: stationRepo,
      authViewModel: authVm,
    );
    final communityVm = CommunityViewModel(
      backend: backend,
      authViewModel: authVm,
    );
    final crateVm = CrateViewModel(
      backend: backend,
      authViewModel: authVm,
    );

    await discoverVm.initialize();

    await tester.pumpWidget(
      WavefuncApp(
        discoverViewModel: discoverVm,
        playerViewModel: playerVm,
        authViewModel: authVm,
        communityViewModel: communityVm,
        crateViewModel: crateVm,
      ),
    );
    await tester.pumpAndSettle();

    // Compact featured list cartridge strip + top-right Sign In pill + stations + social counts
    expect(find.text('DEEP SPACE AMBIENT'), findsOneWidget);
    expect(find.text('SIGN IN'), findsOneWidget);
    expect(find.text('SomaFM Groove Salad'), findsOneWidget);
    expect(find.text('21'), findsOneWidget); // zap sats on card
    expect(find.text('3'), findsOneWidget); // reaction count on card

    // Connect NWC wallet and zap SomaFM right from the station card.
    await authVm.connectNwc('nostr+walletconnect://walletpk?relay=wss://relay.getalby.com/v1&secret=00');
    await tester.pumpAndSettle();

    await tester.tap(find.byIcon(Icons.bolt).first);
    await tester.pumpAndSettle();
    expect(find.text('ZAP // NIP-57 + NIP-61'), findsOneWidget);

    await tester.tap(find.text('ZAP 100 SATS (NWC)'));
    await tester.pumpAndSettle();
    expect(find.text('ZAP CONFIRMED // 100 SATS'), findsOneWidget);
    await tester.tap(find.text('DONE'));
    await tester.pumpAndSettle();
    expect(find.text('121'), findsOneWidget); // 21 + 100 sats updated on card

    // Tap Comment button on station card -> opens StationDetailSheet ready to write.
    await tester.tap(find.byIcon(Icons.mode_comment_outlined).first);
    await tester.pumpAndSettle(const Duration(milliseconds: 500));
    expect(find.text('STATION_COMMENTS // NIP-22'), findsOneWidget);
    Navigator.of(tester.element(find.text('STATION_COMMENTS // NIP-22'))).pop();
    await tester.pumpAndSettle();

    // Tap play and verify FloatingPlayerBar docks with background spectrometer.
    await tester.tap(find.byIcon(Icons.play_arrow).first);
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 50));
    expect(find.byIcon(Icons.stop), findsOneWidget);

    // Stop before running pumpAndSettle on subsequent navigation checks.
    await playerVm.stop();
    await tester.pumpAndSettle();

    // Sign in and verify header pill updates + Library shows synced favorites list & crate.
    await authVm.loginWithNsec('nsec1test');
    await discoverVm.syncUserFavorites();
    await crateVm.refresh();
    await tester.pumpAndSettle();
    expect(find.text('RADIOOPERATOR'), findsOneWidget);

    await tester.tap(find.text('LIBRARY'));
    await tester.pumpAndSettle();
    expect(find.text('Late Night Dub'), findsOneWidget);

    await tester.tap(find.text('SONG CRATE (1)'));
    await tester.pumpAndSettle();
    expect(find.text('Roygbiv'), findsOneWidget);

    await playerVm.stop();
    await audioEngine.disposeEngine();
    playerVm.dispose();
    discoverVm.dispose();
    communityVm.dispose();
    crateVm.dispose();
    authVm.dispose();
  });

  testWidgets(
      'desktop 3-pane console: pinned sidebar lists, table toggle, docked deck & right inspector',
      (tester) async {
    tester.view.physicalSize = const Size(1440, 900);
    tester.view.devicePixelRatio = 1.0;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);

    final prefs = await SharedPreferences.getInstance();
    final prefService = PreferencesService(prefs);
    final backend = _FakeBackend(testStations);
    final authRepo = AuthRepository(
      backend: backend,
      storage: _InMemoryAuthStorage(),
      amber: AmberSignerService(),
      preferences: prefService,
    );
    final authVm = AuthViewModel(authRepository: authRepo);
    final stationRepo = StationRepository(
      backend: backend,
      preferences: prefService,
    );
    final discoverVm = DiscoverViewModel(
      repository: stationRepo,
      authViewModel: authVm,
    );
    final audioEngine = _FakeAudioEngine();
    final playerVm = PlayerViewModel(
      engine: audioEngine,
      repository: stationRepo,
      authViewModel: authVm,
    );
    final communityVm = CommunityViewModel(
      backend: backend,
      authViewModel: authVm,
    );
    final crateVm = CrateViewModel(
      backend: backend,
      authViewModel: authVm,
    );

    await discoverVm.initialize();

    await tester.pumpWidget(
      WavefuncApp(
        discoverViewModel: discoverVm,
        playerViewModel: playerVm,
        authViewModel: authVm,
        communityViewModel: communityVm,
        crateViewModel: crateVm,
      ),
    );
    await tester.pumpAndSettle();

    // Pinned Curated List in left DesktopSidebar + docked StudioPlayerDeck.
    expect(find.text('CURATED_LISTS'), findsOneWidget);
    expect(find.text('DEEP SPACE AMBIENT'), findsOneWidget);
    expect(find.text('STUDIO DECK // STANDBY'), findsOneWidget);

    // Click pinned list in sidebar -> opens inline Active Collection stage banner.
    await tester.tap(find.text('DEEP SPACE AMBIENT'));
    await tester.pumpAndSettle();
    expect(find.text('ACTIVE COLLECTION // 1 STATIONS'), findsOneWidget);

    // Toggle Broadcast Table view mode.
    await tester.tap(find.byIcon(Icons.view_list));
    await tester.pumpAndSettle();
    expect(find.text('SomaFM Groove Salad'), findsOneWidget);

    // Click Comment button -> opens Right Station Inspector directly (no modal sheet).
    await tester.tap(find.byIcon(Icons.mode_comment_outlined).first);
    await tester.pumpAndSettle(const Duration(milliseconds: 400));
    expect(find.text('STATION_INSPECTOR'), findsOneWidget);
    expect(find.text('COMMENTS // NIP-22'), findsOneWidget);

    // Switch to All Stations and play -> StudioPlayerDeck goes live.
    await tester.tap(find.text('ALL STATIONS'));
    await tester.pumpAndSettle();
    await tester.tap(find.byIcon(Icons.play_arrow).first);
    await tester.pump();
    expect(find.text('SOMAFM GROOVE SALAD'), findsOneWidget);

    await playerVm.stop();
    await audioEngine.disposeEngine();
    playerVm.dispose();
    discoverVm.dispose();
    communityVm.dispose();
    crateVm.dispose();
    authVm.dispose();
  });

  testWidgets('first-run onboarding wizard creates identity and publishes kind-0 profile',
      (tester) async {
    SharedPreferences.setMockInitialValues({});
    tester.view.physicalSize = const Size(1280, 900);
    tester.view.devicePixelRatio = 1.0;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);

    final prefs = await SharedPreferences.getInstance();
    final prefService = PreferencesService(prefs);
    final backend = _FakeBackend(testStations);
    final authRepo = AuthRepository(
      backend: backend,
      storage: _InMemoryAuthStorage(),
      amber: AmberSignerService(),
      preferences: prefService,
    );
    final authVm = AuthViewModel(authRepository: authRepo);
    final stationRepo = StationRepository(
      backend: backend,
      preferences: prefService,
    );
    final discoverVm = DiscoverViewModel(
      repository: stationRepo,
      authViewModel: authVm,
    );
    final audioEngine = _FakeAudioEngine();
    final playerVm = PlayerViewModel(
      engine: audioEngine,
      repository: stationRepo,
      authViewModel: authVm,
    );
    final communityVm = CommunityViewModel(
      backend: backend,
      authViewModel: authVm,
    );
    final crateVm = CrateViewModel(
      backend: backend,
      authViewModel: authVm,
    );

    await discoverVm.initialize();

    await tester.pumpWidget(
      WavefuncApp(
        discoverViewModel: discoverVm,
        playerViewModel: playerVm,
        authViewModel: authVm,
        communityViewModel: communityVm,
        crateViewModel: crateVm,
      ),
    );
    await tester.pumpAndSettle();

    // First-run Welcome dialog appears automatically.
    expect(find.text('WELCOME TO THE SIGNAL'), findsOneWidget);

    // Step 1: Create Identity -> generate keys -> confirm checkbox -> continue.
    await tester.tap(find.text('CREATE NOSTR IDENTITY'));
    await tester.pumpAndSettle();
    expect(find.text('YOUR NOSTR IDENTITY'), findsOneWidget);
    expect(find.text('nsec1testsecret1234567890'), findsOneWidget);

    await tester.tap(find.textContaining('I HAVE SAVED MY PRIVATE KEY SAFELY'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('SAVE & CONTINUE'));
    await tester.pumpAndSettle();

    // Step 2: Set up kind-0 profile.
    expect(find.text('SET UP YOUR PROFILE'), findsOneWidget);
    await tester.enterText(
      find.widgetWithText(TextField, 'DISPLAY NAME (E.G. DJ SIGNAL)'),
      'DJ Signal',
    );
    await tester.tap(find.text('PUBLISH PROFILE'));
    await tester.pumpAndSettle();

    // Step 3: Ready -> Start Listening.
    expect(find.text("YOU'RE ON NOSTR"), findsOneWidget);
    expect(find.text('DJ SIGNAL'), findsWidgets);
    await tester.tap(find.text('START LISTENING'));
    await tester.pumpAndSettle();

    expect(authVm.isLoggedIn, isTrue);
    expect(authVm.hasCompletedOnboarding, isTrue);

    await playerVm.stop();
    await audioEngine.disposeEngine();
    playerVm.dispose();
    discoverVm.dispose();
    communityVm.dispose();
    crateVm.dispose();
    authVm.dispose();
  });

  Future<
      ({
        _FakeBackend backend,
        AuthViewModel authVm,
        DiscoverViewModel discoverVm,
      })> buildZapHarness(WidgetTester tester) async {
    tester.view.physicalSize = const Size(412, 1400);
    tester.view.devicePixelRatio = 1.0;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);

    final prefs = await SharedPreferences.getInstance();
    final prefService = PreferencesService(prefs);
    final backend = _FakeBackend(testStations);
    final authRepo = AuthRepository(
      backend: backend,
      storage: _InMemoryAuthStorage(),
      amber: AmberSignerService(),
      preferences: prefService,
    );
    final authVm = AuthViewModel(authRepository: authRepo);
    final discoverVm = DiscoverViewModel(
      repository: StationRepository(backend: backend, preferences: prefService),
      authViewModel: authVm,
    );
    await discoverVm.initialize();
    return (backend: backend, authVm: authVm, discoverVm: discoverVm);
  }

  testWidgets(
      'zap sheet auto-confirms external wallet payment via kind-9735 receipt polling',
      (tester) async {
    final h = await buildZapHarness(tester);

    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: ZapSheet(
            station: testStations.first,
            authViewModel: h.authVm,
            discoverViewModel: h.discoverVm,
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();

    await tester.tap(find.text('GENERATE 100 SAT INVOICE'));
    await tester.pump();
    await tester.pump();
    expect(find.text('WATCHING RELAYS FOR ZAP RECEIPT...'), findsOneWidget);

    // Not paid yet: first poll finds nothing.
    await tester.pump(const Duration(seconds: 3));
    expect(h.backend.receiptChecks, greaterThanOrEqualTo(1));
    expect(find.text('ZAP CONFIRMED // 100 SATS'), findsNothing);

    // Wallet (e.g. Minibits) pays; returning to the app triggers an immediate check.
    h.backend.zapReceiptPublished = true;
    tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.resumed);
    await tester.pump();
    await tester.pump();
    expect(find.text('ZAP CONFIRMED // 100 SATS'), findsOneWidget);
    expect(find.text('EXTERNAL WALLET'), findsOneWidget);

    await tester.pumpWidget(const SizedBox());
    h.discoverVm.dispose();
    h.authVm.dispose();
  });

  testWidgets('zap sheet sends instant P2PK nutzap from embedded Cashu wallet',
      (tester) async {
    final h = await buildZapHarness(tester);
    h.backend.cashuBalance = 500;
    h.backend.nutzapInfo = const RecipientNutzapInfo(
      pubkey: 'pk-1',
      p2pkPubkey: '02abcdef',
      mints: ['https://mint.minibits.cash/Bitcoin/'],
    );
    await h.authVm.initCashuAt('/tmp/wavefunc-test-cashu');
    expect(h.authVm.cashuBalanceSats, 500);

    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: ZapSheet(
            station: testStations.first,
            authViewModel: h.authVm,
            discoverViewModel: h.discoverVm,
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('NUTZAP OK — 500 SATS ON A COMPATIBLE MINT'), findsOneWidget);
    expect(find.text('ZAP 100 SATS (ECASH)'), findsOneWidget);

    await tester.tap(find.text('NUTZAP 100 SATS (INSTANT)'));
    await tester.pumpAndSettle();

    expect(find.text('ZAP CONFIRMED // 100 SATS'), findsOneWidget);
    expect(find.text('NUTZAP PUBLISHED (P2PK)'), findsOneWidget);
    expect(h.backend.sentNutzaps, ['31237:pk-1:soma-groove:100']);
    expect(h.authVm.cashuBalanceSats, 400);

    await tester.pumpWidget(const SizedBox());
    h.discoverVm.dispose();
    h.authVm.dispose();
  });

  testWidgets(
      'NIP-60 wallet is off by default, remembers opt-in, syncs balance, and shows in profile button',
      (tester) async {
    tester.view.physicalSize = const Size(412, 915);
    tester.view.devicePixelRatio = 1.0;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);

    final prefs = await SharedPreferences.getInstance();
    final prefService = PreferencesService(prefs);
    final backend = _FakeBackend(testStations);
    final authRepo = AuthRepository(
      backend: backend,
      storage: _InMemoryAuthStorage(),
      amber: AmberSignerService(),
      preferences: prefService,
    );
    final authVm = AuthViewModel(
      authRepository: authRepo,
      cashuBaseDir: '/tmp/wavefunc-test-nip60',
    );
    final stationRepo = StationRepository(
      backend: backend,
      preferences: prefService,
    );
    final discoverVm = DiscoverViewModel(
      repository: stationRepo,
      authViewModel: authVm,
    );
    final audioEngine = _FakeAudioEngine();
    final playerVm = PlayerViewModel(
      engine: audioEngine,
      repository: stationRepo,
      authViewModel: authVm,
    );
    final communityVm = CommunityViewModel(
      backend: backend,
      authViewModel: authVm,
    );
    final crateVm = CrateViewModel(
      backend: backend,
      authViewModel: authVm,
    );

    await discoverVm.initialize();
    await authVm.loginWithNsec('nsec1test');

    await tester.pumpWidget(
      WavefuncApp(
        discoverViewModel: discoverVm,
        playerViewModel: playerVm,
        authViewModel: authVm,
        communityViewModel: communityVm,
        crateViewModel: crateVm,
      ),
    );
    await tester.pumpAndSettle();

    // Off by default: no sync triggered and no balance in profile pill.
    expect(authVm.isNip60Enabled, isFalse);
    expect(backend.nip60SyncCalls, 0);
    expect(find.text('⚡ 689 SATS'), findsNothing);

    // Enable NIP-60 wallet -> syncs 689 sats and shows in profile pill.
    await authVm.setNip60Enabled(true);
    await tester.pumpAndSettle();
    expect(authVm.isNip60Enabled, isTrue);
    expect(backend.nip60SyncCalls, 1);
    expect(authVm.displayWalletBalanceSats, 689);
    expect(find.text('⚡ 689 SATS'), findsOneWidget);

    // Persisted preference remembered for this account.
    expect(prefService.isNip60EnabledForAccount(authVm.session!.pubkey), isTrue);

    // Switching off stops wallet and clears profile balance.
    await authVm.setNip60Enabled(false);
    await tester.pumpAndSettle();
    expect(authVm.isNip60Enabled, isFalse);
    expect(backend.cashuClosed, isTrue);
    expect(authVm.displayWalletBalanceSats, isNull);
    expect(find.text('⚡ 689 SATS'), findsNothing);

    await playerVm.stop();
    await audioEngine.disposeEngine();
    playerVm.dispose();
    discoverVm.dispose();
    communityVm.dispose();
    crateVm.dispose();
    authVm.dispose();
  });

  testWidgets(
      'song search finds MusicBrainz recordings and backs up audio to Blossom',
      (tester) async {
    tester.view.physicalSize = const Size(1280, 900);
    tester.view.devicePixelRatio = 1.0;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);

    final prefs = await SharedPreferences.getInstance();
    final prefService = PreferencesService(prefs);
    final backend = _FakeBackend(testStations);
    final authRepo = AuthRepository(
      backend: backend,
      storage: _InMemoryAuthStorage(),
      amber: AmberSignerService(),
      preferences: prefService,
    );
    final authVm = AuthViewModel(
      authRepository: authRepo,
      cashuBaseDir: '/tmp/wavefunc-test-songs',
    );
    final stationRepo = StationRepository(
      backend: backend,
      preferences: prefService,
    );
    final discoverVm = DiscoverViewModel(
      repository: stationRepo,
      authViewModel: authVm,
    );
    final audioEngine = _FakeAudioEngine();
    final playerVm = PlayerViewModel(
      engine: audioEngine,
      repository: stationRepo,
      authViewModel: authVm,
    );
    final communityVm = CommunityViewModel(
      backend: backend,
      authViewModel: authVm,
    );
    final crateVm = CrateViewModel(
      backend: backend,
      authViewModel: authVm,
    );

    await discoverVm.initialize();
    await authVm.loginWithNsec('nsec1test');

    await tester.pumpWidget(
      WavefuncApp(
        discoverViewModel: discoverVm,
        playerViewModel: playerVm,
        authViewModel: authVm,
        communityViewModel: communityVm,
        crateViewModel: crateVm,
      ),
    );
    await tester.pumpAndSettle();

    // Switch Discover search bar to Songs (MusicBrainz) mode.
    await tester.tap(find.byTooltip('Search Songs (MusicBrainz)'));
    await tester.pumpAndSettle();

    await tester.enterText(
      find.widgetWithText(TextField, 'SEARCH SONGS (MUSICBRAINZ)...'),
      'Roygbiv',
    );
    await tester.tap(find.byTooltip('Search songs'));
    await tester.pumpAndSettle();

    expect(find.text('MUSICBRAINZ_RECORDINGS'), findsOneWidget);
    expect(find.text('Roygbiv'), findsWidgets);
    expect(find.textContaining('BOARDS OF CANADA'), findsOneWidget);

    // Tap Blossom Backup -> opens MEDIA_FORGE, searches YouTube, and uploads to Blossom.
    await tester.tap(find.text('BLOSSOM BACKUP'));
    await tester.pumpAndSettle();
    expect(find.text('MEDIA_FORGE // BLOSSOM BACKUP'), findsOneWidget);
    expect(
      find.text('Boards of Canada - Roygbiv (Official Audio)'),
      findsOneWidget,
    );

    await tester.tap(find.text('BACKUP'));
    await tester.pumpAndSettle();

    expect(find.text('BACKED UP TO BLOSSOM'), findsOneWidget);
    expect(backend.attachedBlossomUrls, isNotEmpty);

    await tester.tap(find.text('DONE'));
    await tester.pumpAndSettle();

    await playerVm.stop();
    await audioEngine.disposeEngine();
    playerVm.dispose();
    discoverVm.dispose();
    communityVm.dispose();
    crateVm.dispose();
    authVm.dispose();
  });

  testWidgets(
      'feed song signals, public user profile sheet, and station submission work end-to-end',
      (tester) async {
    tester.view.physicalSize = const Size(1280, 900);
    tester.view.devicePixelRatio = 1.0;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);

    final prefs = await SharedPreferences.getInstance();
    final prefService = PreferencesService(prefs);
    final backend = _FakeBackend(testStations);
    final authRepo = AuthRepository(
      backend: backend,
      storage: _InMemoryAuthStorage(),
      amber: AmberSignerService(),
      preferences: prefService,
    );
    final authVm = AuthViewModel(
      authRepository: authRepo,
      cashuBaseDir: '/tmp/wavefunc-test-parity',
    );
    final stationRepo = StationRepository(
      backend: backend,
      preferences: prefService,
    );
    final discoverVm = DiscoverViewModel(
      repository: stationRepo,
      authViewModel: authVm,
    );
    final audioEngine = _FakeAudioEngine();
    final playerVm = PlayerViewModel(
      engine: audioEngine,
      repository: stationRepo,
      authViewModel: authVm,
    );
    final communityVm = CommunityViewModel(
      backend: backend,
      authViewModel: authVm,
    );
    final crateVm = CrateViewModel(
      backend: backend,
      authViewModel: authVm,
    );

    await discoverVm.initialize();
    await authVm.loginWithNsec('nsec1test');

    await tester.pumpWidget(
      WavefuncApp(
        discoverViewModel: discoverVm,
        playerViewModel: playerVm,
        authViewModel: authVm,
        communityViewModel: communityVm,
        crateViewModel: crateVm,
      ),
    );
    await tester.pumpAndSettle();

    // 1. Open FEED -> switch to SONG SIGNALS -> verify Blossom track + tap author profile.
    await tester.tap(find.text('FEED'));
    await tester.pumpAndSettle();

    await tester.tap(find.textContaining('SONG SIGNALS'));
    await tester.pumpAndSettle();
    expect(find.text('Roygbiv'), findsOneWidget);
    expect(find.byTooltip('Play Blossom audio'), findsOneWidget);

    // Tap the signal author icon to open UserProfileSheet (kind 0).
    await tester.tap(find.byTooltip('View saver profile'));
    await tester.pumpAndSettle();
    expect(find.text('NOSTR_PROFILE // KIND 0'), findsOneWidget);
    expect(find.text('Alice Signal'), findsOneWidget);
    expect(find.text('Independent radio curator on Nostr'), findsOneWidget);
    await tester.tap(find.byIcon(Icons.close));
    await tester.pumpAndSettle();

    // 2. Open SYSTEM -> Submit Station -> publish kind 31237 station.
    await tester.tap(find.text('SYSTEM'));
    await tester.pumpAndSettle();
    await tester.scrollUntilVisible(
      find.text('SUBMIT STATION'),
      300,
      scrollable: find.byType(Scrollable).first,
    );
    await tester.tap(find.text('SUBMIT STATION'));
    await tester.pumpAndSettle();

    expect(find.text('SUBMIT RADIO STATION'), findsOneWidget);
    await tester.enterText(
      find.widgetWithText(TextField, 'STATION NAME *'),
      'Pirate Dub FM',
    );
    await tester.enterText(
      find.widgetWithText(TextField, 'STREAM URL (HTTP/HTTPS) *'),
      'https://stream.piratedub.fm/live.mp3',
    );
    await tester.tap(find.text('PUBLISH STATION TO NOSTR'));
    await tester.pumpAndSettle();

    expect(
      backend.publishedStations,
      ['Pirate Dub FM|https://stream.piratedub.fm/live.mp3'],
    );

    await playerVm.stop();
    await audioEngine.disposeEngine();
    playerVm.dispose();
    discoverVm.dispose();
    communityVm.dispose();
    crateVm.dispose();
    authVm.dispose();
  });

  testWidgets(
      'main page renders observer SIGNAL_CHARTS aggregate lists and Blossom recent downloads',
      (tester) async {
    tester.view.physicalSize = const Size(1280, 1200);
    tester.view.devicePixelRatio = 1.0;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);

    final prefs = await SharedPreferences.getInstance();
    final prefService = PreferencesService(prefs);
    final backend = _FakeBackend(testStations);
    backend.signalChartsData = SignalChartsData(
      rankings: [
        StationRankingSnapshot(
          metric: 'best-signal',
          window: '24h',
          generatedAt: 1760000100,
          entries: [
            StationRankingEntry(
              stationAddress: testStations.first.address,
              value: 98,
            ),
          ],
        ),
        StationRankingSnapshot(
          metric: 'most-zapped',
          window: '7d',
          generatedAt: 1760000100,
          entries: [
            StationRankingEntry(
              stationAddress: testStations.last.address,
              value: 42,
            ),
          ],
        ),
      ],
      stations: testStations,
      health: [
        StationHealthSummary(
          stationAddress: testStations.first.address,
          status: 'up',
          score: 98,
          checkedAt: 1760000100,
        ),
      ],
      recentDownloads: const [
        SavedSong(
          id: 'dl-1',
          pubkey: 'pk-1',
          songId: 'mb-roygbiv',
          address: '31337:pk-1:mb-roygbiv',
          title: 'Roygbiv',
          artist: 'Boards of Canada',
          audioUrl: 'https://blossom.band/roygbiv.m4a',
        ),
      ],
    );

    final authRepo = AuthRepository(
      backend: backend,
      storage: _InMemoryAuthStorage(),
      amber: AmberSignerService(),
      preferences: prefService,
    );
    final authVm = AuthViewModel(
      authRepository: authRepo,
      cashuBaseDir: '/tmp/wavefunc-test-charts',
    );
    final stationRepo = StationRepository(
      backend: backend,
      preferences: prefService,
    );
    final discoverVm = DiscoverViewModel(
      repository: stationRepo,
      authViewModel: authVm,
    );
    final audioEngine = _FakeAudioEngine();
    final playerVm = PlayerViewModel(
      engine: audioEngine,
      repository: stationRepo,
      authViewModel: authVm,
    );
    final communityVm = CommunityViewModel(
      backend: backend,
      authViewModel: authVm,
    );
    final crateVm = CrateViewModel(
      backend: backend,
      authViewModel: authVm,
    );

    await discoverVm.initialize();

    await tester.pumpWidget(
      WavefuncApp(
        discoverViewModel: discoverVm,
        playerViewModel: playerVm,
        authViewModel: authVm,
        communityViewModel: communityVm,
        crateViewModel: crateVm,
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('SIGNAL_CHARTS'), findsOneWidget);
    expect(find.text('SIGNED_NETWORK_FEED'), findsOneWidget);
    expect(find.text('BEST_SIGNAL'), findsOneWidget);
    expect(find.text('98 SIGNAL_SCORE'), findsOneWidget);
    expect(find.text('UP 98'), findsOneWidget);
    expect(find.text('MOST_ZAPPED'), findsOneWidget);
    expect(find.text('42 ZAPS'), findsOneWidget);
    expect(find.text('RECENT_DOWNLOADS'), findsOneWidget);
    expect(find.text('ROYGBIV'), findsOneWidget);
    expect(find.text('BLOSSOM_ARCHIVE'), findsOneWidget);

    await playerVm.stop();
    await audioEngine.disposeEngine();
    playerVm.dispose();
    discoverVm.dispose();
    communityVm.dispose();
    crateVm.dispose();
    authVm.dispose();
  });

  testWidgets('crate song share sheet publishes kind-1 note and feed renders video cards',
      (tester) async {
    tester.view.physicalSize = const Size(1280, 900);
    tester.view.devicePixelRatio = 1.0;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);

    final prefs = await SharedPreferences.getInstance();
    final prefService = PreferencesService(prefs);
    final backend = _FakeBackend(testStations);
    final authRepo = AuthRepository(
      backend: backend,
      storage: _InMemoryAuthStorage(),
      amber: AmberSignerService(),
      preferences: prefService,
    );
    final authVm = AuthViewModel(
      authRepository: authRepo,
      cashuBaseDir: '/tmp/wavefunc-test-share',
    );
    final stationRepo = StationRepository(
      backend: backend,
      preferences: prefService,
    );
    final discoverVm = DiscoverViewModel(
      repository: stationRepo,
      authViewModel: authVm,
    );
    final audioEngine = _FakeAudioEngine();
    final playerVm = PlayerViewModel(
      engine: audioEngine,
      repository: stationRepo,
      authViewModel: authVm,
    );
    final communityVm = CommunityViewModel(
      backend: backend,
      authViewModel: authVm,
    );
    final crateVm = CrateViewModel(
      backend: backend,
      authViewModel: authVm,
    );

    await discoverVm.initialize();
    await authVm.loginWithNsec('nsec1test');
    await crateVm.refresh();

    await tester.pumpWidget(
      WavefuncApp(
        discoverViewModel: discoverVm,
        playerViewModel: playerVm,
        authViewModel: authVm,
        communityViewModel: communityVm,
        crateViewModel: crateVm,
      ),
    );
    await tester.pumpAndSettle();

    // Navigate to LIBRARY -> SONG CRATE -> tap Share on Roygbiv.
    await tester.tap(find.text('LIBRARY'));
    await tester.pumpAndSettle();
    await tester.tap(find.textContaining('SONG CRATE'));
    await tester.pumpAndSettle();

    await tester.tap(find.byTooltip('Share song to Nostr').first);
    await tester.pumpAndSettle();
    expect(find.text('SHARE_NOTE // KIND 1'), findsOneWidget);

    await tester.tap(find.text('PUBLISH SHARE NOTE'));
    await tester.pumpAndSettle();

    expect(backend.sharedSongNotes, hasLength(1));
    expect(backend.sharedSongNotes.first, contains('Roygbiv'));
    expect(backend.sharedSongNotes.first, contains('#wavefunc'));

    await playerVm.stop();
    await audioEngine.disposeEngine();
    playerVm.dispose();
    discoverVm.dispose();
    communityVm.dispose();
    crateVm.dispose();
    authVm.dispose();
  });
}
