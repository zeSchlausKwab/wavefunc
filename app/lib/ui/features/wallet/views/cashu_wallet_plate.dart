import 'dart:async';

import 'package:flutter/services.dart';
import 'package:material_ui/material_ui.dart';
import 'package:qr_flutter/qr_flutter.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../../../domain/models/social.dart';
import '../../../core/theme/sonic_machine_theme.dart';
import '../../../core/widgets/qr_scanner_sheet.dart';
import '../../../core/widgets/sonic_plate.dart';
import '../../auth/view_models/auth_view_model.dart';

/// Settings plate for the per-account NIP-60 Cashu ecash wallet (CDK + redb + Nostr relay sync).
class CashuWalletPlate extends StatelessWidget {
  const CashuWalletPlate({super.key, required this.authViewModel});

  final AuthViewModel authViewModel;

  @override
  Widget build(BuildContext context) {
    return ListenableBuilder(
      listenable: authViewModel,
      builder: (context, _) {
        final loggedIn = authViewModel.isLoggedIn;
        final enabled = authViewModel.isNip60Enabled;
        final syncing = authViewModel.isNip60Syncing;
        final syncError = authViewModel.nip60SyncError;
        final cashu = authViewModel.cashuStatus;
        final ready = enabled && cashu.initialized;
        final busy = authViewModel.isWalletBusy || syncing;

        return SonicPlate(
          backgroundColor: SonicColors.surfacePlate,
          shadowColor: enabled && cashu.totalBalanceSats > 0
              ? SonicColors.voltageCyan
              : SonicColors.ink,
          padding: const EdgeInsets.all(14),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          'NIP-60 WALLET // CASHU ECASH',
                          style: SonicMachineTheme.labelTech(
                            fontSize: 10,
                            color: enabled ? SonicColors.ink : SonicColors.signalRed,
                          ),
                        ),
                        const SizedBox(height: 2),
                        Text(
                          !loggedIn
                              ? 'Sign in to enable your NIP-60 wallet.'
                              : enabled
                                  ? 'Enabled for this account on this device. Switch off to stop wallet loading and sync.'
                                  : 'Switched off by default. Enable to load and sync your NIP-60 balance from Nostr relays.',
                          style: Theme.of(context).textTheme.bodySmall,
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(width: 8),
                  Switch(
                    value: enabled,
                    activeThumbColor: SonicColors.ink,
                    activeTrackColor: SonicColors.voltageCyan,
                    onChanged: loggedIn
                        ? (v) => authViewModel.setNip60Enabled(v)
                        : null,
                  ),
                ],
              ),
              if (enabled) ...[
                const SizedBox(height: 12),
                Row(
                  crossAxisAlignment: CrossAxisAlignment.baseline,
                  textBaseline: TextBaseline.alphabetic,
                  children: [
                    Text(
                      ready ? '⚡ ${cashu.totalBalanceSats} SATS' : '⚡ — SATS',
                      style: Theme.of(context).textTheme.titleLarge,
                    ),
                    const Spacer(),
                    SonicTag(
                      label: syncing
                          ? 'SYNCING'
                          : (cashu.nip60Synced ? 'NIP-60 SYNCED' : 'LOCAL'),
                      highlighted: cashu.nip60Synced || syncing,
                    ),
                  ],
                ),
                if (syncing) ...[
                  const SizedBox(height: 8),
                  Row(
                    children: [
                      const SizedBox(
                        width: 12,
                        height: 12,
                        child: CircularProgressIndicator(
                          strokeWidth: 2,
                          color: SonicColors.ink,
                        ),
                      ),
                      const SizedBox(width: 8),
                      Expanded(
                        child: Text(
                          'SYNCING AND UNLOCKING YOUR NIP-60 WALLET...',
                          style: SonicMachineTheme.labelTech(
                            fontSize: 9,
                            color: SonicColors.seamOutline,
                          ),
                        ),
                      ),
                    ],
                  ),
                ],
                if (syncError != null) ...[
                  const SizedBox(height: 8),
                  SonicPlate(
                    backgroundColor: SonicColors.signalRed,
                    shadowOffset: Offset.zero,
                    padding: const EdgeInsets.all(10),
                    child: Text(
                      syncError,
                      style: SonicMachineTheme.labelTech(
                        fontSize: 9.5,
                        color: SonicColors.onSignal,
                        letterSpacing: 0.4,
                      ),
                    ),
                  ),
                ],
                if (ready && cashu.mints.isNotEmpty) ...[
                  const SizedBox(height: 10),
                  for (final m in cashu.mints)
                    Container(
                      margin: const EdgeInsets.only(bottom: 4),
                      padding: const EdgeInsets.symmetric(
                        horizontal: 10,
                        vertical: 6,
                      ),
                      decoration: BoxDecoration(
                        color: SonicColors.foundation,
                        border: Border.all(
                          color: SonicColors.seamOutline,
                          width: 1,
                        ),
                      ),
                      child: Row(
                        children: [
                          const Icon(
                            Icons.account_balance_outlined,
                            size: 14,
                            color: SonicColors.ink,
                          ),
                          const SizedBox(width: 8),
                          Expanded(
                            child: Text(
                              m.displayHost.toUpperCase(),
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: SonicMachineTheme.labelTech(
                                fontSize: 9.5,
                                color: SonicColors.ink,
                                letterSpacing: 0.6,
                              ),
                            ),
                          ),
                          Text(
                            '${m.balanceSats} SATS',
                            style: SonicMachineTheme.labelTech(
                              fontSize: 9.5,
                              color: m.balanceSats > 0
                                  ? SonicColors.signalRed
                                  : SonicColors.seamOutline,
                            ),
                          ),
                        ],
                      ),
                    ),
                ],
                const SizedBox(height: 10),
                Wrap(
                  spacing: 8,
                  runSpacing: 8,
                  children: [
                    SonicPowerButton(
                      label: 'Deposit',
                      icon: Icons.south_west,
                      compact: true,
                      onPressed: !ready || busy
                          ? null
                          : () => showCashuDialog(
                                context,
                                CashuDepositPanel(authViewModel: authViewModel),
                              ),
                    ),
                    SonicPowerButton(
                      label: 'Receive Token',
                      icon: Icons.download,
                      primary: false,
                      compact: true,
                      onPressed: !ready || busy
                          ? null
                          : () => showCashuDialog(
                                context,
                                CashuReceivePanel(authViewModel: authViewModel),
                              ),
                    ),
                    SonicPowerButton(
                      label: 'Send Token',
                      icon: Icons.upload,
                      primary: false,
                      compact: true,
                      onPressed: !ready || busy || cashu.totalBalanceSats <= 0
                          ? null
                          : () => showCashuDialog(
                                context,
                                CashuSendPanel(authViewModel: authViewModel),
                              ),
                    ),
                    SonicPowerButton(
                      label: 'Add Mint',
                      icon: Icons.add,
                      primary: false,
                      compact: true,
                      onPressed: !ready || busy
                          ? null
                          : () => showCashuDialog(
                                context,
                                CashuAddMintPanel(authViewModel: authViewModel),
                              ),
                    ),
                    SonicPowerButton(
                      label: syncing ? 'Syncing...' : 'Sync Relays',
                      icon: Icons.sync,
                      primary: false,
                      compact: true,
                      onPressed: busy ? null : authViewModel.syncNip60Wallet,
                    ),
                  ],
                ),
              ],
            ],
          ),
        );
      },
    );
  }
}

/// Shows a Cashu panel as a centered dialog on wide screens and a bottom sheet on phones.
Future<void> showCashuDialog(BuildContext context, Widget panel) {
  final wide = MediaQuery.of(context).size.width >= 720;
  if (wide) {
    return showDialog<void>(
      context: context,
      builder: (ctx) => Dialog(
        backgroundColor: SonicColors.foundation,
        shape: const RoundedRectangleBorder(
          side: BorderSide(color: SonicColors.ink, width: 3),
        ),
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 440),
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(20),
            child: panel,
          ),
        ),
      ),
    );
  }
  return showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    backgroundColor: SonicColors.foundation,
    shape: const RoundedRectangleBorder(),
    builder: (ctx) => Container(
      decoration: const BoxDecoration(
        border: Border(top: BorderSide(color: SonicColors.ink, width: 3)),
      ),
      padding: EdgeInsets.only(bottom: MediaQuery.of(ctx).viewInsets.bottom),
      child: SafeArea(
        top: false,
        child: SingleChildScrollView(
          padding: const EdgeInsets.fromLTRB(20, 16, 20, 24),
          child: panel,
        ),
      ),
    ),
  );
}

class _PanelHeader extends StatelessWidget {
  const _PanelHeader({required this.kicker, required this.title});

  final String kicker;
  final String title;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          kicker,
          style: SonicMachineTheme.labelTech(
            fontSize: 9.5,
            color: SonicColors.signalRed,
            letterSpacing: 1.5,
          ),
        ),
        const SizedBox(height: 2),
        Text(title, style: Theme.of(context).textTheme.titleMedium),
        const SizedBox(height: 14),
      ],
    );
  }
}

class _ErrorPlate extends StatelessWidget {
  const _ErrorPlate(this.message);

  final String message;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(top: 10),
      child: SonicPlate(
        backgroundColor: SonicColors.signalRed,
        shadowOffset: Offset.zero,
        padding: const EdgeInsets.all(10),
        child: Text(
          message,
          style: SonicMachineTheme.labelTech(
            fontSize: 10.5,
            color: SonicColors.onSignal,
            letterSpacing: 0.4,
          ),
        ),
      ),
    );
  }
}

class _QrPlate extends StatelessWidget {
  const _QrPlate({required this.data, required this.caption, this.footer});

  final String data;
  final String caption;
  final Widget? footer;

  @override
  Widget build(BuildContext context) {
    return SonicPlate(
      backgroundColor: SonicColors.ink,
      shadowColor: SonicColors.voltageCyan,
      padding: const EdgeInsets.all(14),
      child: Column(
        children: [
          Text(
            caption,
            style: SonicMachineTheme.labelTech(
              fontSize: 12,
              color: SonicColors.voltageCyan,
            ),
          ),
          const SizedBox(height: 10),
          Container(
            color: Colors.white,
            padding: const EdgeInsets.all(10),
            child: QrImageView(
              data: data,
              version: QrVersions.auto,
              size: 200,
              backgroundColor: Colors.white,
            ),
          ),
          if (footer != null) ...[const SizedBox(height: 10), footer!],
        ],
      ),
    );
  }
}

String _cleanError(Object e) => e.toString().replaceFirst('Exception: ', '');

// ─── Deposit (NUT-04 Lightning mint quote) ──────────────────────────────────

class CashuDepositPanel extends StatefulWidget {
  const CashuDepositPanel({super.key, required this.authViewModel});

  final AuthViewModel authViewModel;

  @override
  State<CashuDepositPanel> createState() => _CashuDepositPanelState();
}

class _CashuDepositPanelState extends State<CashuDepositPanel>
    with WidgetsBindingObserver {
  final _amountController = TextEditingController(text: '1000');
  String? _mintUrl;
  CashuMintQuoteInfo? _quote;
  bool _busy = false;
  bool _claimed = false;
  String? _error;
  Timer? _poll;
  bool _claiming = false;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    final mints = widget.authViewModel.cashuStatus.mints;
    if (mints.isNotEmpty) _mintUrl = mints.first.mintUrl;
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _poll?.cancel();
    _amountController.dispose();
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed && _quote != null && !_claimed) {
      _tryClaim(silent: true);
    }
  }

  Future<void> _createQuote() async {
    final amount = int.tryParse(_amountController.text.trim()) ?? 0;
    final mint = _mintUrl;
    if (amount <= 0 || mint == null) {
      setState(() => _error = 'Choose a mint and a positive amount.');
      return;
    }
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final q = await widget.authViewModel.createCashuMintQuote(
        mintUrl: mint,
        amountSats: amount,
      );
      if (!mounted) return;
      setState(() => _quote = q);
      _poll = Timer.periodic(
        const Duration(seconds: 4),
        (_) => _tryClaim(silent: true),
      );
    } catch (e) {
      if (mounted) setState(() => _error = _cleanError(e));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _tryClaim({required bool silent}) async {
    final q = _quote;
    if (q == null || _claimed || _claiming) return;
    _claiming = true;
    try {
      await widget.authViewModel.claimCashuMintQuote(
        mintUrl: q.mintUrl,
        quoteId: q.quoteId,
      );
      _poll?.cancel();
      if (!mounted) return;
      HapticFeedback.mediumImpact();
      setState(() {
        _claimed = true;
        _error = null;
      });
    } catch (e) {
      if (!silent && mounted) {
        setState(() => _error = 'Not paid yet — ${_cleanError(e)}');
      }
    } finally {
      _claiming = false;
    }
  }

  @override
  Widget build(BuildContext context) {
    final mints = widget.authViewModel.cashuStatus.mints;
    final q = _quote;

    return Column(
      mainAxisSize: MainAxisSize.min,
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        const _PanelHeader(
          kicker: 'ECASH // DEPOSIT VIA LIGHTNING',
          title: 'Mint new ecash',
        ),
        if (_claimed && q != null) ...[
          SonicPlate(
            backgroundColor: SonicColors.ink,
            shadowColor: SonicColors.voltageCyan,
            padding: const EdgeInsets.all(16),
            child: Column(
              children: [
                const Icon(Icons.check_circle_outline,
                    color: SonicColors.voltageCyan, size: 36),
                const SizedBox(height: 6),
                Text(
                  '+${q.amountSats} SATS MINTED',
                  style: SonicMachineTheme.labelTech(
                    fontSize: 12.5,
                    color: SonicColors.voltageCyan,
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 12),
          SonicPowerButton(
            label: 'Done',
            onPressed: () => Navigator.of(context).pop(),
          ),
        ] else if (q != null) ...[
          _QrPlate(
            data: q.bolt11.toUpperCase(),
            caption: '⚡ PAY ${q.amountSats} SATS',
            footer: Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                const SizedBox(
                  width: 10,
                  height: 10,
                  child: CircularProgressIndicator(
                    strokeWidth: 2,
                    color: SonicColors.voltageCyan,
                  ),
                ),
                const SizedBox(width: 8),
                Text(
                  'WAITING FOR PAYMENT...',
                  style: SonicMachineTheme.labelTech(
                    fontSize: 9,
                    color: SonicColors.foundation,
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 12),
          Row(
            children: [
              Expanded(
                child: SonicPowerButton(
                  label: 'Open Wallet',
                  icon: Icons.open_in_new,
                  onPressed: () async {
                    var ok = false;
                    try {
                      ok = await launchUrl(
                        Uri.parse('lightning:${q.bolt11}'),
                        mode: LaunchMode.externalApplication,
                      );
                    } catch (_) {}
                    if (!ok) {
                      await Clipboard.setData(ClipboardData(text: q.bolt11));
                    }
                  },
                ),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: SonicPowerButton(
                  label: 'Copy',
                  icon: Icons.copy,
                  primary: false,
                  onPressed: () =>
                      Clipboard.setData(ClipboardData(text: q.bolt11)),
                ),
              ),
            ],
          ),
          const SizedBox(height: 8),
          SonicPowerButton(
            label: 'Check Payment Now',
            icon: Icons.refresh,
            primary: false,
            compact: true,
            onPressed: () => _tryClaim(silent: false),
          ),
        ] else ...[
          DropdownButtonFormField<String>(
            initialValue: _mintUrl,
            isExpanded: true,
            decoration: const InputDecoration(labelText: 'MINT'),
            items: mints
                .map(
                  (m) => DropdownMenuItem(
                    value: m.mintUrl,
                    child: Text(
                      m.displayHost,
                      overflow: TextOverflow.ellipsis,
                    ),
                  ),
                )
                .toList(),
            onChanged: (v) => setState(() => _mintUrl = v),
          ),
          const SizedBox(height: 10),
          TextField(
            controller: _amountController,
            keyboardType: TextInputType.number,
            decoration: const InputDecoration(
              labelText: 'AMOUNT (SATS)',
              prefixIcon: Icon(Icons.bolt, color: SonicColors.ink),
            ),
          ),
          const SizedBox(height: 14),
          SonicPowerButton(
            label: _busy ? 'Requesting Invoice...' : 'Create Deposit Invoice',
            icon: Icons.bolt,
            onPressed: _busy ? null : _createQuote,
          ),
        ],
        if (_error != null) _ErrorPlate(_error!),
      ],
    );
  }
}

// ─── Receive token ──────────────────────────────────────────────────────────

class CashuReceivePanel extends StatefulWidget {
  const CashuReceivePanel({super.key, required this.authViewModel});

  final AuthViewModel authViewModel;

  @override
  State<CashuReceivePanel> createState() => _CashuReceivePanelState();
}

class _CashuReceivePanelState extends State<CashuReceivePanel> {
  final _tokenController = TextEditingController();
  bool _busy = false;
  String? _error;
  CashuReceiveResult? _result;

  @override
  void dispose() {
    _tokenController.dispose();
    super.dispose();
  }

  Future<void> _paste() async {
    final data = await Clipboard.getData(Clipboard.kTextPlain);
    final text = data?.text?.trim();
    if (text != null && text.isNotEmpty) {
      setState(() => _tokenController.text = text);
    }
  }

  Future<void> _redeem() async {
    final token = _tokenController.text.trim();
    if (!token.startsWith('cashu')) {
      setState(() => _error = 'Paste a cashuA… or cashuB… token.');
      return;
    }
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final res = await widget.authViewModel.receiveCashuToken(token);
      if (mounted) setState(() => _result = res);
    } catch (e) {
      if (mounted) setState(() => _error = _cleanError(e));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final res = _result;
    return Column(
      mainAxisSize: MainAxisSize.min,
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        const _PanelHeader(
          kicker: 'ECASH // RECEIVE TOKEN',
          title: 'Redeem a Cashu token',
        ),
        if (res != null) ...[
          SonicPlate(
            backgroundColor: SonicColors.ink,
            shadowColor: SonicColors.voltageCyan,
            padding: const EdgeInsets.all(16),
            child: Text(
              '+${res.receivedSats} SATS FROM ${Uri.tryParse(res.mintUrl)?.host ?? res.mintUrl}'
                  .toUpperCase(),
              textAlign: TextAlign.center,
              style: SonicMachineTheme.labelTech(
                fontSize: 12,
                color: SonicColors.voltageCyan,
              ),
            ),
          ),
          const SizedBox(height: 12),
          SonicPowerButton(
            label: 'Done',
            onPressed: () => Navigator.of(context).pop(),
          ),
        ] else ...[
          TextField(
            controller: _tokenController,
            minLines: 3,
            maxLines: 5,
            decoration: InputDecoration(
              hintText: 'cashuB...',
              suffixIcon: QrScannerSheet.isSupported
                  ? IconButton(
                      tooltip: 'Scan Cashu QR',
                      icon: const Icon(
                        Icons.qr_code_scanner,
                        color: SonicColors.ink,
                      ),
                      onPressed: () async {
                        final scanned = await QrScannerSheet.scan(
                          context,
                          title: 'Scan Cashu Token QR',
                          hint: 'POINT AT A CASHUA... OR CASHUB... QR CODE',
                        );
                        if (scanned != null && mounted) {
                          setState(() => _tokenController.text = scanned);
                        }
                      },
                    )
                  : null,
            ),
          ),
          const SizedBox(height: 10),
          Row(
            children: [
              Expanded(
                child: SonicPowerButton(
                  label: 'Paste',
                  icon: Icons.content_paste,
                  primary: false,
                  compact: true,
                  onPressed: _busy ? null : _paste,
                ),
              ),
              const SizedBox(width: 8),
              Expanded(
                flex: 2,
                child: SonicPowerButton(
                  label: _busy ? 'Redeeming...' : 'Redeem',
                  icon: Icons.download,
                  onPressed: _busy ? null : _redeem,
                ),
              ),
            ],
          ),
        ],
        if (_error != null) _ErrorPlate(_error!),
      ],
    );
  }
}

// ─── Send token ─────────────────────────────────────────────────────────────

class CashuSendPanel extends StatefulWidget {
  const CashuSendPanel({super.key, required this.authViewModel});

  final AuthViewModel authViewModel;

  @override
  State<CashuSendPanel> createState() => _CashuSendPanelState();
}

class _CashuSendPanelState extends State<CashuSendPanel> {
  final _amountController = TextEditingController(text: '21');
  final _memoController = TextEditingController();
  bool _busy = false;
  String? _error;
  CashuSendResult? _result;

  @override
  void dispose() {
    _amountController.dispose();
    _memoController.dispose();
    super.dispose();
  }

  Future<void> _create() async {
    final amount = int.tryParse(_amountController.text.trim()) ?? 0;
    if (amount <= 0) {
      setState(() => _error = 'Enter a positive amount.');
      return;
    }
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final memo = _memoController.text.trim();
      final res = await widget.authViewModel.sendCashuToken(
        amountSats: amount,
        memo: memo.isEmpty ? null : memo,
      );
      if (mounted) setState(() => _result = res);
    } catch (e) {
      if (mounted) setState(() => _error = _cleanError(e));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final res = _result;
    return Column(
      mainAxisSize: MainAxisSize.min,
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        const _PanelHeader(
          kicker: 'ECASH // SEND TOKEN',
          title: 'Create a Cashu token',
        ),
        if (res != null) ...[
          _QrPlate(
            data: res.token,
            caption: '${res.amountSats} SATS TOKEN',
            footer: Text(
              'ANYONE WITH THIS TOKEN CAN CLAIM IT',
              style: SonicMachineTheme.labelTech(
                fontSize: 9,
                color: SonicColors.foundation,
              ),
            ),
          ),
          const SizedBox(height: 12),
          SonicPowerButton(
            label: 'Copy Token',
            icon: Icons.copy,
            onPressed: () {
              Clipboard.setData(ClipboardData(text: res.token));
              ScaffoldMessenger.maybeOf(context)?.showSnackBar(
                const SnackBar(content: Text('Cashu token copied')),
              );
            },
          ),
          const SizedBox(height: 8),
          SonicPowerButton(
            label: 'Done',
            primary: false,
            compact: true,
            onPressed: () => Navigator.of(context).pop(),
          ),
        ] else ...[
          TextField(
            controller: _amountController,
            keyboardType: TextInputType.number,
            decoration: const InputDecoration(
              labelText: 'AMOUNT (SATS)',
              prefixIcon: Icon(Icons.bolt, color: SonicColors.ink),
            ),
          ),
          const SizedBox(height: 10),
          TextField(
            controller: _memoController,
            maxLength: 80,
            decoration: const InputDecoration(
              labelText: 'MEMO (OPTIONAL)',
              counterText: '',
            ),
          ),
          const SizedBox(height: 14),
          SonicPowerButton(
            label: _busy ? 'Creating...' : 'Create Token',
            icon: Icons.upload,
            onPressed: _busy ? null : _create,
          ),
        ],
        if (_error != null) _ErrorPlate(_error!),
      ],
    );
  }
}

// ─── Add mint ───────────────────────────────────────────────────────────────

class CashuAddMintPanel extends StatefulWidget {
  const CashuAddMintPanel({super.key, required this.authViewModel});

  final AuthViewModel authViewModel;

  @override
  State<CashuAddMintPanel> createState() => _CashuAddMintPanelState();
}

class _CashuAddMintPanelState extends State<CashuAddMintPanel> {
  final _controller = TextEditingController(text: 'https://');
  bool _busy = false;
  String? _error;

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  Future<void> _add() async {
    final url = _controller.text.trim();
    if (!url.startsWith('https://') || url.length < 12) {
      setState(() => _error = 'Enter a valid https:// mint URL.');
      return;
    }
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await widget.authViewModel.addCashuMint(url);
      if (mounted) Navigator.of(context).pop();
    } catch (e) {
      if (mounted) setState(() => _error = _cleanError(e));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      mainAxisSize: MainAxisSize.min,
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        const _PanelHeader(kicker: 'ECASH // ADD MINT', title: 'Trust a new mint'),
        Text(
          'Mints custody the sats behind your ecash. Only add mints you trust.',
          style: Theme.of(context).textTheme.bodySmall,
        ),
        const SizedBox(height: 10),
        TextField(
          controller: _controller,
          keyboardType: TextInputType.url,
          decoration: const InputDecoration(
            labelText: 'MINT URL',
            prefixIcon:
                Icon(Icons.account_balance_outlined, color: SonicColors.ink),
          ),
        ),
        const SizedBox(height: 14),
        SonicPowerButton(
          label: _busy ? 'Connecting...' : 'Add Mint',
          icon: Icons.add,
          onPressed: _busy ? null : _add,
        ),
        if (_error != null) _ErrorPlate(_error!),
      ],
    );
  }
}
