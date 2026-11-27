import 'dart:async';
import 'dart:io';

import 'package:audio_service/audio_service.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:just_audio/just_audio.dart';
import 'package:wavefunc_app/data/services/radio_audio_handler.dart';
import 'package:wavefunc_app/domain/models/now_playing.dart';
import 'package:wavefunc_app/domain/models/station.dart';

class _RecordingKeepAlive extends PlaybackKeepAliveBridge {
  final List<bool> activeCalls = [];
  int permissionRequests = 0;

  @override
  Future<void> setActive(bool active) async {
    activeCalls.add(active);
  }

  @override
  Future<void> requestNotificationPermission() async {
    permissionRequests++;
  }
}

class _FakeJustAudioPlayer implements AudioPlayer {
  final _playbackEventController = StreamController<PlaybackEvent>.broadcast();
  final _playerStateController = StreamController<PlayerState>.broadcast();
  final _icyController = StreamController<IcyMetadata?>.broadcast();

  bool _playing = false;
  ProcessingState _processingState = ProcessingState.idle;
  Duration? _duration;
  double _volume = 1.0;

  int setUrlCalls = 0;
  int playCalls = 0;
  int pauseCalls = 0;
  int stopCalls = 0;
  String? lastUrl;
  bool failNextSetUrl = false;

  void emitPlayerState(bool playing, ProcessingState processingState) {
    _playing = playing;
    _processingState = processingState;
    _playerStateController.add(PlayerState(playing, processingState));
    _playbackEventController.add(
      PlaybackEvent(
        processingState: processingState,
        updatePosition: Duration.zero,
        bufferedPosition: Duration.zero,
        duration: _duration,
      ),
    );
  }

  void emitIcyTitle(String title) {
    _icyController.add(
      IcyMetadata(
        info: IcyInfo(title: title, url: null),
        headers: null,
      ),
    );
  }

  @override
  Stream<PlaybackEvent> get playbackEventStream =>
      _playbackEventController.stream;

  @override
  Stream<PlayerState> get playerStateStream => _playerStateController.stream;

  @override
  Stream<IcyMetadata?> get icyMetadataStream => _icyController.stream;

  @override
  bool get playing => _playing;

  @override
  ProcessingState get processingState => _processingState;

  @override
  Duration? get duration => _duration;

  @override
  Duration get position => Duration.zero;

  @override
  Duration get bufferedPosition => Duration.zero;

  @override
  double get speed => 1.0;

  @override
  double get volume => _volume;

  @override
  Future<Duration?> setUrl(
    String url, {
    Map<String, String>? headers,
    Duration? initialPosition,
    bool preload = true,
    dynamic tag,
  }) async {
    setUrlCalls++;
    lastUrl = url;
    if (failNextSetUrl) {
      failNextSetUrl = false;
      throw Exception('socket timeout');
    }
    emitPlayerState(false, ProcessingState.ready);
    return _duration;
  }

  @override
  Future<void> setVolume(double volume) async {
    _volume = volume;
  }

  @override
  Future<void> play() async {
    playCalls++;
    emitPlayerState(true, ProcessingState.ready);
  }

  @override
  Future<void> pause() async {
    pauseCalls++;
    emitPlayerState(false, ProcessingState.ready);
  }

  @override
  Future<void> stop() async {
    stopCalls++;
    emitPlayerState(false, ProcessingState.idle);
  }

  @override
  Future<void> dispose() async {
    await _playbackEventController.close();
    await _playerStateController.close();
    await _icyController.close();
  }

  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

const _testStation = Station(
  id: 'st-1',
  pubkey: 'pk-1',
  stationId: 'soma-groove',
  address: '31237:pk-1:soma-groove',
  naddr: 'naddr1test',
  createdAt: 1760000000,
  name: 'SomaFM Groove Salad',
  description: 'Ambient beats and grooves',
  thumbnail: 'https://wavefunc.live/images/logo.png',
  genres: ['ambient', 'electronic'],
  streams: [
    StationStream(
      url: 'https://ice.example/primary.mp3',
      format: 'audio/mpeg',
      quality: StreamQuality(bitrate: 128000, codec: 'mp3', sampleRate: 44100),
      primary: true,
    ),
    StationStream(
      url: 'https://ice.example/fallback.mp3',
      format: 'audio/mpeg',
      quality: StreamQuality(bitrate: 128000, codec: 'mp3', sampleRate: 44100),
      primary: false,
    ),
  ],
);

void main() {
  test(
    'rotates MediaItem.id on every track change for Bluetooth AVRCP and deduplicates repeats',
    () async {
      final player = _FakeJustAudioPlayer();
      final keepAlive = _RecordingKeepAlive();
      final handler = RadioAudioHandler(
        player: player,
        keepAlive: keepAlive,
        bindAudioSession: false,
      );

      final emittedItems = <MediaItem>[];
      final itemSub = handler.mediaItem.listen((item) {
        if (item != null) emittedItems.add(item);
      });

      await handler.playStation(_testStation);
      await Future<void>.delayed(Duration.zero);

      expect(keepAlive.permissionRequests, 1);
      expect(keepAlive.activeCalls.last, isTrue);
      expect(emittedItems, hasLength(1));
      expect(emittedItems.last.title, 'SomaFM Groove Salad');
      final initialId = emittedItems.last.id;

      // Song 1 arrives via ICY StreamTitle -> must produce a NEW MediaItem.id
      player.emitIcyTitle('Boards of Canada - Roygbiv');
      await Future<void>.delayed(Duration.zero);

      expect(emittedItems, hasLength(2));
      expect(emittedItems.last.title, 'Roygbiv');
      expect(emittedItems.last.artist, 'Boards of Canada');
      expect(emittedItems.last.album, 'SomaFM Groove Salad');
      expect(emittedItems.last.id, isNot(equals(initialId)));
      expect(handler.queue.value.single.id, emittedItems.last.id);
      final song1Id = emittedItems.last.id;

      // Duplicate 20s poll with identical song/artist/album must NOT spam AVRCP
      handler.updateEnrichedMetadata(
        const NowPlayingMetadata(
          title: 'Boards of Canada - Roygbiv',
          artist: 'Boards of Canada',
          song: 'Roygbiv',
          station: 'SomaFM Groove Salad',
        ),
      );
      await Future<void>.delayed(Duration.zero);
      expect(emittedItems, hasLength(2));

      // Song 2 arrives via ICY -> must rotate MediaItem.id again so car head unit updates
      player.emitIcyTitle('Tycho - Awake');
      await Future<void>.delayed(Duration.zero);

      expect(emittedItems, hasLength(3));
      expect(emittedItems.last.title, 'Awake');
      expect(emittedItems.last.artist, 'Tycho');
      expect(emittedItems.last.id, isNot(equals(song1Id)));
      expect(handler.queue.value.single.id, emittedItems.last.id);
      expect(handler.playbackState.value.queueIndex, 0);
      expect(
        handler.playbackState.value.systemActions,
        containsAll([MediaAction.play, MediaAction.pause, MediaAction.stop]),
      );

      await itemSub.cancel();
      await handler.disposeEngine();
    },
  );

  test(
    'resume re-tunes live radio cleanly after pause or EOF instead of hanging on a dead socket',
    () async {
      final player = _FakeJustAudioPlayer();
      final keepAlive = _RecordingKeepAlive();
      final handler = RadioAudioHandler(
        player: player,
        keepAlive: keepAlive,
        bindAudioSession: false,
      );

      await handler.playStation(_testStation);
      await Future<void>.delayed(Duration.zero);
      expect(player.setUrlCalls, 1);
      expect(handler.currentSnapshot.phase, PlayerPhase.playing);

      // Pause must keep station loaded, keep playbackState ready (not idle so
      // Android notification persists), and release WakeLock/WifiLock.
      await handler.pause();
      expect(handler.currentSnapshot.phase, PlayerPhase.paused);
      expect(handler.currentSnapshot.station?.address, _testStation.address);
      expect(
        handler.playbackState.value.processingState,
        AudioProcessingState.ready,
      );
      expect(handler.playbackState.value.playing, isFalse);
      expect(keepAlive.activeCalls.last, isFalse);

      // Resuming live radio re-tunes a fresh stream URL instead of playing stale EOF.
      await handler.resume();
      await Future<void>.delayed(Duration.zero);
      expect(player.setUrlCalls, 2);
      expect(handler.currentSnapshot.phase, PlayerPhase.playing);
      expect(keepAlive.activeCalls.last, isTrue);

      await handler.disposeEngine();
    },
  );

  test(
    'live stream EOF triggers reconnecting state (keeping foreground alive) instead of dying into paused',
    () async {
      final player = _FakeJustAudioPlayer();
      final keepAlive = _RecordingKeepAlive();
      final handler = RadioAudioHandler(
        player: player,
        keepAlive: keepAlive,
        bindAudioSession: false,
      );

      await handler.playStation(_testStation);
      await Future<void>.delayed(Duration.zero);
      expect(handler.currentSnapshot.phase, PlayerPhase.playing);

      // Simulate TCP EOF while listening in background
      player.emitPlayerState(false, ProcessingState.completed);
      await Future<void>.delayed(Duration.zero);

      expect(handler.currentSnapshot.phase, PlayerPhase.reconnecting);
      expect(handler.playbackState.value.playing, isTrue);
      expect(
        handler.playbackState.value.processingState,
        AudioProcessingState.buffering,
      );
      expect(keepAlive.activeCalls.last, isTrue);

      await handler.disposeEngine();
    },
  );

  test(
    'onTaskRemoved keeps playing when active and stops cleanly when paused',
    () async {
      final player = _FakeJustAudioPlayer();
      final keepAlive = _RecordingKeepAlive();
      final handler = RadioAudioHandler(
        player: player,
        keepAlive: keepAlive,
        bindAudioSession: false,
      );

      await handler.playStation(_testStation);
      await Future<void>.delayed(Duration.zero);

      // Swiping the app out of Recents while playing MUST NOT stop playback.
      await handler.onTaskRemoved();
      expect(player.stopCalls, 0);
      expect(handler.currentSnapshot.phase, PlayerPhase.playing);
      expect(handler.currentSnapshot.station, isNotNull);

      // Once paused, swiping the app out of Recents stops the dormant service.
      await handler.pause();
      await handler.onTaskRemoved();
      expect(player.stopCalls, 1);
      expect(handler.currentSnapshot.phase, PlayerPhase.idle);
      expect(handler.currentSnapshot.station, isNull);

      await handler.disposeEngine();
    },
  );

  test(
    'Android R8 keep.xml preserves audio_service and status bar notification drawables',
    () {
      final keepFile = File('android/app/src/main/res/raw/keep.xml');
      final statIconFile = File(
        'android/app/src/main/res/drawable/ic_stat_wavefunc.xml',
      );
      expect(keepFile.existsSync(), isTrue);
      expect(statIconFile.existsSync(), isTrue);

      final keepXml = keepFile.readAsStringSync();
      expect(keepXml, contains('@drawable/audio_service_*'));
      expect(keepXml, contains('@drawable/ic_stat_wavefunc'));
    },
  );
}
