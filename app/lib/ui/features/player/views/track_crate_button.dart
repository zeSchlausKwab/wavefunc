import 'package:material_ui/material_ui.dart';

import '../../../../domain/models/now_playing.dart';
import '../../../core/theme/sonic_machine_theme.dart';
import '../../../core/widgets/sonic_plate.dart';
import '../../auth/view_models/auth_view_model.dart';
import '../../crate/view_models/crate_view_model.dart';
import '../../crate/views/media_forge_sheet.dart';

class TrackCrateButton extends StatelessWidget {
  const TrackCrateButton({
    super.key,
    required this.metadata,
    required this.crate,
    required this.auth,
    required this.onRequestLogin,
    this.iconOnly = false,
    this.compact = false,
  });

  final NowPlayingMetadata metadata;
  final CrateViewModel crate;
  final AuthViewModel auth;
  final VoidCallback onRequestLogin;
  final bool iconOnly;
  final bool compact;

  @override
  Widget build(BuildContext context) {
    final title = metadata.displaySong;
    if (title == null) return const SizedBox.shrink();
    final saved = crate.savedSong(
      title,
      metadata.displayArtist,
      mbid: metadata.mbid,
    );
    final label = saved != null
        ? 'Backup Song'
        : crate.isSaving
        ? 'Saving…'
        : 'Save Track';
    final icon = saved == null
        ? Icons.library_add
        : Icons.cloud_upload_outlined;
    Future<void> activate() async {
      if (!auth.isLoggedIn) {
        onRequestLogin();
      } else if (saved != null) {
        await MediaForgeSheet.open(
          context,
          crateViewModel: crate,
          authViewModel: auth,
          onRequestLogin: onRequestLogin,
          existingSong: saved,
        );
      } else {
        final ok = await crate.saveNowPlaying(metadata);
        if (context.mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(
              content: Text(
                ok
                    ? 'Saved "$title" to your Crate'
                    : (crate.errorMessage ?? 'Could not save track'),
              ),
            ),
          );
        }
      }
    }

    final tap = crate.isSaving ? null : activate;
    if (iconOnly) {
      return IconButton(
        icon: Icon(icon, size: 18),
        tooltip: label,
        onPressed: tap,
        color: SonicColors.foundation,
        constraints: const BoxConstraints.tightFor(width: 34, height: 34),
        padding: EdgeInsets.zero,
      );
    }
    return SonicPowerButton(
      label: label,
      icon: icon,
      onPressed: tap,
      primary: false,
      active: saved != null,
      compact: compact,
    );
  }
}
