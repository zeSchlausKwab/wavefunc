import 'dart:async';

import 'package:flutter/foundation.dart';

import '../../../../data/repositories/station_repository.dart';
import '../../../../data/services/radio_audio_handler.dart';
import '../../../../domain/models/now_playing.dart';
import '../../../../domain/models/heard_song.dart';
import '../../../../domain/models/social.dart';
import '../../../../domain/models/station.dart';
import '../../auth/view_models/auth_view_model.dart';

/// MVVM ViewModel coordinating native audio playback, ContextVM metadata polling,
/// and opt-in NIP-38 live music listening status (`kind 30315`).
class PlayerViewModel extends ChangeNotifier {
  PlayerViewModel({
    required this._engine,
    required this._repository,
    this._authViewModel,
  }) {
    _snapshot = _engine.currentSnapshot;
    _sub = _engine.snapshotStream.listen(_onSnapshot);
    _authViewModel?.addListener(_onAuthChanged);
    unawaited(_engine.setVolume(_repository.savedVolume));
  }

  final RadioPlaybackEngine _engine;
  final StationRepository _repository;
  final AuthViewModel? _authViewModel;

  late PlayerSnapshot _snapshot;
  StreamSubscription<PlayerSnapshot>? _sub;
  Timer? _metadataPollTimer;
  Timer? _nip38RefreshTimer;
  String? _sessionId;
  int _pollToken = 0;
  bool _nip38Active = false;
  String? _lastNip38Fingerprint;

  (String, String, String)? _lastHeardKey;
  DateTime? _lastHeardAt;
  String? _lastHeardMbid;

  List<HeardSong> get recentSongs => _repository.recentSongs;
  Future<void> clearRecentSongs() async {
    await _repository.clearRecentSongs();
    notifyListeners();
  }

  void _recordSong(PlayerSnapshot next) {
    if (!next.isPlaying) {
      if (next.phase != PlayerPhase.buffering) _lastHeardKey = null;
      return;
    }
    final station = next.station;
    final metadata = next.metadata;
    final title = metadata?.displaySong;
    if (station == null || metadata == null || title == null ||
        title.toLowerCase() == 'no metadata available') {
      return;
    }
    final key = (station.address, title.toLowerCase(), metadata.displayArtist?.toLowerCase() ?? '');
    final enrich = key == _lastHeardKey;
    if (enrich && (metadata.mbid == null || metadata.mbid == _lastHeardMbid)) return;
    _lastHeardKey = key;
    _lastHeardMbid = metadata.mbid;
    if (!enrich) _lastHeardAt = DateTime.now();
    final song = HeardSong(metadata: metadata, stationName: station.name,
      heardAt: _lastHeardAt!);
    unawaited(_repository.recordSong(song, enrich: enrich).catchError((Object error) {
      debugPrint('Could not persist song history: $error');
    }));
  }

  PlayerSnapshot get snapshot => _snapshot;
  Station? get currentStation => _snapshot.station;
  bool get isPlaying => _snapshot.isPlaying;
  bool get isBusy => _snapshot.isBusy;

  void _onAuthChanged() {
    final auth = _authViewModel;
    if (auth == null) return;
    if (!auth.isLoggedIn || !auth.nip38Enabled) {
      _stopNip38Status(clearRemote: auth.isLoggedIn && _nip38Active);
    } else if (_snapshot.isPlaying) {
      _startNip38Status();
    }
  }

  void _onSnapshot(PlayerSnapshot next) {
    final previousStationId = _snapshot.station?.address;
    final previousPhase = _snapshot.phase;
    final previousTrack = _snapshot.metadata?.displaySong;
    _snapshot = next;
    _recordSong(next);
    notifyListeners();

    if (next.phase == PlayerPhase.playing &&
        (previousPhase != PlayerPhase.playing ||
            previousStationId != next.station?.address)) {
      _startMetadataPolling();
      _startNip38Status();
    } else if (next.phase == PlayerPhase.playing &&
        next.metadata?.displaySong != previousTrack) {
      unawaited(_publishNip38IfEnabled());
    } else if (next.phase == PlayerPhase.idle ||
        next.phase == PlayerPhase.paused ||
        next.phase == PlayerPhase.failed) {
      _stopMetadataPolling();
      _stopNip38Status(clearRemote: _nip38Active);
    }
  }

  Future<void> playStation(Station station, {int streamIndex = 0}) async {
    _sessionId = DateTime.now().microsecondsSinceEpoch.toRadixString(36);
    await _repository.recordRecentStation(station.address);
    await _engine.playStation(station, streamIndex: streamIndex);
  }

  /// Play a Blossom-backed saved song directly through the native audio engine.
  Future<void> playSavedSong(SavedSong song) async {
    final url = song.audioUrl?.trim();
    if (url == null || url.isEmpty) return;
    final pseudoStation = Station(
      id: song.id,
      pubkey: song.pubkey,
      stationId: song.songId,
      address: song.address,
      naddr: song.address,
      createdAt: song.createdAt,
      name: song.artist != null && song.artist!.isNotEmpty
          ? '${song.title} — ${song.artist}'
          : song.title,
      description: song.album ?? 'Blossom Audio Backup',
      thumbnail: song.thumb ?? song.coverArt,
      genres: song.genres,
      streams: [
        StationStream(
          url: url,
          format: 'audio/mp4',
          quality: const StreamQuality(
            bitrate: 128000,
            codec: 'aac',
            sampleRate: 44100,
          ),
          primary: true,
        ),
      ],
    );
    await _engine.playStation(pseudoStation);
  }

  Future<void> togglePlayStation(Station station) async {
    if (_snapshot.station?.address == station.address) {
      if (_snapshot.isPlaying || _snapshot.isBusy) {
        await pause();
      } else {
        await resume();
      }
      return;
    }
    await playStation(station);
  }

  Future<void> selectStream(int streamIndex) =>
      _engine.selectStream(streamIndex);

  Future<void> pause() => _engine.pause();

  Future<void> resume() => _engine.resume();

  Future<void> stop() => _engine.stopPlayback();

  Future<void> retry() => _engine.retry();

  Future<void> setVolume(double volume) async {
    await _engine.setVolume(volume);
    await _repository.saveVolume(volume);
  }

  Future<void> toggleMute() => _engine.toggleMute();

  void setSleepTimer(Duration? duration) => _engine.setSleepTimer(duration);

  /// Called when the app returns to foreground (e.g. after swiping away and
  /// reopening from the Pixel media notification or launcher) so UI state and
  /// metadata polling stay strictly synced with the background audio handler.
  void handleAppResumed() {
    final latest = _engine.currentSnapshot;
    _snapshot = latest;
    notifyListeners();
    if (latest.isPlaying) {
      if (_metadataPollTimer == null || !_metadataPollTimer!.isActive) {
        _startMetadataPolling();
      } else {
        unawaited(_pollMetadataOnce());
      }
    }
  }

  void _startMetadataPolling() {
    _stopMetadataPolling();
    _pollToken++;
    unawaited(_pollMetadataOnce());
    _metadataPollTimer = Timer.periodic(
      const Duration(seconds: 20),
      (_) => unawaited(_pollMetadataOnce()),
    );
  }

  void _stopMetadataPolling() {
    _pollToken++;
    _metadataPollTimer?.cancel();
    _metadataPollTimer = null;
  }

  Future<void> _pollMetadataOnce() async {
    final station = _snapshot.station;
    final stream = _snapshot.activeStream;
    if (station == null || stream == null || !_snapshot.isPlaying) return;
    final token = _pollToken;

    try {
      final enriched = await _repository.extractStreamMetadata(
        streamUrl: stream.url,
        stationAddress: station.address,
        sessionId: _sessionId,
      );
      if (token != _pollToken) return;
      if (enriched != null &&
          enriched.hasTrackInfo &&
          _snapshot.station?.address == station.address &&
          _snapshot.activeStream?.url == stream.url &&
          _snapshot.isPlaying) {
        _engine.updateEnrichedMetadata(enriched);
      }
    } catch (_) {
      // Non-critical: ICY metadata from ExoPlayer/AVPlayer remains active.
    }
  }

  void _startNip38Status() {
    final auth = _authViewModel;
    if (auth == null || !auth.isLoggedIn || !auth.nip38Enabled) return;
    _nip38RefreshTimer?.cancel();
    unawaited(_publishNip38IfEnabled(force: true));
    _nip38RefreshTimer = Timer.periodic(
      const Duration(minutes: 2),
      (_) => unawaited(_publishNip38IfEnabled(force: true)),
    );
  }

  void _stopNip38Status({required bool clearRemote}) {
    _nip38RefreshTimer?.cancel();
    _nip38RefreshTimer = null;
    _lastNip38Fingerprint = null;
    if (!clearRemote) {
      _nip38Active = false;
      return;
    }
    _nip38Active = false;
    final auth = _authViewModel;
    if (auth == null || !auth.isLoggedIn) return;
    unawaited(
      auth
          .executeSignedAction(
            (backend) => backend.publishListeningStatus(),
          )
          .catchError((_) => const ActionOutcome(published: false)),
    );
  }

  Future<void> _publishNip38IfEnabled({bool force = false}) async {
    final auth = _authViewModel;
    final station = _snapshot.station;
    if (auth == null ||
        !auth.isLoggedIn ||
        !auth.nip38Enabled ||
        station == null ||
        !_snapshot.isPlaying) {
      return;
    }

    final title = _snapshot.metadata?.displaySong ?? station.name;
    final artist = _snapshot.metadata?.displayArtist;
    final fingerprint = '${station.address}|$artist|$title';
    if (!force && fingerprint == _lastNip38Fingerprint) return;
    _lastNip38Fingerprint = fingerprint;

    try {
      await auth.executeSignedAction(
        (backend) => backend.publishListeningStatus(
          title: title,
          artist: artist,
          stationAddress: station.address,
          stationUrl: 'https://wavefunc.live/station/${station.naddr}',
        ),
      );
      _nip38Active = true;
    } catch (_) {
      // Non-critical telemetry/status.
    }
  }

  @override
  void dispose() {
    _stopMetadataPolling();
    _nip38RefreshTimer?.cancel();
    _authViewModel?.removeListener(_onAuthChanged);
    unawaited(_sub?.cancel());
    super.dispose();
  }
}
