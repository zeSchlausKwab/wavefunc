import 'dart:async';

import 'package:audio_service/audio_service.dart';
import 'package:audio_session/audio_session.dart';
import 'package:just_audio/just_audio.dart';

import '../../domain/models/now_playing.dart';
import '../../domain/models/station.dart';
import '../../src/rust/api/wavefunc.dart' as frb;
import '../../src/rust/frb_generated.dart';

/// Abstract audio engine interface so tests can inject a lightweight fake while
/// production uses `RadioAudioHandler` backed by `audio_service` + `just_audio`.
abstract class RadioPlaybackEngine {
  Stream<PlayerSnapshot> get snapshotStream;
  PlayerSnapshot get currentSnapshot;

  Future<void> playStation(Station station, {int streamIndex = 0});
  Future<void> selectStream(int streamIndex);
  Future<void> pause();
  Future<void> resume();
  Future<void> stopPlayback();
  Future<void> retry();
  Future<void> setVolume(double volume);
  Future<void> toggleMute();
  void setSleepTimer(Duration? duration);
  void updateEnrichedMetadata(NowPlayingMetadata metadata);
  Future<void> disposeEngine();
}

/// Native background radio playback handler powered by `audio_service` + `just_audio`.
///
/// Handles:
/// - ExoPlayer (Android) / AVPlayer (iOS/macOS) live MP3, AAC, OGG, and HLS streams
/// - Automatic mirror fallback across `station.streams` on stream failure
/// - Live ICY `StreamTitle` parsing into `NowPlayingMetadata` + OS notification updates
/// - Audio focus + becoming-noisy handling via `audio_session`
/// - Sleep timer and volume/mute persistence
class RadioAudioHandler extends BaseAudioHandler
    with QueueHandler
    implements RadioPlaybackEngine {
  RadioAudioHandler({AudioPlayer? player})
      : _player = player ??
            AudioPlayer(
              userAgent: 'WaveFunc Radio Native/0.2.0',
            ) {
    _bindPlayerStreams();
  }

  final AudioPlayer _player;
  final _snapshotController = StreamController<PlayerSnapshot>.broadcast();
  PlayerSnapshot _snapshot = const PlayerSnapshot();

  StreamSubscription<PlaybackEvent>? _playbackEventSub;
  StreamSubscription<PlayerState>? _playerStateSub;
  StreamSubscription<IcyMetadata?>? _icySub;
  Timer? _sleepTimer;
  Timer? _sleepTicker;
  int _generation = 0;

  @override
  Stream<PlayerSnapshot> get snapshotStream => _snapshotController.stream;

  @override
  PlayerSnapshot get currentSnapshot => _snapshot;

  static Future<RadioAudioHandler> initAudioService() async {
    final session = await AudioSession.instance;
    await session.configure(const AudioSessionConfiguration.music());

    return AudioService.init<RadioAudioHandler>(
      builder: () => RadioAudioHandler(),
      config: const AudioServiceConfig(
        androidNotificationChannelId: 'live.wavefunc.app.channel.audio',
        androidNotificationChannelName: 'WaveFunc Radio Playback',
        androidNotificationOngoing: true,
        androidStopForegroundOnPause: true,
      ),
    );
  }

  void _emit(PlayerSnapshot next) {
    _snapshot = next;
    if (!_snapshotController.isClosed) {
      _snapshotController.add(next);
    }
  }

  void _bindPlayerStreams() {
    _playbackEventSub = _player.playbackEventStream.listen(
      _broadcastMediaSessionState,
      onError: (Object error, StackTrace _) {
        _handleStreamError(error);
      },
    );

    _playerStateSub = _player.playerStateStream.listen((state) {
      if (_snapshot.station == null) return;
      final phase = _mapProcessingState(state);
      if (phase != _snapshot.phase) {
        _emit(
          _snapshot.copyWith(
            phase: phase,
            clearError: phase == PlayerPhase.playing,
          ),
        );
      }
    });

    _icySub = _player.icyMetadataStream.listen((icy) {
      final station = _snapshot.station;
      if (station == null) return;
      final rawTitle = icy?.info?.title?.trim();
      if (rawTitle == null || rawTitle.isEmpty) return;

      final parsed = NowPlayingMetadata.fromIcyTitle(
        rawTitle,
        station: station.name,
      );
      _emit(_snapshot.copyWith(metadata: parsed));
      _updateOsMediaItem(station, parsed);
    });
  }

  PlayerPhase _mapProcessingState(PlayerState state) {
    switch (state.processingState) {
      case ProcessingState.idle:
        return _snapshot.phase == PlayerPhase.failed
            ? PlayerPhase.failed
            : PlayerPhase.idle;
      case ProcessingState.loading:
        return PlayerPhase.loading;
      case ProcessingState.buffering:
        return PlayerPhase.buffering;
      case ProcessingState.ready:
        return state.playing ? PlayerPhase.playing : PlayerPhase.paused;
      case ProcessingState.completed:
        return PlayerPhase.paused;
    }
  }

  void _broadcastMediaSessionState(PlaybackEvent event) {
    final playing = _player.playing;
    playbackState.add(
      playbackState.value.copyWith(
        controls: [
          if (playing) MediaControl.pause else MediaControl.play,
          MediaControl.stop,
        ],
        androidCompactActionIndices: const [0, 1],
        processingState: const {
          ProcessingState.idle: AudioProcessingState.idle,
          ProcessingState.loading: AudioProcessingState.loading,
          ProcessingState.buffering: AudioProcessingState.buffering,
          ProcessingState.ready: AudioProcessingState.ready,
          ProcessingState.completed: AudioProcessingState.completed,
        }[_player.processingState]!,
        playing: playing,
        updatePosition: _player.position,
        bufferedPosition: _player.bufferedPosition,
        speed: _player.speed,
      ),
    );
  }

  void _updateOsMediaItem(Station station, NowPlayingMetadata? metadata) {
    final artUri = station.thumbnail != null &&
            station.thumbnail!.trim().startsWith('http')
        ? Uri.tryParse(station.thumbnail!.trim())
        : null;

    mediaItem.add(
      MediaItem(
        id: station.address,
        title: metadata?.displaySong ?? station.name,
        artist: metadata?.displayArtist ?? station.subtitle,
        album: station.name,
        artUri: artUri,
      ),
    );
  }

  @override
  Future<void> playStation(Station station, {int streamIndex = 0}) async {
    if (station.streams.isEmpty) {
      _emit(
        _snapshot.copyWith(
          station: station,
          phase: PlayerPhase.failed,
          errorMessage: 'Station has no playable streams.',
        ),
      );
      return;
    }

    final safeIndex = streamIndex.clamp(0, station.streams.length - 1);
    final gen = ++_generation;

    await _attemptStream(station, safeIndex, gen);
  }

  Future<void> _attemptStream(
    Station station,
    int streamIndex,
    int gen,
  ) async {
    final stream = station.streams[streamIndex];
    _emit(
      _snapshot.copyWith(
        station: station,
        activeStream: stream,
        streamIndex: streamIndex,
        phase: PlayerPhase.loading,
        clearMetadata: true,
        clearError: true,
      ),
    );
    _updateOsMediaItem(station, null);

    try {
      String playbackUrl = stream.url;
      if (RustLib.instance.initialized) {
        try {
          playbackUrl = await frb.prepareAudioProxyUrl(upstreamUrl: stream.url);
        } catch (_) {
          playbackUrl = stream.url;
        }
      }
      if (gen != _generation) return;
      await _player.setUrl(
        playbackUrl,
        headers: const {'Icy-MetaData': '1'},
      );
      if (gen != _generation) return;
      await _player.setVolume(_snapshot.isMuted ? 0.0 : _snapshot.volume);
      unawaited(_player.play());
    } catch (error) {
      if (gen != _generation) return;
      // Automatic mirror fallback across remaining streams before failing.
      final nextIndex = streamIndex + 1;
      if (nextIndex < station.streams.length) {
        _emit(
          _snapshot.copyWith(
            phase: PlayerPhase.reconnecting,
            errorMessage: 'Switching to fallback stream...',
          ),
        );
        await _attemptStream(station, nextIndex, gen);
        return;
      }
      _emit(
        _snapshot.copyWith(
          phase: PlayerPhase.failed,
          errorMessage: 'Unable to tune stream: ${_shortenError(error)}',
        ),
      );
    }
  }

  void _handleStreamError(Object error) {
    final station = _snapshot.station;
    if (station == null) return;
    final nextIndex = _snapshot.streamIndex + 1;
    if (nextIndex < station.streams.length) {
      final gen = _generation;
      unawaited(_attemptStream(station, nextIndex, gen));
      return;
    }
    _emit(
      _snapshot.copyWith(
        phase: PlayerPhase.failed,
        errorMessage: 'Stream interrupted: ${_shortenError(error)}',
      ),
    );
  }

  String _shortenError(Object error) {
    final text = error.toString().replaceFirst('Exception: ', '').trim();
    return text.length > 100 ? '${text.substring(0, 97)}...' : text;
  }

  @override
  Future<void> selectStream(int streamIndex) async {
    final station = _snapshot.station;
    if (station == null) return;
    await playStation(station, streamIndex: streamIndex);
  }

  @override
  Future<void> play() => resume();

  @override
  Future<void> resume() async {
    if (_snapshot.station == null) return;
    if (_snapshot.phase == PlayerPhase.failed) {
      await retry();
      return;
    }
    await _player.play();
  }

  void _resetNativeSpectrum() {
    if (!RustLib.instance.initialized) return;
    try {
      frb.resetAudioSpectrum();
    } catch (_) {}
  }

  @override
  Future<void> pause() async {
    await _player.pause();
    _resetNativeSpectrum();
    if (_snapshot.station != null) {
      _emit(_snapshot.copyWith(phase: PlayerPhase.paused));
    }
  }

  @override
  Future<void> stop() => stopPlayback();

  @override
  Future<void> stopPlayback() async {
    _generation++;
    setSleepTimer(null);
    await _player.stop();
    _resetNativeSpectrum();
    _emit(
      _snapshot.copyWith(
        phase: PlayerPhase.idle,
        clearStation: true,
        clearStream: true,
        clearMetadata: true,
        clearError: true,
      ),
    );
    await super.stop();
  }

  @override
  Future<void> retry() async {
    final station = _snapshot.station;
    if (station == null) return;
    await playStation(station, streamIndex: 0);
  }

  @override
  Future<void> setVolume(double volume) async {
    final clamped = volume.clamp(0.0, 1.0);
    await _player.setVolume(clamped);
    _emit(
      _snapshot.copyWith(
        volume: clamped,
        isMuted: clamped == 0.0,
      ),
    );
  }

  @override
  Future<void> toggleMute() async {
    final nextMuted = !_snapshot.isMuted;
    await _player.setVolume(nextMuted ? 0.0 : _snapshot.volume);
    _emit(_snapshot.copyWith(isMuted: nextMuted));
  }

  @override
  void setSleepTimer(Duration? duration) {
    _sleepTimer?.cancel();
    _sleepTicker?.cancel();
    _sleepTimer = null;
    _sleepTicker = null;

    if (duration == null) {
      _emit(_snapshot.copyWith(clearSleepTimer: true));
      return;
    }

    final endsAt = DateTime.now().add(duration);
    _emit(_snapshot.copyWith(sleepTimerEndsAt: endsAt));

    _sleepTimer = Timer(duration, () {
      unawaited(pause());
      setSleepTimer(null);
    });
    _sleepTicker = Timer.periodic(const Duration(seconds: 30), (_) {
      if (_snapshot.sleepTimerEndsAt != null) {
        _emit(_snapshot);
      }
    });
  }

  @override
  void updateEnrichedMetadata(NowPlayingMetadata metadata) {
    final station = _snapshot.station;
    if (station == null) return;
    _emit(_snapshot.copyWith(metadata: metadata));
    _updateOsMediaItem(station, metadata);
  }

  @override
  Future<void> disposeEngine() async {
    _sleepTimer?.cancel();
    _sleepTicker?.cancel();
    await _playbackEventSub?.cancel();
    await _playerStateSub?.cancel();
    await _icySub?.cancel();
    await _player.dispose();
    await _snapshotController.close();
  }
}
