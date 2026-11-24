import 'package:material_ui/material_ui.dart';

import '../../../../domain/models/station.dart';
import '../../../core/theme/sonic_machine_theme.dart';
import '../../../core/widgets/sonic_plate.dart';
import '../../auth/view_models/auth_view_model.dart';
import '../../crate/view_models/crate_view_model.dart';
import '../../crate/views/crate_view.dart';
import '../../discover/view_models/discover_view_model.dart';
import '../../player/view_models/player_view_model.dart';
import 'favorites_sheets.dart';

enum _LibrarySegment { lists, crate }

/// Mobile-first redesigned Library screen combining:
/// 1. Compact User Favorites Lists (`kind 30078`) + Curated Collections
/// 2. Synced Song Crate (`kind 31337`)
class LibraryView extends StatefulWidget {
  const LibraryView({
    super.key,
    required this.discoverViewModel,
    required this.playerViewModel,
    required this.crateViewModel,
    required this.authViewModel,
    required this.onRequestLogin,
    required this.onOpenStationDetail,
  });

  final DiscoverViewModel discoverViewModel;
  final PlayerViewModel playerViewModel;
  final CrateViewModel crateViewModel;
  final AuthViewModel authViewModel;
  final VoidCallback onRequestLogin;
  final ValueChanged<Station> onOpenStationDetail;

  @override
  State<LibraryView> createState() => _LibraryViewState();
}

class _LibraryViewState extends State<LibraryView> {
  _LibrarySegment _segment = _LibrarySegment.lists;
  String? _playingListId;

  Future<void> _openCreateList() async {
    if (!widget.authViewModel.isLoggedIn) {
      widget.onRequestLogin();
      return;
    }
    await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (_) => FavoritesListEditorSheet(
        discoverViewModel: widget.discoverViewModel,
      ),
    );
  }

  Future<void> _openEditList(FeaturedList list) async {
    await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (_) => FavoritesListEditorSheet(
        discoverViewModel: widget.discoverViewModel,
        existingList: list,
      ),
    );
  }

  Future<void> _confirmDeleteList(FeaturedList list) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: SonicColors.foundation,
        shape: const RoundedRectangleBorder(
          borderRadius: BorderRadius.zero,
          side: BorderSide(color: SonicColors.ink, width: 2.5),
        ),
        title: Text(
          'DELETE LIST?',
          style: SonicMachineTheme.labelTech(fontSize: 13),
        ),
        content: Text(
          'Publish a NIP-09 deletion for "${list.name}"? Stations themselves are unaffected.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(false),
            child: const Text('CANCEL'),
          ),
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(true),
            child: const Text(
              'DELETE',
              style: TextStyle(color: SonicColors.signalRed),
            ),
          ),
        ],
      ),
    );
    if (confirmed == true) {
      try {
        await widget.discoverViewModel.deleteFavoritesList(list);
      } catch (e) {
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(content: Text('Delete failed: $e')),
          );
        }
      }
    }
  }

  Future<void> _playFirstInList(FeaturedList list) async {
    if (list.stationAddresses.isEmpty) return;
    setState(() => _playingListId = list.favoritesId);
    try {
      final stations =
          await widget.discoverViewModel.resolveFeaturedListStations(list);
      if (stations.isNotEmpty) {
        await widget.playerViewModel.playStation(stations.first);
      }
    } finally {
      if (mounted) setState(() => _playingListId = null);
    }
  }

  void _openListSheet(FeaturedList list, {required bool editable}) {
    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (_) => CompactListDetailSheet(
        list: list,
        discoverViewModel: widget.discoverViewModel,
        playerViewModel: widget.playerViewModel,
        onOpenStationDetail: widget.onOpenStationDetail,
        isEditableUserList: editable,
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return ListenableBuilder(
      listenable: Listenable.merge([
        widget.discoverViewModel,
        widget.authViewModel,
        widget.crateViewModel,
      ]),
      builder: (context, _) {
        final vm = widget.discoverViewModel;
        final auth = widget.authViewModel;

        return Column(
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 14, 16, 10),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              'NOSTR_LIBRARY // SYNCED',
                              style: SonicMachineTheme.labelTech(
                                fontSize: 10,
                                color: SonicColors.signalRed,
                                letterSpacing: 2.0,
                              ),
                            ),
                            Text(
                              'LIBRARY',
                              style: Theme.of(context)
                                  .textTheme
                                  .displayMedium
                                  ?.copyWith(fontSize: 28),
                            ),
                          ],
                        ),
                      ),
                      if (_segment == _LibrarySegment.lists)
                        SonicPowerButton(
                          label: 'New List',
                          icon: Icons.add,
                          compact: true,
                          onPressed: _openCreateList,
                        ),
                    ],
                  ),
                  const SizedBox(height: 12),
                  Row(
                    children: [
                      _SegmentPill(
                        label: 'FAV LISTS (${vm.userFavoriteLists.length})',
                        selected: _segment == _LibrarySegment.lists,
                        onTap: () =>
                            setState(() => _segment = _LibrarySegment.lists),
                      ),
                      const SizedBox(width: 8),
                      _SegmentPill(
                        label: 'SONG CRATE (${widget.crateViewModel.songs.length})',
                        selected: _segment == _LibrarySegment.crate,
                        onTap: () {
                          setState(() => _segment = _LibrarySegment.crate);
                          if (auth.isLoggedIn) {
                            widget.crateViewModel.refresh();
                          }
                        },
                      ),
                    ],
                  ),
                ],
              ),
            ),
            Expanded(
              child: _segment == _LibrarySegment.crate
                  ? CrateView(
                      crateViewModel: widget.crateViewModel,
                      authViewModel: widget.authViewModel,
                      playerViewModel: widget.playerViewModel,
                      onRequestLogin: widget.onRequestLogin,
                    )
                  : _buildListsBody(context, vm, auth),
            ),
          ],
        );
      },
    );
  }

  Widget _buildListsBody(
    BuildContext context,
    DiscoverViewModel vm,
    AuthViewModel auth,
  ) {
    return RefreshIndicator(
      color: SonicColors.signalRed,
      backgroundColor: SonicColors.foundation,
      onRefresh: () async {
        await vm.syncUserFavorites();
      },
      child: ListView(
        physics: const AlwaysScrollableScrollPhysics(),
        padding: const EdgeInsets.fromLTRB(16, 4, 16, 120),
        children: [
          // ── User Synced Lists ──
          SonicSectionHeader(
            title: 'YOUR_FAVORITES_LISTS',
            accent: true,
            trailing: vm.isFavoritesSyncing
                ? Text(
                    'SYNCING...',
                    style: SonicMachineTheme.labelTech(
                      fontSize: 9.5,
                      color: SonicColors.signalRed,
                    ),
                  )
                : null,
          ),
          const SizedBox(height: 10),
          if (!auth.isLoggedIn)
            SonicPlate(
              padding: const EdgeInsets.all(14),
              shadowOffset: const Offset(3, 3),
              child: Row(
                children: [
                  const Icon(Icons.lock_outline, size: 22),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          'SIGN IN TO SYNC LISTS',
                          style: SonicMachineTheme.labelTech(fontSize: 10.5),
                        ),
                        const SizedBox(height: 2),
                        Text(
                          'Create & sync kind-30078 station lists across devices.',
                          style: Theme.of(context).textTheme.bodySmall,
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(width: 8),
                  SonicPowerButton(
                    label: 'Sign In',
                    compact: true,
                    onPressed: widget.onRequestLogin,
                  ),
                ],
              ),
            )
          else if (vm.userFavoriteLists.isEmpty)
            SonicPlate(
              padding: const EdgeInsets.all(14),
              shadowOffset: const Offset(3, 3),
              child: Row(
                children: [
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          'NO FAVORITES LISTS YET',
                          style: SonicMachineTheme.labelTech(fontSize: 11),
                        ),
                        const SizedBox(height: 2),
                        Text(
                          'Tap NEW LIST or bookmark any station to start a collection.',
                          style: Theme.of(context).textTheme.bodySmall,
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(width: 10),
                  SonicPowerButton(
                    label: 'Create',
                    icon: Icons.add,
                    compact: true,
                    onPressed: _openCreateList,
                  ),
                ],
              ),
            )
          else
            for (final list in vm.userFavoriteLists)
              Padding(
                padding: const EdgeInsets.only(bottom: 8),
                child: _CompactListRow(
                  list: list,
                  isPlaying: _playingListId == list.favoritesId,
                  onOpen: () => _openListSheet(list, editable: true),
                  onPlayFirst: () => _playFirstInList(list),
                  onEdit: () => _openEditList(list),
                  onDelete: () => _confirmDeleteList(list),
                ),
              ),

          // ── Curated Featured Collections (compact mobile format) ──
          if (vm.featuredLists.isNotEmpty) ...[
            const SizedBox(height: 18),
            SonicSectionHeader(
              title: 'CURATED_COLLECTIONS',
              trailing: Text(
                '${vm.featuredLists.length} LISTS',
                style: SonicMachineTheme.labelTech(
                  fontSize: 9.5,
                  color: SonicColors.seamOutline,
                ),
              ),
            ),
            const SizedBox(height: 10),
            for (final list in vm.featuredLists)
              Padding(
                padding: const EdgeInsets.only(bottom: 8),
                child: _CompactListRow(
                  list: list,
                  curated: true,
                  isPlaying: _playingListId == list.favoritesId,
                  onOpen: () => _openListSheet(list, editable: false),
                  onPlayFirst: () => _playFirstInList(list),
                ),
              ),
          ],
        ],
      ),
    );
  }
}

/// Compact 62px mobile-redesigned Constructivist list row (replaces oversized web cards).
class _CompactListRow extends StatelessWidget {
  const _CompactListRow({
    required this.list,
    required this.onOpen,
    required this.onPlayFirst,
    this.curated = false,
    this.isPlaying = false,
    this.onEdit,
    this.onDelete,
  });

  final FeaturedList list;
  final VoidCallback onOpen;
  final VoidCallback onPlayFirst;
  final bool curated;
  final bool isPlaying;
  final VoidCallback? onEdit;
  final VoidCallback? onDelete;

  @override
  Widget build(BuildContext context) {
    final count = list.stationAddresses.length;
    return SonicPlate(
      backgroundColor: curated ? SonicColors.foundation : SonicColors.surfacePlate,
      shadowColor: curated ? SonicColors.signalRed : SonicColors.ink,
      shadowOffset: const Offset(3, 3),
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
      onTap: onOpen,
      child: Row(
        children: [
          Container(
            width: 42,
            height: 42,
            decoration: BoxDecoration(
              color: SonicColors.ink,
              border: Border.all(
                color: curated ? SonicColors.signalRed : SonicColors.voltageCyan,
                width: 1.5,
              ),
            ),
            alignment: Alignment.center,
            child: Text(
              '$count'.padLeft(2, '0'),
              style: SonicMachineTheme.labelTech(
                fontSize: 14,
                color: curated ? SonicColors.foundation : SonicColors.voltageCyan,
                letterSpacing: 0.5,
              ),
            ),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(
                  list.name,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: Theme.of(context).textTheme.titleMedium?.copyWith(
                        fontSize: 14,
                      ),
                ),
                const SizedBox(height: 2),
                Text(
                  (list.description != null &&
                          list.description!.trim().isNotEmpty)
                      ? list.description!.trim()
                      : '$count STATION${count == 1 ? '' : 'S'}',
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: Theme.of(context).textTheme.bodySmall?.copyWith(
                        color: SonicColors.seamOutline,
                        fontSize: 11,
                      ),
                ),
              ],
            ),
          ),
          const SizedBox(width: 6),
          if (count > 0)
            GestureDetector(
              onTap: isPlaying ? null : onPlayFirst,
              child: Container(
                width: 34,
                height: 34,
                decoration: BoxDecoration(
                  color: SonicColors.signalRed,
                  border: Border.all(color: SonicColors.ink, width: 1.5),
                ),
                alignment: Alignment.center,
                child: isPlaying
                    ? const SizedBox(
                        width: 14,
                        height: 14,
                        child: CircularProgressIndicator(
                          strokeWidth: 2,
                          color: SonicColors.onSignal,
                        ),
                      )
                    : const Icon(
                        Icons.play_arrow,
                        size: 18,
                        color: SonicColors.onSignal,
                      ),
              ),
            ),
          if (onEdit != null || onDelete != null)
            PopupMenuButton<String>(
              padding: EdgeInsets.zero,
              iconSize: 20,
              color: SonicColors.foundation,
              shape: const RoundedRectangleBorder(
                borderRadius: BorderRadius.zero,
                side: BorderSide(color: SonicColors.ink, width: 2),
              ),
              onSelected: (value) {
                if (value == 'edit') onEdit?.call();
                if (value == 'delete') onDelete?.call();
              },
              itemBuilder: (_) => [
                if (onEdit != null)
                  const PopupMenuItem(value: 'edit', child: Text('Rename / Edit')),
                if (onDelete != null)
                  const PopupMenuItem(
                    value: 'delete',
                    child: Text(
                      'Delete List',
                      style: TextStyle(color: SonicColors.signalRed),
                    ),
                  ),
              ],
            ),
        ],
      ),
    );
  }
}

class _SegmentPill extends StatelessWidget {
  const _SegmentPill({
    required this.label,
    required this.selected,
    required this.onTap,
  });

  final String label;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Expanded(
      child: SonicPlate(
        backgroundColor: selected ? SonicColors.ink : SonicColors.surfacePlate,
        shadowColor: selected ? SonicColors.voltageCyan : SonicColors.ink,
        shadowOffset: const Offset(3, 3),
        padding: const EdgeInsets.symmetric(vertical: 9),
        onTap: onTap,
        child: Center(
          child: Text(
            label,
            style: SonicMachineTheme.labelTech(
              fontSize: 10,
              color: selected ? SonicColors.foundation : SonicColors.ink,
            ),
          ),
        ),
      ),
    );
  }
}
