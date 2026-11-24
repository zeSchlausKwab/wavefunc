import 'package:material_ui/material_ui.dart';

import '../../../../domain/models/social.dart';
import '../../../../domain/models/station.dart';
import '../../../core/theme/sonic_machine_theme.dart';
import '../../../core/widgets/sonic_plate.dart';
import '../../../core/widgets/station_thumbnail.dart';
import '../../auth/view_models/auth_view_model.dart';
import '../../crate/view_models/crate_view_model.dart';
import '../../player/view_models/player_view_model.dart';
import '../view_models/discover_view_model.dart';

class _ChartConfig {
  const _ChartConfig({
    required this.metric,
    required this.title,
    required this.signal,
  });

  final String metric;
  final String title;
  final String signal;
}

const _chartConfigs = <_ChartConfig>[
  _ChartConfig(
    metric: 'best-signal',
    title: 'BEST_SIGNAL',
    signal: 'VERIFIED_QUALITY',
  ),
  _ChartConfig(
    metric: 'has-now-playing',
    title: 'HAS_NOW_PLAYING',
    signal: 'METADATA_24H',
  ),
  _ChartConfig(
    metric: 'most-listened',
    title: 'MOST_LISTENED',
    signal: '24H_SIGNAL',
  ),
  _ChartConfig(
    metric: 'most-liked',
    title: 'MOST_LIKED',
    signal: '7D_RESONANCE',
  ),
  _ChartConfig(
    metric: 'most-zapped',
    title: 'MOST_ZAPPED',
    signal: '7D_VOLTAGE',
  ),
  _ChartConfig(
    metric: 'on-air-now',
    title: 'ON_AIR_NOW',
    signal: 'LIVE_METADATA',
  ),
];

/// Main-page `SIGNED_NETWORK_FEED // SIGNAL_CHARTS` aggregate observer lists
/// (`kind 31240` rankings + `kind 31238` health badges + `kind 31337` Blossom downloads).
class SignalChartsSection extends StatelessWidget {
  const SignalChartsSection({
    super.key,
    required this.discoverViewModel,
    required this.playerViewModel,
    required this.authViewModel,
    required this.onOpenStationDetail,
    required this.onRequestLogin,
    this.crateViewModel,
    required this.isWideLayout,
  });

  final DiscoverViewModel discoverViewModel;
  final PlayerViewModel playerViewModel;
  final AuthViewModel authViewModel;
  final ValueChanged<Station> onOpenStationDetail;
  final VoidCallback onRequestLogin;
  final CrateViewModel? crateViewModel;
  final bool isWideLayout;

  @override
  Widget build(BuildContext context) {
    final data = discoverViewModel.signalCharts;
    final byMetric = <String, StationRankingSnapshot>{
      for (final snap in data.rankings) snap.metric: snap,
    };

    final panels = <Widget>[];
    for (final cfg in _chartConfigs) {
      final snap = byMetric[cfg.metric];
      if (snap == null) continue;
      final rows = <(StationRankingEntry, Station)>[];
      for (final entry in snap.entries) {
        final station = discoverViewModel.chartStationFor(entry.stationAddress);
        if (station != null) {
          rows.add((entry, station));
          if (rows.length >= 6) break;
        }
      }
      final emptyListeningWindow =
          cfg.metric == 'most-listened' && snap.entries.isEmpty;
      if (rows.isEmpty && !emptyListeningWindow) continue;

      panels.add(
        _RankingChartPanel(
          config: cfg,
          rows: rows,
          emptyListeningWindow: emptyListeningWindow,
          discoverViewModel: discoverViewModel,
          playerViewModel: playerViewModel,
          onOpenStationDetail: onOpenStationDetail,
          isWideLayout: isWideLayout,
        ),
      );
    }

    if (data.recentDownloads.isNotEmpty) {
      panels.add(
        _RecentDownloadsPanel(
          songs: data.recentDownloads,
          playerViewModel: playerViewModel,
          authViewModel: authViewModel,
          crateViewModel: crateViewModel,
          onRequestLogin: onRequestLogin,
          isWideLayout: isWideLayout,
        ),
      );
    }

    if (panels.isEmpty) {
      return const SizedBox.shrink();
    }

    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 4, 16, 18),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          SonicSectionHeader(
            title: 'SIGNAL_CHARTS',
            accent: true,
            trailing: Text(
              'SIGNED_NETWORK_FEED',
              style: SonicMachineTheme.labelTech(
                fontSize: 9.5,
                color: SonicColors.seamOutline,
              ),
            ),
          ),
          const SizedBox(height: 10),
          if (isWideLayout)
            _WideTwoColumnChartsGrid(panels: panels)
          else
            Column(
              children: [
                for (var i = 0; i < panels.length; i++) ...[
                  if (i > 0) const SizedBox(height: 12),
                  panels[i],
                ],
              ],
            ),
          const SizedBox(height: 16),
          Container(
            height: 3,
            color: SonicColors.ink.withValues(alpha: 0.18),
          ),
        ],
      ),
    );
  }
}

class _WideTwoColumnChartsGrid extends StatelessWidget {
  const _WideTwoColumnChartsGrid({required this.panels});

  final List<Widget> panels;

  @override
  Widget build(BuildContext context) {
    final rows = <Widget>[];
    for (var i = 0; i < panels.length; i += 2) {
      if (i > 0) rows.add(const SizedBox(height: 16));
      if (i + 1 < panels.length) {
        rows.add(
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(child: panels[i]),
              const SizedBox(width: 16),
              Expanded(child: panels[i + 1]),
            ],
          ),
        );
      } else {
        rows.add(panels[i]);
      }
    }
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: rows,
    );
  }
}

class _RankingChartPanel extends StatelessWidget {
  const _RankingChartPanel({
    required this.config,
    required this.rows,
    required this.emptyListeningWindow,
    required this.discoverViewModel,
    required this.playerViewModel,
    required this.onOpenStationDetail,
    required this.isWideLayout,
  });

  final _ChartConfig config;
  final List<(StationRankingEntry, Station)> rows;
  final bool emptyListeningWindow;
  final DiscoverViewModel discoverViewModel;
  final PlayerViewModel playerViewModel;
  final ValueChanged<Station> onOpenStationDetail;
  final bool isWideLayout;

  @override
  Widget build(BuildContext context) {
    return SonicPlate(
      backgroundColor: SonicColors.surfacePlate,
      borderWidth: 3,
      shadowOffset: const Offset(5, 5),
      padding: EdgeInsets.zero,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
            decoration: const BoxDecoration(
              border: Border(
                bottom: BorderSide(color: SonicColors.ink, width: 3),
              ),
            ),
            child: Row(
              children: [
                Expanded(
                  child: Text(
                    config.title,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: Theme.of(context).textTheme.titleSmall?.copyWith(
                          fontWeight: FontWeight.w900,
                          letterSpacing: 0.4,
                        ),
                  ),
                ),
                const SizedBox(width: 8),
                Text(
                  config.signal,
                  style: SonicMachineTheme.labelTech(
                    fontSize: 9,
                    color: SonicColors.signalRed,
                    letterSpacing: 1.1,
                  ),
                ),
              ],
            ),
          ),
          if (emptyListeningWindow)
            Padding(
              padding: const EdgeInsets.all(14),
              child: Text(
                'No listening activity recorded in the last 24 hours. Play a station to get things started.',
                style: Theme.of(context).textTheme.bodySmall?.copyWith(
                      color: SonicColors.seamOutline,
                    ),
              ),
            )
          else if (isWideLayout)
            Padding(
              padding: const EdgeInsets.all(10),
              child: Column(
                children: [
                  for (var i = 0; i < rows.length; i++) ...[
                    if (i > 0) const SizedBox(height: 8),
                    _ChartStationRow(
                      rank: i + 1,
                      metric: config.metric,
                      entry: rows[i].$1,
                      station: rows[i].$2,
                      health: discoverViewModel.healthFor(rows[i].$2.address),
                      playerViewModel: playerViewModel,
                      onOpenStationDetail: onOpenStationDetail,
                    ),
                  ],
                ],
              ),
            )
          else
            SizedBox(
              height: 92,
              child: ListView.separated(
                scrollDirection: Axis.horizontal,
                padding: const EdgeInsets.all(10),
                itemCount: rows.length,
                separatorBuilder: (_, _) => const SizedBox(width: 8),
                itemBuilder: (context, index) {
                  return SizedBox(
                    width: 288,
                    child: _ChartStationRow(
                      rank: index + 1,
                      metric: config.metric,
                      entry: rows[index].$1,
                      station: rows[index].$2,
                      health:
                          discoverViewModel.healthFor(rows[index].$2.address),
                      playerViewModel: playerViewModel,
                      onOpenStationDetail: onOpenStationDetail,
                    ),
                  );
                },
              ),
            ),
        ],
      ),
    );
  }
}

class _ChartStationRow extends StatelessWidget {
  const _ChartStationRow({
    required this.rank,
    required this.metric,
    required this.entry,
    required this.station,
    required this.health,
    required this.playerViewModel,
    required this.onOpenStationDetail,
  });

  final int rank;
  final String metric;
  final StationRankingEntry entry;
  final Station station;
  final StationHealthSummary? health;
  final PlayerViewModel playerViewModel;
  final ValueChanged<Station> onOpenStationDetail;

  String _metricReadout() {
    final rounded = entry.value.round();
    switch (metric) {
      case 'best-signal':
        return '$rounded SIGNAL_SCORE';
      case 'has-now-playing':
        return '$rounded TRACKS_OBSERVED';
      case 'most-listened':
        return '$rounded LISTENER_MIN';
      case 'most-liked':
        return '$rounded LIKES';
      case 'most-zapped':
        return '$rounded ZAPS';
      default:
        final parts = <String>[
          if (entry.artist != null && entry.artist!.trim().isNotEmpty)
            entry.artist!.trim(),
          if (entry.title != null && entry.title!.trim().isNotEmpty)
            entry.title!.trim(),
        ];
        return parts.isNotEmpty ? parts.join(' — ') : 'SIGNAL_DETECTED';
    }
  }

  @override
  Widget build(BuildContext context) {
    final active =
        playerViewModel.snapshot.station?.address == station.address &&
            playerViewModel.snapshot.isPlaying;

    return Container(
      height: 68,
      decoration: BoxDecoration(
        color: SonicColors.foundation,
        border: Border.all(color: SonicColors.ink, width: 2),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Container(
            width: 34,
            color: SonicColors.ink,
            alignment: Alignment.center,
            child: Text(
              rank.toString().padLeft(2, '0'),
              style: SonicMachineTheme.labelTech(
                fontSize: 12,
                color: SonicColors.foundation,
                letterSpacing: 0.4,
              ),
            ),
          ),
          GestureDetector(
            onTap: () => onOpenStationDetail(station),
            child: Container(
              width: 56,
              decoration: const BoxDecoration(
                color: SonicColors.thumbnailDark,
                border: Border(
                  right: BorderSide(color: SonicColors.ink, width: 2),
                ),
              ),
              child: StationThumbnail(
                url: station.thumbnail,
                size: 56,
              ),
            ),
          ),
          Expanded(
            child: InkWell(
              onTap: () => onOpenStationDetail(station),
              child: Padding(
                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    Text(
                      station.name.toUpperCase(),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: Theme.of(context).textTheme.labelLarge?.copyWith(
                            fontSize: 11.5,
                            fontWeight: FontWeight.w900,
                            letterSpacing: 0.2,
                          ),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      _metricReadout().toUpperCase(),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: SonicMachineTheme.labelTech(
                        fontSize: 9,
                        color: SonicColors.signalRed,
                        letterSpacing: 0.8,
                      ),
                    ),
                    if (health != null) ...[
                      const SizedBox(height: 3),
                      _HealthPill(health: health!),
                    ],
                  ],
                ),
              ),
            ),
          ),
          InkWell(
            onTap: () => playerViewModel.togglePlayStation(station),
            child: Container(
              width: 46,
              decoration: BoxDecoration(
                color: active ? SonicColors.ink : SonicColors.signalRed,
                border: const Border(
                  left: BorderSide(color: SonicColors.ink, width: 2),
                ),
              ),
              alignment: Alignment.center,
              child: Icon(
                active ? Icons.graphic_eq : Icons.play_arrow,
                color: active ? SonicColors.voltageCyan : SonicColors.onSignal,
                size: 20,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _HealthPill extends StatelessWidget {
  const _HealthPill({required this.health});

  final StationHealthSummary health;

  @override
  Widget build(BuildContext context) {
    final Color dotColor;
    final String statusLabel;
    switch (health.status) {
      case 'up':
        dotColor = SonicColors.voltageCyan;
        statusLabel = 'UP ${health.score}';
      case 'degraded':
        dotColor = Colors.amber;
        statusLabel = 'DEGRADED ${health.score}';
      case 'down':
        dotColor = SonicColors.signalRed;
        statusLabel = 'OFFLINE';
      default:
        dotColor = SonicColors.seamOutline;
        statusLabel = 'UNCHECKED';
    }

    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Container(
          width: 6,
          height: 6,
          color: dotColor,
        ),
        const SizedBox(width: 4),
        Text(
          statusLabel,
          style: SonicMachineTheme.labelTech(
            fontSize: 8,
            color: SonicColors.seamOutline,
            letterSpacing: 0.8,
          ),
        ),
      ],
    );
  }
}

class _RecentDownloadsPanel extends StatelessWidget {
  const _RecentDownloadsPanel({
    required this.songs,
    required this.playerViewModel,
    required this.authViewModel,
    required this.crateViewModel,
    required this.onRequestLogin,
    required this.isWideLayout,
  });

  final List<SavedSong> songs;
  final PlayerViewModel playerViewModel;
  final AuthViewModel authViewModel;
  final CrateViewModel? crateViewModel;
  final VoidCallback onRequestLogin;
  final bool isWideLayout;

  @override
  Widget build(BuildContext context) {
    return SonicPlate(
      backgroundColor: SonicColors.surfacePlate,
      borderWidth: 3,
      shadowOffset: const Offset(5, 5),
      padding: EdgeInsets.zero,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
            decoration: const BoxDecoration(
              border: Border(
                bottom: BorderSide(color: SonicColors.ink, width: 3),
              ),
            ),
            child: Row(
              children: [
                Expanded(
                  child: Text(
                    'RECENT_DOWNLOADS',
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: Theme.of(context).textTheme.titleSmall?.copyWith(
                          fontWeight: FontWeight.w900,
                          letterSpacing: 0.4,
                        ),
                  ),
                ),
                const SizedBox(width: 8),
                Text(
                  'BLOSSOM_ARCHIVE',
                  style: SonicMachineTheme.labelTech(
                    fontSize: 9,
                    color: SonicColors.signalRed,
                    letterSpacing: 1.1,
                  ),
                ),
              ],
            ),
          ),
          if (isWideLayout)
            Padding(
              padding: const EdgeInsets.all(10),
              child: Column(
                children: [
                  for (var i = 0; i < songs.length; i++) ...[
                    if (i > 0) const SizedBox(height: 8),
                    _RecentDownloadRow(
                      rank: i + 1,
                      song: songs[i],
                      playerViewModel: playerViewModel,
                      authViewModel: authViewModel,
                      crateViewModel: crateViewModel,
                      onRequestLogin: onRequestLogin,
                    ),
                  ],
                ],
              ),
            )
          else
            SizedBox(
              height: 92,
              child: ListView.separated(
                scrollDirection: Axis.horizontal,
                padding: const EdgeInsets.all(10),
                itemCount: songs.length,
                separatorBuilder: (_, _) => const SizedBox(width: 8),
                itemBuilder: (context, index) => SizedBox(
                  width: 288,
                  child: _RecentDownloadRow(
                    rank: index + 1,
                    song: songs[index],
                    playerViewModel: playerViewModel,
                    authViewModel: authViewModel,
                    crateViewModel: crateViewModel,
                    onRequestLogin: onRequestLogin,
                  ),
                ),
              ),
            ),
        ],
      ),
    );
  }
}

class _RecentDownloadRow extends StatelessWidget {
  const _RecentDownloadRow({
    required this.rank,
    required this.song,
    required this.playerViewModel,
    required this.authViewModel,
    required this.crateViewModel,
    required this.onRequestLogin,
  });

  final int rank;
  final SavedSong song;
  final PlayerViewModel playerViewModel;
  final AuthViewModel authViewModel;
  final CrateViewModel? crateViewModel;
  final VoidCallback onRequestLogin;

  @override
  Widget build(BuildContext context) {
    final saved = crateViewModel?.containsAddress(song.address) ?? false;

    return Container(
      height: 68,
      decoration: BoxDecoration(
        color: SonicColors.foundation,
        border: Border.all(color: SonicColors.ink, width: 2),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Container(
            width: 34,
            color: SonicColors.ink,
            alignment: Alignment.center,
            child: Text(
              rank.toString().padLeft(2, '0'),
              style: SonicMachineTheme.labelTech(
                fontSize: 12,
                color: SonicColors.foundation,
                letterSpacing: 0.4,
              ),
            ),
          ),
          Container(
            width: 56,
            decoration: const BoxDecoration(
              color: SonicColors.thumbnailDark,
              border: Border(
                right: BorderSide(color: SonicColors.ink, width: 2),
              ),
            ),
            child: StationThumbnail(
              url: song.thumb ?? song.coverArt,
              size: 56,
            ),
          ),
          Expanded(
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Text(
                    song.title.toUpperCase(),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: Theme.of(context).textTheme.labelLarge?.copyWith(
                          fontSize: 11.5,
                          fontWeight: FontWeight.w900,
                        ),
                  ),
                  const SizedBox(height: 2),
                  Text(
                    (song.artist ?? 'UNKNOWN_ARTIST').toUpperCase(),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: SonicMachineTheme.labelTech(
                      fontSize: 9,
                      color: SonicColors.signalRed,
                      letterSpacing: 0.8,
                    ),
                  ),
                  const SizedBox(height: 3),
                  Text(
                    'BLOSSOM_FILE',
                    style: SonicMachineTheme.labelTech(
                      fontSize: 8,
                      color: SonicColors.seamOutline,
                      letterSpacing: 0.8,
                    ),
                  ),
                ],
              ),
            ),
          ),
          if (crateViewModel != null)
            InkWell(
              onTap: () {
                if (!authViewModel.isLoggedIn) {
                  onRequestLogin();
                  return;
                }
                crateViewModel!.toggleSongAddress(song.address);
              },
              child: Container(
                width: 38,
                decoration: const BoxDecoration(
                  color: SonicColors.surfacePlate,
                  border: Border(
                    left: BorderSide(color: SonicColors.ink, width: 2),
                  ),
                ),
                alignment: Alignment.center,
                child: Icon(
                  saved ? Icons.bookmark : Icons.bookmark_border,
                  size: 17,
                  color: saved ? SonicColors.signalRed : SonicColors.ink,
                ),
              ),
            ),
          InkWell(
            onTap: () => playerViewModel.playSavedSong(song),
            child: Container(
              width: 46,
              decoration: const BoxDecoration(
                color: SonicColors.signalRed,
                border: Border(
                  left: BorderSide(color: SonicColors.ink, width: 2),
                ),
              ),
              alignment: Alignment.center,
              child: const Icon(
                Icons.play_arrow,
                color: SonicColors.onSignal,
                size: 20,
              ),
            ),
          ),
        ],
      ),
    );
  }
}
