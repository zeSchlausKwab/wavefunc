import 'package:flutter/services.dart';
import 'package:material_ui/material_ui.dart';

import '../../../../data/services/secure_auth_storage.dart';
import '../../../core/theme/sonic_machine_theme.dart';
import '../../../core/widgets/sonic_plate.dart';
import '../../../core/widgets/station_thumbnail.dart';
import '../view_models/auth_view_model.dart';

/// Persistent Nostr Session Switcher & Account Manager sheet.
class AccountSessionSheet extends StatelessWidget {
  const AccountSessionSheet({
    super.key,
    required this.authViewModel,
    required this.onAddAccount,
    required this.onAccountChanged,
  });

  final AuthViewModel authViewModel;
  final VoidCallback onAddAccount;
  final VoidCallback onAccountChanged;

  @override
  Widget build(BuildContext context) {
    return ListenableBuilder(
      listenable: authViewModel,
      builder: (context, _) {
        final session = authViewModel.session;
        final saved = authViewModel.savedAccounts;

        return Container(
          decoration: const BoxDecoration(
            color: SonicColors.foundation,
            border: Border(top: BorderSide(color: SonicColors.ink, width: 3)),
          ),
          child: SafeArea(
            top: false,
            child: SingleChildScrollView(
              padding: const EdgeInsets.fromLTRB(20, 12, 20, 24),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                mainAxisSize: MainAxisSize.min,
                children: [
                  Center(
                    child: Container(
                      width: 44,
                      height: 4,
                      color: SonicColors.ink,
                    ),
                  ),
                  const SizedBox(height: 14),
                  Text(
                    'NOSTR_SESSION // ACCOUNT_VAULT',
                    style: SonicMachineTheme.labelTech(
                      fontSize: 10,
                      color: SonicColors.signalRed,
                      letterSpacing: 1.6,
                    ),
                  ),
                  const SizedBox(height: 10),
                  if (session != null) ...[
                    SonicPlate(
                      backgroundColor: SonicColors.ink,
                      shadowColor: SonicColors.voltageCyan,
                      padding: const EdgeInsets.all(12),
                      child: Row(
                        children: [
                          StationThumbnail(
                            url: session.profile?.picture,
                            size: 46,
                            highlight: true,
                          ),
                          const SizedBox(width: 12),
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(
                                  session.displayName,
                                  maxLines: 1,
                                  overflow: TextOverflow.ellipsis,
                                  style: Theme.of(context)
                                      .textTheme
                                      .titleMedium
                                      ?.copyWith(color: SonicColors.foundation),
                                ),
                                const SizedBox(height: 2),
                                GestureDetector(
                                  onTap: () {
                                    Clipboard.setData(
                                      ClipboardData(text: session.npub),
                                    );
                                    ScaffoldMessenger.of(context).showSnackBar(
                                      const SnackBar(
                                        content: Text('Copied npub'),
                                      ),
                                    );
                                  },
                                  child: Text(
                                    '${session.shortNpub} • COPY',
                                    style: SonicMachineTheme.labelTech(
                                      fontSize: 9.5,
                                      color: SonicColors.voltageCyan,
                                    ),
                                  ),
                                ),
                              ],
                            ),
                          ),
                          SonicTag(
                            label: session.signerBadge,
                            highlighted: true,
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(height: 12),
                    Row(
                      children: [
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                'NIP-38 BROADCAST STATUS',
                                style: SonicMachineTheme.labelTech(fontSize: 10),
                              ),
                              Text(
                                'Publish live playing track (kind 30315)',
                                style: Theme.of(context).textTheme.bodySmall,
                              ),
                            ],
                          ),
                        ),
                        Switch(
                          value: authViewModel.nip38Enabled,
                          activeThumbColor: SonicColors.ink,
                          activeTrackColor: SonicColors.voltageCyan,
                          onChanged: authViewModel.setNip38Enabled,
                        ),
                      ],
                    ),
                  ],

                  if (saved.isNotEmpty) ...[
                    const SizedBox(height: 12),
                    const SonicSectionHeader(title: 'SAVED_SESSIONS'),
                    const SizedBox(height: 8),
                    for (final acc in saved)
                      Padding(
                        padding: const EdgeInsets.only(bottom: 8),
                        child: _SavedAccountRow(
                          account: acc,
                          isActive: session?.pubkey == acc.pubkey,
                          isBusy: authViewModel.isBusy,
                          onSwitch: () async {
                            final ok =
                                await authViewModel.switchAccount(acc.pubkey);
                            if (ok) {
                              onAccountChanged();
                              if (context.mounted) Navigator.of(context).pop();
                            }
                          },
                          onRemove: () async {
                            await authViewModel.removeAccount(acc.pubkey);
                            onAccountChanged();
                          },
                        ),
                      ),
                  ],

                  const SizedBox(height: 12),
                  Wrap(
                    spacing: 10,
                    runSpacing: 8,
                    children: [
                      SonicPowerButton(
                        label: session == null
                            ? 'Connect Account'
                            : 'Add Account',
                        icon: Icons.person_add,
                        compact: true,
                        onPressed: () {
                          Navigator.of(context).pop();
                          onAddAccount();
                        },
                      ),
                      if (session != null)
                        SonicPowerButton(
                          label: 'Sign Out',
                          icon: Icons.logout,
                          primary: false,
                          compact: true,
                          onPressed: authViewModel.isBusy
                              ? null
                              : () async {
                                  await authViewModel.logout();
                                  onAccountChanged();
                                  if (context.mounted) {
                                    Navigator.of(context).pop();
                                  }
                                },
                        ),
                    ],
                  ),
                ],
              ),
            ),
          ),
        );
      },
    );
  }
}

class _SavedAccountRow extends StatelessWidget {
  const _SavedAccountRow({
    required this.account,
    required this.isActive,
    required this.isBusy,
    required this.onSwitch,
    required this.onRemove,
  });

  final StoredAuthCredentials account;
  final bool isActive;
  final bool isBusy;
  final VoidCallback onSwitch;
  final VoidCallback onRemove;

  @override
  Widget build(BuildContext context) {
    final modeLabel = switch (account.mode) {
      StoredAuthMode.amber => 'AMBER',
      StoredAuthMode.bunker => 'BUNKER',
      StoredAuthMode.localKey => 'NSEC',
    };
    final shortNpub = account.npub.length > 16
        ? '${account.npub.substring(0, 10)}...${account.npub.substring(account.npub.length - 6)}'
        : account.npub;

    return SonicPlate(
      backgroundColor: isActive ? SonicColors.foundation : SonicColors.surfacePlate,
      shadowColor: isActive ? SonicColors.voltageCyan : SonicColors.ink,
      shadowOffset: const Offset(2, 2),
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
      onTap: isActive || isBusy ? null : onSwitch,
      child: Row(
        children: [
          Container(
            width: 8,
            height: 8,
            color: isActive ? SonicColors.voltageCyan : SonicColors.seamOutline,
          ),
          const SizedBox(width: 8),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  account.label ?? shortNpub,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: Theme.of(context).textTheme.titleSmall,
                ),
                Text(
                  '$modeLabel • $shortNpub',
                  style: SonicMachineTheme.labelTech(
                    fontSize: 9,
                    color: SonicColors.seamOutline,
                  ),
                ),
              ],
            ),
          ),
          if (!isActive)
            SonicTag(label: 'SWITCH', onTap: isBusy ? null : onSwitch),
          IconButton(
            visualDensity: VisualDensity.compact,
            padding: EdgeInsets.zero,
            constraints: const BoxConstraints(minWidth: 28, minHeight: 28),
            tooltip: 'Forget saved session',
            onPressed: isBusy ? null : onRemove,
            icon: const Icon(Icons.close, size: 16),
          ),
        ],
      ),
    );
  }
}
