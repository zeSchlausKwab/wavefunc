import 'package:material_ui/material_ui.dart';

import '../../../../domain/models/now_playing.dart';
import '../../../../domain/models/station.dart';
import '../../../core/theme/sonic_machine_theme.dart';
import '../../../core/widgets/sonic_plate.dart';
import '../../../core/widgets/sonic_visualizer.dart';
import '../../../core/widgets/station_thumbnail.dart';
import '../../auth/view_models/auth_view_model.dart';
import '../../crate/view_models/crate_view_model.dart';
import '../view_models/player_view_model.dart';
import 'track_crate_button.dart';

/// Full Constructivist "Observation Window" sheet for active playback.
class ExpandedPlayerSheet extends StatelessWidget {
  const ExpandedPlayerSheet({
    super.key,
    required this.playerViewModel,
    required this.crateViewModel,
    required this.authViewModel,
    required this.onOpenStationDetail,
    required this.onRequestLogin,
  });

  final PlayerViewModel playerViewModel;
  final CrateViewModel crateViewModel;
  final AuthViewModel authViewModel;
  final ValueChanged<Station> onOpenStationDetail;
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
        final snap = playerViewModel.snapshot;
        final station = snap.station;
        if (station == null) return const SizedBox.shrink();

        final remaining = snap.sleepTimerRemaining;
        final meta = snap.metadata;
        final hasTrack = meta != null && meta.hasTrackInfo;

        return Container(
          decoration: const BoxDecoration(
            color: SonicColors.foundation,
            border: Border(
              top: BorderSide(color: SonicColors.ink, width: 3),
            ),
          ),
          child: SafeArea(
            top: false,
            child: SingleChildScrollView(
              padding: const EdgeInsets.fromLTRB(20, 12, 20, 24),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
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
                    children: [
                      Expanded(
                        child: Text(
                          'OBSERVATION_WINDOW // ${snap.phase.name.toUpperCase()}',
                          style: SonicMachineTheme.labelTech(
                            fontSize: 10.5,
                            color: SonicColors.signalRed,
                            letterSpacing: 1.6,
                          ),
                        ),
                      ),
                      SonicTag(
                        label: 'STATION INFO',
                        onTap: () {
                          Navigator.of(context).pop();
                          onOpenStationDetail(station);
                        },
                      ),
                    ],
                  ),
                  const SizedBox(height: 16),

                  // ── Artwork + Station & Track Headline ──
                  Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      StationThumbnail(
                        url: station.thumbnail,
                        size: 92,
                        borderWidth: 3,
                        highlight: snap.isPlaying,
                      ),
                      const SizedBox(width: 14),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              meta?.displaySong ?? station.name,
                              style: Theme.of(context)
                                  .textTheme
                                  .headlineSmall
                                  ?.copyWith(
                                    fontWeight: FontWeight.w700,
                                    height: 1.1,
                                  ),
                            ),
                            const SizedBox(height: 6),
                            Text(
                              (meta?.displayArtist ?? station.subtitle)
                                  .toUpperCase(),
                              style: SonicMachineTheme.labelTech(
                                fontSize: 11.5,
                                color: SonicColors.seamOutline,
                              ),
                            ),
                            if (meta?.albumWithYear != null) ...[
                              const SizedBox(height: 4),
                              Text(
                                meta!.albumWithYear!,
                                style: Theme.of(context).textTheme.bodySmall,
                              ),
                            ],
                          ],
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 18),

                  // ── 60fps Mechanical Spectrogram ──
                  SonicPlate(
                    backgroundColor: SonicColors.ink,
                    borderColor: SonicColors.ink,
                    shadowColor: SonicColors.voltageCyan,
                    padding: const EdgeInsets.all(10),
                    child: SonicVisualizer(
                      isPlaying: snap.isPlaying,
                      isBuffering: snap.isBusy,
                      height: 76,
                    ),
                  ),
                  const SizedBox(height: 18),

                  if (snap.errorMessage != null) ...[
                    SonicPlate(
                      backgroundColor: SonicColors.signalRed,
                      padding: const EdgeInsets.all(10),
                      child: Text(
                        snap.errorMessage!,
                        style: SonicMachineTheme.labelTech(
                          fontSize: 11,
                          color: SonicColors.onSignal,
                        ),
                      ),
                    ),
                    const SizedBox(height: 14),
                  ],

                  // ── Primary Transport + Save to Crate ──
                  Wrap(
                    alignment: WrapAlignment.center,
                    spacing: 10,
                    runSpacing: 10,
                    children: [
                      SonicPowerButton(
                        label: snap.isPlaying ? 'Pause' : 'Transmit',
                        icon: snap.isPlaying ? Icons.pause : Icons.play_arrow,
                        active: snap.isPlaying,
                        onPressed: () {
                          if (snap.isPlaying) {
                            playerViewModel.pause();
                          } else if (snap.phase == PlayerPhase.failed) {
                            playerViewModel.retry();
                          } else {
                            playerViewModel.resume();
                          }
                        },
                      ),
                      if (hasTrack)
                        TrackCrateButton(
                          metadata: meta,
                          crate: crateViewModel,
                          auth: authViewModel,
                          onRequestLogin: () {
                            Navigator.of(context).pop();
                            onRequestLogin();
                          },
                        ),
                      SonicPowerButton(
                        label: 'Stop',
                        icon: Icons.stop,
                        primary: false,
                        onPressed: () {
                          playerViewModel.stop();
                          Navigator.of(context).pop();
                        },
                      ),
                    ],
                  ),
                  const SizedBox(height: 20),

                  // ── Volume Control ──
                  const SonicSectionHeader(title: 'OUTPUT_GAIN'),
                  const SizedBox(height: 8),
                  Row(
                    children: [
                      IconButton(
                        onPressed: playerViewModel.toggleMute,
                        icon: Icon(
                          snap.isMuted || snap.volume == 0
                              ? Icons.volume_off
                              : Icons.volume_up,
                          color: SonicColors.ink,
                        ),
                      ),
                      Expanded(
                        child: SliderTheme(
                          data: SliderTheme.of(context).copyWith(
                            activeTrackColor: SonicColors.voltageCyan,
                            inactiveTrackColor: SonicColors.surfacePlate,
                            thumbColor: SonicColors.ink,
                            trackHeight: 8,
                            thumbShape: const RoundSliderThumbShape(
                              enabledThumbRadius: 8,
                            ),
                          ),
                          child: Slider(
                            value: snap.isMuted ? 0 : snap.volume,
                            onChanged: playerViewModel.setVolume,
                          ),
                        ),
                      ),
                      SizedBox(
                        width: 42,
                        child: Text(
                          '${((snap.isMuted ? 0 : snap.volume) * 100).round()}%',
                          textAlign: TextAlign.right,
                          style: SonicMachineTheme.labelTech(fontSize: 11),
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 16),

                  // ── Sleep Timer ──
                  SonicSectionHeader(
                    title: 'SLEEP_TIMER',
                    trailing: remaining != null
                        ? Text(
                            '${remaining.inMinutes + 1}M LEFT',
                            style: SonicMachineTheme.labelTech(
                              fontSize: 10,
                              color: SonicColors.signalRed,
                            ),
                          )
                        : null,
                  ),
                  const SizedBox(height: 10),
                  Wrap(
                    spacing: 8,
                    runSpacing: 8,
                    children: [
                      for (final mins in const [15, 30, 45, 60])
                        SonicTag(
                          label: '${mins}M',
                          highlighted: remaining != null &&
                              (remaining.inMinutes - mins).abs() <= 1,
                          onTap: () => playerViewModel.setSleepTimer(
                            Duration(minutes: mins),
                          ),
                        ),
                      if (remaining != null)
                        SonicTag(
                          label: 'CANCEL',
                          inverted: true,
                          onTap: () => playerViewModel.setSleepTimer(null),
                        ),
                    ],
                  ),

                  // ── Stream Mirror Selector ──
                  if (station.streams.length > 1) ...[
                    const SizedBox(height: 18),
                    const SonicSectionHeader(title: 'STREAM_MIRRORS'),
                    const SizedBox(height: 10),
                    Wrap(
                      spacing: 8,
                      runSpacing: 8,
                      children: [
                        for (var i = 0; i < station.streams.length; i++)
                          SonicTag(
                            label:
                                '#${i + 1} ${station.streams[i].formatBadge}',
                            highlighted: i == snap.streamIndex,
                            onTap: () => playerViewModel.selectStream(i),
                          ),
                      ],
                    ),
                  ],
                ],
              ),
            ),
          ),
        );
      },
    );
  }
}
