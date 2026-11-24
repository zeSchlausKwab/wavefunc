import 'dart:async';
import 'dart:convert';
import 'dart:io';

import '../../domain/models/now_playing.dart';
import '../../domain/models/social.dart';
import '../../domain/models/station.dart';
import 'wavefunc_backend.dart';

/// Lightweight pure-Dart NIP-01 / NIP-45 / NIP-50 WebSocket backend.
///
/// Mirrors the exact parsing and search semantics of `crates/wavefunc-core` so
/// the Phase 1 Flutter app can connect live to `wss://relay.wavefunc.live` right
/// away even before the native Rust `wavefunc_bridge` dynamic library is compiled.
class RelayWebSocketBackend implements WavefuncBackend {
  static const int stationKind = 31237;
  static const int appDataKind = 30078;
  static const String favoritesListLabel = 'wavefunc_user_favourite_list';
  static const String adminFeaturedListsLabel = 'wavefunc:featured:lists';

  WebSocket? _socket;
  StreamSubscription<dynamic>? _socketSub;
  String _relayUrl = WavefuncBackend.defaultProductionRelay;
  int _subCounter = 0;

  final Map<String, _PendingReq> _pendingReqs = {};
  final Map<String, Completer<int?>> _pendingCounts = {};
  List<Station> _cachedStations = const [];

  @override
  String get engineLabel => 'DART_WS_FALLBACK';

  @override
  bool get supportsSigning => false;

  bool get _isConnected =>
      _socket != null && _socket!.readyState == WebSocket.open;

  @override
  Future<RelayStatus> connectRelay(String relayUrl) async {
    final trimmed = relayUrl.trim();
    final uri = Uri.tryParse(trimmed);
    if (uri == null || (uri.scheme != 'ws' && uri.scheme != 'wss')) {
      throw FormatException('Invalid relay WebSocket URL: $trimmed');
    }

    await _closeSocket();
    _relayUrl = trimmed;
    _cachedStations = const [];

    _socket = await WebSocket.connect(trimmed).timeout(
      const Duration(seconds: 10),
    );
    _socket!.pingInterval = const Duration(seconds: 25);
    _socketSub = _socket!.listen(
      _onMessage,
      onError: (_) => _failPending('Relay connection error'),
      onDone: () => _failPending('Relay disconnected'),
    );

    return getRelayStatus();
  }

  Future<void> _ensureConnected() async {
    if (!_isConnected) {
      await connectRelay(_relayUrl);
    }
  }

  void _onMessage(dynamic raw) {
    if (raw is! String) return;
    try {
      final decoded = jsonDecode(raw);
      if (decoded is! List || decoded.isEmpty) return;
      final type = decoded[0];
      if (type == 'EVENT' && decoded.length >= 3) {
        final subId = decoded[1] as String?;
        final event = decoded[2];
        if (subId != null && event is Map<String, dynamic>) {
          _pendingReqs[subId]?.events.add(event);
        }
      } else if (type == 'EOSE' && decoded.length >= 2) {
        final subId = decoded[1] as String?;
        if (subId != null) {
          final pending = _pendingReqs.remove(subId);
          if (pending != null && !pending.completer.isCompleted) {
            _sendClose(subId);
            pending.completer.complete(pending.events);
          }
        }
      } else if (type == 'CLOSED' && decoded.length >= 2) {
        final subId = decoded[1] as String?;
        if (subId != null) {
          final pending = _pendingReqs.remove(subId);
          if (pending != null && !pending.completer.isCompleted) {
            pending.completer.complete(pending.events);
          }
          final countCompleter = _pendingCounts.remove(subId);
          if (countCompleter != null && !countCompleter.isCompleted) {
            countCompleter.complete(null);
          }
        }
      } else if (type == 'COUNT' && decoded.length >= 3) {
        final subId = decoded[1] as String?;
        final payload = decoded[2];
        if (subId != null) {
          final completer = _pendingCounts.remove(subId);
          final count = payload is Map<String, dynamic>
              ? (payload['count'] as num?)?.toInt()
              : null;
          if (completer != null && !completer.isCompleted) {
            completer.complete(count);
          }
        }
      }
    } catch (_) {
      // Ignore malformed frames from relays.
    }
  }

  void _failPending(String reason) {
    for (final entry in _pendingReqs.values) {
      if (!entry.completer.isCompleted) {
        entry.completer.complete(entry.events);
      }
    }
    _pendingReqs.clear();
    for (final completer in _pendingCounts.values) {
      if (!completer.isCompleted) {
        completer.complete(null);
      }
    }
    _pendingCounts.clear();
  }

  void _sendClose(String subId) {
    if (_isConnected) {
      try {
        _socket!.add(jsonEncode(['CLOSE', subId]));
      } catch (_) {}
    }
  }

  Future<List<Map<String, dynamic>>> _query(
    Map<String, dynamic> filter, {
    Duration timeout = const Duration(seconds: 10),
  }) async {
    await _ensureConnected();
    final subId = 'wf_${++_subCounter}';
    final pending = _PendingReq();
    _pendingReqs[subId] = pending;

    _socket!.add(jsonEncode(['REQ', subId, filter]));

    return pending.completer.future.timeout(
      timeout,
      onTimeout: () {
        final timedOut = _pendingReqs.remove(subId);
        _sendClose(subId);
        return timedOut?.events ?? const [];
      },
    );
  }

  Future<int?> _count(Map<String, dynamic> filter) async {
    if (!_isConnected) return null;
    final subId = 'wfc_${++_subCounter}';
    final completer = Completer<int?>();
    _pendingCounts[subId] = completer;

    try {
      _socket!.add(jsonEncode(['COUNT', subId, filter]));
      return await completer.future.timeout(
        const Duration(seconds: 4),
        onTimeout: () {
          _pendingCounts.remove(subId);
          return null;
        },
      );
    } catch (_) {
      _pendingCounts.remove(subId);
      return null;
    }
  }

  @override
  Future<RelayStatus> getRelayStatus() async {
    final total = _isConnected
        ? await _count({'kinds': [stationKind]})
        : null;
    return RelayStatus(
      relayUrl: _relayUrl,
      connected: _isConnected,
      totalStationCount: total,
      engineLabel: engineLabel,
    );
  }

  @override
  Future<List<Station>> fetchStations({int limit = 250}) async {
    final events = await _query({
      'kinds': [stationKind],
      'limit': limit.clamp(1, 500),
    });
    final stations = deduplicateStations(
      events.map(parseStationEvent).whereType<Station>().toList(),
    );
    _cachedStations = stations;
    return stations;
  }

  @override
  Future<List<Station>> searchStations({
    String? query,
    String? genre,
    String? country,
    String? language,
    int limit = 150,
  }) async {
    final filter = <String, dynamic>{
      'kinds': [stationKind],
      'limit': limit.clamp(1, 300),
    };
    final cleanQuery = query?.trim();
    if (cleanQuery != null && cleanQuery.isNotEmpty) {
      filter['search'] = cleanQuery;
    }
    final cleanGenre = genre?.trim();
    if (cleanGenre != null && cleanGenre.isNotEmpty) {
      filter['#c'] = [cleanGenre];
    }
    final cleanLang = language?.trim();
    if (cleanLang != null && cleanLang.isNotEmpty) {
      filter['#l'] = [cleanLang];
    }

    final events = await _query(filter);
    final parsed = deduplicateStations(
      events.map(parseStationEvent).whereType<Station>().toList(),
    );

    final ccUpper = country?.trim().toUpperCase();
    final genreLower = cleanGenre?.toLowerCase();
    final langLower = cleanLang?.toLowerCase();

    return parsed.where((station) {
      if (cleanQuery != null &&
          cleanQuery.isNotEmpty &&
          !matchesStationSearch(station, cleanQuery)) {
        return false;
      }
      if (ccUpper != null &&
          ccUpper.isNotEmpty &&
          station.countryCode?.toUpperCase() != ccUpper) {
        return false;
      }
      if (genreLower != null &&
          genreLower.isNotEmpty &&
          !station.genres.any((g) => g.toLowerCase() == genreLower)) {
        return false;
      }
      if (langLower != null &&
          langLower.isNotEmpty &&
          !station.languages.any((l) => l.toLowerCase() == langLower)) {
        return false;
      }
      return true;
    }).toList();
  }

  @override
  Future<Station?> fetchStationByAddress(String address) async {
    final parts = address.split(':');
    if (parts.length < 3 || parts[0] != '$stationKind') return null;
    final pubkey = parts[1];
    final dTag = parts.sublist(2).join(':');
    final events = await _query({
      'kinds': [stationKind],
      'authors': [pubkey],
      '#d': [dTag],
      'limit': 1,
    });
    final stations = deduplicateStations(
      events.map(parseStationEvent).whereType<Station>().toList(),
    );
    return stations.isEmpty ? null : stations.first;
  }

  @override
  Future<List<Station>> fetchStationsByAddresses(List<String> addresses) async {
    final out = <Station>[];
    for (final addr in addresses) {
      final s = await fetchStationByAddress(addr);
      if (s != null) out.add(s);
    }
    return out;
  }

  @override
  Future<List<FeaturedList>> fetchFeaturedLists() async {
    final adminEvents = await _query({
      'kinds': [appDataKind],
      '#l': [adminFeaturedListsLabel],
      'limit': 15,
    });

    final refs = <String>{};
    for (final event in adminEvents) {
      final tags = event['tags'];
      if (tags is! List) continue;
      for (final tag in tags) {
        if (tag is List &&
            tag.length >= 2 &&
            tag[0] == 'a' &&
            tag[1] is String &&
            (tag[1] as String).startsWith('$appDataKind:')) {
          refs.add(tag[1] as String);
        }
      }
    }

    List<Map<String, dynamic>> listEvents;
    if (refs.isEmpty) {
      listEvents = await _query({
        'kinds': [appDataKind],
        '#l': [favoritesListLabel],
        'limit': 12,
      });
    } else {
      final authors = <String>{};
      final dTags = <String>{};
      for (final addr in refs) {
        final parts = addr.split(':');
        if (parts.length >= 3) {
          authors.add(parts[1]);
          dTags.add(parts.sublist(2).join(':'));
        }
      }
      listEvents = await _query({
        'kinds': [appDataKind],
        '#l': [favoritesListLabel],
        'authors': authors.toList(),
        '#d': dTags.toList(),
        'limit': 25,
      });
    }

    final parsed = listEvents
        .map(parseFeaturedListEvent)
        .whereType<FeaturedList>()
        .where((l) => l.stationAddresses.isNotEmpty)
        .toList();
    parsed.sort(
      (a, b) => b.stationAddresses.length.compareTo(a.stationAddresses.length),
    );
    return parsed;
  }

  @override
  Future<StationFacets> getStationFacets() async {
    return computeFacets(_cachedStations);
  }

  @override
  Future<NowPlayingMetadata?> extractStreamMetadata({
    required String streamUrl,
    String? stationAddress,
    String? sessionId,
  }) async {
    return null;
  }

  Never _signingUnsupported() => throw UnsupportedError(
        'Nostr signing requires the native Rust wavefunc-core bridge.',
      );

  @override
  Future<GeneratedAccount> generateAccount() async => _signingUnsupported();

  @override
  Future<AccountSession> loginWithNsec(String secret) async =>
      _signingUnsupported();

  @override
  Future<BunkerLoginResult> loginWithBunker(
    String bunkerUri, {
    String? appNsec,
  }) async =>
      _signingUnsupported();

  @override
  Future<AccountSession> loginWithAmber(String pubkeyOrNpub) async =>
      _signingUnsupported();

  @override
  Future<NostrConnectChallenge> startNostrConnectSession({
    String? relayUrl,
    String? clientName,
  }) async =>
      _signingUnsupported();

  @override
  Future<BunkerLoginResult> awaitNostrConnectSession(String sessionId) async =>
      _signingUnsupported();

  @override
  Future<void> cancelNostrConnectSession(String sessionId) async {}

  @override
  Future<ActionOutcome> publishProfile({
    String? name,
    String? about,
    String? picture,
    String? lud16,
  }) async =>
      _signingUnsupported();

  @override
  Future<void> logoutAccount() async {}

  @override
  Future<AccountSession?> currentAccount() async => null;

  @override
  Future<ActionOutcome> publishSignedEvent(String signedEventJson) async =>
      _signingUnsupported();

  @override
  Future<List<FeaturedList>> fetchUserFavorites() async => const [];

  @override
  Future<ActionOutcome> toggleFavoriteStation(
    String stationAddress, {
    required bool add,
  }) async =>
      _signingUnsupported();

  @override
  Future<ActionOutcome> createFavoritesList({
    required String name,
    String? description,
    List<String> stationAddresses = const [],
  }) async =>
      _signingUnsupported();

  @override
  Future<ActionOutcome> updateFavoritesList({
    required String favoritesId,
    required String name,
    String? description,
  }) async =>
      _signingUnsupported();

  @override
  Future<ActionOutcome> deleteFavoritesList({
    required String eventId,
    required String favoritesId,
  }) async =>
      _signingUnsupported();

  @override
  Future<ActionOutcome> toggleStationInFavoritesList({
    String? favoritesId,
    required String stationAddress,
    required bool add,
  }) async =>
      _signingUnsupported();

  @override
  Future<StationSocialSummary> fetchStationSocial({
    required String stationAddress,
    required String stationEventId,
  }) async =>
      StationSocialSummary(stationAddress: stationAddress);

  @override
  Future<ActionOutcome> reactToStation({
    required String stationId,
    required String stationPubkey,
    required String stationAddress,
  }) async =>
      _signingUnsupported();

  @override
  Future<ActionOutcome> postStationComment({
    required String stationEventId,
    required String stationPubkey,
    required String stationAddress,
    required String content,
    String? replyToId,
    String? replyToPubkey,
  }) async =>
      _signingUnsupported();

  @override
  Future<List<CommunityPost>> fetchCommunityPosts({int limit = 80}) async =>
      const [];

  @override
  Future<ActionOutcome> postCommunityNote({
    required String content,
    String? category,
    String? replyToId,
    String? replyToPubkey,
    String? rootId,
    String? rootPubkey,
  }) async =>
      _signingUnsupported();

  @override
  Future<SongCrate> fetchSongCrate() async => const SongCrate();

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
      _signingUnsupported();

  @override
  Future<ActionOutcome> updateSongCrate({
    required String songAddress,
    required bool add,
  }) async =>
      _signingUnsupported();

  @override
  Future<ActionOutcome> publishListeningStatus({
    String? title,
    String? artist,
    String? stationAddress,
    String? stationUrl,
  }) async =>
      _signingUnsupported();

  @override
  Future<List<StationCardCounts>> fetchStationsSocialCounts(
    List<String> addresses,
  ) async =>
      const [];

  @override
  Future<NwcWalletStatus> connectNwc(String nwcUri) async =>
      _signingUnsupported();

  @override
  Future<void> disconnectNwc() async {}

  @override
  Future<NwcWalletStatus> getNwcStatus() async => const NwcWalletStatus();

  @override
  Future<NwcWalletStatus> refreshNwcBalance() async => const NwcWalletStatus();

  @override
  Future<ZapInvoiceResult> prepareStationZap({
    required String stationPubkey,
    required String stationAddress,
    required int amountSats,
    String? comment,
  }) async =>
      _signingUnsupported();

  @override
  Future<ZapInvoiceResult> completeStationZapWithSignedRequest({
    required String callbackUrl,
    required int amountSats,
    String? comment,
    required String signedZapRequestJson,
    required String recipientLud16,
  }) async =>
      _signingUnsupported();

  @override
  Future<ZapPaymentResult> payInvoiceNwc({
    required String bolt11,
    required int amountSats,
  }) async =>
      _signingUnsupported();

  @override
  Future<bool> checkStationZapReceipt({
    required String stationAddress,
    required String bolt11,
    required int sinceUnix,
  }) async =>
      false;

  @override
  Future<CashuWalletStatus> initCashuWallet({
    required String dbDir,
    required String seedMaterial,
    List<String> mints = const [],
  }) async =>
      const CashuWalletStatus();

  @override
  Future<void> closeCashuWallet() async {}

  @override
  Future<Nip60RawEvents> fetchNip60RawEvents() async => const Nip60RawEvents();

  @override
  Future<CashuWalletStatus> syncNip60Wallet() async =>
      const CashuWalletStatus();

  @override
  Future<CashuWalletStatus> applyDecryptedNip60Events({
    String? walletContentPlain,
    required List<Nip60DecryptedTokenEvent> decryptedTokens,
    required List<String> deletedIds,
    required List<String> discoveredMints,
    required List<String> walletRelays,
  }) async =>
      const CashuWalletStatus();

  @override
  Future<CashuWalletStatus> getCashuStatus() async =>
      const CashuWalletStatus();

  @override
  Future<CashuWalletStatus> addCashuMint(String mintUrl) async =>
      _signingUnsupported();

  @override
  Future<CashuMintQuoteInfo> createCashuMintQuote({
    required String mintUrl,
    required int amountSats,
  }) async =>
      _signingUnsupported();

  @override
  Future<CashuWalletStatus> claimCashuMintQuote({
    required String mintUrl,
    required String quoteId,
  }) async =>
      _signingUnsupported();

  @override
  Future<CashuReceiveResult> receiveCashuToken(String token) async =>
      _signingUnsupported();

  @override
  Future<CashuSendResult> sendCashuToken({
    String? mintUrl,
    required int amountSats,
    String? memo,
  }) async =>
      _signingUnsupported();

  @override
  Future<ZapPaymentResult> payInvoiceCashu({
    String? mintUrl,
    required String bolt11,
    required int amountSats,
  }) async =>
      _signingUnsupported();

  @override
  Future<RecipientNutzapInfo?> fetchRecipientNutzapInfo(
    String pubkeyHex,
  ) async =>
      null;

  @override
  Future<ActionOutcome> sendStationNutzap({
    required String stationEventId,
    required String stationPubkey,
    required String stationAddress,
    required int amountSats,
    String? comment,
  }) async =>
      _signingUnsupported();

  @override
  Future<List<MusicBrainzRecording>> searchRecordings({
    required String query,
    String? artist,
    int limit = 15,
  }) async =>
      const [];

  @override
  Future<List<YouTubeSearchResult>> searchYouTube({
    required String query,
    int limit = 5,
  }) async =>
      const [];

  @override
  Future<PreparedMedia> prepareYouTubeMedia({
    required String cacheRoot,
    required String videoId,
    required String format,
  }) async =>
      _signingUnsupported();

  @override
  Future<BlossomAuthResult> signBlossomUploadAuth({
    required String sha256,
    required String blossomUrl,
    required String format,
  }) async =>
      _signingUnsupported();

  @override
  Future<UploadedMedia> uploadMediaToBlossom({
    required String jobId,
    required String blossomUrl,
    required String signedAuthEventJson,
  }) async =>
      _signingUnsupported();

  @override
  Future<void> discardMediaJob(String jobId) async {}

  @override
  Future<ActionOutcome> attachSongAudioUrl({
    required String songId,
    required String audioUrl,
    String? youtubeId,
  }) async =>
      _signingUnsupported();

  @override
  Future<NostrProfile> fetchUserProfile(String pubkeyOrNpub) async =>
      NostrProfile(pubkey: pubkeyOrNpub, npub: pubkeyOrNpub);

  @override
  Future<List<SavedSong>> fetchSignalSongs({int limit = 80}) async => const [];

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
  }) async =>
      _signingUnsupported();

  @override
  Future<SignalChartsData> fetchSignalCharts() async =>
      const SignalChartsData();

  Future<void> _closeSocket() async {
    await _socketSub?.cancel();
    _socketSub = null;
    if (_socket != null) {
      try {
        await _socket!.close();
      } catch (_) {}
      _socket = null;
    }
    _failPending('Closed');
  }

  @override
  Future<void> dispose() async {
    await _closeSocket();
  }

  // ── Pure helpers (tested directly in unit tests) ──────────────────────────

  static String? _firstTag(List<dynamic> tags, String name) {
    for (final tag in tags) {
      if (tag is List && tag.length >= 2 && tag[0] == name && tag[1] is String) {
        final v = (tag[1] as String).trim();
        if (v.isNotEmpty) return v;
      }
    }
    return null;
  }

  static StationStream? _parseStreamTag(List<dynamic> tag) {
    if (tag.length < 4 || tag[0] != 'stream') return null;
    final url = (tag[1] as String? ?? '').trim().replaceAll('`', '');
    final format = (tag[2] as String? ?? '').trim();
    final qualityRaw = tag[3] as String?;
    if (url.isEmpty || format.isEmpty || qualityRaw == null) return null;
    try {
      final decoded = jsonDecode(qualityRaw);
      if (decoded is! Map<String, dynamic>) return null;
      return StationStream(
        url: url,
        format: format,
        quality: StreamQuality.fromJson(decoded),
        primary: tag.skip(4).contains('primary'),
      );
    } catch (_) {
      return null;
    }
  }

  static List<StationStream> sortStreams(List<StationStream> streams) {
    final copy = List<StationStream>.from(streams);
    copy.sort((a, b) {
      if (a.primary != b.primary) return a.primary ? -1 : 1;
      final aHttps = a.url.startsWith('https://');
      final bHttps = b.url.startsWith('https://');
      if (aHttps != bHttps) return aHttps ? -1 : 1;
      return b.quality.bitrate.compareTo(a.quality.bitrate);
    });
    return copy;
  }

  static Station? parseStationEvent(Map<String, dynamic> event) {
    if ((event['kind'] as num?)?.toInt() != stationKind) return null;
    final tags = event['tags'];
    if (tags is! List) return null;

    final stationId = _firstTag(tags, 'd');
    final pubkey = event['pubkey'] as String?;
    final id = event['id'] as String?;
    if (stationId == null || pubkey == null || id == null) return null;

    Map<String, dynamic>? contentJson;
    final contentRaw = event['content'];
    if (contentRaw is String && contentRaw.trim().startsWith('{')) {
      try {
        final decoded = jsonDecode(contentRaw);
        if (decoded is Map<String, dynamic>) contentJson = decoded;
      } catch (_) {}
    }

    final tagStreams = tags
        .whereType<List<dynamic>>()
        .map(_parseStreamTag)
        .whereType<StationStream>()
        .toList();

    List<StationStream> streams;
    if (tagStreams.isNotEmpty) {
      streams = sortStreams(tagStreams);
    } else if (contentJson != null && contentJson['streams'] is List) {
      streams = sortStreams(
        (contentJson['streams'] as List)
            .whereType<Map<String, dynamic>>()
            .map(StationStream.fromJson)
            .where((s) => s.url.isNotEmpty)
            .toList(),
      );
    } else {
      streams = const [];
    }

    if (streams.isEmpty) return null;

    final genres = <String>[];
    final languages = <String>[];
    for (final tag in tags) {
      if (tag is! List) continue;
      if (tag.length >= 3 && tag[0] == 'c' && tag[2] == 'genre') {
        final g = (tag[1] as String? ?? '').trim();
        if (g.isNotEmpty) genres.add(g);
      } else if (tag.length >= 2 && tag[0] == 'l') {
        final l = (tag[1] as String? ?? '').trim();
        if (l.isNotEmpty) languages.add(l);
      }
    }

    final address = '$stationKind:$pubkey:$stationId';
    return Station(
      id: id,
      pubkey: pubkey,
      stationId: stationId,
      address: address,
      naddr: address,
      createdAt: (event['created_at'] as num?)?.toInt() ?? 0,
      name: _firstTag(tags, 'name') ?? stationId,
      description: _firstTag(tags, 'description') ??
          (contentJson?['description'] as String?),
      thumbnail: _firstTag(tags, 'thumbnail'),
      website: _firstTag(tags, 'website'),
      location: _firstTag(tags, 'location'),
      countryCode: _firstTag(tags, 'country'),
      genres: genres,
      languages: languages,
      streams: streams,
      streamingServerUrl: contentJson?['streamingServerUrl'] as String?,
    );
  }

  static FeaturedList? parseFeaturedListEvent(Map<String, dynamic> event) {
    if ((event['kind'] as num?)?.toInt() != appDataKind) return null;
    final tags = event['tags'];
    if (tags is! List) return null;
    if (_firstTag(tags, 'l') != favoritesListLabel) return null;

    final favoritesId = _firstTag(tags, 'd');
    final pubkey = event['pubkey'] as String?;
    final id = event['id'] as String?;
    if (favoritesId == null || pubkey == null || id == null) return null;

    Map<String, dynamic>? contentJson;
    final contentRaw = event['content'];
    if (contentRaw is String && contentRaw.trim().startsWith('{')) {
      try {
        final decoded = jsonDecode(contentRaw);
        if (decoded is Map<String, dynamic>) contentJson = decoded;
      } catch (_) {}
    }

    final stationAddresses = <String>[];
    for (final tag in tags) {
      if (tag is List &&
          tag.length >= 2 &&
          tag[0] == 'a' &&
          tag[1] is String &&
          (tag[1] as String).startsWith('$stationKind:')) {
        stationAddresses.add(tag[1] as String);
      }
    }

    return FeaturedList(
      id: id,
      pubkey: pubkey,
      favoritesId: favoritesId,
      address: '$appDataKind:$pubkey:$favoritesId',
      name: _firstTag(tags, 'name') ??
          (contentJson?['name'] as String?) ??
          'Curated Collection',
      description: _firstTag(tags, 'description') ??
          (contentJson?['description'] as String?),
      image: contentJson?['image'] as String?,
      banner: contentJson?['banner'] as String?,
      stationAddresses: stationAddresses,
    );
  }

  static List<Station> deduplicateStations(List<Station> stations) {
    final map = <String, Station>{};
    for (final s in stations) {
      final existing = map[s.address];
      if (existing == null || s.createdAt > existing.createdAt) {
        map[s.address] = s;
      }
    }
    final list = map.values.toList();
    list.sort((a, b) {
      final cmp = b.createdAt.compareTo(a.createdAt);
      if (cmp != 0) return cmp;
      return a.name.toLowerCase().compareTo(b.name.toLowerCase());
    });
    return list;
  }

  static List<String> tokenize(String text) {
    return text
        .toLowerCase()
        .split(RegExp(r'[^a-z0-9]+'))
        .where((s) => s.isNotEmpty)
        .toList();
  }

  static bool matchesStationSearch(Station station, String query) {
    final terms = tokenize(query);
    if (terms.isEmpty) return true;

    final tokens = <String>{
      ...tokenize(station.name),
      if (station.description != null) ...tokenize(station.description!),
      if (station.location != null) ...tokenize(station.location!),
      if (station.website != null) ...tokenize(station.website!),
      if (station.countryCode != null) ...tokenize(station.countryCode!),
      for (final g in station.genres) ...tokenize(g),
      for (final l in station.languages) ...tokenize(l),
    };

    return terms.every(
      (term) => tokens.contains(term) || tokens.any((t) => t.startsWith(term)),
    );
  }

  static StationFacets computeFacets(List<Station> stations) {
    final genres = <String, int>{};
    final languages = <String, int>{};
    final countries = <String, int>{};

    for (final s in stations) {
      for (final g in s.genres) {
        final key = g.toLowerCase();
        genres[key] = (genres[key] ?? 0) + 1;
      }
      for (final l in s.languages) {
        final key = l.toLowerCase();
        languages[key] = (languages[key] ?? 0) + 1;
      }
      final cc = s.countryCode?.trim();
      if (cc != null && cc.isNotEmpty) {
        final key = cc.toUpperCase();
        countries[key] = (countries[key] ?? 0) + 1;
      }
    }

    List<FacetCount> toSorted(Map<String, int> m) {
      final items = m.entries
          .map((e) => FacetCount(name: e.key, count: e.value))
          .toList();
      items.sort((a, b) {
        final cmp = b.count.compareTo(a.count);
        return cmp != 0 ? cmp : a.name.compareTo(b.name);
      });
      return items;
    }

    return StationFacets(
      genres: toSorted(genres),
      languages: toSorted(languages),
      countries: toSorted(countries),
    );
  }
}

class _PendingReq {
  final List<Map<String, dynamic>> events = [];
  final Completer<List<Map<String, dynamic>>> completer = Completer();
}
