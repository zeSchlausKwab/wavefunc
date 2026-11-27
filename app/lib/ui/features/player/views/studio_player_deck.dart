import 'package:material_ui/material_ui.dart';

import '../../../../domain/models/now_playing.dart';
import '../../../../domain/models/station.dart';
import '../../../core/theme/sonic_machine_theme.dart';
import '../../../core/widgets/sonic_visualizer.dart';
import '../../../core/widgets/station_thumbnail.dart';
import '../../auth/view_models/auth_view_model.dart';
import '../../crate/view_models/crate_view_model.dart';
import '../view_models/player_view_model.dart';
import 'track_crate_button.dart';

/// Full-width docked Constructivist Studio Console Deck (`76px`) for Tablet & Desktop.
class StudioPlayerDeck extends StatelessWidget {
  const StudioPlayerDeck({
    super.key,
    required this.playerViewModel,
    required this.crateViewModel,
    required this.authViewModel,
    required this.inspectorOpen,
    required this.onToggleInspector,
    required this.onOpenStationInspector,
    required this.onOpenZap,
    required this.onRequestLogin,
  });

  final PlayerViewModel playerViewModel;
  final CrateViewModel crateViewModel;
  final AuthViewModel authViewModel;
  final bool inspectorOpen;
  final VoidCallback onToggleInspector;
  final ValueChanged<Station> onOpenStationInspector;
  final ValueChanged<Station> onOpenZap;
  final VoidCallback onRequestLogin;

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
        final isPlaying = snapshot.isPlaying;
        final isBusy = snapshot.isBusy;
        final meta = snapshot.metadata;
        final activeStream = snapshot.activeStream;
        final hasTrack = meta != null && meta.hasTrackInfo;

        return Container(
          height: 76,
          decoration: const BoxDecoration(
            color: SonicColors.ink,
            border: Border(
              top: BorderSide(color: SonicColors.ink, width: 2.5),
            ),
          ),
          padding: const EdgeInsets.symmetric(horizontal: 16),
          child: Row(
            children: [
              // ── Left: Station plate + Now Playing + Crate/Zap quick actions ──
              Expanded(
                flex: 4,
                child: station == null
                    ? Row(
                        children: [
                          Container(
                            width: 46,
                            height: 46,
                            decoration: BoxDecoration(
                              color: SonicColors.thumbnailDark,
                              border: Border.all(
                                color: SonicColors.seamOutline,
                                width: 1.5,
                              ),
                            ),
                            alignment: Alignment.center,
                            child: const Icon(
                              Icons.sensors_off,
                              color: SonicColors.seamMuted,
                              size: 20,
                            ),
                          ),
                          const SizedBox(width: 12),
                          Column(
                            mainAxisAlignment: MainAxisAlignment.center,
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                'STUDIO DECK // STANDBY',
                                style: SonicMachineTheme.labelTech(
                                  fontSize: 10.5,
                                  color: SonicColors.foundation,
                                ),
                              ),
                              const SizedBox(height: 2),
                              Text(
                                'SELECT ANY STATION TO TUNE',
                                style: SonicMachineTheme.labelTech(
                                  fontSize: 9,
                                  color: SonicColors.seamMuted,
                                ),
                              ),
                            ],
                          ),
                        ],
                      )
                    : Row(
                        children: [
                          GestureDetector(
                            onTap: () => onOpenStationInspector(station),
                            child: StationThumbnail(
                              url: station.thumbnail,
                              size: 48,
                              borderWidth: 2,
                              highlight: isPlaying,
                            ),
                          ),
                          const SizedBox(width: 12),
                          Expanded(
                            child: GestureDetector(
                              onTap: () => onOpenStationInspector(station),
                              child: Column(
                                mainAxisAlignment: MainAxisAlignment.center,
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Row(
                                    children: [
                                      Container(
                                        width: 7,
                                        height: 7,
                                        color: isPlaying
                                            ? SonicColors.voltageCyan
                                            : (snapshot.phase ==
                                                    PlayerPhase.failed
                                                ? SonicColors.signalRed
                                                : SonicColors.seamMuted),
                                      ),
                                      const SizedBox(width: 6),
                                      Expanded(
                                        child: Text(
                                          station.name.toUpperCase(),
                                          maxLines: 1,
                                          overflow: TextOverflow.ellipsis,
                                          style: SonicMachineTheme.labelTech(
                                            fontSize: 11.5,
                                            color: SonicColors.foundation,
                                            letterSpacing: 0.7,
                                          ),
                                        ),
                                      ),
                                    ],
                                  ),
                                  const SizedBox(height: 3),
                                  Text(
                                    snapshot.errorMessage ??
                                        meta?.displayTitle ??
                                        (isBusy
                                            ? 'BUFFERING STREAM...'
                                            : station.subtitle.toUpperCase()),
                                    maxLines: 1,
                                    overflow: TextOverflow.ellipsis,
                                    style: SonicMachineTheme.labelTech(
                                      fontSize: 9.5,
                                      color: snapshot.errorMessage != null
                                          ? SonicColors.signalRed
                                          : SonicColors.voltageCyan,
                                      letterSpacing: 0.4,
                                    ),
                                  ),
                                ],
                              ),
                            ),
                          ),
                          if (hasTrack) ...[
                            const SizedBox(width: 6),
                            TrackCrateButton(
                              metadata: meta,
                              crate: crateViewModel,
                              auth: authViewModel,
                              onRequestLogin: onRequestLogin,
                              iconOnly: true,
                            ),
                          ],
                          const SizedBox(width: 6),
                          _DeckSquareButton(
                            icon: Icons.bolt,
                            color: SonicColors.voltageCyan,
                            tooltip: 'Zap station',
                            onTap: () => onOpenZap(station),
                          ),
                        ],
                      ),
              ),

              // ── Center: Transport switches + 60fps Spectrogram + Stream Quality ──
              Expanded(
                flex: 4,
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    _DeckSquareButton(
                      icon: Icons.stop,
                      tooltip: 'Stop',
                      onTap: station == null ? null : playerViewModel.stop,
                    ),
                    const SizedBox(width: 8),
                    GestureDetector(
                      onTap: station == null
                          ? null
                          : () {
                              if (isPlaying || isBusy) {
                                playerViewModel.pause();
                              } else if (snapshot.phase == PlayerPhase.failed) {
                                playerViewModel.retry();
                              } else {
                                playerViewModel.resume();
                              }
                            },
                      child: Container(
                        width: 46,
                        height: 46,
                        decoration: BoxDecoration(
                          color: station == null
                              ? SonicColors.thumbnailDark
                              : (isPlaying
                                  ? SonicColors.voltageCyan
                                  : SonicColors.signalRed),
                          border: Border.all(
                            color: SonicColors.foundation,
                            width: 1.5,
                          ),
                        ),
                        alignment: Alignment.center,
                        child: isBusy
                            ? const SizedBox(
                                width: 18,
                                height: 18,
                                child: CircularProgressIndicator(
                                  strokeWidth: 2.5,
                                  color: SonicColors.onSignal,
                                ),
                              )
                            : Icon(
                                isPlaying ? Icons.pause : Icons.play_arrow,
                                size: 24,
                                color: station == null
                                    ? SonicColors.seamMuted
                                    : (isPlaying
                                        ? SonicColors.ink
                                        : SonicColors.onSignal),
                              ),
                      ),
                    ),
                    const SizedBox(width: 14),
                    SizedBox(
                      width: 108,
                      child: SonicVisualizer(
                        isPlaying: isPlaying,
                        isBuffering: isBusy,
                        height: 34,
                      ),
                    ),
                    if (station != null && activeStream != null) ...[
                      const SizedBox(width: 12),
                      PopupMenuButton<int>(
                        tooltip: 'Switch stream quality',
                        onSelected: playerViewModel.selectStream,
                        color: SonicColors.foundation,
                        itemBuilder: (context) => [
                          for (var i = 0; i < station.streams.length; i++)
                            PopupMenuItem<int>(
                              value: i,
                              child: Text(
                                '${i == snapshot.streamIndex ? '▸ ' : ''}${station.streams[i].formatBadge}',
                                style: SonicMachineTheme.labelTech(
                                  fontSize: 10.5,
                                ),
                              ),
                            ),
                        ],
                        child: Container(
                          padding: const EdgeInsets.symmetric(
                            horizontal: 8,
                            vertical: 5,
                          ),
                          decoration: BoxDecoration(
                            color: SonicColors.thumbnailDark,
                            border: Border.all(
                              color: SonicColors.seamOutline,
                              width: 1.5,
                            ),
                          ),
                          child: Row(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              Text(
                                activeStream.formatBadge,
                                style: SonicMachineTheme.labelTech(
                                  fontSize: 9.5,
                                  color: SonicColors.foundation,
                                ),
                              ),
                              if (station.streams.length > 1) ...[
                                const SizedBox(width: 3),
                                const Icon(
                                  Icons.arrow_drop_down,
                                  size: 14,
                                  color: SonicColors.voltageCyan,
                                ),
                              ],
                            ],
                          ),
                        ),
                      ),
                    ],
                  ],
                ),
              ),

              // ── Right: Volume Slider + Sleep Timer + Inspector Toggle ──
              Expanded(
                flex: 3,
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.end,
                  children: [
                    _DeckSquareButton(
                      icon: snapshot.isMuted || snapshot.volume == 0
                          ? Icons.volume_off
                          : Icons.volume_up,
                      tooltip: snapshot.isMuted ? 'Unmute (M)' : 'Mute (M)',
                      onTap: playerViewModel.toggleMute,
                    ),
                    const SizedBox(width: 4),
                    SizedBox(
                      width: 104,
                      child: SliderTheme(
                        data: SliderTheme.of(context).copyWith(
                          trackHeight: 6,
                          activeTrackColor: SonicColors.voltageCyan,
                          inactiveTrackColor: SonicColors.thumbnailDark,
                          thumbColor: SonicColors.foundation,
                          overlayShape: SliderComponentShape.noOverlay,
                          thumbShape: const _SquareThumbShape(),
                        ),
                        child: Slider(
                          value: snapshot.isMuted ? 0.0 : snapshot.volume,
                          onChanged: playerViewModel.setVolume,
                        ),
                      ),
                    ),
                    const SizedBox(width: 8),
                    PopupMenuButton<Duration?>(
                      tooltip: 'Sleep timer',
                      onSelected: playerViewModel.setSleepTimer,
                      color: SonicColors.foundation,
                      itemBuilder: (_) => const [
                        PopupMenuItem<Duration?>(
                          value: null,
                          child: Text('SLEEP TIMER: OFF'),
                        ),
                        PopupMenuItem<Duration?>(
                          value: Duration(minutes: 15),
                          child: Text('15 MINUTES'),
                        ),
                        PopupMenuItem<Duration?>(
                          value: Duration(minutes: 30),
                          child: Text('30 MINUTES'),
                        ),
                        PopupMenuItem<Duration?>(
                          value: Duration(minutes: 60),
                          child: Text('60 MINUTES'),
                        ),
                      ],
                      child: _DeckSquareVisual(
                        icon: Icons.bedtime_outlined,
                        color: snapshot.sleepTimerEndsAt != null
                            ? SonicColors.voltageCyan
                            : SonicColors.foundation,
                      ),
                    ),
                    const SizedBox(width: 6),
                    _DeckSquareButton(
                      icon: inspectorOpen
                          ? Icons.view_sidebar
                          : Icons.view_sidebar_outlined,
                      color: inspectorOpen
                          ? SonicColors.voltageCyan
                          : SonicColors.foundation,
                      tooltip: inspectorOpen
                          ? 'Hide Inspector (Esc)'
                          : 'Open Deck Inspector',
                      onTap: onToggleInspector,
                    ),
                  ],
                ),
              ),
            ],
          ),
        );
      },
    );
  }
}

class _DeckSquareButton extends StatelessWidget {
  const _DeckSquareButton({
    required this.icon,
    required this.tooltip,
    required this.onTap,
    this.color = SonicColors.foundation,
  });

  final IconData icon;
  final String tooltip;
  final VoidCallback? onTap;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return Tooltip(
      message: tooltip,
      child: InkWell(
        onTap: onTap,
        child: _DeckSquareVisual(
          icon: icon,
          color: onTap == null ? SonicColors.seamOutline : color,
        ),
      ),
    );
  }
}

class _DeckSquareVisual extends StatelessWidget {
  const _DeckSquareVisual({
    required this.icon,
    required this.color,
  });

  final IconData icon;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: 34,
      height: 34,
      decoration: BoxDecoration(
        color: SonicColors.thumbnailDark,
        border: Border.all(color: SonicColors.seamOutline, width: 1.5),
      ),
      alignment: Alignment.center,
      child: Icon(icon, size: 17, color: color),
    );
  }
}

class _SquareThumbShape extends SliderComponentShape {
  const _SquareThumbShape();

  @override
  Size getPreferredSize(bool isEnabled, bool isDiscrete) => const Size(12, 16);

  @override
  void paint(
    PaintingContext context,
    Offset center, {
    required Animation<double> activationAnimation,
    required Animation<double> enableAnimation,
    required bool isDiscrete,
    required TextPainter labelPainter,
    required RenderBox parentBox,
    required SliderThemeData sliderTheme,
    required TextDirection textDirection,
    required double value,
    required double textScaleFactor,
    required Size sizeWithOverflow,
  }) {
    final rect = Rect.fromCenter(center: center, width: 10, height: 16);
    final fill = Paint()..color = SonicColors.foundation;
    final stroke = Paint()
      ..color = SonicColors.ink
      ..style = PaintingStyle.stroke
      ..strokeWidth = 1.5;
    context.canvas.drawRect(rect, fill);
    context.canvas.drawRect(rect, stroke);
  }
}
