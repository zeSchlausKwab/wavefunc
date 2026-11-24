import 'package:flutter/services.dart';
import 'package:material_ui/material_ui.dart';

import '../../../../domain/models/social.dart';
import '../../../core/theme/sonic_machine_theme.dart';
import '../../../core/widgets/sonic_plate.dart';
import '../../../core/widgets/station_thumbnail.dart';

/// Constructivist public Nostr profile modal (mirrors `profile.$pubkey.tsx`).
class UserProfileSheet extends StatefulWidget {
  const UserProfileSheet({
    super.key,
    required this.pubkey,
    required this.loadProfile,
    this.initialName,
    this.initialPicture,
  });

  final String pubkey;
  final Future<NostrProfile> Function(String pubkey) loadProfile;
  final String? initialName;
  final String? initialPicture;

  static Future<void> open(
    BuildContext context, {
    required String pubkey,
    required Future<NostrProfile> Function(String pubkey) loadProfile,
    String? initialName,
    String? initialPicture,
  }) {
    final body = UserProfileSheet(
      pubkey: pubkey,
      loadProfile: loadProfile,
      initialName: initialName,
      initialPicture: initialPicture,
    );
    if (MediaQuery.of(context).size.width >= 720) {
      return showDialog<void>(
        context: context,
        builder: (_) => Dialog(
          backgroundColor: SonicColors.foundation,
          shape: const RoundedRectangleBorder(
            side: BorderSide(color: SonicColors.ink, width: 3),
          ),
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 460),
            child: body,
          ),
        ),
      );
    }
    return showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      backgroundColor: SonicColors.foundation,
      shape: const RoundedRectangleBorder(),
      builder: (_) => body,
    );
  }

  @override
  State<UserProfileSheet> createState() => _UserProfileSheetState();
}

class _UserProfileSheetState extends State<UserProfileSheet> {
  NostrProfile? _profile;
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final p = await widget.loadProfile(widget.pubkey);
      if (mounted) setState(() => _profile = p);
    } catch (_) {
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final p = _profile;
    final displayName = p?.label ??
        widget.initialName ??
        (widget.pubkey.length > 12
            ? '${widget.pubkey.substring(0, 12)}...'
            : widget.pubkey);
    final picture = p?.picture ?? widget.initialPicture;
    final npub = (p?.npub != null && p!.npub.isNotEmpty) ? p.npub : widget.pubkey;

    return Container(
      decoration: const BoxDecoration(
        color: SonicColors.foundation,
        border: Border(top: BorderSide(color: SonicColors.ink, width: 3)),
      ),
      child: SafeArea(
        top: false,
        child: SingleChildScrollView(
          padding: const EdgeInsets.fromLTRB(20, 16, 20, 24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Row(
                children: [
                  Expanded(
                    child: Text(
                      'NOSTR_PROFILE // KIND 0',
                      style: SonicMachineTheme.labelTech(
                        fontSize: 9.5,
                        color: SonicColors.signalRed,
                        letterSpacing: 1.5,
                      ),
                    ),
                  ),
                  IconButton(
                    icon: const Icon(Icons.close, color: SonicColors.ink),
                    onPressed: () => Navigator.of(context).pop(),
                  ),
                ],
              ),
              const SizedBox(height: 8),
              SonicPlate(
                backgroundColor: SonicColors.ink,
                shadowColor: SonicColors.voltageCyan,
                padding: const EdgeInsets.all(14),
                child: Row(
                  children: [
                    StationThumbnail(
                      url: picture,
                      size: 56,
                      highlight: true,
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            displayName,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: Theme.of(context)
                                .textTheme
                                .titleMedium
                                ?.copyWith(color: SonicColors.foundation),
                          ),
                          if (p?.nip05 != null && p!.nip05!.isNotEmpty) ...[
                            const SizedBox(height: 3),
                            Text(
                              '✓ ${p.nip05!}',
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: SonicMachineTheme.labelTech(
                                fontSize: 9.5,
                                color: SonicColors.voltageCyan,
                              ),
                            ),
                          ],
                          if (p?.lud16 != null && p!.lud16!.isNotEmpty) ...[
                            const SizedBox(height: 3),
                            Text(
                              '⚡ ${p.lud16!}',
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: SonicMachineTheme.labelTech(
                                fontSize: 9.5,
                                color: SonicColors.foundation,
                              ),
                            ),
                          ],
                        ],
                      ),
                    ),
                  ],
                ),
              ),
              if (_loading) ...[
                const SizedBox(height: 12),
                const LinearProgressIndicator(
                  color: SonicColors.signalRed,
                  backgroundColor: SonicColors.surfacePlate,
                ),
              ],
              if (p?.about != null && p!.about!.trim().isNotEmpty) ...[
                const SizedBox(height: 12),
                SonicPlate(
                  backgroundColor: SonicColors.surfacePlate,
                  shadowOffset: Offset.zero,
                  padding: const EdgeInsets.all(12),
                  child: Text(
                    p.about!.trim(),
                    style: Theme.of(context).textTheme.bodyMedium,
                  ),
                ),
              ],
              const SizedBox(height: 12),
              SonicPlate(
                backgroundColor: SonicColors.surfacePlate,
                shadowOffset: Offset.zero,
                padding: const EdgeInsets.all(10),
                child: Row(
                  children: [
                    Expanded(
                      child: Text(
                        npub,
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                        style: SonicMachineTheme.labelTech(
                          fontSize: 9,
                          color: SonicColors.seamOutline,
                          letterSpacing: 0.4,
                        ),
                      ),
                    ),
                    const SizedBox(width: 8),
                    SonicPowerButton(
                      label: 'Copy',
                      icon: Icons.copy,
                      primary: false,
                      compact: true,
                      onPressed: () {
                        Clipboard.setData(ClipboardData(text: npub));
                        ScaffoldMessenger.of(context).showSnackBar(
                          const SnackBar(content: Text('Copied public key')),
                        );
                      },
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
