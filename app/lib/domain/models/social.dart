// Phase 2 domain models: identity, social interactions, community feed, song crates.

enum SignerKind { localKey, bunker, amber }

class GeneratedAccount {
  const GeneratedAccount({
    required this.pubkey,
    required this.npub,
    required this.nsec,
  });

  final String pubkey;
  final String npub;
  final String nsec;
}

class NostrProfile {
  const NostrProfile({
    required this.pubkey,
    required this.npub,
    this.name,
    this.displayName,
    this.picture,
    this.nip05,
    this.about,
    this.lud16,
    this.lud06,
  });

  final String pubkey;
  final String npub;
  final String? name;
  final String? displayName;
  final String? picture;
  final String? nip05;
  final String? about;
  final String? lud16;
  final String? lud06;

  String get label {
    if (displayName != null && displayName!.trim().isNotEmpty) {
      return displayName!.trim();
    }
    if (name != null && name!.trim().isNotEmpty) {
      return name!.trim();
    }
    if (npub.length > 16) {
      return '${npub.substring(0, 10)}...${npub.substring(npub.length - 6)}';
    }
    return npub;
  }
}

class AccountSession {
  const AccountSession({
    required this.pubkey,
    required this.npub,
    required this.signerKind,
    this.profile,
    this.amberPackage,
  });

  final String pubkey;
  final String npub;
  final SignerKind signerKind;
  final NostrProfile? profile;
  final String? amberPackage;

  String get displayName => profile?.label ?? shortNpub;

  String get shortNpub => npub.length > 16
      ? '${npub.substring(0, 10)}...${npub.substring(npub.length - 6)}'
      : npub;

  String get signerBadge {
    switch (signerKind) {
      case SignerKind.localKey:
        return 'LOCAL NSEC';
      case SignerKind.bunker:
        return 'NIP-46 BUNKER';
      case SignerKind.amber:
        return 'NIP-55 AMBER';
    }
  }
}

class BunkerLoginResult {
  const BunkerLoginResult({
    required this.session,
    required this.bunkerUri,
    required this.appNsec,
  });

  final AccountSession session;
  final String bunkerUri;
  final String appNsec;
}

class NostrConnectChallenge {
  const NostrConnectChallenge({
    required this.sessionId,
    required this.connectUri,
    required this.appNsec,
  });

  final String sessionId;
  final String connectUri;
  final String appNsec;
}

class ActionOutcome {
  const ActionOutcome({
    required this.published,
    this.eventId,
    this.unsignedEventJson,
    this.targetAddress,
  });

  final bool published;
  final String? eventId;
  final String? unsignedEventJson;
  final String? targetAddress;
}

class StationComment {
  const StationComment({
    required this.id,
    required this.pubkey,
    required this.authorName,
    this.authorPicture,
    required this.content,
    required this.createdAt,
    this.parentId,
    this.depth = 0,
  });

  final String id;
  final String pubkey;
  final String authorName;
  final String? authorPicture;
  final String content;
  final int createdAt;
  final String? parentId;
  final int depth;
}

class StationSocialSummary {
  const StationSocialSummary({
    required this.stationAddress,
    this.reactionCount = 0,
    this.userReacted = false,
    this.commentCount = 0,
    this.zapCount = 0,
    this.zapSats = 0,
    this.userZapped = false,
    this.comments = const [],
  });

  final String stationAddress;
  final int reactionCount;
  final bool userReacted;
  final int commentCount;
  final int zapCount;
  final int zapSats;
  final bool userZapped;
  final List<StationComment> comments;
}

class StationCardCounts {
  const StationCardCounts({
    required this.stationAddress,
    this.reactionCount = 0,
    this.userReacted = false,
    this.commentCount = 0,
    this.zapCount = 0,
    this.zapSats = 0,
    this.userZapped = false,
  });

  final String stationAddress;
  final int reactionCount;
  final bool userReacted;
  final int commentCount;
  final int zapCount;
  final int zapSats;
  final bool userZapped;

  StationCardCounts copyWith({
    int? reactionCount,
    bool? userReacted,
    int? commentCount,
    int? zapCount,
    int? zapSats,
    bool? userZapped,
  }) =>
      StationCardCounts(
        stationAddress: stationAddress,
        reactionCount: reactionCount ?? this.reactionCount,
        userReacted: userReacted ?? this.userReacted,
        commentCount: commentCount ?? this.commentCount,
        zapCount: zapCount ?? this.zapCount,
        zapSats: zapSats ?? this.zapSats,
        userZapped: userZapped ?? this.userZapped,
      );
}

class NwcWalletStatus {
  const NwcWalletStatus({
    this.connected = false,
    this.walletPubkey,
    this.relay,
    this.lud16,
    this.balanceSats,
  });

  final bool connected;
  final String? walletPubkey;
  final String? relay;
  final String? lud16;
  final int? balanceSats;
}

class ZapInvoiceResult {
  const ZapInvoiceResult({
    this.bolt11,
    required this.amountSats,
    required this.recipientLud16,
    required this.allowsNostr,
    required this.callbackUrl,
    this.unsignedZapRequestJson,
  });

  final String? bolt11;
  final int amountSats;
  final String recipientLud16;
  final bool allowsNostr;
  final String callbackUrl;
  final String? unsignedZapRequestJson;
}

class ZapPaymentResult {
  const ZapPaymentResult({
    required this.preimage,
    required this.amountSats,
    required this.bolt11,
  });

  final String preimage;
  final int amountSats;
  final String bolt11;
}

class CommunityPost {
  const CommunityPost({
    required this.id,
    required this.pubkey,
    required this.authorName,
    this.authorPicture,
    required this.content,
    required this.createdAt,
    this.categories = const [],
    this.isReply = false,
    this.parentId,
    this.rootId,
    this.replyCount = 0,
  });

  final String id;
  final String pubkey;
  final String authorName;
  final String? authorPicture;
  final String content;
  final int createdAt;
  final List<String> categories;
  final bool isReply;
  final String? parentId;
  final String? rootId;
  final int replyCount;
}

class SavedSong {
  const SavedSong({
    required this.id,
    required this.pubkey,
    required this.songId,
    required this.address,
    required this.title,
    this.artist,
    this.album,
    this.coverArt,
    this.thumb,
    this.durationSecs,
    this.releaseYear,
    this.mbid,
    this.audioUrl,
    this.genres = const [],
    this.createdAt = 0,
  });

  final String id;
  final String pubkey;
  final String songId;
  final String address;
  final String title;
  final String? artist;
  final String? album;
  final String? coverArt;
  final String? thumb;
  final int? durationSecs;
  final int? releaseYear;
  final String? mbid;
  final String? audioUrl;
  final List<String> genres;
  final int createdAt;

  String get subtitle {
    final parts = <String>[];
    if (artist != null && artist!.trim().isNotEmpty) parts.add(artist!.trim());
    if (album != null && album!.trim().isNotEmpty) parts.add(album!.trim());
    if (releaseYear != null) parts.add('$releaseYear');
    return parts.isEmpty ? 'SAVED TRACK' : parts.join(' • ');
  }
}

class SongCrate {
  const SongCrate({
    this.listId = 'liked-songs',
    this.address = '',
    this.name = 'Liked Songs',
    this.description,
    this.songAddresses = const [],
    this.songs = const [],
  });

  final String listId;
  final String address;
  final String name;
  final String? description;
  final List<String> songAddresses;
  final List<SavedSong> songs;
}

class CashuMintBalance {
  const CashuMintBalance({
    required this.mintUrl,
    this.balanceSats = 0,
  });

  final String mintUrl;
  final int balanceSats;

  String get displayHost {
    final uri = Uri.tryParse(mintUrl);
    if (uri != null && uri.host.isNotEmpty) return uri.host;
    return mintUrl;
  }
}

class CashuWalletStatus {
  const CashuWalletStatus({
    this.initialized = false,
    this.totalBalanceSats = 0,
    this.mints = const [],
    this.nip60Synced = false,
    this.walletRelays = const [],
    this.tokenEventCount = 0,
  });

  final bool initialized;
  final int totalBalanceSats;
  final List<CashuMintBalance> mints;
  final bool nip60Synced;
  final List<String> walletRelays;
  final int tokenEventCount;
}

class Nip60RawTokenEvent {
  const Nip60RawTokenEvent({
    required this.id,
    required this.createdAt,
    required this.content,
  });

  final String id;
  final int createdAt;
  final String content;
}

class Nip60RawEvents {
  const Nip60RawEvents({
    this.walletEventContent,
    this.tokenEvents = const [],
    this.deletedIds = const [],
    this.walletRelays = const [],
    this.discoveredMints = const [],
  });

  final String? walletEventContent;
  final List<Nip60RawTokenEvent> tokenEvents;
  final List<String> deletedIds;
  final List<String> walletRelays;
  final List<String> discoveredMints;
}

class Nip60DecryptedTokenEvent {
  const Nip60DecryptedTokenEvent({
    required this.id,
    required this.plaintext,
  });

  final String id;
  final String plaintext;
}

class CashuMintQuoteInfo {
  const CashuMintQuoteInfo({
    required this.mintUrl,
    required this.quoteId,
    required this.bolt11,
    required this.amountSats,
  });

  final String mintUrl;
  final String quoteId;
  final String bolt11;
  final int amountSats;
}

class CashuReceiveResult {
  const CashuReceiveResult({
    required this.receivedSats,
    required this.mintUrl,
    required this.status,
  });

  final int receivedSats;
  final String mintUrl;
  final CashuWalletStatus status;
}

class CashuSendResult {
  const CashuSendResult({
    required this.token,
    required this.amountSats,
    required this.mintUrl,
    required this.status,
  });

  final String token;
  final int amountSats;
  final String mintUrl;
  final CashuWalletStatus status;
}

class RecipientNutzapInfo {
  const RecipientNutzapInfo({
    required this.pubkey,
    this.p2pkPubkey,
    this.mints = const [],
    this.relays = const [],
  });

  final String pubkey;
  final String? p2pkPubkey;
  final List<String> mints;
  final List<String> relays;

  bool get acceptsNutzaps => mints.isNotEmpty;
}

class MusicBrainzRecording {
  const MusicBrainzRecording({
    required this.id,
    required this.title,
    required this.artist,
    this.artistId,
    this.release,
    this.releaseId,
    this.releaseDate,
    this.durationMs,
    this.score = 0,
    this.tags = const [],
  });

  final String id;
  final String title;
  final String artist;
  final String? artistId;
  final String? release;
  final String? releaseId;
  final String? releaseDate;
  final int? durationMs;
  final int score;
  final List<String> tags;

  String? get formattedDuration {
    final ms = durationMs;
    if (ms == null || ms <= 0) return null;
    final secs = ms ~/ 1000;
    final m = secs ~/ 60;
    final s = secs % 60;
    return '$m:${s.toString().padLeft(2, '0')}';
  }

  String? get releaseYear {
    final d = releaseDate?.trim();
    if (d == null || d.length < 4) return null;
    return d.substring(0, 4);
  }
}

class YouTubeSearchResult {
  const YouTubeSearchResult({
    required this.videoId,
    required this.url,
    required this.title,
    this.durationSecs,
    this.channel,
    this.thumbnailUrl,
  });

  final String videoId;
  final String url;
  final String title;
  final int? durationSecs;
  final String? channel;
  final String? thumbnailUrl;

  String? get formattedDuration {
    final secs = durationSecs;
    if (secs == null || secs <= 0) return null;
    final m = secs ~/ 60;
    final s = secs % 60;
    return '$m:${s.toString().padLeft(2, '0')}';
  }
}

class PreparedMedia {
  const PreparedMedia({
    required this.jobId,
    required this.sha256,
    required this.size,
    required this.mimeType,
  });

  final String jobId;
  final String sha256;
  final int size;
  final String mimeType;
}

class UploadedMedia {
  const UploadedMedia({
    required this.url,
    required this.sha256,
    required this.size,
    required this.mimeType,
  });

  final String url;
  final String sha256;
  final int size;
  final String mimeType;
}

class BlossomAuthResult {
  const BlossomAuthResult({
    this.signedEventJson,
    this.unsignedEventJson,
  });

  final String? signedEventJson;
  final String? unsignedEventJson;
}
