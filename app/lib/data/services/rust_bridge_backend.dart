import 'dart:io';

import 'package:flutter/foundation.dart';
import 'package:flutter_rust_bridge/flutter_rust_bridge_for_generated.dart';

import '../../domain/models/now_playing.dart';
import '../../domain/models/social.dart';
import '../../domain/models/station.dart';
import '../../src/rust/api/wavefunc.dart' as frb;
import '../../src/rust/frb_generated.dart';
import 'relay_websocket_backend.dart';
import 'wavefunc_backend.dart';

/// Production backend powered by `crates/wavefunc-core` (`rust-nostr` + ContextVM)
/// via `flutter_rust_bridge`.
class RustBridgeBackend implements WavefuncBackend {
  @override
  String get engineLabel => 'RUST_WAVEFUNC_CORE';

  @override
  bool get supportsSigning => true;

  @override
  Future<RelayStatus> connectRelay(String relayUrl) async {
    final res = await frb.connectRelay(relayUrl: relayUrl);
    return _mapRelayStatus(res);
  }

  @override
  Future<RelayStatus> getRelayStatus() async {
    final res = await frb.getRelayStatus();
    return _mapRelayStatus(res);
  }

  @override
  Future<List<Station>> fetchStations({int limit = 250}) async {
    final list = await frb.fetchStations(limit: limit);
    return list.map(_mapStation).toList();
  }

  @override
  Future<List<Station>> searchStations({
    String? query,
    String? genre,
    String? country,
    String? language,
    int limit = 150,
  }) async {
    final list = await frb.searchStations(
      query: query,
      genre: genre,
      country: country,
      language: language,
      limit: limit,
    );
    return list.map(_mapStation).toList();
  }

  @override
  Future<Station?> fetchStationByAddress(String address) async {
    final station = await frb.fetchStationByAddress(address: address);
    return station == null ? null : _mapStation(station);
  }

  @override
  Future<List<Station>> fetchStationsByAddresses(List<String> addresses) async {
    final list = await frb.fetchStationsByAddresses(addresses: addresses);
    return list.map(_mapStation).toList();
  }

  @override
  Future<List<FeaturedList>> fetchFeaturedLists() async {
    final lists = await frb.fetchFeaturedLists();
    return lists.map(_mapFeaturedList).toList();
  }

  @override
  Future<StationFacets> getStationFacets() async {
    final facets = await frb.getStationFacets();
    return StationFacets(
      genres: facets.genres
          .map((f) => FacetCount(name: f.name, count: f.count))
          .toList(),
      languages: facets.languages
          .map((f) => FacetCount(name: f.name, count: f.count))
          .toList(),
      countries: facets.countries
          .map((f) => FacetCount(name: f.name, count: f.count))
          .toList(),
    );
  }

  @override
  Future<NowPlayingMetadata?> extractStreamMetadata({
    required String streamUrl,
    String? stationAddress,
    String? sessionId,
  }) async {
    final meta = await frb.extractStreamMetadata(
      streamUrl: streamUrl,
      stationAddress: stationAddress,
      sessionId: sessionId,
    );
    return NowPlayingMetadata(
      title: meta.title,
      artist: meta.artist,
      song: meta.song,
      station: meta.station,
      genre: meta.genre,
      bitrate: meta.bitrate,
      description: meta.description,
      listeners: meta.listeners,
      source: meta.source,
      album: meta.album,
      releaseDate: meta.releaseDate,
      durationMs: meta.durationMs?.toInt(),
      mbid: meta.mbid,
      confidence: meta.confidence,
    );
  }

  // ── Phase 2 ───────────────────────────────────────────────────────────────

  @override
  Future<GeneratedAccount> generateAccount() async {
    final gen = await frb.generateAccount();
    return GeneratedAccount(
      pubkey: gen.pubkey,
      npub: gen.npub,
      nsec: gen.nsec,
    );
  }

  @override
  Future<AccountSession> loginWithNsec(String secret) async {
    final res = await frb.loginWithNsec(secret: secret);
    return _mapSession(res);
  }

  @override
  Future<BunkerLoginResult> loginWithBunker(
    String bunkerUri, {
    String? appNsec,
  }) async {
    final res = await frb.loginWithBunker(
      bunkerUri: bunkerUri,
      appNsec: appNsec,
    );
    return BunkerLoginResult(
      session: _mapSession(res.session),
      bunkerUri: res.bunkerUri,
      appNsec: res.appNsec,
    );
  }

  @override
  Future<AccountSession> loginWithAmber(String pubkeyOrNpub) async {
    final res = await frb.loginWithAmber(pubkeyOrNpub: pubkeyOrNpub);
    return _mapSession(res);
  }

  @override
  Future<NostrConnectChallenge> startNostrConnectSession({
    String? relayUrl,
    String? clientName,
  }) async {
    final res = await frb.startNostrConnectSession(
      relayUrl: relayUrl,
      clientName: clientName,
    );
    return NostrConnectChallenge(
      sessionId: res.sessionId,
      connectUri: res.connectUri,
      appNsec: res.appNsec,
    );
  }

  @override
  Future<BunkerLoginResult> awaitNostrConnectSession(String sessionId) async {
    final res = await frb.awaitNostrConnectSession(sessionId: sessionId);
    return BunkerLoginResult(
      session: _mapSession(res.session),
      bunkerUri: res.bunkerUri,
      appNsec: res.appNsec,
    );
  }

  @override
  Future<void> cancelNostrConnectSession(String sessionId) =>
      frb.cancelNostrConnectSession(sessionId: sessionId);

  @override
  Future<ActionOutcome> publishProfile({
    String? name,
    String? about,
    String? picture,
    String? lud16,
  }) async {
    final res = await frb.publishProfile(
      name: name,
      about: about,
      picture: picture,
      lud16: lud16,
    );
    return _mapOutcome(res);
  }

  @override
  Future<void> logoutAccount() => frb.logoutAccount();

  @override
  Future<AccountSession?> currentAccount() async {
    final res = await frb.currentAccount();
    return res == null ? null : _mapSession(res);
  }

  @override
  Future<ActionOutcome> publishSignedEvent(String signedEventJson) async {
    final res = await frb.publishSignedEvent(signedEventJson: signedEventJson);
    return _mapOutcome(res);
  }

  @override
  Future<List<FeaturedList>> fetchUserFavorites() async {
    final lists = await frb.fetchUserFavorites();
    return lists.map(_mapFeaturedList).toList();
  }

  @override
  Future<ActionOutcome> toggleFavoriteStation(
    String stationAddress, {
    required bool add,
  }) async {
    final res = await frb.toggleFavoriteStation(
      stationAddress: stationAddress,
      add: add,
    );
    return _mapOutcome(res);
  }

  @override
  Future<ActionOutcome> createFavoritesList({
    required String name,
    String? description,
    List<String> stationAddresses = const [],
  }) async {
    final res = await frb.createFavoritesList(
      name: name,
      description: description,
      stationAddresses: stationAddresses,
    );
    return _mapOutcome(res);
  }

  @override
  Future<ActionOutcome> updateFavoritesList({
    required String favoritesId,
    required String name,
    String? description,
  }) async {
    final res = await frb.updateFavoritesList(
      favoritesId: favoritesId,
      name: name,
      description: description,
    );
    return _mapOutcome(res);
  }

  @override
  Future<ActionOutcome> deleteFavoritesList({
    required String eventId,
    required String favoritesId,
  }) async {
    final res = await frb.deleteFavoritesList(
      eventId: eventId,
      favoritesId: favoritesId,
    );
    return _mapOutcome(res);
  }

  @override
  Future<ActionOutcome> toggleStationInFavoritesList({
    String? favoritesId,
    required String stationAddress,
    required bool add,
  }) async {
    final res = await frb.toggleStationInFavoritesList(
      favoritesId: favoritesId,
      stationAddress: stationAddress,
      add: add,
    );
    return _mapOutcome(res);
  }

  @override
  Future<StationSocialSummary> fetchStationSocial({
    required String stationAddress,
    required String stationEventId,
  }) async {
    final res = await frb.fetchStationSocial(
      stationAddress: stationAddress,
      stationEventId: stationEventId,
    );
    return StationSocialSummary(
      stationAddress: res.stationAddress,
      reactionCount: res.reactionCount,
      userReacted: res.userReacted,
      commentCount: res.commentCount,
      zapCount: res.zapCount,
      zapSats: res.zapSats.toInt(),
      userZapped: res.userZapped,
      comments: res.comments
          .map(
            (c) => StationComment(
              id: c.id,
              pubkey: c.pubkey,
              authorName: c.authorName,
              authorPicture: c.authorPicture,
              content: c.content,
              createdAt: c.createdAt.toInt(),
              parentId: c.parentId,
              depth: c.depth,
            ),
          )
          .toList(),
    );
  }

  @override
  Future<ActionOutcome> reactToStation({
    required String stationId,
    required String stationPubkey,
    required String stationAddress,
  }) async {
    final res = await frb.reactToStation(
      stationId: stationId,
      stationPubkey: stationPubkey,
      stationAddress: stationAddress,
    );
    return _mapOutcome(res);
  }

  @override
  Future<ActionOutcome> postStationComment({
    required String stationEventId,
    required String stationPubkey,
    required String stationAddress,
    required String content,
    String? replyToId,
    String? replyToPubkey,
  }) async {
    final res = await frb.postStationComment(
      stationEventId: stationEventId,
      stationPubkey: stationPubkey,
      stationAddress: stationAddress,
      content: content,
      replyToId: replyToId,
      replyToPubkey: replyToPubkey,
    );
    return _mapOutcome(res);
  }

  @override
  Future<List<CommunityPost>> fetchCommunityPosts({int limit = 80}) async {
    final list = await frb.fetchCommunityPosts(limit: limit);
    return list
        .map(
          (p) => CommunityPost(
            id: p.id,
            pubkey: p.pubkey,
            authorName: p.authorName,
            authorPicture: p.authorPicture,
            content: p.content,
            createdAt: p.createdAt.toInt(),
            categories: p.categories,
            isReply: p.isReply,
            parentId: p.parentId,
            rootId: p.rootId,
            replyCount: p.replyCount,
          ),
        )
        .toList();
  }

  @override
  Future<ActionOutcome> postCommunityNote({
    required String content,
    String? category,
    String? replyToId,
    String? replyToPubkey,
    String? rootId,
    String? rootPubkey,
  }) async {
    final res = await frb.postCommunityNote(
      content: content,
      category: category,
      replyToId: replyToId,
      replyToPubkey: replyToPubkey,
      rootId: rootId,
      rootPubkey: rootPubkey,
    );
    return _mapOutcome(res);
  }

  @override
  Future<SongCrate> fetchSongCrate() async {
    final crate = await frb.fetchSongCrate();
    return SongCrate(
      listId: crate.listId,
      address: crate.address,
      name: crate.name,
      description: crate.description,
      songAddresses: crate.songAddresses,
      songs: crate.songs
          .map(
            (s) => SavedSong(
              id: s.id,
              pubkey: s.pubkey,
              songId: s.songId,
              address: s.address,
              title: s.title,
              artist: s.artist,
              album: s.album,
              coverArt: s.coverArt,
              thumb: s.thumb,
              durationSecs: s.durationSecs,
              releaseYear: s.releaseYear,
              mbid: s.mbid,
              audioUrl: s.audioUrl,
              genres: s.genres,
              createdAt: s.createdAt.toInt(),
            ),
          )
          .toList(),
    );
  }

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
  }) async {
    final res = await frb.createSongEvent(
      title: title,
      artist: artist,
      album: album,
      mbid: mbid,
      releaseId: releaseId,
      releaseDate: releaseDate,
      durationMs: durationMs != null ? BigInt.from(durationMs) : null,
      genres: genres,
    );
    return _mapOutcome(res);
  }

  @override
  Future<ActionOutcome> updateSongCrate({
    required String songAddress,
    required bool add,
  }) async {
    final res = await frb.updateSongCrate(songAddress: songAddress, add: add);
    return _mapOutcome(res);
  }

  @override
  Future<ActionOutcome> publishListeningStatus({
    String? title,
    String? artist,
    String? stationAddress,
    String? stationUrl,
  }) async {
    final res = await frb.publishListeningStatus(
      title: title,
      artist: artist,
      stationAddress: stationAddress,
      stationUrl: stationUrl,
    );
    return _mapOutcome(res);
  }

  @override
  Future<List<StationCardCounts>> fetchStationsSocialCounts(
    List<String> addresses,
  ) async {
    final list = await frb.fetchStationsSocialCounts(addresses: addresses);
    return list
        .map(
          (c) => StationCardCounts(
            stationAddress: c.stationAddress,
            reactionCount: c.reactionCount,
            userReacted: c.userReacted,
            commentCount: c.commentCount,
            zapCount: c.zapCount,
            zapSats: c.zapSats.toInt(),
            userZapped: c.userZapped,
          ),
        )
        .toList();
  }

  @override
  Future<NwcWalletStatus> connectNwc(String nwcUri) async {
    final res = await frb.connectNwc(nwcUri: nwcUri);
    return _mapNwcStatus(res);
  }

  @override
  Future<void> disconnectNwc() => frb.disconnectNwc();

  @override
  Future<NwcWalletStatus> getNwcStatus() async {
    final res = await frb.getNwcStatus();
    return _mapNwcStatus(res);
  }

  @override
  Future<NwcWalletStatus> refreshNwcBalance() async {
    final res = await frb.refreshNwcBalance();
    return _mapNwcStatus(res);
  }

  @override
  Future<ZapInvoiceResult> prepareStationZap({
    required String stationPubkey,
    required String stationAddress,
    required int amountSats,
    String? comment,
  }) async {
    final res = await frb.prepareStationZap(
      stationPubkey: stationPubkey,
      stationAddress: stationAddress,
      amountSats: BigInt.from(amountSats),
      comment: comment,
    );
    return _mapZapInvoice(res);
  }

  @override
  Future<ZapInvoiceResult> completeStationZapWithSignedRequest({
    required String callbackUrl,
    required int amountSats,
    String? comment,
    required String signedZapRequestJson,
    required String recipientLud16,
  }) async {
    final res = await frb.completeStationZapWithSignedRequest(
      callbackUrl: callbackUrl,
      amountSats: BigInt.from(amountSats),
      comment: comment,
      signedZapRequestJson: signedZapRequestJson,
      recipientLud16: recipientLud16,
    );
    return _mapZapInvoice(res);
  }

  @override
  Future<ZapPaymentResult> payInvoiceNwc({
    required String bolt11,
    required int amountSats,
  }) async {
    final res = await frb.payInvoiceNwc(
      bolt11: bolt11,
      amountSats: BigInt.from(amountSats),
    );
    return ZapPaymentResult(
      preimage: res.preimage,
      amountSats: res.amountSats.toInt(),
      bolt11: res.bolt11,
    );
  }

  @override
  Future<bool> checkStationZapReceipt({
    required String stationAddress,
    required String bolt11,
    required int sinceUnix,
  }) =>
      frb.checkStationZapReceipt(
        stationAddress: stationAddress,
        bolt11: bolt11,
        sinceUnix: BigInt.from(sinceUnix),
      );

  @override
  Future<CashuWalletStatus> initCashuWallet({
    required String dbDir,
    required String seedMaterial,
    List<String> mints = const [],
  }) async {
    final res = await frb.initCashuWallet(
      dbDir: dbDir,
      seedMaterial: seedMaterial,
      mints: mints,
    );
    return _mapCashuStatus(res);
  }

  @override
  Future<CashuWalletStatus> getCashuStatus() async {
    final res = await frb.getCashuStatus();
    return _mapCashuStatus(res);
  }

  @override
  Future<CashuWalletStatus> addCashuMint(String mintUrl) async {
    final res = await frb.addCashuMint(mintUrl: mintUrl);
    return _mapCashuStatus(res);
  }

  @override
  Future<CashuMintQuoteInfo> createCashuMintQuote({
    required String mintUrl,
    required int amountSats,
  }) async {
    final res = await frb.createCashuMintQuote(
      mintUrl: mintUrl,
      amountSats: BigInt.from(amountSats),
    );
    return CashuMintQuoteInfo(
      mintUrl: res.mintUrl,
      quoteId: res.quoteId,
      bolt11: res.bolt11,
      amountSats: res.amountSats.toInt(),
    );
  }

  @override
  Future<CashuWalletStatus> claimCashuMintQuote({
    required String mintUrl,
    required String quoteId,
  }) async {
    final res = await frb.claimCashuMintQuote(
      mintUrl: mintUrl,
      quoteId: quoteId,
    );
    return _mapCashuStatus(res);
  }

  @override
  Future<CashuReceiveResult> receiveCashuToken(String token) async {
    final res = await frb.receiveCashuToken(token: token);
    return CashuReceiveResult(
      receivedSats: res.receivedSats.toInt(),
      mintUrl: res.mintUrl,
      status: _mapCashuStatus(res.status),
    );
  }

  @override
  Future<CashuSendResult> sendCashuToken({
    String? mintUrl,
    required int amountSats,
    String? memo,
  }) async {
    final res = await frb.sendCashuToken(
      mintUrl: mintUrl,
      amountSats: BigInt.from(amountSats),
      memo: memo,
    );
    return CashuSendResult(
      token: res.token,
      amountSats: res.amountSats.toInt(),
      mintUrl: res.mintUrl,
      status: _mapCashuStatus(res.status),
    );
  }

  @override
  Future<ZapPaymentResult> payInvoiceCashu({
    String? mintUrl,
    required String bolt11,
    required int amountSats,
  }) async {
    final res = await frb.payInvoiceCashu(
      mintUrl: mintUrl,
      bolt11: bolt11,
      amountSats: BigInt.from(amountSats),
    );
    return ZapPaymentResult(
      preimage: res.preimage,
      amountSats: res.amountSats.toInt(),
      bolt11: res.bolt11,
    );
  }

  @override
  Future<RecipientNutzapInfo?> fetchRecipientNutzapInfo(
    String pubkeyHex,
  ) async {
    final res = await frb.fetchRecipientNutzapInfo(pubkeyHex: pubkeyHex);
    if (res == null) return null;
    return RecipientNutzapInfo(
      pubkey: res.pubkey,
      p2pkPubkey: res.p2PkPubkey,
      mints: res.mints,
      relays: res.relays,
    );
  }

  @override
  Future<ActionOutcome> sendStationNutzap({
    required String stationEventId,
    required String stationPubkey,
    required String stationAddress,
    required int amountSats,
    String? comment,
  }) async {
    final res = await frb.sendStationNutzap(
      stationEventId: stationEventId,
      stationPubkey: stationPubkey,
      stationAddress: stationAddress,
      amountSats: BigInt.from(amountSats),
      comment: comment,
    );
    return _mapOutcome(res);
  }

  @override
  Future<void> dispose() async {}

  // ── Mappers ───────────────────────────────────────────────────────────────

  RelayStatus _mapRelayStatus(frb.FrbRelayStatus v) => RelayStatus(
        relayUrl: v.relayUrl,
        connected: v.connected,
        totalStationCount: v.totalStationCount?.toInt(),
        engineLabel: engineLabel,
      );

  AccountSession _mapSession(frb.FrbAccountSessionInfo v) => AccountSession(
        pubkey: v.pubkey,
        npub: v.npub,
        signerKind: switch (v.signerKind) {
          frb.FrbSignerKind.localKey => SignerKind.localKey,
          frb.FrbSignerKind.bunker => SignerKind.bunker,
          frb.FrbSignerKind.amber => SignerKind.amber,
        },
        profile: v.profile == null
            ? null
            : NostrProfile(
                pubkey: v.profile!.pubkey,
                npub: v.profile!.npub,
                name: v.profile!.name,
                displayName: v.profile!.displayName,
                picture: v.profile!.picture,
                nip05: v.profile!.nip05,
                about: v.profile!.about,
                lud16: v.profile!.lud16,
                lud06: v.profile!.lud06,
              ),
      );

  NwcWalletStatus _mapNwcStatus(frb.FrbNwcWalletStatus v) => NwcWalletStatus(
        connected: v.connected,
        walletPubkey: v.walletPubkey,
        relay: v.relay,
        lud16: v.lud16,
        balanceSats: v.balanceSats?.toInt(),
      );

  CashuWalletStatus _mapCashuStatus(frb.FrbCashuWalletStatus v) =>
      CashuWalletStatus(
        initialized: v.initialized,
        totalBalanceSats: v.totalBalanceSats.toInt(),
        mints: v.mints
            .map(
              (m) => CashuMintBalance(
                mintUrl: m.mintUrl,
                balanceSats: m.balanceSats.toInt(),
              ),
            )
            .toList(),
      );

  ZapInvoiceResult _mapZapInvoice(frb.FrbZapInvoiceResult v) =>
      ZapInvoiceResult(
        bolt11: v.bolt11,
        amountSats: v.amountSats.toInt(),
        recipientLud16: v.recipientLud16,
        allowsNostr: v.allowsNostr,
        callbackUrl: v.callbackUrl,
        unsignedZapRequestJson: v.unsignedZapRequestJson,
      );

  ActionOutcome _mapOutcome(frb.FrbActionOutcome v) => ActionOutcome(
        published: v.published,
        eventId: v.eventId,
        unsignedEventJson: v.unsignedEventJson,
        targetAddress: v.targetAddress,
      );

  Station _mapStation(frb.FrbStation v) => Station(
        id: v.id,
        pubkey: v.pubkey,
        stationId: v.stationId,
        address: v.address,
        naddr: v.naddr,
        createdAt: v.createdAt.toInt(),
        name: v.name,
        description: v.description,
        thumbnail: v.thumbnail,
        website: v.website,
        location: v.location,
        countryCode: v.countryCode,
        genres: v.genres,
        languages: v.languages,
        streams: v.streams
            .map(
              (s) => StationStream(
                url: s.url,
                format: s.format,
                quality: StreamQuality(
                  bitrate: s.quality.bitrate,
                  codec: s.quality.codec,
                  sampleRate: s.quality.sampleRate,
                ),
                primary: s.primary,
              ),
            )
            .toList(),
        streamingServerUrl: v.streamingServerUrl,
      );

  FeaturedList _mapFeaturedList(frb.FrbFeaturedList v) => FeaturedList(
        id: v.id,
        pubkey: v.pubkey,
        favoritesId: v.favoritesId,
        address: v.address,
        name: v.name,
        description: v.description,
        image: v.image,
        banner: v.banner,
        stationAddresses: v.stationAddresses,
      );
}

/// Initializes the Rust `wavefunc-core` FFI library when present for this platform,
/// falling back gracefully to `RelayWebSocketBackend` otherwise.
Future<WavefuncBackend> createWavefuncBackend() async {
  try {
    ExternalLibrary? externalLibrary;
    if (!kIsWeb && Platform.isMacOS) {
      // Load from the app bundle Frameworks dir (`Contents/Frameworks/libwavefunc_bridge.dylib`)
      // with fallback to the local dev artifact when running outside an app bundle.
      final exeDir = File(Platform.resolvedExecutable).parent.path;
      for (final candidate in [
        '$exeDir/../Resources/libwavefunc_bridge.dylib',
        '$exeDir/../Frameworks/libwavefunc_bridge.dylib',
        'libwavefunc_bridge.dylib',
        'macos/Runner/Frameworks/libwavefunc_bridge.dylib',
        'rust/target/release/libwavefunc_bridge.dylib',
      ]) {
        try {
          externalLibrary = ExternalLibrary.open(candidate);
          break;
        } catch (_) {}
      }
    } else if (!kIsWeb && Platform.isLinux) {
      for (final candidate in const [
        'libwavefunc_bridge.so',
        'linux/lib/libwavefunc_bridge.so',
        'rust/target/release/libwavefunc_bridge.so',
      ]) {
        try {
          externalLibrary = ExternalLibrary.open(candidate);
          break;
        } catch (_) {}
      }
    } else if (!kIsWeb && Platform.isWindows) {
      for (final candidate in const [
        'wavefunc_bridge.dll',
        'windows/lib/wavefunc_bridge.dll',
      ]) {
        try {
          externalLibrary = ExternalLibrary.open(candidate);
          break;
        } catch (_) {}
      }
    }

    await RustLib.init(externalLibrary: externalLibrary);
    debugPrint('[WaveFunc] Initialized native Rust wavefunc-core bridge.');
    return RustBridgeBackend();
  } catch (error) {
    debugPrint(
      '[WaveFunc] Native Rust bridge unavailable ($error); '
      'using pure-Dart WebSocket fallback.',
    );
    return RelayWebSocketBackend();
  }
}
