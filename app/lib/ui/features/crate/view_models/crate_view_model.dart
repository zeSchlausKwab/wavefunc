import 'package:flutter/foundation.dart';

import '../../../../data/services/wavefunc_backend.dart';
import '../../../../domain/models/now_playing.dart';
import '../../../../domain/models/social.dart';
import '../../auth/view_models/auth_view_model.dart';

/// MVVM ViewModel for the signed-in user's Nostr Song Crate (`kind 31337` + `kind 30078`).
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

  SongCrate get crate => _crate;
  List<SavedSong> get songs => _crate.songs;
  bool get isLoading => _isLoading;
  bool get isSaving => _isSaving;
  String? get errorMessage => _errorMessage;

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
}
