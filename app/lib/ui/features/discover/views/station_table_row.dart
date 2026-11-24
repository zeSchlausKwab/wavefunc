import 'package:material_ui/material_ui.dart';

import '../../../../domain/models/now_playing.dart';
import '../../../../domain/models/social.dart';
import '../../../../domain/models/station.dart';
import '../../../core/theme/sonic_machine_theme.dart';
import '../../../core/widgets/sonic_plate.dart';
import '../../../core/widgets/station_thumbnail.dart';
import 'station_card.dart';

/// Compact Broadcast Table row for power-browsing stations on Desktop & Tablet.
class StationTableRow extends StatelessWidget {
  const StationTableRow({
    super.key,
    required this.station,
    required this.isCurrent,
    required this.playerPhase,
    required this.isBookmarked,
    required this.onPlayToggle,
    required this.onTapDetail,
    required this.onToggleBookmark,
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
  final StationCardCounts? socialCounts;
  final VoidCallback? onLike;
  final VoidCallback? onComment;
  final VoidCallback? onZap;
  final VoidCallback? onShare;

  @override
  Widget build(BuildContext context) {
    final isPlaying = isCurrent && playerPhase == PlayerPhase.playing;
    final isBusy = isCurrent &&
        (playerPhase == PlayerPhase.loading ||
            playerPhase == PlayerPhase.buffering ||
            playerPhase == PlayerPhase.reconnecting);
    final counts = socialCounts;

    return InkWell(
      onTap: onTapDetail,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
        decoration: BoxDecoration(
          color: isCurrent ? SonicColors.foundation : SonicColors.surfacePlate,
          border: Border.all(
            color: isPlaying ? SonicColors.ink : SonicColors.seamOutline,
            width: isPlaying ? 2 : 1.25,
          ),
          boxShadow: isPlaying
              ? const [
                  BoxShadow(
                    color: SonicColors.voltageCyan,
                    offset: Offset(3, 3),
                    blurRadius: 0,
                  ),
                ]
              : null,
        ),
        child: Row(
          children: [
            // Play switch
            GestureDetector(
              onTap: onPlayToggle,
              child: Container(
                width: 34,
                height: 34,
                decoration: BoxDecoration(
                  color: isPlaying
                      ? SonicColors.voltageCyan
                      : SonicColors.signalRed,
                  border: Border.all(color: SonicColors.ink, width: 1.5),
                ),
                alignment: Alignment.center,
                child: isBusy
                    ? const SizedBox(
                        width: 14,
                        height: 14,
                        child: CircularProgressIndicator(
                          strokeWidth: 2,
                          color: SonicColors.onSignal,
                        ),
                      )
                    : Icon(
                        isPlaying ? Icons.pause : Icons.play_arrow,
                        size: 18,
                        color:
                            isPlaying ? SonicColors.ink : SonicColors.onSignal,
                      ),
              ),
            ),
            const SizedBox(width: 10),
            StationThumbnail(
              url: station.thumbnail,
              size: 36,
              borderWidth: 1.5,
              highlight: isPlaying,
            ),
            const SizedBox(width: 10),
            // Station Name & Genres
            Expanded(
              flex: 4,
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text(
                    station.name,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: Theme.of(context)
                        .textTheme
                        .titleMedium
                        ?.copyWith(fontSize: 13.5),
                  ),
                  Text(
                    station.subtitle.toUpperCase(),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: SonicMachineTheme.labelTech(
                      fontSize: 9,
                      color: SonicColors.seamOutline,
                      letterSpacing: 0.7,
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(width: 8),
            // Format & Country tags
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
            const SizedBox(width: 10),
            // Inline Social Actions
            _TableActionChip(
              icon: counts?.userReacted == true
                  ? Icons.favorite
                  : Icons.favorite_border,
              label: (counts?.reactionCount ?? 0) > 0
                  ? StationCard.formatCompactCount(counts!.reactionCount)
                  : '',
              color: counts?.userReacted == true
                  ? SonicColors.signalRed
                  : SonicColors.ink,
              tooltip: 'Like',
              onTap: onLike ?? onTapDetail,
            ),
            const SizedBox(width: 4),
            _TableActionChip(
              icon: Icons.mode_comment_outlined,
              label: (counts?.commentCount ?? 0) > 0
                  ? StationCard.formatCompactCount(counts!.commentCount)
                  : '',
              tooltip: 'Comment',
              onTap: onComment ?? onTapDetail,
            ),
            const SizedBox(width: 4),
            _TableActionChip(
              icon: Icons.bolt,
              label: (counts?.zapSats ?? 0) > 0
                  ? StationCard.formatCompactCount(counts!.zapSats)
                  : '',
              color: SonicColors.ink,
              fill: counts?.userZapped == true ? SonicColors.voltageCyan : null,
              tooltip: 'Zap',
              onTap: onZap ?? onTapDetail,
            ),
            if (onShare != null) ...[
              const SizedBox(width: 4),
              _TableActionChip(
                icon: Icons.ios_share,
                label: '',
                tooltip: 'Share',
                onTap: onShare!,
              ),
            ],
            const SizedBox(width: 4),
            _TableActionChip(
              icon: isBookmarked ? Icons.bookmark : Icons.bookmark_border,
              label: '',
              color: isBookmarked ? SonicColors.signalRed : SonicColors.ink,
              tooltip: 'Favorites',
              onTap: onToggleBookmark,
            ),
          ],
        ),
      ),
    );
  }
}

class _TableActionChip extends StatelessWidget {
  const _TableActionChip({
    required this.icon,
    required this.label,
    required this.tooltip,
    required this.onTap,
    this.color = SonicColors.ink,
    this.fill,
  });

  final IconData icon;
  final String label;
  final String tooltip;
  final VoidCallback onTap;
  final Color color;
  final Color? fill;

  @override
  Widget build(BuildContext context) {
    return Tooltip(
      message: tooltip,
      child: InkWell(
        onTap: onTap,
        child: Container(
          height: 28,
          padding: EdgeInsets.symmetric(horizontal: label.isEmpty ? 6 : 7),
          decoration: BoxDecoration(
            color: fill ?? SonicColors.foundation,
            border: Border.all(color: SonicColors.seamOutline, width: 1.2),
          ),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(icon, size: 14, color: color),
              if (label.isNotEmpty) ...[
                const SizedBox(width: 4),
                Text(
                  label,
                  style: SonicMachineTheme.labelTech(
                    fontSize: 9,
                    color: color,
                    letterSpacing: 0.3,
                  ),
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }
}
