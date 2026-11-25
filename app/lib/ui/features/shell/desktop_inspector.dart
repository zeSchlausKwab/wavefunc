import 'package:flutter/services.dart';
import 'package:material_ui/material_ui.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../../domain/models/social.dart';
import '../../../domain/models/station.dart';
import '../../core/theme/sonic_machine_theme.dart';
import '../../core/widgets/sonic_plate.dart';
import '../../core/widgets/sonic_visualizer.dart';
import '../../core/widgets/station_thumbnail.dart';
import '../auth/view_models/auth_view_model.dart';
import '../crate/view_models/crate_view_model.dart';
import '../discover/view_models/discover_view_model.dart';
import '../player/view_models/player_view_model.dart';
import '../player/views/track_crate_button.dart';
import '../player/views/song_history.dart';
import '../wallet/views/zap_sheet.dart';

enum InspectorKind { station, nowPlaying, zap }

class InspectorState {
  const InspectorState._({
    required this.kind,
    this.station,
    this.focusComment = false,
    this.requestToken = 0,
  });

  factory InspectorState.station(
    Station station, {
    bool focusComment = false,
    int requestToken = 0,
  }) =>
      InspectorState._(
        kind: InspectorKind.station,
        station: station,
        focusComment: focusComment,
        requestToken: requestToken,
      );

  factory InspectorState.nowPlaying({int requestToken = 0}) =>
      InspectorState._(
        kind: InspectorKind.nowPlaying,
        requestToken: requestToken,
      );

  factory InspectorState.zap(Station station, {int requestToken = 0}) =>
      InspectorState._(
        kind: InspectorKind.zap,
        station: station,
        requestToken: requestToken,
      );

  final InspectorKind kind;
  final Station? station;
  final bool focusComment;
  final int requestToken;
}

/// Right-hand Constructivist Inspector Pane for Desktop (docked) & Tablet (slide-over).
/// Displays Station Details + NIP-22 Comments, Live Studio Deck Visualizer, or Zap Panel.
class DesktopInspector extends StatelessWidget {
  const DesktopInspector({
    super.key,
    required this.state,
    required this.discoverViewModel,
    required this.playerViewModel,
    required this.authViewModel,
    required this.crateViewModel,
    required this.onClose,
    required this.onRequestLogin,
    required this.onOpenFavoritesPicker,
    required this.onOpenZap,
    required this.onOpenWalletSettings,
  });

  final InspectorState state;
  final DiscoverViewModel discoverViewModel;
  final PlayerViewModel playerViewModel;
  final AuthViewModel authViewModel;
  final CrateViewModel crateViewModel;
  final VoidCallback onClose;
  final VoidCallback onRequestLogin;
  final ValueChanged<Station> onOpenFavoritesPicker;
  final ValueChanged<Station> onOpenZap;
  final VoidCallback onOpenWalletSettings;

  String get _headerTitle => switch (state.kind) {
        InspectorKind.station => 'STATION_INSPECTOR',
        InspectorKind.nowPlaying => 'STUDIO_DECK // MONITOR',
        InspectorKind.zap => 'LIGHTNING_ZAP // NIP-57',
      };

  @override
  Widget build(BuildContext context) {
    return Container(
      width: 368,
      decoration: const BoxDecoration(
        color: SonicColors.foundation,
        border: Border(
          left: BorderSide(color: SonicColors.ink, width: 2.5),
        ),
      ),
      child: Column(
        children: [
          // ── Inspector Header ──
          Container(
            height: 46,
            padding: const EdgeInsets.symmetric(horizontal: 14),
            decoration: const BoxDecoration(
              color: SonicColors.surfacePlate,
              border: Border(
                bottom: BorderSide(color: SonicColors.ink, width: 2),
              ),
            ),
            child: Row(
              children: [
                Container(width: 8, height: 8, color: SonicColors.signalRed),
                const SizedBox(width: 8),
                Expanded(
                  child: Text(
                    _headerTitle,
                    style: SonicMachineTheme.labelTech(
                      fontSize: 10,
                      letterSpacing: 1.4,
                    ),
                  ),
                ),
                InkWell(
                  onTap: onClose,
                  child: Container(
                    width: 26,
                    height: 26,
                    decoration: BoxDecoration(
                      color: SonicColors.foundation,
                      border: Border.all(color: SonicColors.ink, width: 1.5),
                    ),
                    alignment: Alignment.center,
                    child: const Icon(Icons.close, size: 15),
                  ),
                ),
              ],
            ),
          ),

          // ── Body ──
          Expanded(
            child: switch (state.kind) {
              InspectorKind.station => _StationInspectorBody(
                  crateViewModel: crateViewModel,
                  key: ValueKey(
                    '${state.station!.address}:${state.requestToken}',
                  ),
                  station: state.station!,
                  focusComment: state.focusComment,
                  discoverViewModel: discoverViewModel,
                  playerViewModel: playerViewModel,
                  authViewModel: authViewModel,
                  onRequestLogin: onRequestLogin,
                  onOpenFavoritesPicker: () =>
                      onOpenFavoritesPicker(state.station!),
                  onOpenZap: () => onOpenZap(state.station!),
                ),
              InspectorKind.nowPlaying => _NowPlayingInspectorBody(
                  playerViewModel: playerViewModel,
                  crateViewModel: crateViewModel,
                  authViewModel: authViewModel,
                  onRequestLogin: onRequestLogin,
                  onOpenZap: onOpenZap,
                ),
              InspectorKind.zap => SingleChildScrollView(
                  child: ZapSheet(
                    key: ValueKey(
                      'zap:${state.station!.address}:${state.requestToken}',
                    ),
                    station: state.station!,
                    authViewModel: authViewModel,
                    discoverViewModel: discoverViewModel,
                    onOpenWalletSettings: () {
                      onClose();
                      onOpenWalletSettings();
                    },
                  ),
                ),
            },
          ),
        ],
      ),
    );
  }
}

class _StationInspectorBody extends StatefulWidget {
  const _StationInspectorBody({
    super.key,
    required this.station,
    required this.focusComment,
    required this.crateViewModel,
    required this.discoverViewModel,
    required this.playerViewModel,
    required this.authViewModel,
    required this.onRequestLogin,
    required this.onOpenFavoritesPicker,
    required this.onOpenZap,
  });

  final Station station;
  final bool focusComment;
  final CrateViewModel crateViewModel;
  final DiscoverViewModel discoverViewModel;
  final PlayerViewModel playerViewModel;
  final AuthViewModel authViewModel;
  final VoidCallback onRequestLogin;
  final VoidCallback onOpenFavoritesPicker;
  final VoidCallback onOpenZap;

  @override
  State<_StationInspectorBody> createState() => _StationInspectorBodyState();
}

class _StationInspectorBodyState extends State<_StationInspectorBody> {
  final _commentController = TextEditingController();
  final _commentFocusNode = FocusNode();
  final _commentKey = GlobalKey();
  StationSocialSummary? _social;
  bool _loading = true;
  bool _submitting = false;
  StationComment? _replyTarget;

  @override
  void initState() {
    super.initState();
    _loadSocial();
    if (widget.focusComment) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        Future<void>.delayed(const Duration(milliseconds: 160), () {
          if (!mounted) return;
          final ctx = _commentKey.currentContext;
          if (ctx != null && ctx.mounted) {
            Scrollable.ensureVisible(
              ctx,
              duration: const Duration(milliseconds: 220),
              curve: Curves.easeOut,
              alignment: 0.12,
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
          _loading = false;
        });
      }
    } catch (_) {
      if (mounted) setState(() => _loading = false);
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

        return ListView(
          padding: const EdgeInsets.fromLTRB(16, 16, 16, 28),
          children: [
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                StationThumbnail(
                  url: station.thumbnail,
                  size: 68,
                  borderWidth: 2,
                  highlight: isPlaying,
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        station.name,
                        style: Theme.of(context)
                            .textTheme
                            .titleLarge
                            ?.copyWith(fontSize: 18, height: 1.15),
                      ),
                      const SizedBox(height: 4),
                      Text(
                        station.subtitle.toUpperCase(),
                        style: SonicMachineTheme.labelTech(
                          fontSize: 9.5,
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
              const SizedBox(height: 12),
              Text(
                station.description!.trim(),
                style: Theme.of(context).textTheme.bodySmall?.copyWith(
                      height: 1.4,
                    ),
              ),
            ],
            const SizedBox(height: 14),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: [
                SonicPowerButton(
                  label: isPlaying ? 'Pause' : 'Play',
                  icon: isPlaying ? Icons.pause : Icons.play_arrow,
                  active: isPlaying,
                  compact: true,
                  onPressed: () =>
                      widget.playerViewModel.togglePlayStation(station),
                ),
                SonicPowerButton(
                  label:
                      'Like${social != null && social.reactionCount > 0 ? ' (${social.reactionCount})' : ''}',
                  icon: social?.userReacted == true
                      ? Icons.favorite
                      : Icons.favorite_border,
                  primary: false,
                  active: social?.userReacted == true,
                  compact: true,
                  onPressed: _submitting ? null : _handleReact,
                ),
                SonicPowerButton(
                  label:
                      'Zap${social != null && social.zapSats > 0 ? ' (${social.zapSats})' : ''}',
                  icon: Icons.bolt,
                  primary: false,
                  active: social?.userZapped == true,
                  compact: true,
                  onPressed: widget.onOpenZap,
                ),
                SonicPowerButton(
                  label: bookmarked ? 'Saved' : 'Save',
                  icon: bookmarked ? Icons.bookmark : Icons.bookmark_border,
                  primary: false,
                  compact: true,
                  onPressed: () {
                    if (widget.authViewModel.isLoggedIn) {
                      widget.onOpenFavoritesPicker();
                    } else {
                      widget.discoverViewModel.toggleBookmark(station);
                    }
                  },
                ),
                if (station.website != null &&
                    station.website!.trim().startsWith('http'))
                  SonicPowerButton(
                    label: 'Web',
                    icon: Icons.open_in_new,
                    primary: false,
                    compact: true,
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
            const SizedBox(height: 18),
            const SonicSectionHeader(title: 'STREAMS'),
            const SizedBox(height: 8),
            for (var i = 0; i < station.streams.length; i++)
              Padding(
                padding: const EdgeInsets.only(bottom: 6),
                child: SonicPlate(
                  backgroundColor: isCurrent &&
                          widget.playerViewModel.snapshot.streamIndex == i
                      ? SonicColors.voltageCyan.withValues(alpha: 0.25)
                      : SonicColors.surfacePlate,
                  shadowOffset: const Offset(2, 2),
                  padding: const EdgeInsets.symmetric(
                    horizontal: 10,
                    vertical: 8,
                  ),
                  onTap: () => widget.playerViewModel
                      .playStation(station, streamIndex: i),
                  child: Row(
                    children: [
                      SonicTag(
                        label: station.streams[i].formatBadge,
                        inverted: true,
                      ),
                      const SizedBox(width: 8),
                      Expanded(
                        child: Text(
                          station.streams[i].url,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: Theme.of(context).textTheme.bodySmall,
                        ),
                      ),
                      const Icon(Icons.play_arrow, size: 16),
                    ],
                  ),
                ),
              ),

            const SizedBox(height: 16),
            StationSongHistory(address: station.address, crate: widget.crateViewModel,
              auth: widget.authViewModel, onRequestLogin: widget.onRequestLogin),
            const SizedBox(height: 16),
            Container(
              key: _commentKey,
              child: SonicSectionHeader(
                title: 'COMMENTS // NIP-22',
                trailing: Text(
                  _loading ? '...' : '${social?.commentCount ?? 0}',
                  style: SonicMachineTheme.labelTech(
                    fontSize: 10,
                    color: SonicColors.seamOutline,
                  ),
                ),
              ),
            ),
            const SizedBox(height: 8),
            if (_replyTarget != null) ...[
              Row(
                children: [
                  Expanded(
                    child: Text(
                      'REPLYING TO ${_replyTarget!.authorName.toUpperCase()}',
                      style: SonicMachineTheme.labelTech(
                        fontSize: 9,
                        color: SonicColors.signalRed,
                      ),
                    ),
                  ),
                  GestureDetector(
                    onTap: () => setState(() => _replyTarget = null),
                    child: const Icon(Icons.close, size: 15),
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
                    onSubmitted: (_) => _handlePostComment(),
                    decoration: InputDecoration(
                      hintText: widget.authViewModel.isLoggedIn
                          ? 'WRITE A COMMENT...'
                          : 'SIGN IN TO COMMENT...',
                    ),
                  ),
                ),
                const SizedBox(width: 8),
                SonicPowerButton(
                  label: widget.authViewModel.isLoggedIn ? 'Send' : 'Sign In',
                  compact: true,
                  onPressed: _submitting ? null : _handlePostComment,
                ),
              ],
            ),
            const SizedBox(height: 12),
            if (_loading)
              const Padding(
                padding: EdgeInsets.all(14),
                child: Center(
                  child: CircularProgressIndicator(
                    color: SonicColors.signalRed,
                    strokeWidth: 2.5,
                  ),
                ),
              )
            else if (social == null || social.comments.isEmpty)
              Padding(
                padding: const EdgeInsets.symmetric(vertical: 6),
                child: Text(
                  'No comments yet. Drop the first note.',
                  style: Theme.of(context).textTheme.bodySmall,
                ),
              )
            else
              ...social.comments.map((comment) {
                final indent = (comment.depth.clamp(0, 3)) * 12.0;
                return Padding(
                  padding: EdgeInsets.only(left: indent, bottom: 8),
                  child: SonicPlate(
                    backgroundColor: SonicColors.surfaceLow,
                    shadowOffset: const Offset(2, 2),
                    padding: const EdgeInsets.all(9),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(
                          children: [
                            Expanded(
                              child: Text(
                                comment.authorName.toUpperCase(),
                                style: SonicMachineTheme.labelTech(
                                  fontSize: 9,
                                  color: SonicColors.seamOutline,
                                ),
                              ),
                            ),
                            GestureDetector(
                              onTap: () {
                                setState(() => _replyTarget = comment);
                                _commentFocusNode.requestFocus();
                              },
                              child: Text(
                                'REPLY',
                                style: SonicMachineTheme.labelTech(
                                  fontSize: 8.5,
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

            const SizedBox(height: 14),
            const SonicSectionHeader(title: 'NOSTR_COORDINATE'),
            const SizedBox(height: 6),
            SonicPlate(
              backgroundColor: SonicColors.surfaceLow,
              shadowOffset: Offset.zero,
              padding: const EdgeInsets.all(8),
              onTap: () {
                Clipboard.setData(ClipboardData(text: station.naddr));
                ScaffoldMessenger.of(context).showSnackBar(
                  const SnackBar(content: Text('Copied station coordinate')),
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
                        fontSize: 9.5,
                        letterSpacing: 0.3,
                      ),
                    ),
                  ),
                  const Icon(Icons.copy, size: 14),
                ],
              ),
            ),
          ],
        );
      },
    );
  }
}

class _NowPlayingInspectorBody extends StatelessWidget {
  const _NowPlayingInspectorBody({
    required this.playerViewModel,
    required this.crateViewModel,
    required this.authViewModel,
    required this.onRequestLogin,
    required this.onOpenZap,
  });

  final PlayerViewModel playerViewModel;
  final CrateViewModel crateViewModel;
  final AuthViewModel authViewModel;
  final VoidCallback onRequestLogin;
  final ValueChanged<Station> onOpenZap;

  @override
  Widget build(BuildContext context) {
    return ListenableBuilder(
      listenable: Listenable.merge([
        playerViewModel,
        crateViewModel,
        authViewModel,
      ]),
      builder: (context, _) {
        final snapshot = playerViewModel.snapshot;
        final station = snapshot.station;
        final meta = snapshot.metadata;

        if (station == null) {
          return Center(
            child: Padding(
              padding: const EdgeInsets.all(24),
              child: SonicPlate(
                padding: const EdgeInsets.all(18),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    const Icon(Icons.radio, size: 36),
                    const SizedBox(height: 10),
                    Text(
                      'DECK STANDBY',
                      style: SonicMachineTheme.labelTech(fontSize: 12),
                    ),
                    const SizedBox(height: 6),
                    Text(
                      'Select any station in the grid or sidebar to monitor live telemetry, spectrogram, and stream mirrors.',
                      textAlign: TextAlign.center,
                      style: Theme.of(context).textTheme.bodySmall,
                    ),
                  ],
                ),
              ),
            ),
          );
        }

        final trackTitle = meta?.displaySong ?? meta?.displayTitle;

        return ListView(
          padding: const EdgeInsets.fromLTRB(16, 16, 16, 28),
          children: [
            SonicPlate(
              backgroundColor: SonicColors.ink,
              shadowColor: SonicColors.voltageCyan,
              padding: const EdgeInsets.all(14),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      StationThumbnail(
                        url: station.thumbnail,
                        size: 56,
                        highlight: snapshot.isPlaying,
                      ),
                      const SizedBox(width: 12),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              station.name.toUpperCase(),
                              maxLines: 2,
                              overflow: TextOverflow.ellipsis,
                              style: SonicMachineTheme.labelTech(
                                fontSize: 12,
                                color: SonicColors.foundation,
                              ),
                            ),
                            const SizedBox(height: 4),
                            Text(
                              trackTitle ?? 'LIVE RADIO STREAM',
                              maxLines: 2,
                              overflow: TextOverflow.ellipsis,
                              style: SonicMachineTheme.labelTech(
                                fontSize: 10,
                                color: SonicColors.voltageCyan,
                              ),
                            ),
                            if (meta?.displayArtist != null) ...[
                              const SizedBox(height: 2),
                              Text(
                                meta!.displayArtist!,
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                                style: SonicMachineTheme.labelTech(
                                  fontSize: 9.5,
                                  color: SonicColors.seamMuted,
                                ),
                              ),
                            ],
                          ],
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 14),
                  SonicVisualizer(
                    isPlaying: snapshot.isPlaying,
                    isBuffering: snapshot.isBusy,
                    height: 64,
                  ),
                ],
              ),
            ),
            const SizedBox(height: 14),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: [
                if (meta != null && meta.hasTrackInfo)
                  TrackCrateButton(
                    metadata: meta,
                    crate: crateViewModel,
                    auth: authViewModel,
                    onRequestLogin: onRequestLogin,
                    compact: true,
                  ),
                SonicPowerButton(
                  label: 'Zap Station',
                  icon: Icons.bolt,
                  primary: false,
                  compact: true,
                  onPressed: () => onOpenZap(station),
                ),
              ],
            ),
            const SizedBox(height: 18),
            const SonicSectionHeader(title: 'STREAM_MIRRORS'),
            const SizedBox(height: 8),
            for (var i = 0; i < station.streams.length; i++)
              Padding(
                padding: const EdgeInsets.only(bottom: 6),
                child: SonicPlate(
                  backgroundColor: snapshot.streamIndex == i
                      ? SonicColors.voltageCyan.withValues(alpha: 0.25)
                      : SonicColors.surfacePlate,
                  shadowOffset: const Offset(2, 2),
                  padding: const EdgeInsets.all(10),
                  onTap: () => playerViewModel.selectStream(i),
                  child: Row(
                    children: [
                      SonicTag(
                        label: station.streams[i].formatBadge,
                        inverted: true,
                      ),
                      const SizedBox(width: 8),
                      Expanded(
                        child: Text(
                          station.streams[i].url,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: Theme.of(context).textTheme.bodySmall,
                        ),
                      ),
                      if (snapshot.streamIndex == i)
                        const Icon(
                          Icons.equalizer,
                          size: 16,
                          color: SonicColors.signalRed,
                        ),
                    ],
                  ),
                ),
              ),
          ],
        );
      },
    );
  }
}
