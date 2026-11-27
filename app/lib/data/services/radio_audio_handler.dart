import 'dart:async';
import 'dart:io';

import 'package:audio_service/audio_service.dart';
import 'package:audio_session/audio_session.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';
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

/// Platform bridge to `AndroidPlaybackKeepAlive` (`WakeLock` + `WifiLock` +
/// runtime `POST_NOTIFICATIONS` on Android 13+). No-op outside Android or in
/// unit tests without platform bindings.
class PlaybackKeepAliveBridge {
  const PlaybackKeepAliveBridge();

  static const _channel = MethodChannel('live.wavefunc.app/playback_keepalive');

  Future<void> setActive(bool active) async {
    if (kIsWeb || !Platform.isAndroid) return;
    try {
      await _channel.invokeMethod<void>('setActive', {'active': active});
    } catch (_) {
      // Safe no-op in headless/test environments.
    }
  }

  Future<void> requestNotificationPermission() async {
    if (kIsWeb || !Platform.isAndroid) return;
    try {
      await _channel.invokeMethod<bool>(
        'requestNotificationPermission',
        {'force': false},
      );
    } catch (_) {
      // Safe no-op in headless/test environments.
    }
  }
}

/// Native background radio playback handler powered by `audio_service` + `just_audio`.
///
/// Handles:
/// - ExoPlayer (Android) / AVPlayer (iOS/macOS) live MP3, AAC, OGG, and HLS streams
/// - Persistent Android foreground `mediaPlayback` service + WakeLock + WifiLock
/// - Bluetooth AVRCP / Pixel media notification updates with unique per-track IDs
/// - Automatic mirror fallback & exponential-backoff reconnect on stream drops
/// - Live ICY `StreamTitle` parsing + ContextVM enrichment synced to OS MediaSession
/// - Audio focus + becoming-noisy handling via `audio_session`
/// - Sleep timer and volume/mute persistence
class RadioAudioHandler extends BaseAudioHandler
    with QueueHandler
    implements RadioPlaybackEngine {
  RadioAudioHandler({
    AudioPlayer? player,
    this._keepAlive = const PlaybackKeepAliveBridge(),
    bool bindAudioSession = true,
    this._setUrlTimeout = const Duration(seconds: 15),
  }) : _player = player ??
            AudioPlayer(
              userAgent: 'WaveFunc Radio Native/0.2.5',
              handleInterruptions: false,
              useProxyForRequestHeaders: kIsWeb || !Platform.isAndroid,
            ) {
    _bindPlayerStreams();
    if (bindAudioSession) {
      unawaited(_bindAudioSession());
    }
  }

  static const _reconnectDelays = <Duration>[
    Duration(seconds: 2),
    Duration(seconds: 4),
    Duration(seconds: 8),
    Duration(seconds: 15),
    Duration(seconds: 25),
  ];

  final AudioPlayer _player;
  final PlaybackKeepAliveBridge _keepAlive;
  final Duration _setUrlTimeout;
  final _snapshotController = StreamController<PlayerSnapshot>.broadcast();
  PlayerSnapshot _snapshot = const PlayerSnapshot();

  StreamSubscription<PlaybackEvent>? _playbackEventSub;
  StreamSubscription<PlayerState>? _playerStateSub;
  StreamSubscription<IcyMetadata?>? _icySub;
  StreamSubscription<AudioInterruptionEvent>? _interruptionSub;
  StreamSubscription<void>? _becomingNoisySub;
  AudioSession? _audioSession;

  Timer? _sleepTimer;
  Timer? _sleepTicker;
  Timer? _reconnectTimer;
  Timer? _mediaStateSyncTimer;

  int _generation = 0;
  int _trackRevision = 0;
  int _reconnectAttempt = 0;
  String? _lastOsMediaFingerprint;
  bool _shouldBePlaying = false;
  bool _resumeAfterInterruption = false;
  bool _isDucked = false;

  @override
  Stream<PlayerSnapshot> get snapshotStream => _snapshotController.stream;

  @override
  PlayerSnapshot get currentSnapshot => _snapshot;

  bool get _isLiveRadio {
    final station = _snapshot.station;
    if (station == null) return false;
    if (station.description == 'Blossom Audio Backup') return false;
    final dur = _player.duration;
    return dur == null || dur == Duration.zero;
  }

  static Future<RadioAudioHandler> initAudioService() async {
    final session = await AudioSession.instance;
    await session.configure(const AudioSessionConfiguration.music());

    return AudioService.init<RadioAudioHandler>(
      builder: () => RadioAudioHandler(),
      config: const AudioServiceConfig(
        androidNotificationChannelId: 'live.wavefunc.app.channel.audio',
        androidNotificationChannelName: 'WaveFunc Radio Playback',
        androidNotificationChannelDescription:
            'Live internet radio playback controls and now playing info',
        androidNotificationIcon: 'drawable/ic_stat_wavefunc',
        // Keep the foreground service alive across pauses, buffering, and
        // transient audio-focus interruptions (e.g. navigation prompts) so
        // Android Doze never freezes the process or blocks resuming playback.
        androidNotificationOngoing: false,
        androidStopForegroundOnPause: false,
        androidNotificationClickStartsActivity: true,
        androidResumeOnClick: true,
      ),
    );
  }

  Future<void> _bindAudioSession() async {
    try {
      final session = await AudioSession.instance;
      _audioSession = session;
      await session.configure(const AudioSessionConfiguration.music());

      _becomingNoisySub = session.becomingNoisyEventStream.listen((_) {
        if (_shouldBePlaying || _snapshot.isPlaying || _snapshot.isBusy) {
          unawaited(pause());
        }
      });

      _interruptionSub = session.interruptionEventStream.listen((event) {
        if (event.begin) {
          switch (event.type) {
            case AudioInterruptionType.duck:
              if (!_isDucked && !_snapshot.isMuted) {
                _isDucked = true;
                unawaited(_player.setVolume((_snapshot.volume * 0.25).clamp(0.0, 1.0)));
              }
              break;
            case AudioInterruptionType.pause:
            case AudioInterruptionType.unknown:
              final active = _shouldBePlaying || _snapshot.isPlaying || _snapshot.isBusy;
              if (active) {
                _resumeAfterInterruption = event.type == AudioInterruptionType.pause;
                unawaited(_pauseInternal(clearResumeAfterInterruption: false));
              }
              break;
          }
        } else {
          switch (event.type) {
            case AudioInterruptionType.duck:
              if (_isDucked) {
                _isDucked = false;
                unawaited(_player.setVolume(_snapshot.isMuted ? 0.0 : _snapshot.volume));
              }
              break;
            case AudioInterruptionType.pause:
              if (_resumeAfterInterruption) {
                _resumeAfterInterruption = false;
                unawaited(resume());
              }
              break;
            case AudioInterruptionType.unknown:
              _resumeAfterInterruption = false;
              break;
          }
        }
      });
    } catch (_) {
      // Safe fallback in unit tests or platforms without audio_session.
    }
  }

  void _emit(PlayerSnapshot next) {
    _snapshot = next;
    if (!_snapshotController.isClosed) {
      _snapshotController.add(next);
    }
  }

  void _syncKeepAlive() {
    final active = _shouldBePlaying || _snapshot.isPlaying || _snapshot.isBusy;
    unawaited(_keepAlive.setActive(active));
  }

  void _bindPlayerStreams() {
    _playbackEventSub = _player.playbackEventStream.listen(
      _broadcastMediaSessionState,
      onError: (Object error, StackTrace _) {
        _handleStreamError(error);
      },
    );

    _playerStateSub = _player.playerStateStream.listen((state) {
      final station = _snapshot.station;
      if (station == null) return;

      // Live internet radio streams never "complete" cleanly — reaching
      // `completed` means the TCP/upstream socket dropped (e.g. tunnel,
      // Wi-Fi/5G switch, or background timeout). Auto-reconnect instead of
      // stalling in a broken paused state.
      if (state.processingState == ProcessingState.completed &&
          _shouldBePlaying &&
          _isLiveRadio) {
        _scheduleReconnect('Stream connection ended — reconnecting...');
        return;
      }

      final phase = _mapProcessingState(state);
      if (phase == PlayerPhase.playing) {
        _reconnectAttempt = 0;
        _cancelReconnectTimer();
      }
      if (phase != _snapshot.phase) {
        _emit(
          _snapshot.copyWith(
            phase: phase,
            clearError: phase == PlayerPhase.playing,
          ),
        );
        _broadcastCurrentPlaybackState();
        _syncKeepAlive();
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
        if (_snapshot.phase == PlayerPhase.reconnecting) {
          return PlayerPhase.reconnecting;
        }
        return _snapshot.phase == PlayerPhase.failed
            ? PlayerPhase.failed
            : PlayerPhase.idle;
      case ProcessingState.loading:
        return PlayerPhase.loading;
      case ProcessingState.buffering:
        return _snapshot.phase == PlayerPhase.reconnecting
            ? PlayerPhase.reconnecting
            : PlayerPhase.buffering;
      case ProcessingState.ready:
        return state.playing ? PlayerPhase.playing : PlayerPhase.paused;
      case ProcessingState.completed:
        return PlayerPhase.paused;
    }
  }

  void _broadcastMediaSessionState(PlaybackEvent event) {
    _broadcastCurrentPlaybackState();
  }

  void _broadcastCurrentPlaybackState({bool forcePlayingState = false}) {
    final station = _snapshot.station;
    if (station == null) {
      playbackState.add(
        PlaybackState(
          controls: const [],
          systemActions: const {},
          processingState: AudioProcessingState.idle,
          playing: false,
        ),
      );
      return;
    }

    final isReconnecting = _snapshot.phase == PlayerPhase.reconnecting;
    final isLoading = _snapshot.phase == PlayerPhase.loading;
    final isFailed = _snapshot.phase == PlayerPhase.failed;

    final bool playing;
    final AudioProcessingState processingState;

    if (isReconnecting) {
      playing = true;
      processingState = AudioProcessingState.buffering;
    } else if (isLoading) {
      playing = true;
      processingState = AudioProcessingState.loading;
    } else if (isFailed) {
      playing = false;
      processingState = AudioProcessingState.error;
    } else if (forcePlayingState) {
      playing = _shouldBePlaying;
      processingState = _shouldBePlaying
          ? AudioProcessingState.ready
          : AudioProcessingState.ready;
    } else {
      playing = _player.playing;
      processingState = const {
        ProcessingState.idle: AudioProcessingState.ready,
        ProcessingState.loading: AudioProcessingState.loading,
        ProcessingState.buffering: AudioProcessingState.buffering,
        ProcessingState.ready: AudioProcessingState.ready,
        ProcessingState.completed: AudioProcessingState.ready,
      }[_player.processingState]!;
    }

    playbackState.add(
      playbackState.value.copyWith(
        controls: [
          if (playing) MediaControl.pause else MediaControl.play,
          MediaControl.stop,
        ],
        systemActions: const {
          MediaAction.play,
          MediaAction.pause,
          MediaAction.playPause,
          MediaAction.stop,
        },
        androidCompactActionIndices: const [0, 1],
        processingState: processingState,
        playing: playing,
        queueIndex: queue.value.isNotEmpty ? 0 : null,
        updatePosition: _player.position,
        bufferedPosition: _player.bufferedPosition,
        speed: playing ? _player.speed : 0.0,
        errorMessage: isFailed ? _snapshot.errorMessage : null,
      ),
    );
  }

  /// Builds an OS `MediaItem` with a unique per-track ID (`station#revision`).
  ///
  /// Android Bluetooth AVRCP (car head units) keys track-change notifications
  /// (`EVENT_TRACK_CHANGED`) on `METADATA_KEY_MEDIA_ID` + `MediaMetadata` +
  /// `PlaybackState` updates. Changing the ID whenever the displayed track
  /// changes forces car stereos and Pixel media controls to refresh immediately.
  @visibleForTesting
  MediaItem buildOsMediaItem(
    Station station,
    NowPlayingMetadata? metadata, {
    required int revision,
  }) {
    final artUri = station.thumbnail != null &&
            station.thumbnail!.trim().startsWith('http')
        ? Uri.tryParse(station.thumbnail!.trim())
        : null;

    final songTitle = metadata?.displaySong ?? station.name;
    final artistLine = metadata?.displayArtist ??
        (metadata?.displaySong != null ? station.name : station.subtitle);
    final albumLine = (metadata?.album?.trim().isNotEmpty ?? false)
        ? metadata!.album!.trim()
        : station.name;

    return MediaItem(
      id: '${station.address}#$revision',
      title: songTitle,
      artist: artistLine,
      album: albumLine,
      displayTitle: songTitle,
      displaySubtitle: artistLine,
      displayDescription: station.name,
      artUri: artUri,
      duration: metadata?.durationMs != null && metadata!.durationMs! > 0
          ? Duration(milliseconds: metadata.durationMs!)
          : null,
      extras: <String, dynamic>{
        'stationAddress': station.address,
        'stationName': station.name,
        'trackRevision': revision,
      },
    );
  }

  void _updateOsMediaItem(
    Station station,
    NowPlayingMetadata? metadata, {
    bool force = false,
  }) {
    final songTitle = metadata?.displaySong ?? station.name;
    final artistLine = metadata?.displayArtist ??
        (metadata?.displaySong != null ? station.name : station.subtitle);
    final albumLine = (metadata?.album?.trim().isNotEmpty ?? false)
        ? metadata!.album!.trim()
        : station.name;
    final artStr = station.thumbnail?.trim() ?? '';

    final fingerprint =
        '${station.address}|$songTitle|$artistLine|$albumLine|$artStr';
    if (!force && fingerprint == _lastOsMediaFingerprint) {
      return;
    }
    _lastOsMediaFingerprint = fingerprint;
    _trackRevision++;

    final rev = _trackRevision;
    final item = buildOsMediaItem(
      station,
      metadata,
      revision: rev,
    );
    queue.add(<MediaItem>[item]);
    mediaItem.add(item);
    // Re-broadcast PlaybackState immediately and once more after AudioService's
    // background setMetadata thread completes so PLAYBACK_STATE_EXTRAS_KEY_MEDIA_ID
    // and Bluetooth AVRCP pick up the new track ID reliably.
    _broadcastCurrentPlaybackState();
    _mediaStateSyncTimer?.cancel();
    _mediaStateSyncTimer = Timer(const Duration(milliseconds: 180), () {
      if (_trackRevision == rev && _snapshot.station?.address == station.address) {
        _broadcastCurrentPlaybackState();
      }
    });
  }

  void _cancelReconnectTimer() {
    _reconnectTimer?.cancel();
    _reconnectTimer = null;
  }

  @override
  Future<void> playStation(Station station, {int streamIndex = 0}) async {
    _cancelReconnectTimer();
    _resumeAfterInterruption = false;
    _isDucked = false;

    if (station.streams.isEmpty) {
      _shouldBePlaying = false;
      _emit(
        _snapshot.copyWith(
          station: station,
          phase: PlayerPhase.failed,
          errorMessage: 'Station has no playable streams.',
        ),
      );
      _broadcastCurrentPlaybackState();
      _syncKeepAlive();
      return;
    }

    unawaited(_keepAlive.requestNotificationPermission());

    final safeIndex = streamIndex.clamp(0, station.streams.length - 1);
    final gen = ++_generation;
    _reconnectAttempt = 0;
    _shouldBePlaying = true;
    _syncKeepAlive();

    await _attemptStream(station, safeIndex, gen, clearMetadata: true);
  }

  Future<void> _attemptStream(
    Station station,
    int streamIndex,
    int gen, {
    required bool clearMetadata,
  }) async {
    final stream = station.streams[streamIndex];
    _emit(
      _snapshot.copyWith(
        station: station,
        activeStream: stream,
        streamIndex: streamIndex,
        phase: _reconnectAttempt > 0
            ? PlayerPhase.reconnecting
            : PlayerPhase.loading,
        clearMetadata: clearMetadata,
        clearError: true,
      ),
    );
    _updateOsMediaItem(
      station,
      clearMetadata ? null : _snapshot.metadata,
      force: clearMetadata,
    );
    _broadcastCurrentPlaybackState();
    _syncKeepAlive();

    try {
      await _audioSession?.setActive(true);
    } catch (_) {}

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

      await _player
          .setUrl(
            playbackUrl,
            headers: const {'Icy-MetaData': '1'},
          )
          .timeout(_setUrlTimeout);

      if (gen != _generation) return;
      final targetVol = _snapshot.isMuted
          ? 0.0
          : (_isDucked ? (_snapshot.volume * 0.25).clamp(0.0, 1.0) : _snapshot.volume);
      await _player.setVolume(targetVol);
      if (gen != _generation) return;

      unawaited(
        _player.play().catchError((Object error) {
          if (gen == _generation) {
            _handleStreamError(error);
          }
        }),
      );
      _broadcastCurrentPlaybackState();
    } catch (error) {
      if (gen != _generation) return;
      // Automatic mirror fallback across remaining streams before backoff retry.
      final nextIndex = streamIndex + 1;
      if (nextIndex < station.streams.length) {
        _emit(
          _snapshot.copyWith(
            phase: PlayerPhase.reconnecting,
            errorMessage: 'Switching to fallback stream...',
          ),
        );
        _broadcastCurrentPlaybackState();
        await _attemptStream(
          station,
          nextIndex,
          gen,
          clearMetadata: clearMetadata,
        );
        return;
      }

      if (_shouldBePlaying &&
          _isLiveRadio &&
          _reconnectAttempt < _reconnectDelays.length) {
        _scheduleReconnect('Signal interrupted — reconnecting...');
        return;
      }

      _shouldBePlaying = false;
      _emit(
        _snapshot.copyWith(
          phase: PlayerPhase.failed,
          errorMessage: 'Unable to tune stream: ${_shortenError(error)}',
        ),
      );
      _broadcastCurrentPlaybackState();
      _syncKeepAlive();
    }
  }

  void _scheduleReconnect(String reason) {
    final station = _snapshot.station;
    if (station == null || !_shouldBePlaying) return;
    if (_reconnectAttempt >= _reconnectDelays.length) {
      _shouldBePlaying = false;
      _emit(
        _snapshot.copyWith(
          phase: PlayerPhase.failed,
          errorMessage: 'Stream interrupted — tap Retry to reconnect.',
        ),
      );
      _broadcastCurrentPlaybackState();
      _syncKeepAlive();
      return;
    }

    final delay = _reconnectDelays[_reconnectAttempt];
    _reconnectAttempt++;
    final gen = _generation;

    _cancelReconnectTimer();
    _emit(
      _snapshot.copyWith(
        phase: PlayerPhase.reconnecting,
        errorMessage: reason,
      ),
    );
    _broadcastCurrentPlaybackState();
    _syncKeepAlive();

    _reconnectTimer = Timer(delay, () {
      if (gen != _generation || !_shouldBePlaying) return;
      final current = _snapshot.station;
      if (current == null || current.streams.isEmpty) return;
      final idx = _snapshot.streamIndex.clamp(0, current.streams.length - 1);
      unawaited(_attemptStream(current, idx, gen, clearMetadata: false));
    });
  }

  void _handleStreamError(Object error) {
    final station = _snapshot.station;
    if (station == null || !_shouldBePlaying) return;
    final nextIndex = _snapshot.streamIndex + 1;
    if (nextIndex < station.streams.length) {
      final gen = _generation;
      unawaited(_attemptStream(station, nextIndex, gen, clearMetadata: false));
      return;
    }
    if (_isLiveRadio && _reconnectAttempt < _reconnectDelays.length) {
      _scheduleReconnect('Stream interrupted — reconnecting...');
      return;
    }
    _shouldBePlaying = false;
    _emit(
      _snapshot.copyWith(
        phase: PlayerPhase.failed,
        errorMessage: 'Stream interrupted: ${_shortenError(error)}',
      ),
    );
    _broadcastCurrentPlaybackState();
    _syncKeepAlive();
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
    final station = _snapshot.station;
    if (station == null) return;
    _cancelReconnectTimer();
    _resumeAfterInterruption = false;

    // Live radio TCP sockets go stale after pause, Doze, or EOF. Always re-tune
    // live stations (or any failed/idle/completed/stuck player) cleanly so the
    // Play button never hangs on a dead socket.
    final needsRetune = _isLiveRadio ||
        _snapshot.phase == PlayerPhase.failed ||
        _snapshot.phase == PlayerPhase.idle ||
        _snapshot.phase == PlayerPhase.loading ||
        _snapshot.phase == PlayerPhase.reconnecting ||
        _player.processingState == ProcessingState.idle ||
        _player.processingState == ProcessingState.completed;

    if (needsRetune) {
      final idx = _snapshot.streamIndex.clamp(
        0,
        station.streams.isEmpty ? 0 : station.streams.length - 1,
      );
      await playStation(station, streamIndex: idx);
      return;
    }

    _shouldBePlaying = true;
    _syncKeepAlive();
    try {
      await _audioSession?.setActive(true);
    } catch (_) {}
    unawaited(
      _player.play().catchError((Object error) {
        _handleStreamError(error);
      }),
    );
    _broadcastCurrentPlaybackState(forcePlayingState: true);
  }

  void _resetNativeSpectrum() {
    if (!RustLib.instance.initialized) return;
    try {
      frb.resetAudioSpectrum();
    } catch (_) {}
  }

  @override
  Future<void> pause() => _pauseInternal(clearResumeAfterInterruption: true);

  Future<void> _pauseInternal({
    required bool clearResumeAfterInterruption,
  }) async {
    _generation++;
    _shouldBePlaying = false;
    _cancelReconnectTimer();
    if (clearResumeAfterInterruption) {
      _resumeAfterInterruption = false;
    }
    _isDucked = false;
    try {
      await _player.pause();
    } catch (_) {}
    _resetNativeSpectrum();
    if (_snapshot.station != null) {
      _emit(
        _snapshot.copyWith(
          phase: PlayerPhase.paused,
          clearError: true,
        ),
      );
    }
    _broadcastCurrentPlaybackState(forcePlayingState: true);
    _syncKeepAlive();
  }

  @override
  Future<void> stop() => stopPlayback();

  @override
  Future<void> stopPlayback() async {
    _generation++;
    _shouldBePlaying = false;
    _resumeAfterInterruption = false;
    _isDucked = false;
    _reconnectAttempt = 0;
    _lastOsMediaFingerprint = null;
    _mediaStateSyncTimer?.cancel();
    _mediaStateSyncTimer = null;
    _cancelReconnectTimer();
    setSleepTimer(null);
    try {
      await _player.stop();
    } catch (_) {}
    try {
      await _audioSession?.setActive(false);
    } catch (_) {}
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
    queue.add(const <MediaItem>[]);
    mediaItem.add(null);
    _broadcastCurrentPlaybackState();
    _syncKeepAlive();
    await super.stop();
  }

  @override
  Future<void> onTaskRemoved() async {
    // Keep playing seamlessly in the background foreground service when the
    // user swipes WaveFunc away from Android Recents while listening.
    if (_shouldBePlaying || _snapshot.isPlaying || _snapshot.isBusy) {
      return;
    }
    await stopPlayback();
  }

  @override
  Future<void> onNotificationDeleted() async {
    await stopPlayback();
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
    _isDucked = false;
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
    _isDucked = false;
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
    _shouldBePlaying = false;
    _mediaStateSyncTimer?.cancel();
    _cancelReconnectTimer();
    _sleepTimer?.cancel();
    _sleepTicker?.cancel();
    await _keepAlive.setActive(false);
    await _interruptionSub?.cancel();
    await _becomingNoisySub?.cancel();
    await _playbackEventSub?.cancel();
    await _playerStateSub?.cancel();
    await _icySub?.cancel();
    await _player.dispose();
    await _snapshotController.close();
  }
}
