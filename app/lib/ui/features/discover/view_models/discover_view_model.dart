import 'dart:async';

import 'package:flutter/foundation.dart';

import '../../../../data/repositories/station_repository.dart';
import '../../../../domain/models/social.dart';
import '../../../../domain/models/station.dart';
import '../../auth/view_models/auth_view_model.dart';

/// MVVM ViewModel for station discovery, search, filtering, and relay switching.
class DiscoverViewModel extends ChangeNotifier {
  DiscoverViewModel({
    required this._repository,
    this._authViewModel,
  }) {
    _bookmarkedAddresses = _repository.bookmarkedAddresses;
  }

  final StationRepository _repository;
  final AuthViewModel? _authViewModel;

  List<Station> _allStations = const [];
  List<Station> _displayedStations = const [];
  List<FeaturedList> _featuredLists = const [];
  List<FeaturedList> _userFavoriteLists = const [];
  StationFacets _facets = const StationFacets();
  RelayStatus? _relayStatus;
  Set<String> _bookmarkedAddresses = const {};
  final Map<String, StationCardCounts> _socialCounts = {};
  int _socialHydrationToken = 0;

  String _searchQuery = '';
  String? _selectedGenre;
  String? _selectedCountry;
  String? _selectedLanguage;
  bool _onlyBookmarked = false;

  bool _isLoading = false;
  bool _isSearching = false;
  bool _isFavoritesSyncing = false;
  bool _tableViewMode = false;
  FeaturedList? _activeList;
  List<Station> _activeListStations = const [];
  bool _isLoadingActiveList = false;
  String? _errorMessage;
  Timer? _searchDebounce;

  List<Station> get stations =>
      _activeList != null ? _activeListStations : _displayedStations;
  List<Station> get allStations => _allStations;
  List<FeaturedList> get featuredLists => _featuredLists;
  List<FeaturedList> get userFavoriteLists => _userFavoriteLists;
  FeaturedList? get activeList => _activeList;
  bool get isLoadingActiveList => _isLoadingActiveList;
  bool get tableViewMode => _tableViewMode;
  StationFacets get facets => _facets;
  RelayStatus? get relayStatus => _relayStatus;
  String get currentRelayUrl => _repository.currentRelayUrl;
  Set<String> get bookmarkedAddresses => _bookmarkedAddresses;
  bool get isFavoritesSyncing => _isFavoritesSyncing;

  StationCardCounts socialCountsFor(String address) =>
      _socialCounts[address] ?? StationCardCounts(stationAddress: address);

  String get searchQuery => _searchQuery;
  String? get selectedGenre => _selectedGenre;
  String? get selectedCountry => _selectedCountry;
  String? get selectedLanguage => _selectedLanguage;
  bool get onlyBookmarked => _onlyBookmarked;
  bool get isLoading => _isLoading;
  bool get isSearching => _isSearching;
  String? get errorMessage => _errorMessage;

  bool get hasActiveFilters =>
      _searchQuery.trim().isNotEmpty ||
      _selectedGenre != null ||
      _selectedCountry != null ||
      _selectedLanguage != null ||
      _onlyBookmarked;

  bool isBookmarked(String address) => _bookmarkedAddresses.contains(address);

  Future<void> initialize() async {
    _isLoading = true;
    _errorMessage = null;
    notifyListeners();

    try {
      _relayStatus = await _repository.connectInitialRelay();
      await _loadCatalog();
    } catch (e) {
      _errorMessage = 'Relay connection failed: $e';
    } finally {
      _isLoading = false;
      notifyListeners();
    }
  }

  Future<void> refresh() async {
    _errorMessage = null;
    if (!_isLoading) {
      _isLoading = true;
      notifyListeners();
    }
    try {
      await _loadCatalog();
    } catch (e) {
      _errorMessage = 'Refresh failed: $e';
    } finally {
      _isLoading = false;
      notifyListeners();
    }
  }

  Future<void> _loadCatalog() async {
    final stations = await _repository.loadStations(limit: 250);
    _allStations = stations;
    _facets = _repository.cachedFacets;
    _relayStatus = _repository.relayStatus;

    try {
      _featuredLists = await _repository.loadFeaturedLists();
    } catch (_) {
      _featuredLists = const [];
    }

    if (hasActiveFilters) {
      await _executeFilterQuery();
    } else {
      _displayedStations = stations;
      unawaited(_hydrateSocialCounts(stations));
    }
  }

  Future<void> _hydrateSocialCounts(List<Station> stations) async {
    if (stations.isEmpty) return;
    final token = ++_socialHydrationToken;
    final addresses = stations.take(60).map((s) => s.address).toList();
    try {
      final fetched = await _repository.fetchStationsSocialCounts(addresses);
      if (token != _socialHydrationToken) return;
      for (final item in fetched) {
        _socialCounts[item.stationAddress] = item;
      }
      notifyListeners();
    } catch (_) {
      // Non-fatal: cards still show cleanly without counts.
    }
  }

  void toggleTableViewMode() {
    _tableViewMode = !_tableViewMode;
    notifyListeners();
  }

  void setTableViewMode(bool value) {
    if (_tableViewMode == value) return;
    _tableViewMode = value;
    notifyListeners();
  }

  Future<void> openListInStage(FeaturedList list) async {
    _activeList = list;
    _isLoadingActiveList = true;
    _activeListStations = const [];
    notifyListeners();
    try {
      final resolved = await resolveFeaturedListStations(list);
      if (_activeList?.address == list.address) {
        _activeListStations = resolved;
        unawaited(_hydrateSocialCounts(resolved));
      }
    } catch (e) {
      _errorMessage = 'Could not load list stations: $e';
    } finally {
      _isLoadingActiveList = false;
      notifyListeners();
    }
  }

  void clearActiveList() {
    if (_activeList == null) return;
    _activeList = null;
    _activeListStations = const [];
    _isLoadingActiveList = false;
    notifyListeners();
  }

  void setSearchQuery(String query) {
    if (_activeList != null && query.trim().isNotEmpty) {
      _activeList = null;
      _activeListStations = const [];
    }
    _searchQuery = query;
    notifyListeners();

    _searchDebounce?.cancel();
    _searchDebounce = Timer(const Duration(milliseconds: 280), () {
      unawaited(_executeFilterQuery());
    });
  }

  Future<void> selectGenre(String? genre) async {
    _activeList = null;
    _selectedGenre = _selectedGenre == genre ? null : genre;
    _onlyBookmarked = false;
    notifyListeners();
    await _executeFilterQuery();
  }

  Future<void> selectCountry(String? country) async {
    _activeList = null;
    _selectedCountry = _selectedCountry == country ? null : country;
    _onlyBookmarked = false;
    notifyListeners();
    await _executeFilterQuery();
  }

  Future<void> selectLanguage(String? language) async {
    _activeList = null;
    _selectedLanguage = _selectedLanguage == language ? null : language;
    _onlyBookmarked = false;
    notifyListeners();
    await _executeFilterQuery();
  }

  void toggleBookmarkedFilter() {
    _activeList = null;
    _onlyBookmarked = !_onlyBookmarked;
    _applyLocalView();
    notifyListeners();
  }

  Future<void> clearFilters() async {
    _searchDebounce?.cancel();
    _activeList = null;
    _activeListStations = const [];
    _searchQuery = '';
    _selectedGenre = null;
    _selectedCountry = null;
    _selectedLanguage = null;
    _onlyBookmarked = false;
    _displayedStations = _allStations;
    notifyListeners();
  }

  Future<void> _executeFilterQuery() async {
    if (!hasActiveFilters) {
      _displayedStations = _allStations;
      _isSearching = false;
      notifyListeners();
      return;
    }

    if (_onlyBookmarked &&
        _searchQuery.trim().isEmpty &&
        _selectedGenre == null &&
        _selectedCountry == null &&
        _selectedLanguage == null) {
      _applyLocalView();
      notifyListeners();
      return;
    }

    _isSearching = true;
    _errorMessage = null;
    notifyListeners();

    try {
      var results = await _repository.searchStations(
        query: _searchQuery.trim().isEmpty ? null : _searchQuery.trim(),
        genre: _selectedGenre,
        country: _selectedCountry,
        language: _selectedLanguage,
        limit: 150,
      );
      if (_onlyBookmarked) {
        results = results
            .where((s) => _bookmarkedAddresses.contains(s.address))
            .toList();
      }
      _displayedStations = results;
      unawaited(_hydrateSocialCounts(results));
    } catch (e) {
      _errorMessage = 'Search error: $e';
    } finally {
      _isSearching = false;
      notifyListeners();
    }
  }

  void _applyLocalView() {
    if (_onlyBookmarked) {
      _displayedStations = _allStations
          .where((s) => _bookmarkedAddresses.contains(s.address))
          .toList();
    } else {
      _displayedStations = _allStations;
    }
  }

  Future<void> syncUserFavorites() async {
    if (_authViewModel == null || !_authViewModel.isLoggedIn) {
      _userFavoriteLists = const [];
      notifyListeners();
      return;
    }
    _isFavoritesSyncing = true;
    notifyListeners();
    try {
      final lists = await _repository.fetchUserFavoritesLists();
      _userFavoriteLists = lists;
      final merged = <String>{};
      for (final list in lists) {
        merged.addAll(list.stationAddresses);
      }
      if (merged.isNotEmpty || lists.isNotEmpty) {
        _bookmarkedAddresses = merged;
        if (_onlyBookmarked) _applyLocalView();
      }
    } catch (_) {
      // Keep cached/local bookmarks if relay sync fails.
    } finally {
      _isFavoritesSyncing = false;
      notifyListeners();
    }
  }

  Future<bool> createFavoritesList({
    required String name,
    String? description,
    List<String> stationAddresses = const [],
  }) async {
    final auth = _authViewModel;
    if (auth == null || !auth.isLoggedIn) {
      throw StateError('Sign in to create favorites lists.');
    }
    _isFavoritesSyncing = true;
    notifyListeners();
    try {
      await auth.executeSignedAction(
        (backend) => backend.createFavoritesList(
          name: name,
          description: description,
          stationAddresses: stationAddresses,
        ),
      );
      await syncUserFavorites();
      return true;
    } finally {
      _isFavoritesSyncing = false;
      notifyListeners();
    }
  }

  Future<bool> updateFavoritesList({
    required String favoritesId,
    required String name,
    String? description,
  }) async {
    final auth = _authViewModel;
    if (auth == null || !auth.isLoggedIn) {
      throw StateError('Sign in to edit favorites lists.');
    }
    _isFavoritesSyncing = true;
    notifyListeners();
    try {
      await auth.executeSignedAction(
        (backend) => backend.updateFavoritesList(
          favoritesId: favoritesId,
          name: name,
          description: description,
        ),
      );
      await syncUserFavorites();
      return true;
    } finally {
      _isFavoritesSyncing = false;
      notifyListeners();
    }
  }

  Future<bool> deleteFavoritesList(FeaturedList list) async {
    final auth = _authViewModel;
    if (auth == null || !auth.isLoggedIn) {
      throw StateError('Sign in to delete favorites lists.');
    }
    _isFavoritesSyncing = true;
    notifyListeners();
    try {
      await auth.executeSignedAction(
        (backend) => backend.deleteFavoritesList(
          eventId: list.id,
          favoritesId: list.favoritesId,
        ),
      );
      await syncUserFavorites();
      return true;
    } finally {
      _isFavoritesSyncing = false;
      notifyListeners();
    }
  }

  Future<void> toggleStationInList(
    FeaturedList list,
    String stationAddress,
  ) async {
    final auth = _authViewModel;
    if (auth == null || !auth.isLoggedIn) {
      throw StateError('Sign in to edit favorites lists.');
    }
    final currentlyIn = list.stationAddresses.contains(stationAddress);
    _isFavoritesSyncing = true;
    notifyListeners();
    try {
      await auth.executeSignedAction(
        (backend) => backend.toggleStationInFavoritesList(
          favoritesId: list.favoritesId,
          stationAddress: stationAddress,
          add: !currentlyIn,
        ),
      );
      await syncUserFavorites();
    } finally {
      _isFavoritesSyncing = false;
      notifyListeners();
    }
  }

  Future<void> toggleBookmark(Station station) async {
    final wasBookmarked = _bookmarkedAddresses.contains(station.address);
    _bookmarkedAddresses = await _repository.toggleBookmark(station.address);
    if (_onlyBookmarked) {
      _applyLocalView();
    }
    notifyListeners();

    final auth = _authViewModel;
    if (auth != null && auth.isLoggedIn) {
      try {
        await auth.executeSignedAction(
          (backend) => backend.toggleStationInFavoritesList(
            favoritesId: _userFavoriteLists.isNotEmpty
                ? _userFavoriteLists.first.favoritesId
                : null,
            stationAddress: station.address,
            add: !wasBookmarked,
          ),
        );
        await syncUserFavorites();
      } catch (e) {
        _errorMessage = 'Saved locally; Nostr sync failed: $e';
        notifyListeners();
      }
    }
  }

  Future<StationSocialSummary> fetchStationSocial(Station station) async {
    final summary = await _repository.fetchStationSocial(
      stationAddress: station.address,
      stationEventId: station.id,
    );
    _socialCounts[station.address] = StationCardCounts(
      stationAddress: station.address,
      reactionCount: summary.reactionCount,
      userReacted: summary.userReacted,
      commentCount: summary.commentCount,
      zapCount: summary.zapCount,
      zapSats: summary.zapSats,
      userZapped: summary.userZapped,
    );
    notifyListeners();
    return summary;
  }

  Future<void> reactToStation(Station station) async {
    final auth = _authViewModel;
    if (auth == null || !auth.isLoggedIn) {
      throw StateError('Sign in to react to stations.');
    }
    final prev = socialCountsFor(station.address);
    if (!prev.userReacted) {
      _socialCounts[station.address] = prev.copyWith(
        reactionCount: prev.reactionCount + 1,
        userReacted: true,
      );
      notifyListeners();
    }
    try {
      await auth.executeSignedAction(
        (backend) => backend.reactToStation(
          stationId: station.id,
          stationPubkey: station.pubkey,
          stationAddress: station.address,
        ),
      );
    } catch (e) {
      _socialCounts[station.address] = prev;
      notifyListeners();
      rethrow;
    }
  }

  Future<void> postStationComment(
    Station station, {
    required String content,
    StationComment? replyTo,
  }) async {
    final auth = _authViewModel;
    if (auth == null || !auth.isLoggedIn) {
      throw StateError('Sign in to post comments.');
    }
    await auth.executeSignedAction(
      (backend) => backend.postStationComment(
        stationEventId: station.id,
        stationPubkey: station.pubkey,
        stationAddress: station.address,
        content: content,
        replyToId: replyTo?.id,
        replyToPubkey: replyTo?.pubkey,
      ),
    );
    final prev = socialCountsFor(station.address);
    _socialCounts[station.address] = prev.copyWith(
      commentCount: prev.commentCount + 1,
    );
    notifyListeners();
  }

  void recordLocalZap(Station station, int amountSats) {
    final prev = socialCountsFor(station.address);
    _socialCounts[station.address] = prev.copyWith(
      zapCount: prev.zapCount + 1,
      zapSats: prev.zapSats + amountSats,
      userZapped: true,
    );
    notifyListeners();
  }

  Future<void> switchRelay(String relayUrl) async {
    _isLoading = true;
    _errorMessage = null;
    notifyListeners();

    try {
      _relayStatus = await _repository.switchRelay(relayUrl);
      await clearFilters();
      await _loadCatalog();
    } catch (e) {
      _errorMessage = 'Could not connect to $relayUrl: $e';
    } finally {
      _isLoading = false;
      notifyListeners();
    }
  }

  Future<List<Station>> resolveFeaturedListStations(FeaturedList list) async {
    if (list.stationAddresses.isEmpty) return const [];
    return _repository.resolveStationsByAddresses(
      list.stationAddresses.take(50).toList(),
    );
  }

  @override
  void dispose() {
    _searchDebounce?.cancel();
    super.dispose();
  }
}
