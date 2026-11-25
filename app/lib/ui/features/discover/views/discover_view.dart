import 'package:flutter/services.dart';
import 'package:material_ui/material_ui.dart';

import '../../../../domain/models/station.dart';
import '../../../core/theme/sonic_machine_theme.dart';
import '../../../core/widgets/sonic_plate.dart';
import '../../../core/widgets/sonic_wf_cube.dart';
import '../../../core/widgets/station_thumbnail.dart';
import '../../auth/view_models/auth_view_model.dart';
import '../../crate/view_models/crate_view_model.dart';
import '../../crate/views/crate_view.dart';
import '../../crate/views/media_forge_sheet.dart';
import '../../player/view_models/player_view_model.dart';
import '../view_models/discover_view_model.dart';
import '../widgets/signal_charts_section.dart';
import 'station_card.dart';
import 'station_table_row.dart';

class DiscoverView extends StatefulWidget {
  const DiscoverView({
    super.key,
    required this.discoverViewModel,
    required this.playerViewModel,
    required this.authViewModel,
    this.crateViewModel,
    required this.onOpenStationDetail,
    required this.onOpenStationComment,
    required this.onOpenStationZap,
    required this.onOpenFeaturedList,
    required this.onOpenFavoritesPicker,
    required this.onOpenSessionMenu,
    required this.onRequestLogin,
    this.searchFocusNode,
    this.isWideLayout = false,
    this.isExpandedDesktop = false,
  });

  final DiscoverViewModel discoverViewModel;
  final PlayerViewModel playerViewModel;
  final AuthViewModel authViewModel;
  final CrateViewModel? crateViewModel;
  final ValueChanged<Station> onOpenStationDetail;
  final ValueChanged<Station> onOpenStationComment;
  final ValueChanged<Station> onOpenStationZap;
  final ValueChanged<FeaturedList> onOpenFeaturedList;
  final ValueChanged<Station> onOpenFavoritesPicker;
  final VoidCallback onOpenSessionMenu;
  final VoidCallback onRequestLogin;
  final FocusNode? searchFocusNode;
  final bool isWideLayout;
  final bool isExpandedDesktop;

  @override
  State<DiscoverView> createState() => _DiscoverViewState();
}

class _DiscoverViewState extends State<DiscoverView> {
  late final TextEditingController _searchController;
  final TextEditingController _songQueryController = TextEditingController();
  bool _songSearchMode = false;

  @override
  void initState() {
    super.initState();
    _searchController = TextEditingController(
      text: widget.discoverViewModel.searchQuery,
    );
  }

  @override
  void dispose() {
    _searchController.dispose();
    _songQueryController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return ListenableBuilder(
      listenable: Listenable.merge([
        widget.discoverViewModel,
        widget.playerViewModel,
        widget.authViewModel,
        if (widget.crateViewModel != null) widget.crateViewModel!,
      ]),
      builder: (context, _) {
        final vm = widget.discoverViewModel;
        final player = widget.playerViewModel;
        final auth = widget.authViewModel;
        final crate = widget.crateViewModel;
        final status = vm.relayStatus;

        if (!_songSearchMode && _searchController.text != vm.searchQuery) {
          _searchController.value = TextEditingValue(
            text: vm.searchQuery,
            selection: TextSelection.collapsed(offset: vm.searchQuery.length),
          );
        }

        return RefreshIndicator(
          color: SonicColors.signalRed,
          backgroundColor: SonicColors.foundation,
          onRefresh: vm.refresh,
          child: CustomScrollView(
            physics: const AlwaysScrollableScrollPhysics(),
            slivers: [
              // ── Header + Session Pill + Search input ──
              SliverToBoxAdapter(
                child: Padding(
                  padding: const EdgeInsets.fromLTRB(16, 14, 16, 10),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        crossAxisAlignment: CrossAxisAlignment.center,
                        children: [
                          if (!widget.isExpandedDesktop) ...[
                            SonicWfCube(
                              isPlaying: player.isPlaying,
                              size: 42,
                            ),
                            const SizedBox(width: 6),
                          ],
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Row(
                                  children: [
                                    Container(
                                      width: 6,
                                      height: 6,
                                      color: (status?.connected ?? false)
                                          ? SonicColors.voltageCyan
                                          : SonicColors.signalRed,
                                    ),
                                    const SizedBox(width: 6),
                                    Flexible(
                                      child: Text(
                                        'WAVEFUNC // RADIO',
                                        maxLines: 1,
                                        overflow: TextOverflow.ellipsis,
                                        style: SonicMachineTheme.labelTech(
                                          fontSize: 9.5,
                                          color: SonicColors.signalRed,
                                          letterSpacing: 1.5,
                                        ),
                                      ),
                                    ),
                                  ],
                                ),
                                const SizedBox(height: 1),
                                Text(
                                  vm.activeList != null
                                      ? vm.activeList!.name.toUpperCase()
                                      : 'LIVE SIGNALS',
                                  maxLines: 1,
                                  overflow: TextOverflow.ellipsis,
                                  style: Theme.of(context)
                                      .textTheme
                                      .displayMedium
                                      ?.copyWith(fontSize: 28),
                                ),
                              ],
                            ),
                          ),
                          if (!widget.isExpandedDesktop)
                            _SessionHeaderPill(
                              authViewModel: auth,
                              onTap: widget.onOpenSessionMenu,
                            ),
                        ],
                      ),
                      const SizedBox(height: 12),
                      Row(
                        children: [
                          Expanded(
                            child: _songSearchMode && crate != null
                                ? TextField(
                                    controller: _songQueryController,
                                    focusNode: widget.searchFocusNode,
                                    onSubmitted: (q) => crate.searchSongs(q),
                                    style: Theme.of(context)
                                        .textTheme
                                        .bodyMedium
                                        ?.copyWith(fontWeight: FontWeight.w600),
                                    decoration: InputDecoration(
                                      hintText:
                                          'SEARCH SONGS (MUSICBRAINZ)...',
                                      prefixIcon: const Icon(
                                        Icons.music_note,
                                        color: SonicColors.signalRed,
                                      ),
                                      suffixIcon: IconButton(
                                        icon: const Icon(
                                          Icons.arrow_forward,
                                          color: SonicColors.ink,
                                        ),
                                        tooltip: 'Search songs',
                                        onPressed: () => crate.searchSongs(
                                          _songQueryController.text,
                                        ),
                                      ),
                                    ),
                                  )
                                : TextField(
                                    controller: _searchController,
                                    focusNode: widget.searchFocusNode,
                                    onChanged: vm.setSearchQuery,
                                    style: Theme.of(context)
                                        .textTheme
                                        .bodyMedium
                                        ?.copyWith(fontWeight: FontWeight.w600),
                                    decoration: InputDecoration(
                                      hintText: widget.isWideLayout
                                          ? 'SEARCH_STATIONS, GENRES, CITIES...  (⌘K / /)'
                                          : 'SEARCH_STATIONS, GENRES, CITIES...',
                                      prefixIcon: const Icon(
                                        Icons.search,
                                        color: SonicColors.ink,
                                      ),
                                      suffixIcon: vm.searchQuery.isNotEmpty
                                          ? IconButton(
                                              icon: const Icon(
                                                Icons.close,
                                                color: SonicColors.ink,
                                              ),
                                              onPressed: () {
                                                _searchController.clear();
                                                vm.setSearchQuery('');
                                              },
                                            )
                                          : null,
                                    ),
                                  ),
                          ),
                          if (crate != null) ...[
                            const SizedBox(width: 8),
                            _SearchModeToggle(
                              songMode: _songSearchMode,
                              onChanged: (songs) =>
                                  setState(() => _songSearchMode = songs),
                            ),
                          ],
                          if (widget.isWideLayout && !_songSearchMode) ...[
                            const SizedBox(width: 8),
                            _ViewModeToggle(
                              tableMode: vm.tableViewMode,
                              onChanged: vm.setTableViewMode,
                            ),
                          ],
                        ],
                      ),
                      const SizedBox(height: 10),
                      if (_songSearchMode && crate != null)
                        _SongSearchResultsSection(
                          crateViewModel: crate,
                          authViewModel: auth,
                          onRequestLogin: widget.onRequestLogin,
                        )
                      else if (vm.activeList != null)
                        _ActiveListStageBanner(
                          list: vm.activeList!,
                          stations: vm.stations,
                          loading: vm.isLoadingActiveList,
                          onPlayFirst: vm.stations.isNotEmpty
                              ? () => player.playStation(vm.stations.first)
                              : null,
                          onBack: vm.clearActiveList,
                        )
                      else
                        _ActiveFilterStrip(vm: vm),
                    ],
                  ),
                ),
              ),

              // ── Error banner ──
              if (vm.errorMessage != null)
                SliverToBoxAdapter(
                  child: Padding(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 16,
                      vertical: 6,
                    ),
                    child: SonicPlate(
                      backgroundColor: SonicColors.signalRed,
                      borderColor: SonicColors.ink,
                      padding: const EdgeInsets.all(12),
                      child: Row(
                        children: [
                          const Icon(
                            Icons.warning_amber,
                            color: SonicColors.onSignal,
                            size: 18,
                          ),
                          const SizedBox(width: 8),
                          Expanded(
                            child: Text(
                              vm.errorMessage!,
                              style: SonicMachineTheme.labelTech(
                                fontSize: 11,
                                color: SonicColors.onSignal,
                                letterSpacing: 0.5,
                              ),
                            ),
                          ),
                          const SizedBox(width: 8),
                          SonicPowerButton(
                            label: 'Retry',
                            primary: false,
                            compact: true,
                            onPressed: vm.refresh,
                          ),
                        ],
                      ),
                    ),
                  ),
                ),

              // ── Compact Mobile/Tablet Featured Lists Cartridge Strip (58px tall) ──
              if (!widget.isExpandedDesktop &&
                  vm.activeList == null &&
                  !vm.hasActiveFilters &&
                  vm.featuredLists.isNotEmpty)
                SliverToBoxAdapter(
                  child: Padding(
                    padding: const EdgeInsets.fromLTRB(16, 4, 16, 12),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        SonicSectionHeader(
                          title: 'CURATED_LISTS',
                          accent: true,
                          trailing: Text(
                            '${vm.featuredLists.length} SETS',
                            style: SonicMachineTheme.labelTech(
                              fontSize: 9.5,
                              color: SonicColors.seamOutline,
                            ),
                          ),
                        ),
                        const SizedBox(height: 8),
                        SizedBox(
                          height: 58,
                          child: ListView.separated(
                            scrollDirection: Axis.horizontal,
                            itemCount: vm.featuredLists.length,
                            separatorBuilder: (_, _) =>
                                const SizedBox(width: 10),
                            itemBuilder: (context, index) {
                              final list = vm.featuredLists[index];
                              return SizedBox(
                                width: 176,
                                child: SonicPlate(
                                  backgroundColor: SonicColors.ink,
                                  borderColor: SonicColors.ink,
                                  shadowColor: SonicColors.signalRed,
                                  shadowOffset: const Offset(3, 3),
                                  padding: const EdgeInsets.symmetric(
                                    horizontal: 9,
                                    vertical: 7,
                                  ),
                                  onTap: () => widget.onOpenFeaturedList(list),
                                  child: Row(
                                    children: [
                                      Container(
                                        width: 30,
                                        height: 36,
                                        color: SonicColors.thumbnailDark,
                                        alignment: Alignment.center,
                                        child: Text(
                                          '${list.stationAddresses.length}'
                                              .padLeft(2, '0'),
                                          style: SonicMachineTheme.labelTech(
                                            fontSize: 12,
                                            color: SonicColors.voltageCyan,
                                            letterSpacing: 0.4,
                                          ),
                                        ),
                                      ),
                                      const SizedBox(width: 8),
                                      Expanded(
                                        child: Column(
                                          crossAxisAlignment:
                                              CrossAxisAlignment.start,
                                          mainAxisAlignment:
                                              MainAxisAlignment.center,
                                          children: [
                                            Text(
                                              list.name.toUpperCase(),
                                              maxLines: 1,
                                              overflow: TextOverflow.ellipsis,
                                              style:
                                                  SonicMachineTheme.labelTech(
                                                fontSize: 10.5,
                                                color: SonicColors.foundation,
                                                letterSpacing: 0.6,
                                              ),
                                            ),
                                            const SizedBox(height: 2),
                                            Text(
                                              'CURATED',
                                              style:
                                                  SonicMachineTheme.labelTech(
                                                fontSize: 8.5,
                                                color: SonicColors.seamMuted,
                                              ),
                                            ),
                                          ],
                                        ),
                                      ),
                                      const Icon(
                                        Icons.chevron_right,
                                        size: 16,
                                        color: SonicColors.voltageCyan,
                                      ),
                                    ],
                                  ),
                                ),
                              );
                            },
                          ),
                        ),
                      ],
                    ),
                  ),
                ),

              // ── Signed Observer Aggregate Lists (SIGNAL_CHARTS) ──
              if (!_songSearchMode &&
                  vm.activeList == null &&
                  !vm.hasActiveFilters &&
                  !vm.signalCharts.isEmpty)
                SliverToBoxAdapter(
                  child: SignalChartsSection(
                    discoverViewModel: vm,
                    playerViewModel: player,
                    authViewModel: auth,
                    crateViewModel: crate,
                    onOpenStationDetail: widget.onOpenStationDetail,
                    onRequestLogin: widget.onRequestLogin,
                    isWideLayout: widget.isWideLayout,
                  ),
                ),

              // ── Section header for station list ──
              SliverToBoxAdapter(
                child: Padding(
                  padding: const EdgeInsets.fromLTRB(16, 2, 16, 10),
                  child: SonicSectionHeader(
                    title: vm.onlyBookmarked
                        ? 'SAVED_FREQUENCIES'
                        : 'LIVE_STATIONS',
                    trailing: Text(
                      vm.isSearching
                          ? 'SCANNING...'
                          : '${vm.stations.length} SHOWN'
                              '${status?.totalStationCount != null ? ' / ${status!.totalStationCount} TOTAL' : ''}',
                      style: SonicMachineTheme.labelTech(
                        fontSize: 10,
                        color: SonicColors.seamOutline,
                      ),
                    ),
                  ),
                ),
              ),

              // ── Loading / Empty / Station Grid or Broadcast Table ──
              if ((vm.isLoading || vm.isLoadingActiveList) &&
                  vm.stations.isEmpty)
                const SliverFillRemaining(
                  hasScrollBody: false,
                  child: Center(
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        CircularProgressIndicator(
                          color: SonicColors.signalRed,
                          strokeWidth: 3,
                        ),
                        SizedBox(height: 16),
                        Text('TUNING RELAY FEED...'),
                      ],
                    ),
                  ),
                )
              else if (vm.stations.isEmpty)
                SliverFillRemaining(
                  hasScrollBody: false,
                  child: Center(
                    child: Padding(
                      padding: const EdgeInsets.all(24),
                      child: SonicPlate(
                        padding: const EdgeInsets.all(20),
                        child: Column(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            Text(
                              'NO SIGNALS MATCHED',
                              style: SonicMachineTheme.labelTech(fontSize: 13),
                            ),
                            const SizedBox(height: 8),
                            const Text(
                              'Clear active filters or pull down to rescan the Nostr relay.',
                              textAlign: TextAlign.center,
                            ),
                            if (vm.hasActiveFilters ||
                                vm.activeList != null) ...[
                              const SizedBox(height: 14),
                              SonicPowerButton(
                                label: 'Reset Filters',
                                onPressed: vm.clearFilters,
                              ),
                            ],
                          ],
                        ),
                      ),
                    ),
                  ),
                )
              else if (widget.isWideLayout && vm.tableViewMode)
                SliverPadding(
                  padding: EdgeInsets.fromLTRB(
                    16,
                    0,
                    16,
                    widget.isWideLayout ? 24 : 120,
                  ),
                  sliver: SliverList.separated(
                    itemCount: vm.stations.length,
                    separatorBuilder: (_, _) => const SizedBox(height: 6),
                    itemBuilder: (context, index) => _buildTableRow(
                      vm.stations[index],
                      vm,
                      player,
                      auth,
                    ),
                  ),
                )
              else
                SliverLayoutBuilder(
                  builder: (context, constraints) {
                    final crossAxisCount = constraints.crossAxisExtent >= 1000
                        ? 3
                        : (constraints.crossAxisExtent >= 640 ? 2 : 1);
                    final bottomPad = widget.isWideLayout ? 24.0 : 120.0;

                    if (crossAxisCount == 1) {
                      return SliverPadding(
                        padding: EdgeInsets.fromLTRB(16, 0, 16, bottomPad),
                        sliver: SliverList.separated(
                          itemCount: vm.stations.length,
                          separatorBuilder: (_, _) =>
                              const SizedBox(height: 12),
                          itemBuilder: (context, index) => _buildCard(
                            vm.stations[index],
                            vm,
                            player,
                            auth,
                          ),
                        ),
                      );
                    }

                    return SliverPadding(
                      padding: EdgeInsets.fromLTRB(16, 0, 16, bottomPad),
                      sliver: SliverGrid(
                        gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(
                          crossAxisCount: crossAxisCount,
                          mainAxisSpacing: 14,
                          crossAxisSpacing: 14,
                          mainAxisExtent: 192,
                        ),
                        delegate: SliverChildBuilderDelegate(
                          (context, index) => _buildCard(
                            vm.stations[index],
                            vm,
                            player,
                            auth,
                          ),
                          childCount: vm.stations.length,
                        ),
                      ),
                    );
                  },
                ),
            ],
          ),
        );
      },
    );
  }

  Future<void> _handleLike(
    Station station,
    DiscoverViewModel vm,
    AuthViewModel auth,
  ) async {
    if (!auth.isLoggedIn) {
      widget.onRequestLogin();
      return;
    }
    try {
      await vm.reactToStation(station);
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Liked ${station.name}')),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Like failed: $e')),
        );
      }
    }
  }

  void _handleShare(Station station) {
    final link = 'https://wavefunc.live/station/${station.naddr}';
    Clipboard.setData(ClipboardData(text: link));
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text('Copied station link for ${station.name}')),
    );
  }

  Widget _buildCard(
    Station station,
    DiscoverViewModel vm,
    PlayerViewModel player,
    AuthViewModel auth,
  ) {
    final isCurrent = player.currentStation?.address == station.address;
    return StationCard(
      station: station,
      isCurrent: isCurrent,
      playerPhase: player.snapshot.phase,
      isBookmarked: vm.isBookmarked(station.address),
      socialCounts: vm.socialCountsFor(station.address),
      onPlayToggle: () => player.togglePlayStation(station),
      onTapDetail: () => widget.onOpenStationDetail(station),
      onLike: () => _handleLike(station, vm, auth),
      onComment: () => widget.onOpenStationComment(station),
      onZap: () => widget.onOpenStationZap(station),
      onShare: () => _handleShare(station),
      onToggleBookmark: () {
        if (auth.isLoggedIn) {
          widget.onOpenFavoritesPicker(station);
        } else {
          vm.toggleBookmark(station);
        }
      },
      onGenreTap: vm.selectGenre,
    );
  }

  Widget _buildTableRow(
    Station station,
    DiscoverViewModel vm,
    PlayerViewModel player,
    AuthViewModel auth,
  ) {
    final isCurrent = player.currentStation?.address == station.address;
    return StationTableRow(
      station: station,
      isCurrent: isCurrent,
      playerPhase: player.snapshot.phase,
      isBookmarked: vm.isBookmarked(station.address),
      socialCounts: vm.socialCountsFor(station.address),
      onPlayToggle: () => player.togglePlayStation(station),
      onTapDetail: () => widget.onOpenStationDetail(station),
      onLike: () => _handleLike(station, vm, auth),
      onComment: () => widget.onOpenStationComment(station),
      onZap: () => widget.onOpenStationZap(station),
      onShare: () => _handleShare(station),
      onToggleBookmark: () {
        if (auth.isLoggedIn) {
          widget.onOpenFavoritesPicker(station);
        } else {
          vm.toggleBookmark(station);
        }
      },
    );
  }
}

class _ViewModeToggle extends StatelessWidget {
  const _ViewModeToggle({
    required this.tableMode,
    required this.onChanged,
  });

  final bool tableMode;
  final ValueChanged<bool> onChanged;

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        color: SonicColors.surfacePlate,
        border: Border.all(color: SonicColors.ink, width: 2),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          _ModeSegment(
            icon: Icons.grid_view,
            tooltip: 'Card Grid View',
            active: !tableMode,
            onTap: () => onChanged(false),
          ),
          Container(width: 2, height: 38, color: SonicColors.ink),
          _ModeSegment(
            icon: Icons.view_list,
            tooltip: 'Broadcast Table View',
            active: tableMode,
            onTap: () => onChanged(true),
          ),
        ],
      ),
    );
  }
}

class _ModeSegment extends StatelessWidget {
  const _ModeSegment({
    required this.icon,
    required this.tooltip,
    required this.active,
    required this.onTap,
  });

  final IconData icon;
  final String tooltip;
  final bool active;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Tooltip(
      message: tooltip,
      child: InkWell(
        onTap: onTap,
        child: Container(
          width: 40,
          height: 38,
          color: active ? SonicColors.ink : SonicColors.surfacePlate,
          alignment: Alignment.center,
          child: Icon(
            icon,
            size: 18,
            color: active ? SonicColors.voltageCyan : SonicColors.ink,
          ),
        ),
      ),
    );
  }
}

class _ActiveListStageBanner extends StatelessWidget {
  const _ActiveListStageBanner({
    required this.list,
    required this.stations,
    required this.loading,
    required this.onPlayFirst,
    required this.onBack,
  });

  final FeaturedList list;
  final List<Station> stations;
  final bool loading;
  final VoidCallback? onPlayFirst;
  final VoidCallback onBack;

  @override
  Widget build(BuildContext context) {
    return SonicPlate(
      backgroundColor: SonicColors.ink,
      shadowColor: SonicColors.signalRed,
      shadowOffset: const Offset(4, 4),
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'ACTIVE COLLECTION // ${list.stationAddresses.length} STATIONS',
                  style: SonicMachineTheme.labelTech(
                    fontSize: 9.5,
                    color: SonicColors.voltageCyan,
                  ),
                ),
                if (list.description != null &&
                    list.description!.trim().isNotEmpty) ...[
                  const SizedBox(height: 3),
                  Text(
                    list.description!.trim(),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: Theme.of(context).textTheme.bodySmall?.copyWith(
                          color: SonicColors.foundation,
                        ),
                  ),
                ],
              ],
            ),
          ),
          const SizedBox(width: 10),
          if (!loading && onPlayFirst != null) ...[
            SonicPowerButton(
              label: 'Play First',
              icon: Icons.play_arrow,
              compact: true,
              onPressed: onPlayFirst,
            ),
            const SizedBox(width: 8),
          ],
          SonicPowerButton(
            label: 'All Stations',
            icon: Icons.arrow_back,
            primary: false,
            compact: true,
            onPressed: onBack,
          ),
        ],
      ),
    );
  }
}

class _SessionHeaderPill extends StatelessWidget {
  const _SessionHeaderPill({
    required this.authViewModel,
    required this.onTap,
  });

  final AuthViewModel authViewModel;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final session = authViewModel.session;

    if (session == null) {
      return SonicPowerButton(
        label: 'Sign In',
        icon: Icons.key,
        compact: true,
        onPressed: onTap,
      );
    }

    final walletSats = authViewModel.displayWalletBalanceSats;
    final isSyncing = authViewModel.isNip60Syncing;

    return SonicPlate(
      backgroundColor: SonicColors.ink,
      shadowColor: SonicColors.voltageCyan,
      shadowOffset: const Offset(3, 3),
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 5),
      onTap: onTap,
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          StationThumbnail(
            url: session.profile?.picture,
            size: 24,
            borderWidth: 1,
            highlight: true,
          ),
          const SizedBox(width: 6),
          ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 108),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(
                  session.displayName.toUpperCase(),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: SonicMachineTheme.labelTech(
                    fontSize: 9.5,
                    color: SonicColors.foundation,
                    letterSpacing: 0.7,
                  ),
                ),
                if (walletSats != null || isSyncing)
                  Text(
                    isSyncing && walletSats == null
                        ? '⚡ SYNCING...'
                        : '⚡ $walletSats SATS',
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: SonicMachineTheme.labelTech(
                      fontSize: 8.5,
                      color: SonicColors.voltageCyan,
                      letterSpacing: 0.5,
                    ),
                  ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _SearchModeToggle extends StatelessWidget {
  const _SearchModeToggle({
    required this.songMode,
    required this.onChanged,
  });

  final bool songMode;
  final ValueChanged<bool> onChanged;

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        border: Border.all(color: SonicColors.ink, width: 2),
        color: SonicColors.surfacePlate,
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          _buildSegment(
            icon: Icons.radio,
            tooltip: 'Search Stations',
            selected: !songMode,
            onTap: () => onChanged(false),
          ),
          Container(width: 1.5, height: 34, color: SonicColors.ink),
          _buildSegment(
            icon: Icons.music_note,
            tooltip: 'Search Songs (MusicBrainz)',
            selected: songMode,
            onTap: () => onChanged(true),
          ),
        ],
      ),
    );
  }

  Widget _buildSegment({
    required IconData icon,
    required String tooltip,
    required bool selected,
    required VoidCallback onTap,
  }) {
    return Tooltip(
      message: tooltip,
      child: InkWell(
        onTap: onTap,
        child: Container(
          width: 36,
          height: 36,
          color: selected ? SonicColors.ink : Colors.transparent,
          alignment: Alignment.center,
          child: Icon(
            icon,
            size: 18,
            color: selected ? SonicColors.voltageCyan : SonicColors.ink,
          ),
        ),
      ),
    );
  }
}

class _SongSearchResultsSection extends StatelessWidget {
  const _SongSearchResultsSection({
    required this.crateViewModel,
    required this.authViewModel,
    required this.onRequestLogin,
  });

  final CrateViewModel crateViewModel;
  final AuthViewModel authViewModel;
  final VoidCallback onRequestLogin;

  @override
  Widget build(BuildContext context) {
    if (crateViewModel.isSearchingSongs) {
      return const Padding(
        padding: EdgeInsets.symmetric(vertical: 20),
        child: Center(
          child: CircularProgressIndicator(color: SonicColors.signalRed),
        ),
      );
    }
    if (crateViewModel.songSearchError != null) {
      return SonicPlate(
        backgroundColor: SonicColors.signalRed,
        shadowOffset: Offset.zero,
        padding: const EdgeInsets.all(10),
        child: Text(
          crateViewModel.songSearchError!,
          style: SonicMachineTheme.labelTech(
            fontSize: 10,
            color: SonicColors.onSignal,
          ),
        ),
      );
    }
    if (crateViewModel.searchResults.isEmpty) {
      return SonicPlate(
        shadowOffset: Offset.zero,
        padding: const EdgeInsets.all(12),
        child: Text(
          crateViewModel.lastSongQuery.isEmpty
              ? 'TYPE A SONG OR ARTIST AND PRESS ENTER TO SEARCH MUSICBRAINZ & BACK UP TO BLOSSOM'
              : 'NO RECORDINGS MATCHED "${crateViewModel.lastSongQuery.toUpperCase()}"',
          style: SonicMachineTheme.labelTech(
            fontSize: 9.5,
            color: SonicColors.seamOutline,
          ),
        ),
      );
    }
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        SonicSectionHeader(
          title: 'MUSICBRAINZ_RECORDINGS',
          accent: true,
          trailing: Text(
            '${crateViewModel.searchResults.length} MATCHES',
            style: SonicMachineTheme.labelTech(
              fontSize: 9.5,
              color: SonicColors.seamOutline,
            ),
          ),
        ),
        const SizedBox(height: 8),
        for (final rec in crateViewModel.searchResults)
          Padding(
            padding: const EdgeInsets.only(bottom: 8),
            child: SongRecordingCard(
              recording: rec,
              alreadySaved: crateViewModel.savedSong(
                rec.title, rec.artist, mbid: rec.id,
              ) != null,
              isSaving: crateViewModel.isSaving,
              onSave: () async {
                if (!authViewModel.isLoggedIn) {
                  onRequestLogin();
                  return;
                }
                final id = await crateViewModel.saveRecording(rec);
                if (!context.mounted) return;
                ScaffoldMessenger.of(context).showSnackBar(
                  SnackBar(
                    content: Text(
                      id != null
                          ? 'Saved "${rec.title}" to Song Crate'
                          : 'Could not save song',
                    ),
                  ),
                );
              },
              onBackupToBlossom: () {
                if (!authViewModel.isLoggedIn) {
                  onRequestLogin();
                  return;
                }
                MediaForgeSheet.open(
                  context,
                  crateViewModel: crateViewModel,
                  authViewModel: authViewModel,
                  onRequestLogin: onRequestLogin,
                  recording: rec,
                );
              },
            ),
          ),
      ],
    );
  }
}

class _ActiveFilterStrip extends StatelessWidget {
  const _ActiveFilterStrip({required this.vm});

  final DiscoverViewModel vm;

  @override
  Widget build(BuildContext context) {
    final quickGenres = vm.facets.genres.take(8).toList();
    return SingleChildScrollView(
      scrollDirection: Axis.horizontal,
      child: Row(
        children: [
          SonicTag(
            label: 'SAVED (${vm.bookmarkedAddresses.length})',
            highlighted: vm.onlyBookmarked,
            onTap: vm.toggleBookmarkedFilter,
          ),
          if (vm.selectedGenre != null) ...[
            const SizedBox(width: 6),
            SonicTag(
              label: 'GENRE: ${vm.selectedGenre} ×',
              highlighted: true,
              onTap: () => vm.selectGenre(vm.selectedGenre),
            ),
          ],
          if (vm.selectedCountry != null) ...[
            const SizedBox(width: 6),
            SonicTag(
              label: 'REGION: ${vm.selectedCountry} ×',
              highlighted: true,
              onTap: () => vm.selectCountry(vm.selectedCountry),
            ),
          ],
          if (vm.selectedLanguage != null) ...[
            const SizedBox(width: 6),
            SonicTag(
              label: 'LANG: ${vm.selectedLanguage} ×',
              highlighted: true,
              onTap: () => vm.selectLanguage(vm.selectedLanguage),
            ),
          ],
          if (vm.hasActiveFilters) ...[
            const SizedBox(width: 6),
            SonicTag(
              label: 'CLEAR ALL',
              inverted: true,
              onTap: vm.clearFilters,
            ),
          ] else
            ...quickGenres.map(
              (facet) => Padding(
                padding: const EdgeInsets.only(left: 6),
                child: SonicTag(
                  label: facet.name,
                  onTap: () => vm.selectGenre(facet.name),
                ),
              ),
            ),
        ],
      ),
    );
  }
}
