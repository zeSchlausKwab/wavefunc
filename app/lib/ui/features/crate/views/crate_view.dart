import 'package:material_ui/material_ui.dart';

import '../../../core/theme/sonic_machine_theme.dart';
import '../../../core/widgets/sonic_plate.dart';
import '../../../core/widgets/station_thumbnail.dart';
import '../../auth/view_models/auth_view_model.dart';
import '../view_models/crate_view_model.dart';

/// User's synced Nostr Song Crate (`kind 31337` songs + `kind 30078` list).
class CrateView extends StatelessWidget {
  const CrateView({
    super.key,
    required this.crateViewModel,
    required this.authViewModel,
    required this.onRequestLogin,
  });

  final CrateViewModel crateViewModel;
  final AuthViewModel authViewModel;
  final VoidCallback onRequestLogin;

  @override
  Widget build(BuildContext context) {
    return ListenableBuilder(
      listenable: Listenable.merge([crateViewModel, authViewModel]),
      builder: (context, _) {
        final auth = authViewModel;
        final vm = crateViewModel;

        if (!auth.isLoggedIn) {
          return Center(
            child: Padding(
              padding: const EdgeInsets.all(24),
              child: SonicPlate(
                padding: const EdgeInsets.all(20),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Text(
                      'SONG_CRATE // LOCKED',
                      style: SonicMachineTheme.labelTech(
                        fontSize: 11,
                        color: SonicColors.signalRed,
                      ),
                    ),
                    const SizedBox(height: 8),
                    const Text(
                      'Sign in with Amber, Bunker, or nsec to sync your saved radio tracks and favorites across devices.',
                      textAlign: TextAlign.center,
                    ),
                    const SizedBox(height: 16),
                    SonicPowerButton(
                      label: 'Connect Nostr Account',
                      icon: Icons.login,
                      onPressed: onRequestLogin,
                    ),
                  ],
                ),
              ),
            ),
          );
        }

        return RefreshIndicator(
          color: SonicColors.signalRed,
          backgroundColor: SonicColors.foundation,
          onRefresh: vm.refresh,
          child: CustomScrollView(
            physics: const AlwaysScrollableScrollPhysics(),
            slivers: [
              SliverToBoxAdapter(
                child: Padding(
                  padding: const EdgeInsets.fromLTRB(16, 16, 16, 12),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        'AUDIO_ARCHIVE // KIND 31337',
                        style: SonicMachineTheme.labelTech(
                          fontSize: 10,
                          color: SonicColors.signalRed,
                          letterSpacing: 2.0,
                        ),
                      ),
                      const SizedBox(height: 2),
                      Text(
                        vm.crate.name.toUpperCase(),
                        style: Theme.of(context)
                            .textTheme
                            .displayMedium
                            ?.copyWith(fontSize: 30),
                      ),
                      const SizedBox(height: 12),
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
              if (vm.isLoading && vm.songs.isEmpty)
                const SliverFillRemaining(
                  hasScrollBody: false,
                  child: Center(
                    child: CircularProgressIndicator(
                      color: SonicColors.signalRed,
                    ),
                  ),
                )
              else if (vm.songs.isEmpty)
                SliverFillRemaining(
                  hasScrollBody: false,
                  child: Center(
                    child: Padding(
                      padding: const EdgeInsets.all(24),
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
                              'Tune into a station, open the Observation Window player sheet, and tap SAVE TO CRATE when a track is playing.',
                              textAlign: TextAlign.center,
                            ),
                          ],
                        ),
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
                      return SonicPlate(
                        shadowOffset: const Offset(3, 3),
                        padding: const EdgeInsets.all(10),
                        child: Row(
                          children: [
                            StationThumbnail(
                              url: song.thumb ?? song.coverArt,
                              size: 48,
                            ),
                            const SizedBox(width: 12),
                            Expanded(
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text(
                                    song.title,
                                    maxLines: 1,
                                    overflow: TextOverflow.ellipsis,
                                    style:
                                        Theme.of(context).textTheme.titleMedium,
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
