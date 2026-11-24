import 'package:material_ui/material_ui.dart';

import '../../../../domain/models/station.dart';
import '../../../core/theme/sonic_machine_theme.dart';
import '../../../core/widgets/sonic_plate.dart';
import '../../../core/widgets/station_thumbnail.dart';
import '../../discover/view_models/discover_view_model.dart';
import '../../player/view_models/player_view_model.dart';

/// Compact mobile sheet for creating or editing a user Nostr favorites list (`kind 30078`).
class FavoritesListEditorSheet extends StatefulWidget {
  const FavoritesListEditorSheet({
    super.key,
    required this.discoverViewModel,
    this.existingList,
    this.initialStationAddress,
  });

  final DiscoverViewModel discoverViewModel;
  final FeaturedList? existingList;
  final String? initialStationAddress;

  @override
  State<FavoritesListEditorSheet> createState() =>
      _FavoritesListEditorSheetState();
}

class _FavoritesListEditorSheetState extends State<FavoritesListEditorSheet> {
  late final TextEditingController _nameController;
  late final TextEditingController _descController;
  bool _saving = false;
  String? _error;

  bool get _isEditing => widget.existingList != null;

  @override
  void initState() {
    super.initState();
    _nameController = TextEditingController(
      text: widget.existingList?.name ?? '',
    );
    _descController = TextEditingController(
      text: widget.existingList?.description ?? '',
    );
  }

  @override
  void dispose() {
    _nameController.dispose();
    _descController.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    final name = _nameController.text.trim();
    if (name.isEmpty) {
      setState(() => _error = 'Enter a list name.');
      return;
    }
    setState(() {
      _saving = true;
      _error = null;
    });
    try {
      final desc = _descController.text.trim();
      if (_isEditing) {
        await widget.discoverViewModel.updateFavoritesList(
          favoritesId: widget.existingList!.favoritesId,
          name: name,
          description: desc.isEmpty ? null : desc,
        );
      } else {
        await widget.discoverViewModel.createFavoritesList(
          name: name,
          description: desc.isEmpty ? null : desc,
          stationAddresses: widget.initialStationAddress != null
              ? [widget.initialStationAddress!]
              : const [],
        );
      }
      if (mounted) Navigator.of(context).pop(true);
    } catch (e) {
      if (mounted) {
        setState(() {
          _error = '$e';
          _saving = false;
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final bottomInset = MediaQuery.of(context).viewInsets.bottom;
    return Container(
      decoration: const BoxDecoration(
        color: SonicColors.foundation,
        border: Border(top: BorderSide(color: SonicColors.ink, width: 3)),
      ),
      padding: EdgeInsets.only(bottom: bottomInset),
      child: SafeArea(
        top: false,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(20, 12, 20, 22),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Center(
                child: Container(width: 44, height: 4, color: SonicColors.ink),
              ),
              const SizedBox(height: 12),
              Text(
                _isEditing
                    ? 'EDIT_FAVORITES_LIST // KIND 30078'
                    : 'NEW_FAVORITES_LIST // KIND 30078',
                style: SonicMachineTheme.labelTech(
                  fontSize: 10,
                  color: SonicColors.signalRed,
                  letterSpacing: 1.6,
                ),
              ),
              const SizedBox(height: 10),
              if (_error != null) ...[
                SonicPlate(
                  backgroundColor: SonicColors.signalRed,
                  shadowOffset: Offset.zero,
                  padding: const EdgeInsets.all(8),
                  child: Text(
                    _error!,
                    style: SonicMachineTheme.labelTech(
                      fontSize: 10.5,
                      color: SonicColors.onSignal,
                    ),
                  ),
                ),
                const SizedBox(height: 10),
              ],
              TextField(
                controller: _nameController,
                autofocus: true,
                textInputAction: TextInputAction.next,
                decoration: const InputDecoration(
                  hintText: 'LIST NAME (E.G. LATE NIGHT DUB)',
                ),
              ),
              const SizedBox(height: 10),
              TextField(
                controller: _descController,
                maxLines: 2,
                minLines: 1,
                decoration: const InputDecoration(
                  hintText: 'SHORT DESCRIPTION (OPTIONAL)',
                ),
              ),
              const SizedBox(height: 16),
              Row(
                mainAxisAlignment: MainAxisAlignment.end,
                children: [
                  SonicPowerButton(
                    label: 'Cancel',
                    primary: false,
                    compact: true,
                    onPressed: _saving ? null : () => Navigator.of(context).pop(),
                  ),
                  const SizedBox(width: 10),
                  SonicPowerButton(
                    label: _saving
                        ? 'Publishing...'
                        : (_isEditing ? 'Save List' : 'Create List'),
                    icon: _isEditing ? Icons.check : Icons.add,
                    compact: true,
                    onPressed: _saving ? null : _submit,
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// Compact 1-tap sheet for adding/removing a station across multiple Nostr favorites lists.
class StationFavoritesPickerSheet extends StatefulWidget {
  const StationFavoritesPickerSheet({
    super.key,
    required this.station,
    required this.discoverViewModel,
  });

  final Station station;
  final DiscoverViewModel discoverViewModel;

  @override
  State<StationFavoritesPickerSheet> createState() =>
      _StationFavoritesPickerSheetState();
}

class _StationFavoritesPickerSheetState
    extends State<StationFavoritesPickerSheet> {
  String? _busyListId;

  Future<void> _toggleList(FeaturedList list) async {
    setState(() => _busyListId = list.favoritesId);
    try {
      await widget.discoverViewModel.toggleStationInList(
        list,
        widget.station.address,
      );
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Failed to update list: $e')),
        );
      }
    } finally {
      if (mounted) setState(() => _busyListId = null);
    }
  }

  Future<void> _createAndAdd() async {
    await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (_) => FavoritesListEditorSheet(
        discoverViewModel: widget.discoverViewModel,
        initialStationAddress: widget.station.address,
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return ListenableBuilder(
      listenable: widget.discoverViewModel,
      builder: (context, _) {
        final lists = widget.discoverViewModel.userFavoriteLists;

        return Container(
          decoration: const BoxDecoration(
            color: SonicColors.foundation,
            border: Border(top: BorderSide(color: SonicColors.ink, width: 3)),
          ),
          child: SafeArea(
            top: false,
            child: Padding(
              padding: const EdgeInsets.fromLTRB(16, 12, 16, 20),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Center(
                    child:
                        Container(width: 44, height: 4, color: SonicColors.ink),
                  ),
                  const SizedBox(height: 12),
                  Row(
                    children: [
                      StationThumbnail(
                        url: widget.station.thumbnail,
                        size: 38,
                      ),
                      const SizedBox(width: 10),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              'SAVE TO LIST',
                              style: SonicMachineTheme.labelTech(
                                fontSize: 9.5,
                                color: SonicColors.signalRed,
                              ),
                            ),
                            Text(
                              widget.station.name,
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: Theme.of(context).textTheme.titleMedium,
                            ),
                          ],
                        ),
                      ),
                      SonicPowerButton(
                        label: 'New',
                        icon: Icons.add,
                        compact: true,
                        onPressed: _createAndAdd,
                      ),
                    ],
                  ),
                  const SizedBox(height: 12),
                  Container(height: 2, color: SonicColors.seamOutline),
                  const SizedBox(height: 10),
                  if (lists.isEmpty)
                    Padding(
                      padding: const EdgeInsets.symmetric(vertical: 12),
                      child: Row(
                        children: [
                          Expanded(
                            child: Text(
                              'No synced lists yet. Tap NEW or quick-save to "My Favorite Stations".',
                              style: Theme.of(context).textTheme.bodySmall,
                            ),
                          ),
                          const SizedBox(width: 10),
                          SonicPowerButton(
                            label: 'Quick Save',
                            compact: true,
                            onPressed: () async {
                              await widget.discoverViewModel
                                  .toggleBookmark(widget.station);
                              if (context.mounted) Navigator.of(context).pop();
                            },
                          ),
                        ],
                      ),
                    )
                  else
                    ConstrainedBox(
                      constraints: const BoxConstraints(maxHeight: 280),
                      child: ListView.separated(
                        shrinkWrap: true,
                        itemCount: lists.length,
                        separatorBuilder: (_, _) => const SizedBox(height: 8),
                        itemBuilder: (context, index) {
                          final list = lists[index];
                          final inList = list.stationAddresses
                              .contains(widget.station.address);
                          final busy = _busyListId == list.favoritesId;

                          return SonicPlate(
                            backgroundColor: inList
                                ? SonicColors.ink
                                : SonicColors.surfacePlate,
                            shadowColor: inList
                                ? SonicColors.voltageCyan
                                : SonicColors.ink,
                            shadowOffset: const Offset(2, 2),
                            padding: const EdgeInsets.symmetric(
                              horizontal: 12,
                              vertical: 10,
                            ),
                            onTap: busy ? null : () => _toggleList(list),
                            child: Row(
                              children: [
                                if (busy)
                                  SizedBox(
                                    width: 18,
                                    height: 18,
                                    child: CircularProgressIndicator(
                                      strokeWidth: 2,
                                      color: inList
                                          ? SonicColors.voltageCyan
                                          : SonicColors.signalRed,
                                    ),
                                  )
                                else
                                  Icon(
                                    inList
                                        ? Icons.check_box
                                        : Icons.check_box_outline_blank,
                                    size: 20,
                                    color: inList
                                        ? SonicColors.voltageCyan
                                        : SonicColors.ink,
                                  ),
                                const SizedBox(width: 10),
                                Expanded(
                                  child: Text(
                                    list.name.toUpperCase(),
                                    maxLines: 1,
                                    overflow: TextOverflow.ellipsis,
                                    style: SonicMachineTheme.labelTech(
                                      fontSize: 11.5,
                                      color: inList
                                          ? SonicColors.foundation
                                          : SonicColors.ink,
                                    ),
                                  ),
                                ),
                                Text(
                                  '${list.stationAddresses.length}',
                                  style: SonicMachineTheme.labelTech(
                                    fontSize: 10,
                                    color: inList
                                        ? SonicColors.voltageCyan
                                        : SonicColors.seamOutline,
                                  ),
                                ),
                              ],
                            ),
                          );
                        },
                      ),
                    ),
                ],
              ),
            ),
          ),
        );
      },
    );
  }
}

/// Compact mobile-redesigned detail sheet for both Curated Featured Lists and User Favorites Lists.
class CompactListDetailSheet extends StatefulWidget {
  const CompactListDetailSheet({
    super.key,
    required this.list,
    required this.discoverViewModel,
    required this.playerViewModel,
    required this.onOpenStationDetail,
    this.isEditableUserList = false,
  });

  final FeaturedList list;
  final DiscoverViewModel discoverViewModel;
  final PlayerViewModel playerViewModel;
  final ValueChanged<Station> onOpenStationDetail;
  final bool isEditableUserList;

  @override
  State<CompactListDetailSheet> createState() => _CompactListDetailSheetState();
}

class _CompactListDetailSheetState extends State<CompactListDetailSheet> {
  late Future<List<Station>> _stationsFuture;
  String? _removingAddr;

  @override
  void initState() {
    super.initState();
    _stationsFuture =
        widget.discoverViewModel.resolveFeaturedListStations(widget.list);
  }

  Future<void> _removeStation(FeaturedList currentList, Station station) async {
    setState(() => _removingAddr = station.address);
    try {
      await widget.discoverViewModel
          .toggleStationInList(currentList, station.address);
      if (mounted) {
        final refreshed = _currentList;
        setState(() {
          _stationsFuture =
              widget.discoverViewModel.resolveFeaturedListStations(refreshed);
        });
      }
    } finally {
      if (mounted) setState(() => _removingAddr = null);
    }
  }

  FeaturedList get _currentList {
    if (!widget.isEditableUserList) return widget.list;
    for (final l in widget.discoverViewModel.userFavoriteLists) {
      if (l.favoritesId == widget.list.favoritesId) return l;
    }
    return widget.list;
  }

  @override
  Widget build(BuildContext context) {
    return ListenableBuilder(
      listenable: Listenable.merge([
        widget.discoverViewModel,
        widget.playerViewModel,
      ]),
      builder: (context, _) {
        final list = _currentList;
        final currentPlayingAddr =
            widget.playerViewModel.currentStation?.address;
        final isPlaying = widget.playerViewModel.isPlaying;

        return DraggableScrollableSheet(
          initialChildSize: 0.68,
          minChildSize: 0.42,
          maxChildSize: 0.92,
          expand: false,
          builder: (context, scrollController) {
            return Container(
              decoration: const BoxDecoration(
                color: SonicColors.foundation,
                border: Border(
                  top: BorderSide(color: SonicColors.ink, width: 3),
                ),
              ),
              child: SafeArea(
                top: false,
                child: Column(
                  children: [
                    Padding(
                      padding: const EdgeInsets.fromLTRB(16, 10, 16, 10),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Center(
                            child: Container(
                              width: 44,
                              height: 4,
                              color: SonicColors.ink,
                            ),
                          ),
                          const SizedBox(height: 12),
                          Row(
                            children: [
                              Container(
                                width: 42,
                                height: 42,
                                color: SonicColors.ink,
                                alignment: Alignment.center,
                                child: Text(
                                  '${list.stationAddresses.length}'
                                      .padLeft(2, '0'),
                                  style: SonicMachineTheme.labelTech(
                                    fontSize: 15,
                                    color: SonicColors.voltageCyan,
                                  ),
                                ),
                              ),
                              const SizedBox(width: 10),
                              Expanded(
                                child: Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    Text(
                                      widget.isEditableUserList
                                          ? 'YOUR_LIST // KIND 30078'
                                          : 'CURATED_COLLECTION',
                                      style: SonicMachineTheme.labelTech(
                                        fontSize: 9.5,
                                        color: SonicColors.signalRed,
                                      ),
                                    ),
                                    Text(
                                      list.name,
                                      maxLines: 1,
                                      overflow: TextOverflow.ellipsis,
                                      style: Theme.of(context)
                                          .textTheme
                                          .titleLarge
                                          ?.copyWith(fontSize: 18),
                                    ),
                                  ],
                                ),
                              ),
                            ],
                          ),
                          if (list.description != null &&
                              list.description!.trim().isNotEmpty) ...[
                            const SizedBox(height: 6),
                            Text(
                              list.description!.trim(),
                              maxLines: 2,
                              overflow: TextOverflow.ellipsis,
                              style: Theme.of(context).textTheme.bodySmall,
                            ),
                          ],
                          const SizedBox(height: 10),
                          Container(height: 2, color: SonicColors.seamOutline),
                        ],
                      ),
                    ),
                    Expanded(
                      child: FutureBuilder<List<Station>>(
                        future: _stationsFuture,
                        builder: (context, snapshot) {
                          if (snapshot.connectionState !=
                              ConnectionState.done) {
                            return const Center(
                              child: CircularProgressIndicator(
                                color: SonicColors.signalRed,
                              ),
                            );
                          }
                          final stations = snapshot.data ?? const [];
                          if (stations.isEmpty) {
                            return const Center(
                              child: Text('No stations in this list yet.'),
                            );
                          }
                          return ListView.separated(
                            controller: scrollController,
                            padding: const EdgeInsets.fromLTRB(16, 2, 16, 24),
                            itemCount: stations.length,
                            separatorBuilder: (_, _) =>
                                const SizedBox(height: 8),
                            itemBuilder: (context, index) {
                              final station = stations[index];
                              final active =
                                  currentPlayingAddr == station.address &&
                                      isPlaying;
                              final removing = _removingAddr == station.address;

                              return SonicPlate(
                                backgroundColor: active
                                    ? SonicColors.foundation
                                    : SonicColors.surfacePlate,
                                shadowColor: active
                                    ? SonicColors.voltageCyan
                                    : SonicColors.ink,
                                shadowOffset: const Offset(2, 2),
                                padding: const EdgeInsets.symmetric(
                                  horizontal: 10,
                                  vertical: 8,
                                ),
                                onTap: () {
                                  Navigator.of(context).pop();
                                  widget.onOpenStationDetail(station);
                                },
                                child: Row(
                                  children: [
                                    StationThumbnail(
                                      url: station.thumbnail,
                                      size: 38,
                                      highlight: active,
                                    ),
                                    const SizedBox(width: 10),
                                    Expanded(
                                      child: Column(
                                        crossAxisAlignment:
                                            CrossAxisAlignment.start,
                                        children: [
                                          Text(
                                            station.name,
                                            maxLines: 1,
                                            overflow: TextOverflow.ellipsis,
                                            style: Theme.of(context)
                                                .textTheme
                                                .titleSmall,
                                          ),
                                          const SizedBox(height: 2),
                                          Row(
                                            children: [
                                              if (station.primaryStream != null)
                                                Text(
                                                  station.primaryStream!
                                                      .formatBadge,
                                                  style: SonicMachineTheme
                                                      .labelTech(
                                                    fontSize: 9,
                                                    color:
                                                        SonicColors.signalRed,
                                                  ),
                                                ),
                                              if (station.primaryStream !=
                                                  null)
                                                const SizedBox(width: 6),
                                              Expanded(
                                                child: Text(
                                                  station.subtitle
                                                      .toUpperCase(),
                                                  maxLines: 1,
                                                  overflow:
                                                      TextOverflow.ellipsis,
                                                  style: SonicMachineTheme
                                                      .labelTech(
                                                    fontSize: 9,
                                                    color: SonicColors
                                                        .seamOutline,
                                                  ),
                                                ),
                                              ),
                                            ],
                                          ),
                                        ],
                                      ),
                                    ),
                                    const SizedBox(width: 6),
                                    GestureDetector(
                                      onTap: () => widget.playerViewModel
                                          .togglePlayStation(station),
                                      child: Container(
                                        width: 34,
                                        height: 34,
                                        decoration: BoxDecoration(
                                          color: active
                                              ? SonicColors.voltageCyan
                                              : SonicColors.signalRed,
                                          border: Border.all(
                                            color: SonicColors.ink,
                                            width: 1.5,
                                          ),
                                        ),
                                        alignment: Alignment.center,
                                        child: Icon(
                                          active
                                              ? Icons.pause
                                              : Icons.play_arrow,
                                          size: 18,
                                          color: active
                                              ? SonicColors.ink
                                              : SonicColors.onSignal,
                                        ),
                                      ),
                                    ),
                                    if (widget.isEditableUserList) ...[
                                      const SizedBox(width: 4),
                                      IconButton(
                                        onPressed: removing
                                            ? null
                                            : () =>
                                                _removeStation(list, station),
                                        visualDensity: VisualDensity.compact,
                                        padding: EdgeInsets.zero,
                                        constraints: const BoxConstraints(
                                          minWidth: 28,
                                          minHeight: 28,
                                        ),
                                        icon: removing
                                            ? const SizedBox(
                                                width: 14,
                                                height: 14,
                                                child:
                                                    CircularProgressIndicator(
                                                  strokeWidth: 2,
                                                  color: SonicColors.ink,
                                                ),
                                              )
                                            : const Icon(
                                                Icons.close,
                                                size: 18,
                                                color: SonicColors.ink,
                                              ),
                                      ),
                                    ],
                                  ],
                                ),
                              );
                            },
                          );
                        },
                      ),
                    ),
                  ],
                ),
              ),
            );
          },
        );
      },
    );
  }
}
