import 'dart:async';

import 'package:material_ui/material_ui.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'app.dart';
import 'data/repositories/auth_repository.dart';
import 'data/repositories/station_repository.dart';
import 'data/services/amber_signer_service.dart';
import 'data/services/desktop_shell_service.dart';
import 'data/services/preferences_service.dart';
import 'data/services/radio_audio_handler.dart';
import 'data/services/rust_bridge_backend.dart';
import 'data/services/secure_auth_storage.dart';
import 'ui/features/auth/view_models/auth_view_model.dart';
import 'ui/features/crate/view_models/crate_view_model.dart';
import 'ui/features/discover/view_models/discover_view_model.dart';
import 'ui/features/player/view_models/player_view_model.dart';
import 'ui/features/social/view_models/community_view_model.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await DesktopShellService.instance.initializeWindow();

  final prefs = await SharedPreferences.getInstance();
  final preferencesService = PreferencesService(prefs);
  final backend = await createWavefuncBackend();
  final audioHandler = await RadioAudioHandler.initAudioService();

  final authRepository = AuthRepository(
    backend: backend,
    storage: SecureAuthStorage(),
    amber: AmberSignerService(),
    preferences: preferencesService,
  );
  final authViewModel = AuthViewModel(authRepository: authRepository);

  final stationRepository = StationRepository(
    backend: backend,
    preferences: preferencesService,
  );
  final discoverViewModel = DiscoverViewModel(
    repository: stationRepository,
    authViewModel: authViewModel,
  );
  final playerViewModel = PlayerViewModel(
    engine: audioHandler,
    repository: stationRepository,
    authViewModel: authViewModel,
  );
  final communityViewModel = CommunityViewModel(
    backend: backend,
    authViewModel: authViewModel,
  );
  final crateViewModel = CrateViewModel(
    backend: backend,
    authViewModel: authViewModel,
  );

  unawaited(DesktopShellService.instance.attachPlayer(playerViewModel));

  // Boot relay sync + saved Nostr session asynchronously so frame 1 is instant.
  unawaited(
    Future<void>(() async {
      await discoverViewModel.initialize();
      await authViewModel.initialize();
      if (authViewModel.isLoggedIn) {
        await discoverViewModel.syncUserFavorites();
        await crateViewModel.refresh();
      }
    }),
  );

  runApp(
    WavefuncApp(
      discoverViewModel: discoverViewModel,
      playerViewModel: playerViewModel,
      authViewModel: authViewModel,
      communityViewModel: communityViewModel,
      crateViewModel: crateViewModel,
    ),
  );
}
