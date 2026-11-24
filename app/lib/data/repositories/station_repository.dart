import '../../domain/models/now_playing.dart';
import '../../domain/models/social.dart';
import '../../domain/models/station.dart';
import '../services/preferences_service.dart';
import '../services/wavefunc_backend.dart';

/// Single source of truth for station discovery, search, facets, and local bookmarks.
class StationRepository {
  StationRepository({
    required this._backend,
    required this._preferences,
  });

  final WavefuncBackend _backend;
  final PreferencesService _preferences;

  List<Station> _cachedStations = const [];
  List<FeaturedList> _cachedFeaturedLists = const [];
  StationFacets _cachedFacets = const StationFacets();
  RelayStatus? _relayStatus;

  List<Station> get cachedStations => _cachedStations;
  List<FeaturedList> get cachedFeaturedLists => _cachedFeaturedLists;
  StationFacets get cachedFacets => _cachedFacets;
  RelayStatus? get relayStatus => _relayStatus;
  String get currentRelayUrl => _preferences.relayUrl;
  Set<String> get bookmarkedAddresses => _preferences.bookmarkedAddresses;
  List<String> get recentAddresses => _preferences.recentAddresses;
  double get savedVolume => _preferences.volume;

  Future<RelayStatus> connectInitialRelay() async {
    final status = await _backend.connectRelay(_preferences.relayUrl);
    _relayStatus = status;
    return status;
  }

  Future<RelayStatus> switchRelay(String relayUrl) async {
    final status = await _backend.connectRelay(relayUrl);
    await _preferences.setRelayUrl(status.relayUrl);
    _relayStatus = status;
    _cachedStations = const [];
    _cachedFeaturedLists = const [];
    _cachedFacets = const StationFacets();
    return status;
  }

  Future<List<Station>> loadStations({int limit = 250}) async {
    final stations = await _backend.fetchStations(limit: limit);
    _cachedStations = stations;
    _cachedFacets = await _backend.getStationFacets();
    _relayStatus = await _backend.getRelayStatus();
    return stations;
  }

  Future<List<FeaturedList>> loadFeaturedLists() async {
    final lists = await _backend.fetchFeaturedLists();
    _cachedFeaturedLists = lists;
    return lists;
  }

  Future<List<Station>> searchStations({
    String? query,
    String? genre,
    String? country,
    String? language,
    int limit = 150,
  }) async {
    return _backend.searchStations(
      query: query,
      genre: genre,
      country: country,
      language: language,
      limit: limit,
    );
  }

  Future<Station?> resolveStationByAddress(String address) async {
    for (final s in _cachedStations) {
      if (s.address == address) return s;
    }
    return _backend.fetchStationByAddress(address);
  }

  Future<List<Station>> resolveStationsByAddresses(
    List<String> addresses,
  ) async {
    if (addresses.isEmpty) return const [];
    return _backend.fetchStationsByAddresses(addresses);
  }

  Future<List<FeaturedList>> fetchUserFavoritesLists() async {
    final lists = await _backend.fetchUserFavorites();
    final allAddresses = <String>{};
    for (final list in lists) {
      allAddresses.addAll(list.stationAddresses);
    }
    if (allAddresses.isNotEmpty) {
      await _preferences.setBookmarkedAddresses(allAddresses);
    }
    return lists;
  }

  Future<NowPlayingMetadata?> extractStreamMetadata({
    required String streamUrl,
    String? stationAddress,
    String? sessionId,
  }) {
    return _backend.extractStreamMetadata(
      streamUrl: streamUrl,
      stationAddress: stationAddress,
      sessionId: sessionId,
    );
  }

  Future<Set<String>> toggleBookmark(String stationAddress) async {
    final next = Set<String>.from(_preferences.bookmarkedAddresses);
    if (!next.add(stationAddress)) {
      next.remove(stationAddress);
    }
    await _preferences.setBookmarkedAddresses(next);
    return next;
  }

  Future<Set<String>> syncUserFavoritesFromNostr() async {
    final lists = await _backend.fetchUserFavorites();
    final synced = <String>{};
    for (final list in lists) {
      synced.addAll(list.stationAddresses);
    }
    if (synced.isNotEmpty) {
      await _preferences.setBookmarkedAddresses(synced);
    }
    return synced;
  }

  Future<StationSocialSummary> fetchStationSocial({
    required String stationAddress,
    required String stationEventId,
  }) {
    return _backend.fetchStationSocial(
      stationAddress: stationAddress,
      stationEventId: stationEventId,
    );
  }

  Future<List<StationCardCounts>> fetchStationsSocialCounts(
    List<String> addresses,
  ) {
    if (addresses.isEmpty) return Future.value(const []);
    return _backend.fetchStationsSocialCounts(addresses);
  }

  Future<void> recordRecentStation(String stationAddress) =>
      _preferences.recordRecentAddress(stationAddress);

  Future<void> saveVolume(double volume) => _preferences.setVolume(volume);

  Future<void> dispose() => _backend.dispose();
}
