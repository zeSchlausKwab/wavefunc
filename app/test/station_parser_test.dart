import 'package:flutter_test/flutter_test.dart';
import 'package:wavefunc_app/data/services/relay_websocket_backend.dart';
import 'package:wavefunc_app/domain/models/now_playing.dart';

void main() {
  group('RelayWebSocketBackend station parsing', () {
    final sampleEvent = <String, dynamic>{
      'id': 'evt1',
      'pubkey': 'abc123',
      'kind': 31237,
      'created_at': 1760000000,
      'content': '{"description":"Fallback desc","streams":[]}',
      'tags': [
        ['d', 'flux-fm-klubradio'],
        ['name', 'FLUX FM-KlubRadio'],
        ['description', 'Berlin electronic club stream'],
        ['country', 'DE'],
        ['c', 'electronic', 'genre'],
        ['c', 'techno', 'genre'],
        ['l', 'german'],
        [
          'stream',
          'http://streams.fluxfm.de/klubradio/mp3-128/audio/',
          'audio/mpeg',
          '{"bitrate":128000,"codec":"mp3","sampleRate":44100}',
        ],
        [
          'stream',
          'https://streams.fluxfm.de/klubradio/mp3-320/audio/',
          'audio/mpeg',
          '{"bitrate":320000,"codec":"mp3","sampleRate":44100}',
          'primary',
        ],
      ],
    };

    test('parses station and prioritizes primary stream', () {
      final station = RelayWebSocketBackend.parseStationEvent(sampleEvent);
      expect(station, isNotNull);
      expect(station!.name, 'FLUX FM-KlubRadio');
      expect(station.countryCode, 'DE');
      expect(station.genres, ['electronic', 'techno']);
      expect(station.languages, ['german']);
      expect(station.streams.length, 2);
      expect(station.streams.first.primary, isTrue);
      expect(station.streams.first.formatBadge, 'MP3 320K');
    });

    test('tokenized search matches hyphenated names and prefixes', () {
      final station = RelayWebSocketBackend.parseStationEvent(sampleEvent)!;
      expect(
        RelayWebSocketBackend.matchesStationSearch(station, 'flux fm'),
        isTrue,
      );
      expect(
        RelayWebSocketBackend.matchesStationSearch(station, 'klub elec'),
        isTrue,
      );
      expect(
        RelayWebSocketBackend.matchesStationSearch(station, 'classical'),
        isFalse,
      );
    });

    test('deduplicates addressable stations keeping latest created_at', () {
      final older = RelayWebSocketBackend.parseStationEvent(sampleEvent)!;
      final newerEvent = Map<String, dynamic>.from(sampleEvent)
        ..['id'] = 'evt2'
        ..['created_at'] = 1760000500;
      final newer = RelayWebSocketBackend.parseStationEvent(newerEvent)!;

      final deduped = RelayWebSocketBackend.deduplicateStations([older, newer]);
      expect(deduped.length, 1);
      expect(deduped.first.id, 'evt2');
    });

    test('parses ICY StreamTitle into artist and song', () {
      final meta = NowPlayingMetadata.fromIcyTitle(
        'Boards of Canada - Roygbiv',
        station: 'SomaFM',
      );
      expect(meta.displayArtist, 'Boards of Canada');
      expect(meta.displaySong, 'Roygbiv');
      expect(meta.source, 'ICY');
    });
  });
}
