import 'dart:async';

import 'package:flutter/services.dart';
import 'package:material_ui/material_ui.dart';
import 'package:qr_flutter/qr_flutter.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../../../domain/models/social.dart';
import '../../../core/theme/sonic_machine_theme.dart';
import '../../../core/widgets/sonic_plate.dart';
import '../view_models/auth_view_model.dart';

enum _LoginTab { amber, qr, bunker, nsec }

class _Nip46RelayOption {
  const _Nip46RelayOption(this.url, this.label);
  final String url;
  final String label;
}

const List<_Nip46RelayOption> _kNip46Relays = [
  _Nip46RelayOption('wss://relay.primal.net', 'relay.primal.net (recommended)'),
  _Nip46RelayOption('wss://nos.lol', 'nos.lol'),
  _Nip46RelayOption('wss://relay.damus.io', 'relay.damus.io'),
  _Nip46RelayOption('wss://relay.nsec.app', 'relay.nsec.app'),
];

/// Platform-aware Constructivist Nostr Sign-In modal supporting:
/// - NIP-55 Amber (Android ONLY — hidden on macOS/Linux/Windows/iOS)
/// - NIP-46 `nostrconnect://` QR Code pairing with relay selector & platform client name
/// - NIP-46 `bunker://...` URI paste
/// - Local `nsec` import or fresh keypair generation (OS Keychain / Keystore)
class LoginSheet extends StatefulWidget {
  const LoginSheet({
    super.key,
    required this.authViewModel,
    required this.onSignedIn,
    this.onStartOnboarding,
    this.isDialog = false,
  });

  final AuthViewModel authViewModel;
  final VoidCallback onSignedIn;
  final VoidCallback? onStartOnboarding;
  final bool isDialog;

  @override
  State<LoginSheet> createState() => _LoginSheetState();
}

class _LoginSheetState extends State<LoginSheet> {
  late _LoginTab _tab;
  final _bunkerController = TextEditingController();
  final _nsecController = TextEditingController();
  bool _obscureNsec = true;
  GeneratedAccount? _generated;
  NostrConnectChallenge? _qrChallenge;
  bool _awaitingQr = false;
  int _qrSessionNonce = 0;
  String _selectedNip46Relay = _kNip46Relays.first.url;

  bool get _showAmberTab => AuthViewModel.supportsAmberPlatform;

  @override
  void initState() {
    super.initState();
    _tab = (_showAmberTab && widget.authViewModel.isAmberAvailable)
        ? _LoginTab.amber
        : _LoginTab.qr;
    widget.authViewModel.clearError();
    if (_tab == _LoginTab.qr) {
      unawaited(_startQrPairing());
    }
  }

  @override
  void dispose() {
    _cancelActiveQr();
    _bunkerController.dispose();
    _nsecController.dispose();
    super.dispose();
  }

  void _cancelActiveQr() {
    _qrSessionNonce++;
    final activeQr = _qrChallenge;
    if (activeQr != null) {
      _qrChallenge = null;
      _awaitingQr = false;
      unawaited(widget.authViewModel.cancelNostrConnect(activeQr.sessionId));
    }
  }

  Future<void> _selectTab(_LoginTab next) async {
    if (_tab == next) return;
    widget.authViewModel.clearError();
    if (next != _LoginTab.qr) {
      _cancelActiveQr();
    }
    setState(() => _tab = next);
    if (next == _LoginTab.qr) {
      await _startQrPairing();
    }
  }

  Future<void> _selectRelay(String relayUrl) async {
    if (_selectedNip46Relay == relayUrl) return;
    _cancelActiveQr();
    widget.authViewModel.clearError();
    setState(() => _selectedNip46Relay = relayUrl);
    await _startQrPairing();
  }

  Future<void> _startQrPairing() async {
    _cancelActiveQr();
    final nonce = ++_qrSessionNonce;
    widget.authViewModel.clearError();
    setState(() {
      _qrChallenge = null;
      _awaitingQr = true;
    });

    final challenge = await widget.authViewModel.startNostrConnect(
      relayUrl: _selectedNip46Relay,
      clientName: AuthViewModel.nip46ClientName,
    );
    if (!mounted || nonce != _qrSessionNonce || challenge == null) return;
    setState(() {
      _qrChallenge = challenge;
      _awaitingQr = true;
    });

    final ok = await widget.authViewModel.awaitNostrConnect(challenge.sessionId);
    if (!mounted || nonce != _qrSessionNonce) return;
    setState(() => _awaitingQr = false);
    if (ok) {
      _qrChallenge = null;
      widget.onSignedIn();
      Navigator.of(context).pop();
    }
  }

  Future<void> _handleAmberLogin() async {
    final ok = await widget.authViewModel.loginWithAmber();
    if (ok && mounted) {
      widget.onSignedIn();
      Navigator.of(context).pop();
    }
  }

  Future<void> _handleBunkerLogin() async {
    final uri = _bunkerController.text.trim();
    if (uri.isEmpty) return;
    final ok = await widget.authViewModel.loginWithBunker(uri);
    if (ok && mounted) {
      widget.onSignedIn();
      Navigator.of(context).pop();
    }
  }

  Future<void> _handleNsecLogin() async {
    final secret = _nsecController.text.trim();
    if (secret.isEmpty) return;
    final ok = await widget.authViewModel.loginWithNsec(secret);
    if (ok && mounted) {
      widget.onSignedIn();
      Navigator.of(context).pop();
    }
  }

  Future<void> _handleGenerate() async {
    final gen = await widget.authViewModel.generateAndLogin();
    if (gen != null && mounted) {
      setState(() => _generated = gen);
      widget.onSignedIn();
    }
  }

  @override
  Widget build(BuildContext context) {
    final bottomInset =
        widget.isDialog ? 0.0 : MediaQuery.of(context).viewInsets.bottom;

    return ListenableBuilder(
      listenable: widget.authViewModel,
      builder: (context, _) {
        final vm = widget.authViewModel;

        return Container(
          decoration: BoxDecoration(
            color: SonicColors.foundation,
            border: widget.isDialog
                ? Border.all(color: SonicColors.ink, width: 3)
                : const Border(
                    top: BorderSide(color: SonicColors.ink, width: 3),
                  ),
            boxShadow: widget.isDialog
                ? const [
                    BoxShadow(
                      color: SonicColors.ink,
                      offset: Offset(8, 8),
                      blurRadius: 0,
                    ),
                  ]
                : null,
          ),
          padding: EdgeInsets.only(bottom: bottomInset),
          child: SafeArea(
            top: false,
            bottom: !widget.isDialog,
            child: SingleChildScrollView(
              padding: const EdgeInsets.fromLTRB(18, 12, 18, 22),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                mainAxisSize: MainAxisSize.min,
                children: [
                  if (!widget.isDialog) ...[
                    Center(
                      child: Container(
                        width: 44,
                        height: 4,
                        color: SonicColors.ink,
                      ),
                    ),
                    const SizedBox(height: 12),
                  ],
                  Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              'NOSTR_IDENTITY // SIGNER',
                              style: SonicMachineTheme.labelTech(
                                fontSize: 10,
                                color: SonicColors.signalRed,
                                letterSpacing: 1.8,
                              ),
                            ),
                            const SizedBox(height: 2),
                            Text(
                              'CONNECT ACCOUNT',
                              style: Theme.of(context).textTheme.headlineSmall,
                            ),
                          ],
                        ),
                      ),
                      if (widget.isDialog)
                        InkWell(
                          onTap: () => Navigator.of(context).pop(),
                          child: Container(
                            width: 28,
                            height: 28,
                            decoration: BoxDecoration(
                              color: SonicColors.surfacePlate,
                              border:
                                  Border.all(color: SonicColors.ink, width: 2),
                            ),
                            alignment: Alignment.center,
                            child: const Icon(Icons.close, size: 16),
                          ),
                        ),
                    ],
                  ),
                  const SizedBox(height: 12),

                  if (_generated != null) ...[
                    _GeneratedKeyBackupPanel(
                      account: _generated!,
                      onDone: () => Navigator.of(context).pop(),
                    ),
                  ] else ...[
                    Row(
                      children: [
                        if (_showAmberTab) ...[
                          _ModeTab(
                            label: 'AMBER',
                            selected: _tab == _LoginTab.amber,
                            onTap: () => _selectTab(_LoginTab.amber),
                          ),
                          const SizedBox(width: 6),
                        ],
                        _ModeTab(
                          label: 'QR (NIP-46)',
                          selected: _tab == _LoginTab.qr,
                          onTap: () => _selectTab(_LoginTab.qr),
                        ),
                        const SizedBox(width: 6),
                        _ModeTab(
                          label: 'BUNKER',
                          selected: _tab == _LoginTab.bunker,
                          onTap: () => _selectTab(_LoginTab.bunker),
                        ),
                        const SizedBox(width: 6),
                        _ModeTab(
                          label: 'NSEC',
                          selected: _tab == _LoginTab.nsec,
                          onTap: () => _selectTab(_LoginTab.nsec),
                        ),
                      ],
                    ),
                    const SizedBox(height: 14),

                    if (vm.errorMessage != null) ...[
                      SonicPlate(
                        backgroundColor: SonicColors.signalRed,
                        shadowOffset: const Offset(3, 3),
                        padding: const EdgeInsets.all(10),
                        child: Text(
                          vm.errorMessage!,
                          style: SonicMachineTheme.labelTech(
                            fontSize: 10.5,
                            color: SonicColors.onSignal,
                            letterSpacing: 0.4,
                          ),
                        ),
                      ),
                      const SizedBox(height: 12),
                    ],

                    if (_tab == _LoginTab.amber && _showAmberTab) ...[
                      SonicPlate(
                        padding: const EdgeInsets.all(14),
                        shadowOffset: const Offset(3, 3),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              'NIP-55 ANDROID SIGNER',
                              style: SonicMachineTheme.labelTech(fontSize: 11),
                            ),
                            const SizedBox(height: 6),
                            Text(
                              vm.isAmberAvailable
                                  ? 'Amber (or a compatible NIP-55 signer) is installed. Your keys never leave your signer app.'
                                  : 'No NIP-55 signer detected on this device. Install Amber on Android, or use QR / BUNKER / NSEC.',
                              style: Theme.of(context).textTheme.bodySmall,
                            ),
                            const SizedBox(height: 14),
                            SonicPowerButton(
                              label: vm.isBusy
                                  ? 'Authorizing...'
                                  : 'Connect with Amber',
                              icon: Icons.verified_user,
                              onPressed: vm.isBusy || !vm.isAmberAvailable
                                  ? null
                                  : _handleAmberLogin,
                            ),
                          ],
                        ),
                      ),
                    ] else if (_tab == _LoginTab.qr) ...[
                      SonicPlate(
                        padding: const EdgeInsets.all(14),
                        shadowOffset: const Offset(3, 3),
                        child: Column(
                          children: [
                            // Platform device identifier shown in Amber's connected apps list
                            Container(
                              width: double.infinity,
                              padding: const EdgeInsets.symmetric(
                                horizontal: 10,
                                vertical: 6,
                              ),
                              color: SonicColors.ink,
                              child: Row(
                                children: [
                                  const Icon(
                                    Icons.devices,
                                    size: 14,
                                    color: SonicColors.voltageCyan,
                                  ),
                                  const SizedBox(width: 6),
                                  Expanded(
                                    child: Text(
                                      'CLIENT: ${AuthViewModel.nip46ClientName.toUpperCase()}',
                                      maxLines: 1,
                                      overflow: TextOverflow.ellipsis,
                                      style: SonicMachineTheme.labelTech(
                                        fontSize: 9,
                                        color: SonicColors.foundation,
                                        letterSpacing: 0.7,
                                      ),
                                    ),
                                  ),
                                ],
                              ),
                            ),
                            const SizedBox(height: 10),
                            // NIP-46 Relay Selector
                            Container(
                              padding: const EdgeInsets.symmetric(
                                horizontal: 10,
                                vertical: 2,
                              ),
                              decoration: BoxDecoration(
                                color: SonicColors.foundation,
                                border: Border.all(
                                  color: SonicColors.ink,
                                  width: 1.5,
                                ),
                              ),
                              child: DropdownButtonHideUnderline(
                                child: DropdownButton<String>(
                                  value: _selectedNip46Relay,
                                  isExpanded: true,
                                  isDense: true,
                                  dropdownColor: SonicColors.foundation,
                                  style: SonicMachineTheme.labelTech(
                                    fontSize: 10,
                                    color: SonicColors.ink,
                                    letterSpacing: 0.4,
                                  ),
                                  items: _kNip46Relays
                                      .map(
                                        (r) => DropdownMenuItem<String>(
                                          value: r.url,
                                          child: Text(r.label.toUpperCase()),
                                        ),
                                      )
                                      .toList(),
                                  onChanged: (next) {
                                    if (next != null) _selectRelay(next);
                                  },
                                ),
                              ),
                            ),
                            const SizedBox(height: 12),
                            Text(
                              'SCAN WITH AMBER / NSEC.APP ON YOUR PHONE',
                              textAlign: TextAlign.center,
                              style: SonicMachineTheme.labelTech(
                                fontSize: 9.5,
                                color: SonicColors.seamOutline,
                              ),
                            ),
                            const SizedBox(height: 10),
                            if (_qrChallenge == null)
                              const Padding(
                                padding: EdgeInsets.all(24),
                                child: CircularProgressIndicator(
                                  color: SonicColors.signalRed,
                                ),
                              )
                            else ...[
                              Container(
                                padding: const EdgeInsets.all(10),
                                decoration: BoxDecoration(
                                  color: Colors.white,
                                  border: Border.all(
                                    color: SonicColors.ink,
                                    width: 2.5,
                                  ),
                                ),
                                child: QrImageView(
                                  data: _qrChallenge!.connectUri,
                                  size: 196,
                                  backgroundColor: Colors.white,
                                  eyeStyle: const QrEyeStyle(
                                    eyeShape: QrEyeShape.square,
                                    color: SonicColors.ink,
                                  ),
                                  dataModuleStyle: const QrDataModuleStyle(
                                    dataModuleShape: QrDataModuleShape.square,
                                    color: SonicColors.ink,
                                  ),
                                ),
                              ),
                              const SizedBox(height: 10),
                              Text(
                                _awaitingQr
                                    ? 'WAITING FOR SIGNER APPROVAL...'
                                    : 'EXPIRED — TAP REFRESH',
                                style: SonicMachineTheme.labelTech(
                                  fontSize: 9.5,
                                  color: _awaitingQr
                                      ? SonicColors.signalRed
                                      : SonicColors.seamOutline,
                                ),
                              ),
                              const SizedBox(height: 12),
                              Wrap(
                                spacing: 8,
                                runSpacing: 8,
                                alignment: WrapAlignment.center,
                                children: [
                                  if (AuthViewModel
                                      .supportsMobileSignerDeepLink)
                                    SonicPowerButton(
                                      label: 'Open Signer',
                                      icon: Icons.open_in_new,
                                      compact: true,
                                      onPressed: () async {
                                        final uri = Uri.tryParse(
                                          _qrChallenge!.connectUri,
                                        );
                                        if (uri != null) {
                                          await launchUrl(
                                            uri,
                                            mode:
                                                LaunchMode.externalApplication,
                                          );
                                        }
                                      },
                                    ),
                                  SonicPowerButton(
                                    label: 'Copy URI',
                                    icon: Icons.copy,
                                    primary: !AuthViewModel
                                        .supportsMobileSignerDeepLink,
                                    compact: true,
                                    onPressed: () {
                                      Clipboard.setData(
                                        ClipboardData(
                                          text: _qrChallenge!.connectUri,
                                        ),
                                      );
                                      ScaffoldMessenger.of(context)
                                          .showSnackBar(
                                        const SnackBar(
                                          content: Text(
                                            'Copied nostrconnect:// URI',
                                          ),
                                        ),
                                      );
                                    },
                                  ),
                                  SonicPowerButton(
                                    label: 'Refresh QR',
                                    icon: Icons.refresh,
                                    primary: false,
                                    compact: true,
                                    onPressed: _startQrPairing,
                                  ),
                                ],
                              ),
                            ],
                          ],
                        ),
                      ),
                    ] else if (_tab == _LoginTab.bunker) ...[
                      Text(
                        'Paste a NIP-46 bunker:// URI from nsec.app, Amber Bunker, or your remote signer.',
                        style: Theme.of(context).textTheme.bodySmall,
                      ),
                      const SizedBox(height: 10),
                      TextField(
                        controller: _bunkerController,
                        decoration: const InputDecoration(
                          hintText: 'bunker://<pubkey>?relay=wss://...',
                          prefixIcon: Icon(Icons.link, color: SonicColors.ink),
                        ),
                      ),
                      const SizedBox(height: 14),
                      SonicPowerButton(
                        label: vm.isBusy
                            ? 'Connecting Bunker...'
                            : 'Connect Bunker',
                        icon: Icons.vpn_key,
                        onPressed: vm.isBusy ? null : _handleBunkerLogin,
                      ),
                    ] else ...[
                      Text(
                        'Stored encrypted in ${AuthViewModel.platformKeystoreLabel}.',
                        style: Theme.of(context).textTheme.bodySmall,
                      ),
                      const SizedBox(height: 10),
                      TextField(
                        controller: _nsecController,
                        obscureText: _obscureNsec,
                        decoration: InputDecoration(
                          hintText: 'nsec1... or 64-char hex',
                          prefixIcon:
                              const Icon(Icons.key, color: SonicColors.ink),
                          suffixIcon: IconButton(
                            onPressed: () =>
                                setState(() => _obscureNsec = !_obscureNsec),
                            icon: Icon(
                              _obscureNsec
                                  ? Icons.visibility
                                  : Icons.visibility_off,
                            ),
                          ),
                        ),
                      ),
                      const SizedBox(height: 14),
                      Wrap(
                        spacing: 10,
                        runSpacing: 10,
                        children: [
                          SonicPowerButton(
                            label: vm.isBusy ? 'Signing In...' : 'Sign In',
                            icon: Icons.login,
                            onPressed: vm.isBusy ? null : _handleNsecLogin,
                          ),
                          SonicPowerButton(
                            label: 'Generate New Key',
                            icon: Icons.auto_awesome,
                            primary: false,
                            onPressed: vm.isBusy ? null : _handleGenerate,
                          ),
                        ],
                      ),
                    ],
                    if (widget.onStartOnboarding != null) ...[
                      const SizedBox(height: 14),
                      Container(
                        height: 1.5,
                        color: SonicColors.seamOutline.withValues(alpha: 0.5),
                      ),
                      const SizedBox(height: 10),
                      Row(
                        children: [
                          Expanded(
                            child: Text(
                              'NEW TO NOSTR?',
                              style: SonicMachineTheme.labelTech(
                                fontSize: 9.5,
                                color: SonicColors.seamOutline,
                              ),
                            ),
                          ),
                          SonicPowerButton(
                            label: 'Guided Setup',
                            icon: Icons.auto_awesome,
                            primary: false,
                            compact: true,
                            onPressed: () {
                              Navigator.of(context).pop();
                              widget.onStartOnboarding!();
                            },
                          ),
                        ],
                      ),
                    ],
                  ],
                ],
              ),
            ),
          ),
        );
      },
    );
  }
}

class _ModeTab extends StatelessWidget {
  const _ModeTab({
    required this.label,
    required this.selected,
    required this.onTap,
  });

  final String label;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Expanded(
      child: SonicPlate(
        backgroundColor:
            selected ? SonicColors.ink : SonicColors.surfacePlate,
        shadowColor: selected ? SonicColors.voltageCyan : SonicColors.ink,
        shadowOffset: const Offset(2, 2),
        padding: const EdgeInsets.symmetric(vertical: 9),
        onTap: onTap,
        child: Center(
          child: Text(
            label,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: SonicMachineTheme.labelTech(
              fontSize: 9.5,
              color: selected ? SonicColors.foundation : SonicColors.ink,
            ),
          ),
        ),
      ),
    );
  }
}

class _GeneratedKeyBackupPanel extends StatelessWidget {
  const _GeneratedKeyBackupPanel({
    required this.account,
    required this.onDone,
  });

  final GeneratedAccount account;
  final VoidCallback onDone;

  @override
  Widget build(BuildContext context) {
    return SonicPlate(
      backgroundColor: SonicColors.ink,
      shadowColor: SonicColors.voltageCyan,
      padding: const EdgeInsets.all(14),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'NEW IDENTITY CREATED — BACK UP YOUR NSEC',
            style: SonicMachineTheme.labelTech(
              fontSize: 10.5,
              color: SonicColors.voltageCyan,
            ),
          ),
          const SizedBox(height: 8),
          Text(
            'Save this secret key in a password manager. It has been stored securely in ${AuthViewModel.platformKeystoreLabel}.',
            style: Theme.of(context)
                .textTheme
                .bodySmall
                ?.copyWith(color: SonicColors.foundation),
          ),
          const SizedBox(height: 10),
          Container(
            width: double.infinity,
            padding: const EdgeInsets.all(10),
            color: SonicColors.thumbnailDark,
            child: SelectableText(
              account.nsec,
              style: SonicMachineTheme.labelTech(
                fontSize: 10,
                color: SonicColors.foundation,
                letterSpacing: 0.3,
              ),
            ),
          ),
          const SizedBox(height: 12),
          Wrap(
            spacing: 10,
            runSpacing: 8,
            children: [
              SonicPowerButton(
                label: 'Copy nsec',
                icon: Icons.copy,
                active: true,
                compact: true,
                onPressed: () {
                  Clipboard.setData(ClipboardData(text: account.nsec));
                  ScaffoldMessenger.of(context).showSnackBar(
                    const SnackBar(content: Text('Copied nsec to clipboard')),
                  );
                },
              ),
              SonicPowerButton(
                label: 'Done',
                compact: true,
                onPressed: onDone,
              ),
            ],
          ),
        ],
      ),
    );
  }
}
