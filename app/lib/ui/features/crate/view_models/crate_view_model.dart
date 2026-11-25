import 'dart:async';
import 'dart:io';

import 'package:flutter/foundation.dart';
import 'package:path_provider/path_provider.dart';

import '../../../../data/services/wavefunc_backend.dart';
import '../../../../domain/models/now_playing.dart';
import '../../../../domain/models/social.dart';
import '../../auth/view_models/auth_view_model.dart';

/// MVVM ViewModel for the signed-in user's Nostr Song Crate (`kind 31337` + `kind 30078`),
/// MusicBrainz Song Search, and Blossom Media Backup (`MEDIA_FORGE`).
class CrateViewModel extends ChangeNotifier {
  CrateViewModel({required this._backend, required this._authViewModel});

  final WavefuncBackend _backend;
  final AuthViewModel _authViewModel;

  SongCrate _crate = const SongCrate();
  String? _crateOwner;
  int _refreshSequence = 0;
  final _recentSaves = <String, SavedSong>{};
  bool _isLoading = false;
  bool _isSaving = false;
  String? _errorMessage;

  // Song Search (MusicBrainz) state
  List<MusicBrainzRecording> _searchResults = const [];
  bool _isSearchingSongs = false;
  String? _songSearchError;
  String _lastSongQuery = '';

  String? get _owner => _authViewModel.session?.pubkey;
  SongCrate get crate => _crateOwner == _owner ? _crate : const SongCrate();
  List<SavedSong> get songs => [
    ..._recentSaves.values.where((song) => song.pubkey == _owner),
    ...crate.songs.where(
      (song) =>
          song.pubkey != _owner || !_recentSaves.containsKey(song.address),
    ),
  ];
  bool get isLoading => _isLoading;
  bool get isSaving => _isSaving;
  String? get errorMessage => _errorMessage;

  List<MusicBrainzRecording> get searchResults => _searchResults;
  bool get isSearchingSongs => _isSearchingSongs;
  String? get songSearchError => _songSearchError;
  String get lastSongQuery => _lastSongQuery;

  SavedSong? savedSong(
    String title,
    String? artist, {
    String? mbid,
    bool ownedOnly = false,
  }) {
    final pubkey = _owner;
    if (pubkey == null) return null;
    String normalize(String? value) => (value ?? '').trim().toLowerCase();
    final recordingId = normalize(mbid);
    final matches = songs.where((song) {
      final otherId = normalize(song.mbid);
      if (recordingId.isNotEmpty && otherId.isNotEmpty) {
        return recordingId == otherId;
      }
      return normalize(song.title) == normalize(title) &&
          normalize(song.artist) == normalize(artist);
    }).toList();
    final owned = matches.where((song) => song.pubkey == pubkey);
    SavedSong? preferExact(Iterable<SavedSong> candidates) {
      if (recordingId.isNotEmpty) {
        final exact = candidates
            .where((song) => normalize(song.mbid) == recordingId)
            .firstOrNull;
        if (exact != null) return exact;
      }
      return candidates.firstOrNull;
    }

    return preferExact(owned) ?? (ownedOnly ? null : preferExact(matches));
  }

  Future<void> refresh() async {
    final sequence = ++_refreshSequence;
    final owner = _owner;
    if (owner == null) {
      _crate = const SongCrate();
      _crateOwner = null;
      _recentSaves.clear();
      _isLoading = false;
      notifyListeners();
      return;
    }
    _isLoading = true;
    _errorMessage = null;
    notifyListeners();
    try {
      final result = await _backend.fetchSongCrate();
      if (sequence != _refreshSequence || _owner != owner) return;
      _crate = result;
      _crateOwner = owner;
      for (final song in result.songs.where((song) => song.pubkey == owner)) {
        _recentSaves.remove(song.address);
      }
    } catch (e) {
      if (sequence == _refreshSequence && _owner == owner) {
        _errorMessage = 'Failed to load crate: $e';
      }
    } finally {
      if (sequence == _refreshSequence) {
        _isLoading = false;
        notifyListeners();
      }
    }
  }

  @override
  void dispose() {
    _refreshSequence++;
    super.dispose();
  }

  // ── Song Search (MusicBrainz) ─────────────────────────────────────────────

  Future<void> searchSongs(String query, {String? artist}) async {
    final trimmed = query.trim();
    _lastSongQuery = trimmed;
    if (trimmed.isEmpty) {
      _searchResults = const [];
      _songSearchError = null;
      notifyListeners();
      return;
    }

    _isSearchingSongs = true;
    _songSearchError = null;
    notifyListeners();
    try {
      _searchResults = await _backend.searchRecordings(
        query: trimmed,
        artist: artist,
        limit: 15,
      );
    } catch (e) {
      _songSearchError = e.toString().replaceFirst('Exception: ', '');
    } finally {
      _isSearchingSongs = false;
      notifyListeners();
    }
  }

  void clearSongSearch() {
    _lastSongQuery = '';
    _searchResults = const [];
    _songSearchError = null;
    notifyListeners();
  }

  Future<String?> saveRecording(MusicBrainzRecording rec) => _saveSong(
    title: rec.title,
    artist: rec.artist,
    album: rec.release,
    mbid: rec.id,
    releaseId: rec.releaseId,
    releaseDate: rec.releaseDate,
    durationMs: rec.durationMs,
    genres: rec.tags,
  );

  Future<bool> saveNowPlaying(NowPlayingMetadata metadata) async {
    final title = metadata.displaySong;
    if (title == null || title.isEmpty) return false;
    return await _saveSong(
          title: title,
          artist: metadata.displayArtist,
          album: metadata.album,
          mbid: metadata.mbid,
          releaseDate: metadata.releaseDate,
          durationMs: metadata.durationMs,
          genres: metadata.genre != null ? [metadata.genre!] : const [],
        ) !=
        null;
  }

  Future<String?> _saveSong({
    required String title,
    String? artist,
    String? album,
    String? mbid,
    String? releaseId,
    String? releaseDate,
    int? durationMs,
    List<String> genres = const [],
  }) async {
    final existing = savedSong(title, artist, mbid: mbid, ownedOnly: true);
    if (existing != null) return existing.songId;
    final owner = _owner;
    if (owner == null || _isSaving) return null;
    _isSaving = true;
    _errorMessage = null;
    notifyListeners();
    try {
      final outcome = await _authViewModel.executeSignedAction(
        (backend) => backend.createSongEvent(
          title: title,
          artist: artist,
          album: album,
          mbid: mbid,
          releaseId: releaseId,
          releaseDate: releaseDate,
          durationMs: durationMs,
          genres: genres,
        ),
        expectedAuthor: owner,
      );
      final address = outcome.targetAddress;
      final prefix = '31337:$owner:';
      if (!outcome.published ||
          _owner != owner ||
          address == null ||
          !address.startsWith(prefix) ||
          address.length == prefix.length) {
        throw StateError('Could not confirm the saved song for this account.');
      }
      final added = await _authViewModel.executeSignedAction(
        (backend) => backend.updateSongCrate(songAddress: address, add: true),
        expectedAuthor: owner,
      );
      if (!added.published || _owner != owner) {
        throw StateError('Could not confirm the song was added to your crate.');
      }
      final songId = address.substring(prefix.length);
      // Keep the signed address available until the relay returns the song.
      _recentSaves[address] = SavedSong(
        id: outcome.eventId ?? '',
        pubkey: owner,
        songId: songId,
        address: address,
        title: title,
        artist: artist,
        album: album,
        mbid: mbid,
        genres: genres,
        durationSecs: durationMs == null ? null : durationMs ~/ 1000,
      );
      unawaited(refresh());
      return songId;
    } catch (e) {
      _errorMessage = '$e';
      return null;
    } finally {
      _isSaving = false;
      notifyListeners();
    }
  }

  Future<bool> removeSong(String songAddress) async {
    _isSaving = true;
    _errorMessage = null;
    notifyListeners();
    try {
      await _authViewModel.executeSignedAction(
        (backend) =>
            backend.updateSongCrate(songAddress: songAddress, add: false),
        expectedAuthor: _owner,
      );
      _recentSaves.remove(songAddress);
      await refresh();
      return true;
    } catch (e) {
      _errorMessage = '$e';
      return false;
    } finally {
      _isSaving = false;
      notifyListeners();
    }
  }

  bool containsAddress(String songAddress) =>
      crate.songAddresses.contains(songAddress) ||
      songs.any((s) => s.address == songAddress);

  Future<bool> toggleSongAddress(String songAddress) async {
    final exists = containsAddress(songAddress);
    _isSaving = true;
    _errorMessage = null;
    notifyListeners();
    try {
      await _authViewModel.executeSignedAction(
        (backend) =>
            backend.updateSongCrate(songAddress: songAddress, add: !exists),
        expectedAuthor: _owner,
      );
      if (exists) _recentSaves.remove(songAddress);
      await refresh();
      return true;
    } catch (e) {
      _errorMessage = '$e';
      return false;
    } finally {
      _isSaving = false;
      notifyListeners();
    }
  }

  // ── Media Backup to Blossom (MEDIA_FORGE) ─────────────────────────────────

  Future<List<YouTubeSearchResult>> searchYouTube(String query) =>
      _backend.searchYouTube(query: query, limit: 5);

  /// Full end-to-end Blossom backup pipeline:
  /// 1. Ensure `kind 31337` song exists in the user's crate.
  /// 2. Download and hash the selected media on the device.
  /// 3. Sign BUD-02 `kind 24242` upload auth (LocalKey / Bunker / Amber).
  /// 4. Upload to Blossom server.
  /// 5. Attach `["r", blossomUrl]` + `["i", "youtube:<videoId>"]` to `kind 31337` and refresh crate.
  Future<UploadedMedia> backupSongToBlossom({
    SavedSong? existingSong,
    MusicBrainzRecording? recording,
    String? fallbackTitle,
    String? fallbackArtist,
    required String videoId,
    required String format,
    required String blossomUrl,
    required void Function(String stage, String message) onProgress,
  }) async {
    // 1. Ensure song exists in the user's crate.
    final owner = _owner;
    if (owner == null) throw StateError('Sign in to back up this song.');
    final title = existingSong?.title ?? recording?.title ?? fallbackTitle;
    final artist = existingSong?.artist ?? recording?.artist ?? fallbackArtist;
    final owned = existingSong?.pubkey == owner
        ? existingSong
        : (title == null
              ? null
              : savedSong(
                  title,
                  artist,
                  mbid: recording?.id ?? existingSong?.mbid,
                  ownedOnly: true,
                ));
    String? songId = owned?.songId;
    if (songId == null || songId.isEmpty) {
      onProgress('saving', 'Saving song to your crate...');
      if (recording != null) {
        songId = await saveRecording(recording);
      } else if (title != null && title.trim().isNotEmpty) {
        songId = await _saveSong(
          title: title.trim(),
          artist: artist,
          album: existingSong?.album,
          mbid: existingSong?.mbid,
          durationMs: existingSong?.durationSecs == null
              ? null
              : existingSong!.durationSecs! * 1000,
          releaseDate: existingSong?.releaseYear?.toString(),
          genres: existingSong?.genres ?? const [],
        );
      }
      if (songId == null || songId.isEmpty) {
        throw StateError(
          _errorMessage ?? 'Could not save song metadata before upload.',
        );
      }
    }

    // 2. Prepare & hash media.
    onProgress('downloading', 'Downloading & hashing media...');
    String cacheRoot;
    try {
      final dir = await getTemporaryDirectory().timeout(
        const Duration(seconds: 2),
      );
      cacheRoot = dir.path;
    } catch (_) {
      cacheRoot = Directory.systemTemp.path;
    }

    final prepared = await _backend.prepareYouTubeMedia(
      cacheRoot: cacheRoot,
      videoId: videoId,
      format: format,
    );

    try {
      // 3. Sign BUD-02 Blossom upload auth event (kind 24242).
      onProgress('authorizing', 'Signing Blossom upload auth (kind 24242)...');
      if (_owner != owner) throw StateError('Account changed during backup.');
      final signedAuth = await _authViewModel.signBlossomUploadAuth(
        sha256: prepared.sha256,
        blossomUrl: blossomUrl,
        format: format,
      );

      if (_owner != owner) throw StateError('Account changed during backup.');

      // 4. Upload to Blossom server.
      final sizeKb = (prepared.size / 1024).round();
      onProgress('uploading', 'Uploading ${sizeKb}KB to Blossom...');
      final uploaded = await _backend.uploadMediaToBlossom(
        jobId: prepared.jobId,
        blossomUrl: blossomUrl,
        signedAuthEventJson: signedAuth,
      );

      // 5. Update `kind 31337` song event with Blossom URL.
      if (_owner != owner) throw StateError('Account changed during backup.');
      onProgress('attaching', 'Attaching Blossom URL to song event...');
      await _authViewModel.executeSignedAction(
        (backend) => backend.attachSongAudioUrl(
          songId: songId!,
          audioUrl: uploaded.url,
          youtubeId: videoId,
        ),
        expectedAuthor: owner,
      );

      await refresh();
      return uploaded;
    } catch (_) {
      await _backend.discardMediaJob(prepared.jobId).catchError((_) {});
      rethrow;
    }
  }
}
