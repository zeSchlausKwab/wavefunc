import 'package:material_ui/material_ui.dart';

import 'ui/core/theme/sonic_machine_theme.dart';
import 'ui/features/auth/view_models/auth_view_model.dart';
import 'ui/features/crate/view_models/crate_view_model.dart';
import 'ui/features/discover/view_models/discover_view_model.dart';
import 'ui/features/player/view_models/player_view_model.dart';
import 'ui/features/shell/app_shell.dart';
import 'ui/features/social/view_models/community_view_model.dart';

class WavefuncApp extends StatelessWidget {
  const WavefuncApp({
    super.key,
    required this.discoverViewModel,
    required this.playerViewModel,
    required this.authViewModel,
    required this.communityViewModel,
    required this.crateViewModel,
  });

  final DiscoverViewModel discoverViewModel;
  final PlayerViewModel playerViewModel;
  final AuthViewModel authViewModel;
  final CommunityViewModel communityViewModel;
  final CrateViewModel crateViewModel;

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'WaveFunc Radio',
      debugShowCheckedModeBanner: false,
      theme: SonicMachineTheme.build(),
      home: AppShell(
        discoverViewModel: discoverViewModel,
        playerViewModel: playerViewModel,
        authViewModel: authViewModel,
        communityViewModel: communityViewModel,
        crateViewModel: crateViewModel,
      ),
    );
  }
}
