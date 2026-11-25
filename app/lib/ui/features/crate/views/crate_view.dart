import 'package:material_ui/material_ui.dart';

import '../../../../domain/models/social.dart';
import '../../../core/theme/sonic_machine_theme.dart';
import '../../../core/widgets/sonic_plate.dart';
import '../../../core/widgets/station_thumbnail.dart';
import '../../../core/widgets/video_player_sheet.dart';
import '../../auth/view_models/auth_view_model.dart';
import '../../player/view_models/player_view_model.dart';
import '../view_models/crate_view_model.dart';
import 'media_forge_sheet.dart';
import 'share_song_sheet.dart';

/// User's synced Nostr Song Crate (`kind 31337` songs + `kind 30078` list),
/// integrated MusicBrainz Song Search, and Blossom Media Backup (`MEDIA_FORGE`).
class CrateView extends StatefulWidget {
  const CrateView({
    super.key,
    required this.crateViewModel,
    required this.authViewModel,
    required this.onRequestLogin,
    this.playerViewModel,
  });

  final CrateViewModel crateViewModel;
  final AuthViewModel authViewModel;
  final VoidCallback onRequestLogin;
  final PlayerViewModel? playerViewModel;

  @override
  State<CrateView> createState() => _CrateViewState();
}

class _CrateViewState extends State<CrateView> {
  final TextEditingController _songSearchController = TextEditingController();

  @override
  void dispose() {
    _songSearchController.dispose();
    super.dispose();
  }

  void _runSongSearch() {
    widget.crateViewModel.searchSongs(_songSearchController.text);
  }

  Future<void> _saveRecording(MusicBrainzRecording rec) async {
    if (!widget.authViewModel.isLoggedIn) {
      widget.onRequestLogin();
      return;
    }
    final songId = await widget.crateViewModel.saveRecording(rec);
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(
          songId != null
              ? 'Saved "${rec.title}" to Song Crate'
              : (widget.crateViewModel.errorMessage ?? 'Could not save song'),
        ),
      ),
    );
  }

  void _openBlossomBackup({
    SavedSong? existingSong,
    MusicBrainzRecording? recording,
  }) {
    if (!widget.authViewModel.isLoggedIn) {
      widget.onRequestLogin();
      return;
    }
    MediaForgeSheet.open(
      context,
      crateViewModel: widget.crateViewModel,
      authViewModel: widget.authViewModel,
      onRequestLogin: widget.onRequestLogin,
      existingSong: existingSong,
      recording: recording,
    );
  }

  @override
  Widget build(BuildContext context) {
    return ListenableBuilder(
      listenable: Listenable.merge([widget.crateViewModel, widget.authViewModel]),
      builder: (context, _) {
        final auth = widget.authViewModel;
        final vm = widget.crateViewModel;

        return RefreshIndicator(
          color: SonicColors.signalRed,
          backgroundColor: SonicColors.foundation,
          onRefresh: vm.refresh,
          child: CustomScrollView(
            physics: const AlwaysScrollableScrollPhysics(),
            slivers: [
              // ── Header + MusicBrainz Song Search ──
              SliverToBoxAdapter(
                child: Padding(
                  padding: const EdgeInsets.fromLTRB(16, 16, 16, 12),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        'AUDIO_ARCHIVE // KIND 31337 + BLOSSOM',
                        style: SonicMachineTheme.labelTech(
                          fontSize: 10,
                          color: SonicColors.signalRed,
                          letterSpacing: 1.8,
                        ),
                      ),
                      const SizedBox(height: 2),
                      Text(
                        vm.crate.name.toUpperCase(),
                        style: Theme.of(context)
                            .textTheme
                            .displayMedium
                            ?.copyWith(fontSize: 28),
                      ),
                      const SizedBox(height: 12),
                      Row(
                        children: [
                          Expanded(
                            child: TextField(
                              controller: _songSearchController,
                              onSubmitted: (_) => _runSongSearch(),
                              decoration: InputDecoration(
                                hintText: 'SEARCH SONGS (MUSICBRAINZ)...',
                                prefixIcon: const Icon(
                                  Icons.music_note,
                                  color: SonicColors.ink,
                                ),
                                suffixIcon:
                                    _songSearchController.text.isNotEmpty ||
                                            vm.searchResults.isNotEmpty
                                        ? IconButton(
                                            icon: const Icon(
                                              Icons.close,
                                              color: SonicColors.ink,
                                            ),
                                            onPressed: () {
                                              _songSearchController.clear();
                                              vm.clearSongSearch();
                                            },
                                          )
                                        : null,
                              ),
                            ),
                          ),
                          const SizedBox(width: 8),
                          SonicPowerButton(
                            label: 'Search',
                            compact: true,
                            onPressed:
                                vm.isSearchingSongs ? null : _runSongSearch,
                          ),
                        ],
                      ),

                      // Song Search Results
                      if (vm.isSearchingSongs)
                        const Padding(
                          padding: EdgeInsets.symmetric(vertical: 18),
                          child: Center(
                            child: CircularProgressIndicator(
                              color: SonicColors.signalRed,
                            ),
                          ),
                        )
                      else if (vm.songSearchError != null) ...[
                        const SizedBox(height: 10),
                        SonicPlate(
                          backgroundColor: SonicColors.signalRed,
                          shadowOffset: Offset.zero,
                          padding: const EdgeInsets.all(10),
                          child: Text(
                            vm.songSearchError!,
                            style: SonicMachineTheme.labelTech(
                              fontSize: 10,
                              color: SonicColors.onSignal,
                            ),
                          ),
                        ),
                      ] else if (vm.searchResults.isNotEmpty) ...[
                        const SizedBox(height: 14),
                        SonicSectionHeader(
                          title: 'SONG_SEARCH_RESULTS',
                          trailing: Text(
                            '${vm.searchResults.length} MATCHES',
                            style: SonicMachineTheme.labelTech(
                              fontSize: 9.5,
                              color: SonicColors.seamOutline,
                            ),
                          ),
                        ),
                        const SizedBox(height: 8),
                        for (final rec in vm.searchResults)
                          Padding(
                            padding: const EdgeInsets.only(bottom: 8),
                            child: SongRecordingCard(
                              recording: rec,
                              alreadySaved: vm.savedSong(
                                rec.title, rec.artist, mbid: rec.id,
                              ) != null,
                              isSaving: vm.isSaving,
                              onSave: () => _saveRecording(rec),
                              onBackupToBlossom: () =>
                                  _openBlossomBackup(recording: rec),
                            ),
                          ),
                      ],

                      const SizedBox(height: 14),
                      SonicSectionHeader(
                        title: 'SAVED_TRACKS',
                        trailing: Text(
                          '${vm.songs.length} TRACKS',
                          style: SonicMachineTheme.labelTech(
                            fontSize: 10,
                            color: SonicColors.seamOutline,
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
              ),

              if (!auth.isLoggedIn)
                SliverToBoxAdapter(
                  child: Padding(
                    padding: const EdgeInsets.fromLTRB(16, 4, 16, 120),
                    child: SonicPlate(
                      padding: const EdgeInsets.all(16),
                      child: Column(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Text(
                            'SONG_CRATE // SIGN IN TO SYNC & BACKUP',
                            style: SonicMachineTheme.labelTech(
                              fontSize: 10.5,
                              color: SonicColors.signalRed,
                            ),
                          ),
                          const SizedBox(height: 6),
                          const Text(
                            'Sign in with Amber, Bunker, or nsec to save songs to Nostr and back up audio to Blossom.',
                            textAlign: TextAlign.center,
                          ),
                          const SizedBox(height: 12),
                          SonicPowerButton(
                            label: 'Connect Nostr Account',
                            icon: Icons.login,
                            compact: true,
                            onPressed: widget.onRequestLogin,
                          ),
                        ],
                      ),
                    ),
                  ),
                )
              else if (vm.isLoading && vm.songs.isEmpty)
                const SliverFillRemaining(
                  hasScrollBody: false,
                  child: Center(
                    child: CircularProgressIndicator(
                      color: SonicColors.signalRed,
                    ),
                  ),
                )
              else if (vm.songs.isEmpty)
                SliverToBoxAdapter(
                  child: Padding(
                    padding: const EdgeInsets.fromLTRB(16, 4, 16, 120),
                    child: SonicPlate(
                      padding: const EdgeInsets.all(18),
                      child: Column(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Text(
                            'CRATE IS EMPTY',
                            style: SonicMachineTheme.labelTech(fontSize: 12),
                          ),
                          const SizedBox(height: 8),
                          const Text(
                            'Search for a song above or save a live track from the player, then back it up to Blossom.',
                            textAlign: TextAlign.center,
                          ),
                        ],
                      ),
                    ),
                  ),
                )
              else
                SliverPadding(
                  padding: const EdgeInsets.fromLTRB(16, 4, 16, 120),
                  sliver: SliverList.separated(
                    itemCount: vm.songs.length,
                    separatorBuilder: (_, _) => const SizedBox(height: 10),
                    itemBuilder: (context, index) {
                      final song = vm.songs[index];
                      final hasAudio = song.audioUrl != null &&
                          song.audioUrl!.trim().isNotEmpty;
                      final isVideo = isVideoMediaUrl(song.audioUrl);
                      return SonicPlate(
                        shadowOffset: const Offset(3, 3),
                        shadowColor: hasAudio
                            ? SonicColors.voltageCyan
                            : SonicColors.ink,
                        padding: const EdgeInsets.all(10),
                        child: Row(
                          children: [
                            StationThumbnail(
                              url: song.thumb ?? song.coverArt,
                              size: 48,
                              highlight: hasAudio,
                            ),
                            const SizedBox(width: 12),
                            Expanded(
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Row(
                                    children: [
                                      Expanded(
                                        child: Text(
                                          song.title,
                                          maxLines: 1,
                                          overflow: TextOverflow.ellipsis,
                                          style: Theme.of(context)
                                              .textTheme
                                              .titleMedium,
                                        ),
                                      ),
                                      if (hasAudio) ...[
                                        const SizedBox(width: 6),
                                        SonicTag(
                                          label: isVideo ? 'VIDEO' : 'BLOSSOM',
                                          highlighted: true,
                                        ),
                                      ],
                                    ],
                                  ),
                                  const SizedBox(height: 2),
                                  Text(
                                    song.subtitle.toUpperCase(),
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
                            if (hasAudio &&
                                (isVideo || widget.playerViewModel != null))
                              IconButton(
                                tooltip: isVideo
                                    ? 'Play Blossom video'
                                    : 'Play Blossom audio',
                                onPressed: () {
                                  if (isVideo) {
                                    VideoPlayerSheet.open(
                                      context,
                                      url: song.audioUrl!,
                                      title: song.title,
                                      subtitle: song.artist,
                                      onBeforeOpen: () async {
                                        if (widget.playerViewModel != null &&
                                            widget.playerViewModel!.snapshot
                                                .isPlaying) {
                                          await widget.playerViewModel!.pause();
                                        }
                                      },
                                    );
                                  } else {
                                    widget.playerViewModel!.playSavedSong(song);
                                  }
                                },
                                icon: Icon(
                                  isVideo
                                      ? Icons.smart_display
                                      : Icons.play_arrow,
                                  color: SonicColors.signalRed,
                                  size: 22,
                                ),
                              ),
                            IconButton(
                              tooltip: 'Share song to Nostr',
                              onPressed: () => ShareSongSheet.open(
                                context,
                                song: song,
                                authViewModel: widget.authViewModel,
                                onRequestLogin: widget.onRequestLogin,
                              ),
                              icon: const Icon(
                                Icons.share_outlined,
                                color: SonicColors.ink,
                                size: 19,
                              ),
                            ),
                            IconButton(
                              tooltip: hasAudio
                                  ? 'Re-backup to Blossom'
                                  : 'Backup to Blossom',
                              onPressed: () =>
                                  _openBlossomBackup(existingSong: song),
                              icon: Icon(
                                hasAudio
                                    ? Icons.cloud_done_outlined
                                    : Icons.cloud_upload_outlined,
                                color: SonicColors.ink,
                                size: 20,
                              ),
                            ),
                            IconButton(
                              tooltip: 'Remove from crate',
                              onPressed: vm.isSaving
                                  ? null
                                  : () => vm.removeSong(song.address),
                              icon: const Icon(
                                Icons.delete_outline,
                                color: SonicColors.ink,
                                size: 20,
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
        );
      },
    );
  }
}

/// Reusable Constructivist card for a MusicBrainz song search recording.
class SongRecordingCard extends StatelessWidget {
  const SongRecordingCard({
    super.key,
    required this.recording,
    required this.alreadySaved,
    required this.isSaving,
    required this.onSave,
    required this.onBackupToBlossom,
  });

  final MusicBrainzRecording recording;
  final bool alreadySaved;
  final bool isSaving;
  final VoidCallback onSave;
  final VoidCallback onBackupToBlossom;

  @override
  Widget build(BuildContext context) {
    final metaParts = <String>[
      recording.artist,
      if (recording.release != null && recording.release!.isNotEmpty)
        recording.release!,
      if (recording.releaseYear != null) recording.releaseYear!,
      if (recording.formattedDuration != null) recording.formattedDuration!,
    ];

    return SonicPlate(
      shadowOffset: const Offset(3, 3),
      padding: const EdgeInsets.all(10),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Container(
                width: 36,
                height: 36,
                color: SonicColors.ink,
                alignment: Alignment.center,
                child: const Icon(
                  Icons.album_outlined,
                  color: SonicColors.voltageCyan,
                  size: 18,
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      recording.title,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: Theme.of(context).textTheme.titleMedium,
                    ),
                    const SizedBox(height: 2),
                    Text(
                      metaParts.join(' · ').toUpperCase(),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: SonicMachineTheme.labelTech(
                        fontSize: 9,
                        color: SonicColors.seamOutline,
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
          if (recording.tags.isNotEmpty) ...[
            const SizedBox(height: 6),
            Wrap(
              spacing: 4,
              runSpacing: 4,
              children: recording.tags
                  .take(4)
                  .map((t) => SonicTag(label: t))
                  .toList(),
            ),
          ],
          const SizedBox(height: 8),
          Row(
            children: [
              if (!alreadySaved) ...[
                Expanded(
                  child: SonicPowerButton(
                    label: 'Save to Crate',
                    icon: Icons.bookmark_add_outlined,
                    primary: false,
                    compact: true,
                    onPressed: isSaving ? null : onSave,
                  ),
                ),
                const SizedBox(width: 8),
              ],
              Expanded(
                child: SonicPowerButton(
                  label: alreadySaved ? 'Backup Song' : 'Blossom Backup',
                  icon: Icons.cloud_upload_outlined,
                  compact: true,
                  onPressed: onBackupToBlossom,
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}
