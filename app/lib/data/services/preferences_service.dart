import 'dart:convert';

import '../../domain/models/heard_song.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'wavefunc_backend.dart';

class PreferencesService {
  PreferencesService(this._prefs);

  static const _keyRelayUrl = 'wavefunc_relay_url';
  static const _keyBookmarks = 'wavefunc_local_bookmarks';
  static const _keyRecent = 'wavefunc_recent_stations';
  static const _keyVolume = 'wavefunc_volume';
  static const _keyNip38Enabled = 'wavefunc_nip38_status_enabled';
  static const _keyOnboardingDone = 'wavefunc_onboarding_done_v1';
  static const _keyNip60EnabledPrefix = 'wavefunc_nip60_enabled_v1_';

  final SharedPreferences _prefs;

  String get relayUrl =>
      _prefs.getString(_keyRelayUrl) ?? WavefuncBackend.defaultProductionRelay;

  Future<void> setRelayUrl(String url) => _prefs.setString(_keyRelayUrl, url);

  Set<String> get bookmarkedAddresses =>
      (_prefs.getStringList(_keyBookmarks) ?? const []).toSet();

  Future<void> setBookmarkedAddresses(Set<String> addresses) =>
      _prefs.setStringList(_keyBookmarks, addresses.toList());

  List<String> get recentAddresses =>
      _prefs.getStringList(_keyRecent) ?? const [];

  Future<void> recordRecentAddress(String address) async {
    final current = List<String>.from(recentAddresses);
    current.remove(address);
    current.insert(0, address);
    if (current.length > 20) {
      current.removeRange(20, current.length);
    }
    await _prefs.setStringList(_keyRecent, current);
  }

  static const _songsKey = 'wavefunc_song_history';
  late List<HeardSong> _recentSongs = _loadRecentSongs();

  List<HeardSong> get recentSongs => _recentSongs;

  List<HeardSong> _loadRecentSongs() {
    final songs = <HeardSong>[];
    for (final row in (_prefs.getStringList(_songsKey) ?? <String>[]).take(50)) {
      try {
        songs.add(HeardSong.fromJson(jsonDecode(row) as Map<String, dynamic>));
      } catch (_) {
        // An unreadable entry should not hide the remaining listening history.
      }
    }
    return songs;
  }

  Future<void> recordSong(HeardSong song, {required bool enrich}) async {
    final history = recentSongs;
    if (enrich && (history.isEmpty || history.first.heardAt != song.heardAt)) return;
    _recentSongs = [song, ...history.skip(enrich ? 1 : 0).take(49)];
    await _prefs.setStringList(_songsKey, _recentSongs.map((item) => jsonEncode(item.toJson())).toList());
  }

  Future<void> clearRecentSongs() async {
    _recentSongs = [];
    await _prefs.remove(_songsKey);
  }

  double get volume => (_prefs.getDouble(_keyVolume) ?? 1.0).clamp(0.0, 1.0);

  Future<void> setVolume(double value) =>
      _prefs.setDouble(_keyVolume, value.clamp(0.0, 1.0));

  bool get nip38StatusEnabled => _prefs.getBool(_keyNip38Enabled) ?? false;

  Future<void> setNip38StatusEnabled(bool value) =>
      _prefs.setBool(_keyNip38Enabled, value);

  bool get hasCompletedOnboarding => _prefs.getBool(_keyOnboardingDone) ?? false;

  Future<void> setOnboardingCompleted(bool value) =>
      _prefs.setBool(_keyOnboardingDone, value);

  /// Per-account NIP-60 wallet opt-in. Switched OFF by default.
  bool isNip60EnabledForAccount(String pubkey) =>
      _prefs.getBool('$_keyNip60EnabledPrefix$pubkey') ?? false;

  Future<void> setNip60EnabledForAccount(String pubkey, bool enabled) =>
      _prefs.setBool('$_keyNip60EnabledPrefix$pubkey', enabled);
}
