import 'package:flutter/services.dart';
import 'package:material_ui/material_ui.dart';

import '../../../../data/services/wavefunc_backend.dart';
import '../../../core/theme/sonic_machine_theme.dart';
import '../../../core/widgets/qr_scanner_sheet.dart';
import '../../../core/widgets/sonic_plate.dart';
import '../../../core/widgets/station_thumbnail.dart';
import '../../auth/view_models/auth_view_model.dart';
import '../../discover/view_models/discover_view_model.dart';
import '../../discover/views/publish_station_sheet.dart';
import '../../wallet/views/cashu_wallet_plate.dart';

class SettingsView extends StatefulWidget {
  const SettingsView({
    super.key,
    required this.discoverViewModel,
    required this.authViewModel,
    required this.onRequestLogin,
    this.onStartOnboarding,
  });

  final DiscoverViewModel discoverViewModel;
  final AuthViewModel authViewModel;
  final VoidCallback onRequestLogin;
  final VoidCallback? onStartOnboarding;

  @override
  State<SettingsView> createState() => _SettingsViewState();
}

class _SettingsViewState extends State<SettingsView> {
  late final TextEditingController _relayController;
  final TextEditingController _nwcController = TextEditingController();

  @override
  void initState() {
    super.initState();
    _relayController = TextEditingController(
      text: widget.discoverViewModel.currentRelayUrl,
    );
  }

  @override
  void dispose() {
    _relayController.dispose();
    _nwcController.dispose();
    super.dispose();
  }

  Future<void> _connectNwc() async {
    final uri = _nwcController.text.trim();
    if (uri.isEmpty) return;
    final ok = await widget.authViewModel.connectNwc(uri);
    if (!mounted) return;
    if (ok) {
      _nwcController.clear();
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('NWC Lightning wallet connected')),
      );
    } else {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            widget.authViewModel.errorMessage ?? 'Could not connect NWC wallet',
          ),
        ),
      );
    }
  }

  Future<void> _applyRelay(String url) async {
    _relayController.text = url;
    await widget.discoverViewModel.switchRelay(url);
    if (!mounted) return;
    final err = widget.discoverViewModel.errorMessage;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text(err ?? 'Connected to $url')),
    );
  }

  @override
  Widget build(BuildContext context) {
    return ListenableBuilder(
      listenable: Listenable.merge([
        widget.discoverViewModel,
        widget.authViewModel,
      ]),
      builder: (context, _) {
        final vm = widget.discoverViewModel;
        final auth = widget.authViewModel;
        final status = vm.relayStatus;
        final session = auth.session;

        return ListView(
          padding: const EdgeInsets.fromLTRB(16, 16, 16, 120),
          children: [
            Text(
              'SYSTEM_CONTROL',
              style: SonicMachineTheme.labelTech(
                fontSize: 10,
                color: SonicColors.signalRed,
                letterSpacing: 2.0,
              ),
            ),
            const SizedBox(height: 2),
            Text(
              'ACCOUNT & RELAY',
              style: Theme.of(context)
                  .textTheme
                  .displayMedium
                  ?.copyWith(fontSize: 28),
            ),
            const SizedBox(height: 18),

            // ── Nostr Identity Plate ──
            SonicPlate(
              backgroundColor: SonicColors.surfacePlate,
              shadowColor:
                  session != null ? SonicColors.voltageCyan : SonicColors.ink,
              padding: const EdgeInsets.all(14),
              child: session == null
                  ? Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          'NOSTR_IDENTITY // DISCONNECTED',
                          style: SonicMachineTheme.labelTech(
                            fontSize: 10,
                            color: SonicColors.signalRed,
                          ),
                        ),
                        const SizedBox(height: 6),
                        Text(
                          AuthViewModel.supportsAmberPlatform
                              ? 'Sign in with Amber (NIP-55), a NIP-46 QR / Bunker remote signer, or a local nsec to sync favorites, save tracks to your Crate, like/comment on stations, and post to #wavefunc.'
                              : 'Sign in with a NIP-46 QR remote signer, Bunker URI, or a local nsec to sync favorites, save tracks to your Crate, like/comment on stations, and post to #wavefunc.',
                          style: Theme.of(context).textTheme.bodySmall,
                        ),
                        const SizedBox(height: 12),
                        Wrap(
                          spacing: 8,
                          runSpacing: 8,
                          children: [
                            SonicPowerButton(
                              label: 'Connect Account',
                              icon: Icons.login,
                              onPressed: widget.onRequestLogin,
                            ),
                            if (widget.onStartOnboarding != null)
                              SonicPowerButton(
                                label: 'New to Nostr? Setup',
                                icon: Icons.auto_awesome,
                                primary: false,
                                onPressed: widget.onStartOnboarding,
                              ),
                          ],
                        ),
                      ],
                    )
                  : Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(
                          children: [
                            StationThumbnail(
                              url: session.profile?.picture,
                              size: 48,
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
                                    style:
                                        Theme.of(context).textTheme.titleMedium,
                                  ),
                                  const SizedBox(height: 2),
                                  GestureDetector(
                                    onTap: () {
                                      Clipboard.setData(
                                        ClipboardData(text: session.npub),
                                      );
                                      ScaffoldMessenger.of(context)
                                          .showSnackBar(
                                        const SnackBar(
                                          content: Text('Copied npub'),
                                        ),
                                      );
                                    },
                                    child: Text(
                                      session.shortNpub,
                                      style: SonicMachineTheme.labelTech(
                                        fontSize: 9.5,
                                        color: SonicColors.seamOutline,
                                      ),
                                    ),
                                  ),
                                ],
                              ),
                            ),
                            SonicTag(
                              label: session.signerBadge,
                              inverted: true,
                            ),
                          ],
                        ),
                        const SizedBox(height: 12),
                        Container(height: 2, color: SonicColors.seamOutline),
                        const SizedBox(height: 8),
                        Row(
                          children: [
                            Expanded(
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text(
                                    'NIP-38 LIVE LISTENING STATUS',
                                    style: SonicMachineTheme.labelTech(
                                      fontSize: 10,
                                    ),
                                  ),
                                  Text(
                                    'Broadcast now-playing track to Nostr (kind 30315)',
                                    style:
                                        Theme.of(context).textTheme.bodySmall,
                                  ),
                                ],
                              ),
                            ),
                            Switch(
                              value: auth.nip38Enabled,
                              activeThumbColor: SonicColors.ink,
                              activeTrackColor: SonicColors.voltageCyan,
                              onChanged: auth.setNip38Enabled,
                            ),
                          ],
                        ),
                        const SizedBox(height: 10),
                        SonicPowerButton(
                          label: 'Sign Out',
                          icon: Icons.logout,
                          primary: false,
                          compact: true,
                          onPressed: auth.isBusy ? null : auth.logout,
                        ),
                      ],
                    ),
            ),
            const SizedBox(height: 18),

            // ── Lightning Wallet (NIP-47 NWC) Plate ──
            SonicPlate(
              backgroundColor: SonicColors.surfacePlate,
              shadowColor: auth.isNwcConnected
                  ? SonicColors.voltageCyan
                  : SonicColors.ink,
              padding: const EdgeInsets.all(14),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      Text(
                        'LIGHTNING_WALLET // NIP-47 NWC',
                        style: SonicMachineTheme.labelTech(
                          fontSize: 10,
                          color: auth.isNwcConnected
                              ? SonicColors.ink
                              : SonicColors.signalRed,
                        ),
                      ),
                      SonicTag(
                        label: auth.isNwcConnected ? 'CONNECTED' : 'OFFLINE',
                        highlighted: auth.isNwcConnected,
                      ),
                    ],
                  ),
                  const SizedBox(height: 8),
                  if (auth.isNwcConnected) ...[
                    Row(
                      children: [
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                auth.nwcStatus.balanceSats != null
                                    ? '⚡ ${auth.nwcStatus.balanceSats} SATS'
                                    : '⚡ NWC READY',
                                style: Theme.of(context).textTheme.titleLarge,
                              ),
                              if (auth.nwcStatus.lud16 != null) ...[
                                const SizedBox(height: 2),
                                Text(
                                  auth.nwcStatus.lud16!,
                                  style: SonicMachineTheme.labelTech(
                                    fontSize: 9.5,
                                    color: SonicColors.seamOutline,
                                  ),
                                ),
                              ],
                              if (auth.nwcStatus.relay != null) ...[
                                const SizedBox(height: 2),
                                Text(
                                  auth.nwcStatus.relay!,
                                  maxLines: 1,
                                  overflow: TextOverflow.ellipsis,
                                  style: SonicMachineTheme.labelTech(
                                    fontSize: 9,
                                    color: SonicColors.seamOutline,
                                  ),
                                ),
                              ],
                            ],
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 10),
                    Wrap(
                      spacing: 8,
                      runSpacing: 8,
                      children: [
                        SonicPowerButton(
                          label: auth.isWalletBusy
                              ? 'Refreshing...'
                              : 'Refresh Balance',
                          icon: Icons.refresh,
                          primary: false,
                          compact: true,
                          onPressed: auth.isWalletBusy
                              ? null
                              : auth.refreshNwcBalance,
                        ),
                        SonicPowerButton(
                          label: 'Disconnect',
                          icon: Icons.link_off,
                          primary: false,
                          compact: true,
                          onPressed:
                              auth.isWalletBusy ? null : auth.disconnectNwc,
                        ),
                      ],
                    ),
                  ] else ...[
                    Text(
                      'Connect an NWC wallet (Alby Hub, Primal, Coinos, Zeus) for 1-tap Lightning zaps on every station card.',
                      style: Theme.of(context).textTheme.bodySmall,
                    ),
                    const SizedBox(height: 10),
                    TextField(
                      controller: _nwcController,
                      decoration: InputDecoration(
                        hintText: 'nostr+walletconnect://...',
                        prefixIcon:
                            const Icon(Icons.bolt, color: SonicColors.ink),
                        suffixIcon: QrScannerSheet.isSupported
                            ? IconButton(
                                tooltip: 'Scan NWC QR',
                                icon: const Icon(
                                  Icons.qr_code_scanner,
                                  color: SonicColors.ink,
                                ),
                                onPressed: () async {
                                  final scanned = await QrScannerSheet.scan(
                                    context,
                                    title: 'Scan NWC Wallet QR',
                                    hint:
                                        'POINT AT A NOSTR+WALLETCONNECT:// QR CODE',
                                  );
                                  if (scanned != null && mounted) {
                                    setState(() => _nwcController.text = scanned);
                                  }
                                },
                              )
                            : null,
                      ),
                    ),
                    const SizedBox(height: 10),
                    SonicPowerButton(
                      label: auth.isWalletBusy
                          ? 'Connecting...'
                          : 'Connect NWC Wallet',
                      icon: Icons.bolt,
                      compact: true,
                      onPressed: auth.isWalletBusy ? null : _connectNwc,
                    ),
                  ],
                ],
              ),
            ),
            const SizedBox(height: 18),

            // ── Embedded Cashu ecash wallet ──
            if (auth.supportsSigning) ...[
              CashuWalletPlate(authViewModel: auth),
              const SizedBox(height: 18),
            ],

            // ── Publish Radio Station Plate ──
            if (auth.supportsSigning) ...[
              SonicPlate(
                backgroundColor: SonicColors.surfacePlate,
                shadowOffset: const Offset(4, 4),
                padding: const EdgeInsets.all(14),
                child: Row(
                  children: [
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            'BROADCAST_DIRECTORY // KIND 31237',
                            style: SonicMachineTheme.labelTech(
                              fontSize: 10,
                              color: SonicColors.signalRed,
                            ),
                          ),
                          const SizedBox(height: 2),
                          Text(
                            'Publish a new internet radio station directly to the Nostr relay.',
                            style: Theme.of(context).textTheme.bodySmall,
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(width: 10),
                    SonicPowerButton(
                      label: 'Submit Station',
                      icon: Icons.cell_tower,
                      compact: true,
                      onPressed: () async {
                        if (!auth.isLoggedIn) {
                          widget.onRequestLogin();
                          return;
                        }
                        final published = await PublishStationSheet.open(
                          context,
                          authViewModel: auth,
                          discoverViewModel: vm,
                        );
                        if (published == true && context.mounted) {
                          ScaffoldMessenger.of(context).showSnackBar(
                            const SnackBar(
                              content: Text('Station published to Nostr!'),
                            ),
                          );
                        }
                      },
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 18),
            ],

            // ── Status telemetry plate ──
            SonicPlate(
              backgroundColor: SonicColors.ink,
              shadowColor: SonicColors.voltageCyan,
              padding: const EdgeInsets.all(14),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      Text(
                        'CONNECTION_TELEMETRY',
                        style: SonicMachineTheme.labelTech(
                          fontSize: 10,
                          color: SonicColors.voltageCyan,
                        ),
                      ),
                      SonicTag(
                        label: status?.connected == true ? 'ONLINE' : 'OFFLINE',
                        highlighted: status?.connected == true,
                      ),
                    ],
                  ),
                  const SizedBox(height: 10),
                  _TelemetryRow(
                    label: 'ACTIVE RELAY',
                    value: status?.relayUrl ?? vm.currentRelayUrl,
                  ),
                  const SizedBox(height: 6),
                  _TelemetryRow(
                    label: 'PROTOCOL ENGINE',
                    value: status?.engineLabel ?? 'INITIALIZING',
                  ),
                  const SizedBox(height: 6),
                  _TelemetryRow(
                    label: 'CATALOG COUNT',
                    value: status?.totalStationCount != null
                        ? '${status!.totalStationCount} STATIONS (NIP-45)'
                        : '${vm.allStations.length} LOADED',
                  ),
                  const SizedBox(height: 6),
                  _TelemetryRow(
                    label: 'FAVORITES',
                    value:
                        '${vm.bookmarkedAddresses.length} ${auth.isLoggedIn ? 'SYNCED' : 'LOCAL'}',
                  ),
                ],
              ),
            ),
            const SizedBox(height: 20),

            // ── Relay switcher ──
            const SonicSectionHeader(title: 'NOSTR_RELAY_ENDPOINT'),
            const SizedBox(height: 12),
            TextField(
              controller: _relayController,
              decoration: const InputDecoration(
                hintText: 'wss://relay.wavefunc.live',
                prefixIcon: Icon(Icons.hub, color: SonicColors.ink),
              ),
            ),
            const SizedBox(height: 12),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: [
                SonicPowerButton(
                  label: 'Connect',
                  icon: Icons.bolt,
                  onPressed: vm.isLoading
                      ? null
                      : () => _applyRelay(_relayController.text.trim()),
                ),
                SonicPowerButton(
                  label: 'Production',
                  primary: false,
                  onPressed: vm.isLoading
                      ? null
                      : () => _applyRelay(
                            WavefuncBackend.defaultProductionRelay,
                          ),
                ),
                SonicPowerButton(
                  label: 'Emulator :3334',
                  primary: false,
                  onPressed: vm.isLoading
                      ? null
                      : () => _applyRelay(
                            WavefuncBackend.defaultAndroidEmulatorRelay,
                          ),
                ),
                SonicPowerButton(
                  label: 'Localhost :3334',
                  primary: false,
                  onPressed: vm.isLoading
                      ? null
                      : () => _applyRelay(WavefuncBackend.defaultLocalRelay),
                ),
              ],
            ),
          ],
        );
      },
    );
  }
}

class _TelemetryRow extends StatelessWidget {
  const _TelemetryRow({required this.label, required this.value});

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        SizedBox(
          width: 128,
          child: Text(
            label,
            style: SonicMachineTheme.labelTech(
              fontSize: 9.5,
              color: SonicColors.seamMuted,
            ),
          ),
        ),
        Expanded(
          child: Text(
            value,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: SonicMachineTheme.labelTech(
              fontSize: 10.5,
              color: SonicColors.foundation,
              letterSpacing: 0.5,
            ),
          ),
        ),
      ],
    );
  }
}
