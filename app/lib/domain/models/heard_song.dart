import 'now_playing.dart';

class HeardSong {
  const HeardSong({
    required this.metadata,
    required this.heardAt,
    this.stationName,
  });

  final NowPlayingMetadata metadata;
  final DateTime heardAt;
  final String? stationName;

  factory HeardSong.fromJson(Map<String, dynamic> json) {
    final title = json['title'] as String;
    return HeardSong(
      metadata: NowPlayingMetadata(
        song: title,
        artist: json['artist'] as String?,
        album: json['album'] as String?,
        mbid: json['mbid'] as String?,
        releaseDate: json['releaseDate'] as String?,
        durationMs: json['durationMs'] as int?,
        genre: json['genre'] as String?,
      ),
      stationName: json['stationName'] as String?,
      heardAt: DateTime.fromMillisecondsSinceEpoch(
        json['heardAt'] as int? ?? (json['observedAt'] as int) * 1000,
      ),
    );
  }

  Map<String, dynamic> toJson() => {
    'title': metadata.displaySong,
    'artist': metadata.displayArtist,
    'album': metadata.album,
    'mbid': metadata.mbid,
    'genre': metadata.genre,
    'releaseDate': metadata.releaseDate,
    'durationMs': metadata.durationMs,
    'heardAt': heardAt.millisecondsSinceEpoch,
    'stationName': stationName,
  };
}
