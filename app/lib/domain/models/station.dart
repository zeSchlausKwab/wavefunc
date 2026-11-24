// Immutable domain models mirroring `crates/wavefunc-core/src/models.rs`.

class StreamQuality {
  const StreamQuality({
    required this.bitrate,
    required this.codec,
    required this.sampleRate,
  });

  final int bitrate;
  final String codec;
  final int sampleRate;

  factory StreamQuality.fromJson(Map<String, dynamic> json) {
    return StreamQuality(
      bitrate: (json['bitrate'] as num?)?.toInt() ?? 0,
      codec: (json['codec'] as String?) ?? '',
      sampleRate: (json['sampleRate'] as num?)?.toInt() ?? 44100,
    );
  }
}

class StationStream {
  const StationStream({
    required this.url,
    required this.format,
    required this.quality,
    this.primary = false,
  });

  final String url;
  final String format;
  final StreamQuality quality;
  final bool primary;

  bool get isHls {
    final lower = url.toLowerCase();
    final fmt = format.toLowerCase();
    return lower.contains('.m3u8') ||
        fmt.contains('mpegurl') ||
        fmt.contains('hls');
  }

  /// Short Constructivist stream badge (e.g. `MP3 128K`, `HLS`).
  String get formatBadge {
    final lower = format.toLowerCase();
    final String name;
    switch (lower) {
      case 'audio/mpeg':
      case 'audio/mp3':
        name = 'MP3';
      case 'audio/aac':
      case 'audio/mp4':
      case 'audio/aacp':
        name = 'AAC';
      case 'audio/ogg':
      case 'application/ogg':
        name = 'OGG';
      case 'audio/flac':
        name = 'FLAC';
      case 'audio/wav':
      case 'audio/x-wav':
        name = 'WAV';
      case 'application/x-mpegurl':
      case 'application/vnd.apple.mpegurl':
      case 'audio/x-hls':
        name = 'HLS';
      default:
        final part = format.split('/').last.trim();
        name = part.isEmpty ? 'STREAM' : part.toUpperCase();
    }

    final int? kbps;
    if (quality.bitrate >= 1000) {
      kbps = (quality.bitrate / 1000).round();
    } else if (quality.bitrate > 0) {
      kbps = quality.bitrate;
    } else {
      kbps = null;
    }

    return kbps != null ? '$name ${kbps}K' : name;
  }

  factory StationStream.fromJson(Map<String, dynamic> json) {
    return StationStream(
      url: ((json['url'] as String?) ?? '').trim().replaceAll('`', ''),
      format: (json['format'] as String?) ?? 'audio/mpeg',
      quality: json['quality'] is Map<String, dynamic>
          ? StreamQuality.fromJson(json['quality'] as Map<String, dynamic>)
          : const StreamQuality(bitrate: 0, codec: '', sampleRate: 44100),
      primary: (json['primary'] as bool?) ?? false,
    );
  }
}

class Station {
  const Station({
    required this.id,
    required this.pubkey,
    required this.stationId,
    required this.address,
    required this.naddr,
    required this.createdAt,
    required this.name,
    this.description,
    this.thumbnail,
    this.website,
    this.location,
    this.countryCode,
    this.genres = const [],
    this.languages = const [],
    this.streams = const [],
    this.streamingServerUrl,
  });

  final String id;
  final String pubkey;
  final String stationId;
  final String address;
  final String naddr;
  final int createdAt;
  final String name;
  final String? description;
  final String? thumbnail;
  final String? website;
  final String? location;
  final String? countryCode;
  final List<String> genres;
  final List<String> languages;
  final List<StationStream> streams;
  final String? streamingServerUrl;

  StationStream? get primaryStream =>
      streams.isEmpty ? null : streams.first;

  String get subtitle {
    final parts = <String>[];
    if (location != null && location!.trim().isNotEmpty) {
      parts.add(location!.trim());
    } else if (countryCode != null && countryCode!.trim().isNotEmpty) {
      parts.add(countryCode!.trim().toUpperCase());
    }
    if (genres.isNotEmpty) {
      parts.add(genres.take(2).join(' / '));
    }
    return parts.isEmpty ? 'INTERNET RADIO' : parts.join(' • ');
  }
}

class FacetCount {
  const FacetCount({required this.name, required this.count});

  final String name;
  final int count;
}

class StationFacets {
  const StationFacets({
    this.genres = const [],
    this.languages = const [],
    this.countries = const [],
  });

  final List<FacetCount> genres;
  final List<FacetCount> languages;
  final List<FacetCount> countries;
}

class FeaturedList {
  const FeaturedList({
    required this.id,
    required this.pubkey,
    required this.favoritesId,
    required this.address,
    required this.name,
    this.description,
    this.image,
    this.banner,
    this.stationAddresses = const [],
  });

  final String id;
  final String pubkey;
  final String favoritesId;
  final String address;
  final String name;
  final String? description;
  final String? image;
  final String? banner;
  final List<String> stationAddresses;
}

class RelayStatus {
  const RelayStatus({
    required this.relayUrl,
    required this.connected,
    this.totalStationCount,
    this.engineLabel = 'DIRECT_WS',
  });

  final String relayUrl;
  final bool connected;
  final int? totalStationCount;
  final String engineLabel;
}
