import 'package:material_ui/material_ui.dart';

import '../../../../data/services/station_tracks.dart';
import '../../../../domain/models/heard_song.dart';
import '../../../core/theme/sonic_machine_theme.dart';
import '../../../core/widgets/sonic_plate.dart';
import '../../auth/view_models/auth_view_model.dart';
import '../../crate/view_models/crate_view_model.dart';
import '../view_models/player_view_model.dart';
import 'track_crate_button.dart';

class SongHistoryRow extends StatelessWidget {
  const SongHistoryRow({
    super.key,
    required this.song,
    required this.crate,
    required this.auth,
    required this.onRequestLogin,
  });
  final HeardSong song;
  final CrateViewModel crate;
  final AuthViewModel auth;
  final VoidCallback onRequestLogin;

  @override
  Widget build(BuildContext context) {
    final local = MaterialLocalizations.of(context);
    final date = song.heardAt.toLocal();
    final when =
        '${local.formatShortDate(date)} · ${local.formatTimeOfDay(TimeOfDay.fromDateTime(date), alwaysUse24HourFormat: MediaQuery.alwaysUse24HourFormatOf(context))}';
    return ListTile(
      contentPadding: EdgeInsets.zero,
      title: Text(
        song.metadata.displaySong!,
        style: const TextStyle(fontWeight: FontWeight.bold),
      ),
      subtitle: Text(
        [?song.metadata.displayArtist, ?song.stationName, when].join(' · '),
      ),
      trailing: TrackCrateButton(
        metadata: song.metadata,
        crate: crate,
        auth: auth,
        onRequestLogin: onRequestLogin,
        iconOnly: true,
        iconColor: SonicColors.ink,
      ),
    );
  }
}

class PersonalSongHistory extends StatelessWidget {
  const PersonalSongHistory({
    super.key,
    required this.player,
    required this.crate,
    required this.auth,
    required this.onRequestLogin,
  });
  final PlayerViewModel player;
  final CrateViewModel crate;
  final AuthViewModel auth;
  final VoidCallback onRequestLogin;

  @override
  Widget build(BuildContext context) {
    return ListenableBuilder(
      listenable: player,
      builder: (context, _) {
        final songs = player.recentSongs;
        return ListView(
          padding: const EdgeInsets.fromLTRB(16, 4, 16, 120),
          children: [
            SonicSectionHeader(
              title: 'HEARD_ON_THIS_DEVICE',
              trailing: songs.isEmpty
                  ? null
                  : TextButton(
                      onPressed: () async {
                        final clear = await showDialog<bool>(
                          context: context,
                          builder: (ctx) => AlertDialog(
                            title: const Text(
                              'Clear song history on this device?',
                            ),
                            actions: [
                              TextButton(
                                onPressed: () => Navigator.pop(ctx, false),
                                child: const Text('Cancel'),
                              ),
                              TextButton(
                                onPressed: () => Navigator.pop(ctx, true),
                                child: const Text('Clear'),
                              ),
                            ],
                          ),
                        );
                        if (clear == true) await player.clearRecentSongs();
                      },
                      child: const Text('Clear all'),
                    ),
            ),
            if (songs.isEmpty)
              const Padding(
                padding: EdgeInsets.symmetric(vertical: 16),
                child: Text(
                  'Songs appear here when a station you listen to provides track information.',
                ),
              ),
            for (final song in songs)
              SongHistoryRow(
                song: song,
                auth: auth,
                crate: crate,
                onRequestLogin: onRequestLogin,
              ),
          ],
        );
      },
    );
  }
}

class StationSongHistory extends StatefulWidget {
  const StationSongHistory({
    super.key,
    required this.address,
    required this.crate,
    required this.auth,
    required this.onRequestLogin,
  });
  final String address;
  final CrateViewModel crate;
  final AuthViewModel auth;
  final VoidCallback onRequestLogin;

  @override
  State<StationSongHistory> createState() => _StationSongHistoryState();
}

class _StationSongHistoryState extends State<StationSongHistory> {
  late Future<List<HeardSong>> _songs = fetchStationTracks(widget.address);

  @override
  void didUpdateWidget(StationSongHistory oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (widget.address != oldWidget.address) {
      _songs = fetchStationTracks(widget.address);
    }
  }

  @override
  Widget build(BuildContext context) {
    return FutureBuilder<List<HeardSong>>(
      future: _songs,
      builder: (context, snapshot) {
        final loading = snapshot.connectionState != ConnectionState.done;
        final songs = snapshot.data ?? [];
        return Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            SonicSectionHeader(
              title: 'RECENTLY_HEARD',
              trailing: IconButton(
                tooltip: 'Refresh station song history',
                icon: const Icon(Icons.refresh),
                onPressed: loading
                    ? null
                    : () => setState(
                        () => _songs = fetchStationTracks(widget.address),
                      ),
              ),
            ),
            if (loading || snapshot.hasError || songs.isEmpty)
              Text(
                loading
                    ? 'Loading song history…'
                    : snapshot.hasError
                    ? 'Station song history is unavailable.'
                    : 'No songs observed yet.',
                style: SonicMachineTheme.labelTech(fontSize: 11),
              ),
            if (!loading && !snapshot.hasError)
              ListenableBuilder(
                listenable: Listenable.merge([widget.crate, widget.auth]),
                builder: (_, _) => Column(
                  children: [
                    for (final song in songs)
                      SongHistoryRow(
                        song: song,
                        auth: widget.auth,
                        crate: widget.crate,
                        onRequestLogin: widget.onRequestLogin,
                      ),
                  ],
                ),
              ),
          ],
        );
      },
    );
  }
}
