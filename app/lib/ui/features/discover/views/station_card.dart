import 'package:material_ui/material_ui.dart';

import '../../../../domain/models/now_playing.dart';
import '../../../../domain/models/social.dart';
import '../../../../domain/models/station.dart';
import '../../../core/theme/sonic_machine_theme.dart';
import '../../../core/widgets/sonic_plate.dart';
import '../../../core/widgets/station_thumbnail.dart';

/// Brutal Constructivist station plate mirroring `src/components/RadioCard.tsx`
/// with live social telemetry (Likes, Comments, Zaps, Share, Save).
class StationCard extends StatelessWidget {
  const StationCard({
    super.key,
    required this.station,
    required this.isCurrent,
    required this.playerPhase,
    required this.isBookmarked,
    required this.onPlayToggle,
    required this.onTapDetail,
    required this.onToggleBookmark,
    required this.onGenreTap,
    this.socialCounts,
    this.onLike,
    this.onComment,
    this.onZap,
    this.onShare,
  });

  final Station station;
  final bool isCurrent;
  final PlayerPhase playerPhase;
  final bool isBookmarked;
  final VoidCallback onPlayToggle;
  final VoidCallback onTapDetail;
  final VoidCallback onToggleBookmark;
  final ValueChanged<String> onGenreTap;
  final StationCardCounts? socialCounts;
  final VoidCallback? onLike;
  final VoidCallback? onComment;
  final VoidCallback? onZap;
  final VoidCallback? onShare;

  static String formatCompactCount(int value) {
    if (value >= 1000000) {
      return '${(value / 1000000).toStringAsFixed(1)}M';
    }
    if (value >= 1000) {
      return '${(value / 1000).toStringAsFixed(1)}K';
    }
    return '$value';
  }

  @override
  Widget build(BuildContext context) {
    final isPlaying = isCurrent && playerPhase == PlayerPhase.playing;
    final isBusy = isCurrent &&
        (playerPhase == PlayerPhase.loading ||
            playerPhase == PlayerPhase.buffering ||
            playerPhase == PlayerPhase.reconnecting);
    final isFailed = isCurrent && playerPhase == PlayerPhase.failed;
    final counts = socialCounts;

    return SonicPlate(
      backgroundColor:
          isCurrent ? SonicColors.foundation : SonicColors.surfacePlate,
      borderColor: SonicColors.ink,
      shadowColor: isPlaying ? SonicColors.voltageCyan : SonicColors.ink,
      shadowOffset: isPlaying ? const Offset(5, 5) : const Offset(4, 4),
      padding: const EdgeInsets.fromLTRB(12, 12, 12, 8),
      onTap: onTapDetail,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              StationThumbnail(
                url: station.thumbnail,
                size: 54,
                highlight: isPlaying,
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        if (isPlaying)
                          Container(
                            width: 8,
                            height: 8,
                            margin: const EdgeInsets.only(right: 6),
                            color: SonicColors.signalRed,
                          ),
                        Expanded(
                          child: Text(
                            station.name,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: Theme.of(context).textTheme.titleMedium,
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 3),
                    Text(
                      station.subtitle.toUpperCase(),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: SonicMachineTheme.labelTech(
                        fontSize: 10,
                        color: SonicColors.seamOutline,
                        letterSpacing: 1.0,
                      ),
                    ),
                    if (station.description != null &&
                        station.description!.trim().isNotEmpty) ...[
                      const SizedBox(height: 3),
                      Text(
                        station.description!.trim(),
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                        style: Theme.of(context).textTheme.bodySmall?.copyWith(
                              color: SonicColors.ink.withValues(alpha: 0.8),
                              height: 1.22,
                            ),
                      ),
                    ],
                  ],
                ),
              ),
              const SizedBox(width: 8),
              _PlaySwitch(
                isPlaying: isPlaying,
                isBusy: isBusy,
                isFailed: isFailed,
                onTap: onPlayToggle,
              ),
            ],
          ),
          const SizedBox(height: 9),
          Row(
            children: [
              if (station.primaryStream != null)
                SonicTag(
                  label: station.primaryStream!.formatBadge,
                  inverted: true,
                ),
              if (station.countryCode != null &&
                  station.countryCode!.trim().isNotEmpty) ...[
                const SizedBox(width: 6),
                SonicTag(label: station.countryCode!.toUpperCase()),
              ],
              const SizedBox(width: 6),
              Expanded(
                child: SingleChildScrollView(
                  scrollDirection: Axis.horizontal,
                  child: Row(
                    children: station.genres.take(3).map((genre) {
                      return Padding(
                        padding: const EdgeInsets.only(right: 6),
                        child: SonicTag(
                          label: genre,
                          onTap: () => onGenreTap(genre.toLowerCase()),
                        ),
                      );
                    }).toList(),
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 8),
          Container(height: 1.5, color: SonicColors.seamOutline.withValues(alpha: 0.5)),
          const SizedBox(height: 6),
          // ── Social & Action Control Strip (Like / Comment / Zap / Share / Save) ──
          Row(
            children: [
              Expanded(
                child: SingleChildScrollView(
                  scrollDirection: Axis.horizontal,
                  child: Row(
                    children: [
                      _CardActionButton(
                        icon: counts?.userReacted == true
                            ? Icons.favorite
                            : Icons.favorite_border,
                        label: (counts?.reactionCount ?? 0) > 0
                            ? formatCompactCount(counts!.reactionCount)
                            : 'LIKE',
                        active: counts?.userReacted == true,
                        activeColor: SonicColors.signalRed,
                        tooltip: 'Like station',
                        onTap: onLike ?? onTapDetail,
                      ),
                      const SizedBox(width: 5),
                      _CardActionButton(
                        icon: Icons.mode_comment_outlined,
                        label: (counts?.commentCount ?? 0) > 0
                            ? formatCompactCount(counts!.commentCount)
                            : 'COMMENT',
                        tooltip: 'Write a comment',
                        onTap: onComment ?? onTapDetail,
                      ),
                      const SizedBox(width: 5),
                      _CardActionButton(
                        icon: Icons.bolt,
                        label: (counts?.zapSats ?? 0) > 0
                            ? formatCompactCount(counts!.zapSats)
                            : 'ZAP',
                        active: counts?.userZapped == true,
                        activeColor: SonicColors.ink,
                        activeFill: SonicColors.voltageCyan,
                        tooltip: 'Zap station with Lightning',
                        onTap: onZap ?? onTapDetail,
                      ),
                    ],
                  ),
                ),
              ),
              const SizedBox(width: 6),
              if (onShare != null) ...[
                _CompactIconAction(
                  icon: Icons.ios_share,
                  tooltip: 'Share station',
                  onTap: onShare!,
                ),
                const SizedBox(width: 4),
              ],
              _CompactIconAction(
                icon: isBookmarked ? Icons.bookmark : Icons.bookmark_border,
                color: isBookmarked ? SonicColors.signalRed : SonicColors.ink,
                tooltip: isBookmarked ? 'Manage favorites' : 'Save station',
                onTap: onToggleBookmark,
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _CardActionButton extends StatelessWidget {
  const _CardActionButton({
    required this.icon,
    required this.label,
    required this.tooltip,
    required this.onTap,
    this.active = false,
    this.activeColor = SonicColors.signalRed,
    this.activeFill,
  });

  final IconData icon;
  final String label;
  final String tooltip;
  final VoidCallback onTap;
  final bool active;
  final Color activeColor;
  final Color? activeFill;

  @override
  Widget build(BuildContext context) {
    final fg = active ? activeColor : SonicColors.ink;
    final bg = active
        ? (activeFill ?? activeColor.withValues(alpha: 0.12))
        : SonicColors.foundation;

    return Tooltip(
      message: tooltip,
      child: InkWell(
        onTap: onTap,
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 4),
          decoration: BoxDecoration(
            color: bg,
            border: Border.all(
              color: active ? SonicColors.ink : SonicColors.seamOutline,
              width: 1.25,
            ),
          ),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(icon, size: 13, color: fg),
              const SizedBox(width: 3),
              Text(
                label,
                style: SonicMachineTheme.labelTech(
                  fontSize: 9,
                  color: fg,
                  letterSpacing: 0.4,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _CompactIconAction extends StatelessWidget {
  const _CompactIconAction({
    required this.icon,
    required this.tooltip,
    required this.onTap,
    this.color = SonicColors.ink,
  });

  final IconData icon;
  final String tooltip;
  final VoidCallback onTap;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return Tooltip(
      message: tooltip,
      child: InkWell(
        onTap: onTap,
        child: Container(
          width: 28,
          height: 26,
          decoration: BoxDecoration(
            color: SonicColors.foundation,
            border: Border.all(color: SonicColors.seamOutline, width: 1.25),
          ),
          alignment: Alignment.center,
          child: Icon(icon, size: 15, color: color),
        ),
      ),
    );
  }
}

class _PlaySwitch extends StatelessWidget {
  const _PlaySwitch({
    required this.isPlaying,
    required this.isBusy,
    required this.isFailed,
    required this.onTap,
  });

  final bool isPlaying;
  final bool isBusy;
  final bool isFailed;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final bg = isPlaying
        ? SonicColors.voltageCyan
        : (isFailed ? SonicColors.ink : SonicColors.signalRed);
    final fg = isPlaying ? SonicColors.ink : SonicColors.onSignal;

    return GestureDetector(
      onTap: onTap,
      child: Container(
        width: 44,
        height: 44,
        decoration: BoxDecoration(
          color: bg,
          border: Border.all(color: SonicColors.ink, width: 2),
          boxShadow: const [
            BoxShadow(
              color: SonicColors.ink,
              offset: Offset(3, 3),
              blurRadius: 0,
            ),
          ],
        ),
        alignment: Alignment.center,
        child: isBusy
            ? SizedBox(
                width: 18,
                height: 18,
                child: CircularProgressIndicator(
                  strokeWidth: 2.5,
                  color: fg,
                ),
              )
            : Icon(
                isPlaying
                    ? Icons.pause
                    : (isFailed ? Icons.refresh : Icons.play_arrow),
                color: fg,
                size: 24,
              ),
      ),
    );
  }
}
