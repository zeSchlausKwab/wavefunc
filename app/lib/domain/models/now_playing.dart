import 'station.dart';

class NowPlayingMetadata {
  const NowPlayingMetadata({
    this.title,
    this.artist,
    this.song,
    this.station,
    this.genre,
    this.bitrate,
    this.description,
    this.listeners,
    this.source,
    this.album,
    this.releaseDate,
    this.durationMs,
    this.mbid,
    this.confidence,
  });

  final String? title;
  final String? artist;
  final String? song;
  final String? station;
  final String? genre;
  final String? bitrate;
  final String? description;
  final int? listeners;
  final String? source;
  final String? album;
  final String? releaseDate;
  final int? durationMs;
  final String? mbid;
  final String? confidence;

  bool get hasTrackInfo =>
      (song != null && song!.trim().isNotEmpty) ||
      (title != null && title!.trim().isNotEmpty);

  String? get displaySong {
    if (song != null && song!.trim().isNotEmpty) return song!.trim();
    if (title != null && title!.trim().isNotEmpty) return title!.trim();
    return null;
  }

  String? get displayArtist {
    if (artist != null && artist!.trim().isNotEmpty) return artist!.trim();
    return null;
  }

  String? get displayTitle {
    final s = displaySong;
    if (s == null) return null;
    final a = displayArtist;
    return a != null ? '$a — $s' : s;
  }

  String? get albumWithYear {
    final a = album?.trim();
    if (a == null || a.isEmpty) return null;
    final year = releaseDate != null && releaseDate!.length >= 4
        ? releaseDate!.substring(0, 4)
        : null;
    return year != null ? '$a ($year)' : a;
  }

  /// Parse an ICY StreamTitle string like `"Boards of Canada - Roygbiv"`.
  factory NowPlayingMetadata.fromIcyTitle(String rawTitle, {String? station}) {
    final cleaned = rawTitle.trim();
    final parts = cleaned.split(' - ');
    if (parts.length >= 2) {
      return NowPlayingMetadata(
        title: cleaned,
        artist: parts.first.trim(),
        song: parts.sublist(1).join(' - ').trim(),
        station: station,
        source: 'ICY',
      );
    }
    return NowPlayingMetadata(
      title: cleaned,
      song: cleaned,
      station: station,
      source: 'ICY',
    );
  }
}

enum PlayerPhase {
  idle,
  loading,
  buffering,
  playing,
  paused,
  reconnecting,
  failed,
}

class PlayerSnapshot {
  const PlayerSnapshot({
    this.phase = PlayerPhase.idle,
    this.station,
    this.activeStream,
    this.streamIndex = 0,
    this.metadata,
    this.volume = 1.0,
    this.isMuted = false,
    this.errorMessage,
    this.sleepTimerEndsAt,
  });

  final PlayerPhase phase;
  final Station? station;
  final StationStream? activeStream;
  final int streamIndex;
  final NowPlayingMetadata? metadata;
  final double volume;
  final bool isMuted;
  final String? errorMessage;
  final DateTime? sleepTimerEndsAt;

  bool get isPlaying => phase == PlayerPhase.playing;
  bool get isBusy =>
      phase == PlayerPhase.loading ||
      phase == PlayerPhase.buffering ||
      phase == PlayerPhase.reconnecting;
  bool get hasStation => station != null;

  Duration? get sleepTimerRemaining {
    final endsAt = sleepTimerEndsAt;
    if (endsAt == null) return null;
    final remaining = endsAt.difference(DateTime.now());
    return remaining.isNegative ? Duration.zero : remaining;
  }

  PlayerSnapshot copyWith({
    PlayerPhase? phase,
    Station? station,
    bool clearStation = false,
    StationStream? activeStream,
    bool clearStream = false,
    int? streamIndex,
    NowPlayingMetadata? metadata,
    bool clearMetadata = false,
    double? volume,
    bool? isMuted,
    String? errorMessage,
    bool clearError = false,
    DateTime? sleepTimerEndsAt,
    bool clearSleepTimer = false,
  }) {
    return PlayerSnapshot(
      phase: phase ?? this.phase,
      station: clearStation ? null : (station ?? this.station),
      activeStream: clearStream ? null : (activeStream ?? this.activeStream),
      streamIndex: streamIndex ?? this.streamIndex,
      metadata: clearMetadata ? null : (metadata ?? this.metadata),
      volume: volume ?? this.volume,
      isMuted: isMuted ?? this.isMuted,
      errorMessage: clearError ? null : (errorMessage ?? this.errorMessage),
      sleepTimerEndsAt: clearSleepTimer
          ? null
          : (sleepTimerEndsAt ?? this.sleepTimerEndsAt),
    );
  }
}
