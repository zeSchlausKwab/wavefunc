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
  CrateViewModel({
    required this._backend,
    required this._authViewModel,
  });

  final WavefuncBackend _backend;
  final AuthViewModel _authViewModel;

  SongCrate _crate = const SongCrate();
  bool _isLoading = false;
  bool _isSaving = false;
  String? _errorMessage;

  // Song Search (MusicBrainz) state
  List<MusicBrainzRecording> _searchResults = const [];
  bool _isSearchingSongs = false;
  String? _songSearchError;
  String _lastSongQuery = '';

  SongCrate get crate => _crate;
  List<SavedSong> get songs => _crate.songs;
  bool get isLoading => _isLoading;
  bool get isSaving => _isSaving;
  String? get errorMessage => _errorMessage;

  List<MusicBrainzRecording> get searchResults => _searchResults;
  bool get isSearchingSongs => _isSearchingSongs;
  String? get songSearchError => _songSearchError;
  String get lastSongQuery => _lastSongQuery;

  bool hasSong(String title, String? artist) {
    final t = title.trim().toLowerCase();
    final a = artist?.trim().toLowerCase();
    return _crate.songs.any(
      (s) =>
          s.title.trim().toLowerCase() == t &&
          (a == null || s.artist?.trim().toLowerCase() == a),
    );
  }

  Future<void> refresh() async {
    if (!_authViewModel.isLoggedIn) {
      _crate = const SongCrate();
      notifyListeners();
      return;
    }
    _isLoading = true;
    _errorMessage = null;
    notifyListeners();
    try {
      _crate = await _backend.fetchSongCrate();
    } catch (e) {
      _errorMessage = 'Failed to load crate: $e';
    } finally {
      _isLoading = false;
      notifyListeners();
    }
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

  /// Publish a `kind 31337` song event from a MusicBrainz recording and add it to the crate.
  /// Returns the canonical `songId` (`d`-tag) if successful.
  Future<String?> saveRecording(MusicBrainzRecording rec) async {
    _isSaving = true;
    _errorMessage = null;
    notifyListeners();
    try {
      final songOutcome = await _authViewModel.executeSignedAction(
        (backend) => backend.createSongEvent(
          title: rec.title,
          artist: rec.artist,
          album: rec.release,
          mbid: rec.id,
          releaseId: rec.releaseId,
          releaseDate: rec.releaseDate,
          durationMs: rec.durationMs,
          genres: rec.tags,
        ),
      );
      final songAddress = songOutcome.targetAddress;
      if (songAddress != null && songAddress.isNotEmpty) {
        await _authViewModel.executeSignedAction(
          (backend) => backend.updateSongCrate(
            songAddress: songAddress,
            add: true,
          ),
        );
      }
      await refresh();
      return songAddress?.split(':').last;
    } catch (e) {
      _errorMessage = '$e';
      return null;
    } finally {
      _isSaving = false;
      notifyListeners();
    }
  }

  /// Publish a `kind 31337` song event and add it to the user's `kind 30078` song crate.
  Future<bool> saveNowPlaying(NowPlayingMetadata metadata) async {
    final title = metadata.displaySong;
    if (title == null || title.isEmpty) return false;

    _isSaving = true;
    _errorMessage = null;
    notifyListeners();
    try {
      final songOutcome = await _authViewModel.executeSignedAction(
        (backend) => backend.createSongEvent(
          title: title,
          artist: metadata.displayArtist,
          album: metadata.album,
          mbid: metadata.mbid,
          releaseDate: metadata.releaseDate,
          durationMs: metadata.durationMs,
          genres: metadata.genre != null ? [metadata.genre!] : const [],
        ),
      );
      final songAddress = songOutcome.targetAddress;
      if (songAddress != null && songAddress.isNotEmpty) {
        await _authViewModel.executeSignedAction(
          (backend) => backend.updateSongCrate(
            songAddress: songAddress,
            add: true,
          ),
        );
      }
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

  Future<bool> removeSong(String songAddress) async {
    _isSaving = true;
    _errorMessage = null;
    notifyListeners();
    try {
      await _authViewModel.executeSignedAction(
        (backend) => backend.updateSongCrate(
          songAddress: songAddress,
          add: false,
        ),
      );
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
      _crate.songAddresses.contains(songAddress);

  Future<bool> toggleSongAddress(String songAddress) async {
    final exists = containsAddress(songAddress);
    _isSaving = true;
    _errorMessage = null;
    notifyListeners();
    try {
      await _authViewModel.executeSignedAction(
        (backend) => backend.updateSongCrate(
          songAddress: songAddress,
          add: !exists,
        ),
      );
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
  /// 2. Download & hash YouTube media (local `yt-dlp` on desktop, ContextVM fallback on Android).
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
    String? songId = existingSong?.songId;
    if (songId == null || songId.isEmpty) {
      onProgress('saving', 'Saving song to your crate...');
      if (recording != null) {
        songId = await saveRecording(recording);
      } else if (fallbackTitle != null && fallbackTitle.trim().isNotEmpty) {
        final songOutcome = await _authViewModel.executeSignedAction(
          (backend) => backend.createSongEvent(
            title: fallbackTitle.trim(),
            artist: fallbackArtist?.trim(),
          ),
        );
        final addr = songOutcome.targetAddress;
        if (addr != null && addr.isNotEmpty) {
          await _authViewModel.executeSignedAction(
            (backend) => backend.updateSongCrate(songAddress: addr, add: true),
          );
          songId = addr.split(':').last;
        }
      }
      if (songId == null || songId.isEmpty) {
        throw StateError('Could not save song metadata before upload.');
      }
    }

    // 2. Prepare & hash media.
    onProgress('downloading', 'Downloading & hashing media...');
    String cacheRoot;
    try {
      final dir = await getTemporaryDirectory()
          .timeout(const Duration(seconds: 2));
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
      final signedAuth = await _authViewModel.signBlossomUploadAuth(
        sha256: prepared.sha256,
        blossomUrl: blossomUrl,
        format: format,
      );

      // 4. Upload to Blossom server.
      final sizeKb = (prepared.size / 1024).round();
      onProgress('uploading', 'Uploading ${sizeKb}KB to Blossom...');
      final uploaded = await _backend.uploadMediaToBlossom(
        jobId: prepared.jobId,
        blossomUrl: blossomUrl,
        signedAuthEventJson: signedAuth,
      );

      // 5. Update `kind 31337` song event with Blossom URL.
      onProgress('attaching', 'Attaching Blossom URL to song event...');
      await _authViewModel.executeSignedAction(
        (backend) => backend.attachSongAudioUrl(
          songId: songId!,
          audioUrl: uploaded.url,
          youtubeId: videoId,
        ),
      );

      await refresh();
      return uploaded;
    } catch (_) {
      await _backend.discardMediaJob(prepared.jobId).catchError((_) {});
      rethrow;
    }
  }
}
