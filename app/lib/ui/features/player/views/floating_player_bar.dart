import 'package:material_ui/material_ui.dart';

import '../../../../domain/models/now_playing.dart';
import '../../../core/theme/sonic_machine_theme.dart';
import '../../../core/widgets/sonic_plate.dart';
import '../../../core/widgets/sonic_visualizer.dart';
import '../../../core/widgets/station_thumbnail.dart';
import '../view_models/player_view_model.dart';

/// Persistent bottom floating player dock with hard offset shadow & cyan power bar.
class FloatingPlayerBar extends StatelessWidget {
  const FloatingPlayerBar({
    super.key,
    required this.playerViewModel,
    required this.onExpand,
  });

  final PlayerViewModel playerViewModel;
  final VoidCallback onExpand;

  @override
  Widget build(BuildContext context) {
    return ListenableBuilder(
      listenable: playerViewModel,
      builder: (context, _) {
        final snap = playerViewModel.snapshot;
        final station = snap.station;
        if (station == null) return const SizedBox.shrink();

        final primaryLine = snap.metadata?.displaySong ?? station.name;
        final secondaryLine = _secondarySubtitle(snap);

        return Padding(
          padding: const EdgeInsets.fromLTRB(12, 0, 12, 10),
          child: SonicPlate(
            backgroundColor: SonicColors.ink,
            borderColor: SonicColors.ink,
            shadowColor: snap.isPlaying
                ? SonicColors.voltageCyan
                : SonicColors.signalRed,
            shadowOffset: const Offset(4, 4),
            onTap: onExpand,
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                // 6px thick progress / signal carrier bar per DESIGN.md
                SizedBox(
                  height: 6,
                  child: snap.isBusy
                      ? const LinearProgressIndicator(
                          color: SonicColors.voltageCyan,
                          backgroundColor: SonicColors.thumbnailDark,
                        )
                      : Container(
                          color: snap.isPlaying
                              ? SonicColors.voltageCyan
                              : (snap.phase == PlayerPhase.failed
                                  ? SonicColors.signalRed
                                  : SonicColors.seamOutline),
                        ),
                ),
                Stack(
                  children: [
                    if (snap.isPlaying || snap.isBusy)
                      Positioned.fill(
                        child: IgnorePointer(
                          child: Padding(
                            padding: const EdgeInsets.fromLTRB(4, 4, 4, 2),
                            child: SonicVisualizer(
                              isPlaying: snap.isPlaying,
                              isBuffering: snap.isBusy,
                              columns: 24,
                              rows: 8,
                              height: 58,
                              subtleBackground: true,
                            ),
                          ),
                        ),
                      ),
                    Padding(
                      padding: const EdgeInsets.symmetric(
                        horizontal: 10,
                        vertical: 9,
                      ),
                      child: Row(
                        children: [
                          StationThumbnail(
                            url: station.thumbnail,
                            size: 44,
                            borderWidth: 2,
                            highlight: snap.isPlaying,
                          ),
                          const SizedBox(width: 10),
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              mainAxisSize: MainAxisSize.min,
                              children: [
                                Text(
                                  primaryLine,
                                  maxLines: 1,
                                  overflow: TextOverflow.ellipsis,
                                  style: Theme.of(context)
                                      .textTheme
                                      .titleMedium
                                      ?.copyWith(
                                        color: SonicColors.foundation,
                                        fontSize: 14,
                                      ),
                                ),
                                const SizedBox(height: 2),
                                Text(
                                  secondaryLine,
                                  maxLines: 1,
                                  overflow: TextOverflow.ellipsis,
                                  style: SonicMachineTheme.labelTech(
                                    fontSize: 10,
                                    color: snap.phase == PlayerPhase.failed
                                        ? SonicColors.signalRed
                                        : SonicColors.voltageCyan,
                                    letterSpacing: 0.9,
                                  ),
                                ),
                              ],
                            ),
                          ),
                          const SizedBox(width: 6),
                          _DockControlButton(
                            icon: snap.isPlaying
                                ? Icons.pause
                                : (snap.phase == PlayerPhase.failed
                                    ? Icons.refresh
                                    : Icons.play_arrow),
                            backgroundColor: snap.isPlaying
                                ? SonicColors.voltageCyan
                                : SonicColors.signalRed,
                            foregroundColor: snap.isPlaying
                                ? SonicColors.ink
                                : SonicColors.onSignal,
                            loading: snap.isBusy,
                            onTap: () {
                              if (snap.isPlaying) {
                                playerViewModel.pause();
                              } else if (snap.phase == PlayerPhase.failed) {
                                playerViewModel.retry();
                              } else {
                                playerViewModel.resume();
                              }
                            },
                          ),
                          const SizedBox(width: 6),
                          _DockControlButton(
                            icon: Icons.stop,
                            backgroundColor: SonicColors.thumbnailDark,
                            foregroundColor: SonicColors.foundation,
                            onTap: playerViewModel.stop,
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
              ],
            ),
          ),
        );
      },
    );
  }

  String _secondarySubtitle(PlayerSnapshot snap) {
    if (snap.phase == PlayerPhase.failed) {
      return snap.errorMessage ?? 'SIGNAL LOST — TAP RETRY';
    }
    if (snap.phase == PlayerPhase.reconnecting) {
      return 'SWITCHING STREAM MIRROR...';
    }
    if (snap.isBusy) {
      return 'LOCKING FREQUENCY...';
    }
    final artist = snap.metadata?.displayArtist;
    if (artist != null) {
      return '$artist • ${snap.station!.name}'.toUpperCase();
    }
    final badge = snap.activeStream?.formatBadge ?? 'LIVE';
    return '${snap.station!.name} • $badge'.toUpperCase();
  }
}

class _DockControlButton extends StatelessWidget {
  const _DockControlButton({
    required this.icon,
    required this.backgroundColor,
    required this.foregroundColor,
    required this.onTap,
    this.loading = false,
  });

  final IconData icon;
  final Color backgroundColor;
  final Color foregroundColor;
  final VoidCallback onTap;
  final bool loading;

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        width: 38,
        height: 38,
        decoration: BoxDecoration(
          color: backgroundColor,
          border: Border.all(color: SonicColors.foundation, width: 1.5),
        ),
        alignment: Alignment.center,
        child: loading
            ? SizedBox(
                width: 16,
                height: 16,
                child: CircularProgressIndicator(
                  strokeWidth: 2,
                  color: foregroundColor,
                ),
              )
            : Icon(icon, color: foregroundColor, size: 22),
      ),
    );
  }
}
