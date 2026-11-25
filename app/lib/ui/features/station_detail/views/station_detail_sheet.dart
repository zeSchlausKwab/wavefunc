import 'package:flutter/services.dart';
import 'package:material_ui/material_ui.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../../../domain/models/social.dart';
import '../../../../domain/models/station.dart';
import '../../../core/theme/sonic_machine_theme.dart';
import '../../../core/widgets/sonic_plate.dart';
import '../../../core/widgets/station_thumbnail.dart';
import '../../auth/view_models/auth_view_model.dart';
import '../../discover/view_models/discover_view_model.dart';
import '../../player/view_models/player_view_model.dart';
import '../../crate/view_models/crate_view_model.dart';
import '../../player/views/song_history.dart';

class StationDetailSheet extends StatefulWidget {
  const StationDetailSheet({
    super.key,
    required this.station,
    required this.discoverViewModel,
    required this.playerViewModel,
    required this.authViewModel,
    required this.crateViewModel,
    required this.onRequestLogin,
    this.onOpenFavoritesPicker,
    this.onOpenZap,
    this.focusComment = false,
  });

  final Station station;
  final DiscoverViewModel discoverViewModel;
  final PlayerViewModel playerViewModel;
  final AuthViewModel authViewModel;
  final CrateViewModel crateViewModel;
  final VoidCallback onRequestLogin;
  final VoidCallback? onOpenFavoritesPicker;
  final VoidCallback? onOpenZap;
  final bool focusComment;

  @override
  State<StationDetailSheet> createState() => _StationDetailSheetState();
}

class _StationDetailSheetState extends State<StationDetailSheet> {
  final _commentController = TextEditingController();
  final _commentFocusNode = FocusNode();
  final _commentSectionKey = GlobalKey();
  StationSocialSummary? _social;
  bool _loadingSocial = true;
  bool _submitting = false;
  StationComment? _replyTarget;

  @override
  void initState() {
    super.initState();
    _loadSocial();
    if (widget.focusComment) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        Future<void>.delayed(const Duration(milliseconds: 220), () {
          if (!mounted) return;
          final ctx = _commentSectionKey.currentContext;
          if (ctx != null && ctx.mounted) {
            Scrollable.ensureVisible(
              ctx,
              duration: const Duration(milliseconds: 260),
              curve: Curves.easeOut,
              alignment: 0.15,
            );
          }
          _commentFocusNode.requestFocus();
        });
      });
    }
  }

  @override
  void dispose() {
    _commentController.dispose();
    _commentFocusNode.dispose();
    super.dispose();
  }

  Future<void> _loadSocial() async {
    try {
      final summary =
          await widget.discoverViewModel.fetchStationSocial(widget.station);
      if (mounted) {
        setState(() {
          _social = summary;
          _loadingSocial = false;
        });
      }
    } catch (_) {
      if (mounted) {
        setState(() => _loadingSocial = false);
      }
    }
  }

  Future<void> _handleReact() async {
    if (!widget.authViewModel.isLoggedIn) {
      widget.onRequestLogin();
      return;
    }
    setState(() => _submitting = true);
    try {
      await widget.discoverViewModel.reactToStation(widget.station);
      await _loadSocial();
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Reaction published to Nostr')),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Reaction failed: $e')),
        );
      }
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  Future<void> _handlePostComment() async {
    if (!widget.authViewModel.isLoggedIn) {
      widget.onRequestLogin();
      return;
    }
    final text = _commentController.text.trim();
    if (text.isEmpty) return;

    setState(() => _submitting = true);
    try {
      await widget.discoverViewModel.postStationComment(
        widget.station,
        content: text,
        replyTo: _replyTarget,
      );
      _commentController.clear();
      setState(() => _replyTarget = null);
      await _loadSocial();
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Comment failed: $e')),
        );
      }
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final bottomInset = MediaQuery.of(context).viewInsets.bottom;

    return ListenableBuilder(
      listenable: Listenable.merge([
        widget.discoverViewModel,
        widget.playerViewModel,
        widget.authViewModel,
      ]),
      builder: (context, _) {
        final station = widget.station;
        final isCurrent =
            widget.playerViewModel.currentStation?.address == station.address;
        final isPlaying = isCurrent && widget.playerViewModel.isPlaying;
        final bookmarked =
            widget.discoverViewModel.isBookmarked(station.address);
        final social = _social;

        return DraggableScrollableSheet(
          initialChildSize: 0.78,
          minChildSize: 0.5,
          maxChildSize: 0.94,
          expand: false,
          builder: (context, scrollController) {
            return Container(
              decoration: const BoxDecoration(
                color: SonicColors.foundation,
                border: Border(
                  top: BorderSide(color: SonicColors.ink, width: 3),
                ),
              ),
              padding: EdgeInsets.only(bottom: bottomInset),
              child: SafeArea(
                top: false,
                child: ListView(
                  controller: scrollController,
                  padding: const EdgeInsets.fromLTRB(20, 12, 20, 28),
                  children: [
                    Center(
                      child: Container(
                        width: 48,
                        height: 4,
                        color: SonicColors.ink,
                      ),
                    ),
                    const SizedBox(height: 16),
                    Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        StationThumbnail(
                          url: station.thumbnail,
                          size: 76,
                          borderWidth: 2.5,
                          highlight: isPlaying,
                        ),
                        const SizedBox(width: 14),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                station.name,
                                style: Theme.of(context)
                                    .textTheme
                                    .titleLarge
                                    ?.copyWith(height: 1.1),
                              ),
                              const SizedBox(height: 4),
                              Text(
                                station.subtitle.toUpperCase(),
                                style: SonicMachineTheme.labelTech(
                                  fontSize: 10.5,
                                  color: SonicColors.seamOutline,
                                ),
                              ),
                            ],
                          ),
                        ),
                      ],
                    ),
                    if (station.description != null &&
                        station.description!.trim().isNotEmpty) ...[
                      const SizedBox(height: 14),
                      Text(
                        station.description!.trim(),
                        style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                              height: 1.4,
                            ),
                      ),
                    ],
                    const SizedBox(height: 16),
                    Wrap(
                      spacing: 10,
                      runSpacing: 10,
                      children: [
                        SonicPowerButton(
                          label: isPlaying ? 'Pause' : 'Play',
                          icon: isPlaying ? Icons.pause : Icons.play_arrow,
                          active: isPlaying,
                          onPressed: () =>
                              widget.playerViewModel.togglePlayStation(station),
                        ),
                        SonicPowerButton(
                          label: bookmarked ? 'Saved' : 'Save',
                          icon: bookmarked
                              ? Icons.bookmark
                              : Icons.bookmark_border,
                          primary: false,
                          onPressed: () {
                            if (widget.authViewModel.isLoggedIn &&
                                widget.onOpenFavoritesPicker != null) {
                              widget.onOpenFavoritesPicker!();
                            } else {
                              widget.discoverViewModel.toggleBookmark(station);
                            }
                          },
                        ),
                        SonicPowerButton(
                          label:
                              'Like${social != null && social.reactionCount > 0 ? ' (${social.reactionCount})' : ''}',
                          icon: social?.userReacted == true
                              ? Icons.favorite
                              : Icons.favorite_border,
                          primary: false,
                          active: social?.userReacted == true,
                          onPressed: _submitting ? null : _handleReact,
                        ),
                        if (widget.onOpenZap != null)
                          SonicPowerButton(
                            label:
                                'Zap${social != null && social.zapSats > 0 ? ' (${social.zapSats})' : ''}',
                            icon: Icons.bolt,
                            primary: false,
                            active: social?.userZapped == true,
                            onPressed: widget.onOpenZap,
                          ),
                        if (station.website != null &&
                            station.website!.trim().startsWith('http'))
                          SonicPowerButton(
                            label: 'Web',
                            icon: Icons.open_in_new,
                            primary: false,
                            onPressed: () async {
                              final uri = Uri.tryParse(station.website!.trim());
                              if (uri != null) {
                                await launchUrl(
                                  uri,
                                  mode: LaunchMode.externalApplication,
                                );
                              }
                            },
                          ),
                      ],
                    ),
                    const SizedBox(height: 20),
                    const SonicSectionHeader(title: 'AVAILABLE_STREAMS'),
                    const SizedBox(height: 10),
                    for (var i = 0; i < station.streams.length; i++)
                      Padding(
                        padding: const EdgeInsets.only(bottom: 8),
                        child: SonicPlate(
                          backgroundColor: isCurrent &&
                                  widget.playerViewModel.snapshot.streamIndex ==
                                      i
                              ? SonicColors.voltageCyan.withValues(alpha: 0.25)
                              : SonicColors.surfacePlate,
                          shadowOffset: const Offset(2, 2),
                          padding: const EdgeInsets.symmetric(
                            horizontal: 12,
                            vertical: 10,
                          ),
                          onTap: () => widget.playerViewModel.playStation(
                            station,
                            streamIndex: i,
                          ),
                          child: Row(
                            children: [
                              SonicTag(
                                label: station.streams[i].formatBadge,
                                inverted: true,
                              ),
                              const SizedBox(width: 10),
                              Expanded(
                                child: Text(
                                  station.streams[i].url,
                                  maxLines: 1,
                                  overflow: TextOverflow.ellipsis,
                                  style: Theme.of(context).textTheme.bodySmall,
                                ),
                              ),
                              const SizedBox(width: 6),
                              const Icon(Icons.play_arrow, size: 18),
                            ],
                          ),
                        ),
                      ),

                    const SizedBox(height: 18),
                    StationSongHistory(address: station.address, crate: widget.crateViewModel,
                      auth: widget.authViewModel, onRequestLogin: widget.onRequestLogin),

                    // ── NIP-22 Comments Section ──
                    const SizedBox(height: 18),
                    Container(
                      key: _commentSectionKey,
                      child: SonicSectionHeader(
                        title: 'STATION_COMMENTS // NIP-22',
                        trailing: Text(
                          _loadingSocial
                              ? 'LOADING...'
                              : '${social?.commentCount ?? 0}',
                          style: SonicMachineTheme.labelTech(
                            fontSize: 10,
                            color: SonicColors.seamOutline,
                          ),
                        ),
                      ),
                    ),
                    const SizedBox(height: 10),
                    if (_replyTarget != null) ...[
                      Row(
                        children: [
                          Expanded(
                            child: Text(
                              'REPLYING TO ${_replyTarget!.authorName.toUpperCase()}',
                              style: SonicMachineTheme.labelTech(
                                fontSize: 9.5,
                                color: SonicColors.signalRed,
                              ),
                            ),
                          ),
                          GestureDetector(
                            onTap: () => setState(() => _replyTarget = null),
                            child: const Icon(Icons.close, size: 16),
                          ),
                        ],
                      ),
                      const SizedBox(height: 6),
                    ],
                    Row(
                      crossAxisAlignment: CrossAxisAlignment.end,
                      children: [
                        Expanded(
                          child: TextField(
                            controller: _commentController,
                            focusNode: _commentFocusNode,
                            minLines: 1,
                            maxLines: 3,
                            decoration: InputDecoration(
                              hintText: widget.authViewModel.isLoggedIn
                                  ? 'LEAVE_A_COMMENT...'
                                  : 'SIGN IN TO COMMENT...',
                            ),
                          ),
                        ),
                        const SizedBox(width: 8),
                        SonicPowerButton(
                          label: widget.authViewModel.isLoggedIn
                              ? 'Send'
                              : 'Sign In',
                          compact: true,
                          onPressed: _submitting ? null : _handlePostComment,
                        ),
                      ],
                    ),
                    const SizedBox(height: 12),
                    if (_loadingSocial)
                      const Padding(
                        padding: EdgeInsets.all(12),
                        child: Center(
                          child: CircularProgressIndicator(
                            color: SonicColors.signalRed,
                            strokeWidth: 2.5,
                          ),
                        ),
                      )
                    else if (social == null || social.comments.isEmpty)
                      Padding(
                        padding: const EdgeInsets.symmetric(vertical: 8),
                        child: Text(
                          'No comments yet. Start the signal log.',
                          style: Theme.of(context).textTheme.bodySmall,
                        ),
                      )
                    else
                      ...social.comments.map((comment) {
                        final indent = (comment.depth.clamp(0, 4)) * 14.0;
                        return Padding(
                          padding: EdgeInsets.only(left: indent, bottom: 8),
                          child: SonicPlate(
                            backgroundColor: SonicColors.surfaceLow,
                            shadowOffset: const Offset(2, 2),
                            padding: const EdgeInsets.all(10),
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Row(
                                  children: [
                                    Expanded(
                                      child: Text(
                                        comment.authorName.toUpperCase(),
                                        style: SonicMachineTheme.labelTech(
                                          fontSize: 9.5,
                                          color: SonicColors.seamOutline,
                                        ),
                                      ),
                                    ),
                                    GestureDetector(
                                      onTap: () => setState(
                                        () => _replyTarget = comment,
                                      ),
                                      child: Text(
                                        'REPLY',
                                        style: SonicMachineTheme.labelTech(
                                          fontSize: 9,
                                          color: SonicColors.signalRed,
                                        ),
                                      ),
                                    ),
                                  ],
                                ),
                                const SizedBox(height: 4),
                                Text(
                                  comment.content,
                                  style: Theme.of(context).textTheme.bodySmall,
                                ),
                              ],
                            ),
                          ),
                        );
                      }),

                    const SizedBox(height: 16),
                    const SonicSectionHeader(title: 'NOSTR_COORDINATE'),
                    const SizedBox(height: 8),
                    SonicPlate(
                      backgroundColor: SonicColors.surfaceLow,
                      shadowOffset: Offset.zero,
                      padding: const EdgeInsets.all(10),
                      onTap: () {
                        Clipboard.setData(ClipboardData(text: station.naddr));
                        ScaffoldMessenger.of(context).showSnackBar(
                          const SnackBar(
                            content: Text('Copied station coordinate'),
                          ),
                        );
                      },
                      child: Row(
                        children: [
                          Expanded(
                            child: Text(
                              station.naddr,
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: SonicMachineTheme.labelTech(
                                fontSize: 10,
                                letterSpacing: 0.4,
                              ),
                            ),
                          ),
                          const SizedBox(width: 8),
                          const Icon(Icons.copy, size: 16),
                        ],
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

class FeaturedListSheet extends StatefulWidget {
  const FeaturedListSheet({
    super.key,
    required this.featuredList,
    required this.discoverViewModel,
    required this.playerViewModel,
  });

  final FeaturedList featuredList;
  final DiscoverViewModel discoverViewModel;
  final PlayerViewModel playerViewModel;

  @override
  State<FeaturedListSheet> createState() => _FeaturedListSheetState();
}

class _FeaturedListSheetState extends State<FeaturedListSheet> {
  late final Future<List<Station>> _stationsFuture;

  @override
  void initState() {
    super.initState();
    _stationsFuture = widget.discoverViewModel
        .resolveFeaturedListStations(widget.featuredList);
  }

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: const BoxDecoration(
        color: SonicColors.foundation,
        border: Border(top: BorderSide(color: SonicColors.ink, width: 3)),
      ),
      child: SafeArea(
        top: false,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(20, 12, 20, 24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Center(
                child: Container(width: 48, height: 4, color: SonicColors.ink),
              ),
              const SizedBox(height: 14),
              Text(
                'CURATED_COLLECTION',
                style: SonicMachineTheme.labelTech(
                  fontSize: 10,
                  color: SonicColors.signalRed,
                ),
              ),
              const SizedBox(height: 4),
              Text(
                widget.featuredList.name,
                style: Theme.of(context).textTheme.titleLarge,
              ),
              if (widget.featuredList.description != null) ...[
                const SizedBox(height: 6),
                Text(widget.featuredList.description!),
              ],
              const SizedBox(height: 14),
              Flexible(
                child: FutureBuilder<List<Station>>(
                  future: _stationsFuture,
                  builder: (context, snapshot) {
                    if (snapshot.connectionState != ConnectionState.done) {
                      return const Padding(
                        padding: EdgeInsets.all(24),
                        child: Center(
                          child: CircularProgressIndicator(
                            color: SonicColors.signalRed,
                          ),
                        ),
                      );
                    }
                    final stations = snapshot.data ?? const [];
                    if (stations.isEmpty) {
                      return const Padding(
                        padding: EdgeInsets.all(16),
                        child: Text('No stations resolved from this list.'),
                      );
                    }
                    return ListView.separated(
                      shrinkWrap: true,
                      itemCount: stations.length,
                      separatorBuilder: (_, _) => const SizedBox(height: 8),
                      itemBuilder: (context, index) {
                        final station = stations[index];
                        return SonicPlate(
                          shadowOffset: const Offset(2, 2),
                          padding: const EdgeInsets.all(10),
                          onTap: () {
                            widget.playerViewModel.playStation(station);
                            Navigator.of(context).pop();
                          },
                          child: Row(
                            children: [
                              StationThumbnail(
                                url: station.thumbnail,
                                size: 42,
                              ),
                              const SizedBox(width: 10),
                              Expanded(
                                child: Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    Text(
                                      station.name,
                                      maxLines: 1,
                                      overflow: TextOverflow.ellipsis,
                                      style: Theme.of(context)
                                          .textTheme
                                          .titleMedium,
                                    ),
                                    Text(
                                      station.subtitle.toUpperCase(),
                                      maxLines: 1,
                                      overflow: TextOverflow.ellipsis,
                                      style: SonicMachineTheme.labelTech(
                                        fontSize: 9.5,
                                        color: SonicColors.seamOutline,
                                      ),
                                    ),
                                  ],
                                ),
                              ),
                              const Icon(
                                Icons.play_arrow,
                                color: SonicColors.signalRed,
                              ),
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
      ),
    );
  }
}
