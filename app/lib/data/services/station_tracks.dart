import 'dart:convert';
import 'dart:io';

import '../../domain/models/heard_song.dart';

/// Public detections from WaveFunc's station observer, in newest-first order.
Future<List<HeardSong>> fetchStationTracks(String address) async {
  final client = HttpClient()..connectionTimeout = const Duration(seconds: 8);
  try {
    final url = Uri.https('wavefunc.live', '/api/station-tracks', {
      'address': address,
    });
    final request = await client.getUrl(url);
    final response = await request.close().timeout(const Duration(seconds: 10));
    if (response.statusCode != HttpStatus.ok) {
      throw HttpException('Station song history unavailable', uri: url);
    }
    final body = await utf8.decoder
        .bind(response)
        .join()
        .timeout(const Duration(seconds: 10));
    final tracks = (jsonDecode(body) as Map<String, dynamic>)['tracks'] as List;
    return tracks
        .map((track) => HeardSong.fromJson(track as Map<String, dynamic>))
        .toList();
  } finally {
    client.close(force: true);
  }
}
