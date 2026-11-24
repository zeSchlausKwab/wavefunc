import 'dart:async';

import 'package:flutter/services.dart';
import 'package:material_ui/material_ui.dart';
import 'package:qr_flutter/qr_flutter.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../../../domain/models/social.dart';
import '../../../../domain/models/station.dart';
import '../../../core/theme/sonic_machine_theme.dart';
import '../../../core/widgets/sonic_plate.dart';
import '../../../core/widgets/station_thumbnail.dart';
import '../../auth/view_models/auth_view_model.dart';
import '../../discover/view_models/discover_view_model.dart';

/// How a zap was settled (shown on the confirmation plate).
enum ZapSettlement { nwc, cashuMelt, nutzap, externalWallet }

class _ZapConfirmation {
  const _ZapConfirmation({
    required this.amountSats,
    required this.settlement,
    this.detail,
  });

  final int amountSats;
  final ZapSettlement settlement;
  final String? detail;
}

/// Brutal Constructivist zap sheet:
/// - NIP-61 P2PK Nutzap from the embedded Cashu wallet (when the station owner
///   publishes `kind 10019`)
/// - NIP-57 zap paid by melting Cashu ecash
/// - NIP-57 zap paid via NWC (1-tap)
/// - BOLT11 QR / external wallet fallback, auto-confirmed by polling for the
///   `kind 9735` receipt (wallets like Minibits never redirect back).
class ZapSheet extends StatefulWidget {
  const ZapSheet({
    super.key,
    required this.station,
    required this.authViewModel,
    required this.discoverViewModel,
    this.onOpenWalletSettings,
  });

  final Station station;
  final AuthViewModel authViewModel;
  final DiscoverViewModel discoverViewModel;
  final VoidCallback? onOpenWalletSettings;

  @override
  State<ZapSheet> createState() => _ZapSheetState();
}

class _ZapSheetState extends State<ZapSheet> with WidgetsBindingObserver {
  static const List<int> _presets = [21, 100, 500, 1000, 5000];
  static const Duration _receiptPollInterval = Duration(seconds: 3);
  static const Duration _receiptPollTimeout = Duration(minutes: 10);

  int _selectedSats = 100;
  final _customAmountController = TextEditingController();
  final _commentController = TextEditingController();

  bool _isBusy = false;
  String? _busyLabel;
  String? _error;
  ZapInvoiceResult? _invoice;
  _ZapConfirmation? _confirmation;

  RecipientNutzapInfo? _nutzapInfo;
  bool _nutzapInfoLoaded = false;

  Timer? _receiptTimer;
  int _invoiceIssuedAt = 0;
  bool _checkingReceipt = false;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _loadNutzapInfo();
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _receiptTimer?.cancel();
    _customAmountController.dispose();
    _commentController.dispose();
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    // Returning from Minibits / Phoenix / Zeus: check immediately.
    if (state == AppLifecycleState.resumed && _receiptTimer != null) {
      _checkReceipt();
    }
  }

  Future<void> _loadNutzapInfo() async {
    final info =
        await widget.authViewModel.fetchRecipientNutzapInfo(widget.station.pubkey);
    if (!mounted) return;
    setState(() {
      _nutzapInfo = info;
      _nutzapInfoLoaded = true;
    });
  }

  int get _effectiveSats {
    final raw = _customAmountController.text.trim();
    if (raw.isNotEmpty) {
      final parsed = int.tryParse(raw);
      if (parsed != null && parsed > 0) return parsed;
    }
    return _selectedSats;
  }

  String? get _comment {
    final c = _commentController.text.trim();
    return c.isEmpty ? null : c;
  }

  static String _normalizeMint(String url) =>
      url.trim().replaceAll(RegExp(r'/+$'), '').toLowerCase();

  /// Cashu balance on mints the recipient accepts for nutzaps.
  int _compatibleNutzapBalance(CashuWalletStatus cashu) {
    final info = _nutzapInfo;
    if (info == null || !info.acceptsNutzaps) return 0;
    final accepted = info.mints.map(_normalizeMint).toSet();
    var best = 0;
    for (final m in cashu.mints) {
      if (accepted.contains(_normalizeMint(m.mintUrl)) && m.balanceSats > best) {
        best = m.balanceSats;
      }
    }
    return best;
  }

  int _maxSingleMintBalance(CashuWalletStatus cashu) {
    var best = 0;
    for (final m in cashu.mints) {
      if (m.balanceSats > best) best = m.balanceSats;
    }
    return best;
  }

  void _setError(Object e) {
    if (!mounted) return;
    setState(() => _error = e.toString().replaceFirst('Exception: ', ''));
  }

  void _confirm(_ZapConfirmation c) {
    _receiptTimer?.cancel();
    _receiptTimer = null;
    widget.discoverViewModel.recordLocalZap(widget.station, c.amountSats);
    HapticFeedback.mediumImpact();
    setState(() => _confirmation = c);
  }

  Future<ZapInvoiceResult> _prepareInvoice(int amount) async {
    final inv = await widget.authViewModel.prepareStationZap(
      stationPubkey: widget.station.pubkey,
      stationAddress: widget.station.address,
      amountSats: amount,
      comment: _comment,
    );
    final bolt11 = inv.bolt11;
    if (bolt11 == null || bolt11.isEmpty) {
      throw StateError('LNURL server did not return a BOLT11 invoice.');
    }
    return inv;
  }

  Future<void> _runBusy(String label, Future<void> Function() fn) async {
    final amount = _effectiveSats;
    if (amount <= 0) {
      setState(() => _error = 'Enter a valid sat amount.');
      return;
    }
    setState(() {
      _isBusy = true;
      _busyLabel = label;
      _error = null;
    });
    try {
      await fn();
    } catch (e) {
      _setError(e);
    } finally {
      if (mounted) {
        setState(() {
          _isBusy = false;
          _busyLabel = null;
        });
      }
    }
  }

  Future<void> _zapWithNwc() => _runBusy('Zapping via NWC...', () async {
        final amount = _effectiveSats;
        final inv = await _prepareInvoice(amount);
        final paid = await widget.authViewModel.payInvoiceNwc(
          bolt11: inv.bolt11!,
          amountSats: amount,
        );
        if (!mounted) return;
        _confirm(
          _ZapConfirmation(
            amountSats: amount,
            settlement: ZapSettlement.nwc,
            detail: paid.preimage,
          ),
        );
      });

  Future<void> _zapWithCashuMelt() => _runBusy('Melting ecash...', () async {
        final amount = _effectiveSats;
        final inv = await _prepareInvoice(amount);
        final paid = await widget.authViewModel.payInvoiceCashu(
          bolt11: inv.bolt11!,
          amountSats: amount,
        );
        if (!mounted) return;
        _confirm(
          _ZapConfirmation(
            amountSats: amount,
            settlement: ZapSettlement.cashuMelt,
            detail: paid.preimage,
          ),
        );
      });

  Future<void> _sendNutzap() => _runBusy('Locking P2PK ecash...', () async {
        final amount = _effectiveSats;
        final outcome = await widget.authViewModel.sendStationNutzap(
          stationEventId: widget.station.id,
          stationPubkey: widget.station.pubkey,
          stationAddress: widget.station.address,
          amountSats: amount,
          comment: _comment,
        );
        if (!mounted) return;
        _confirm(
          _ZapConfirmation(
            amountSats: amount,
            settlement: ZapSettlement.nutzap,
            detail: outcome.eventId,
          ),
        );
      });

  Future<void> _generateQrInvoice() =>
      _runBusy('Fetching invoice...', () async {
        final inv = await _prepareInvoice(_effectiveSats);
        if (!mounted) return;
        setState(() => _invoice = inv);
        _startReceiptPolling();
      });

  void _startReceiptPolling() {
    _receiptTimer?.cancel();
    _invoiceIssuedAt = DateTime.now().millisecondsSinceEpoch ~/ 1000;
    final startedAt = DateTime.now();
    _receiptTimer = Timer.periodic(_receiptPollInterval, (_) {
      if (DateTime.now().difference(startedAt) > _receiptPollTimeout) {
        _receiptTimer?.cancel();
        _receiptTimer = null;
        if (mounted) setState(() {});
        return;
      }
      _checkReceipt();
    });
  }

  Future<void> _checkReceipt() async {
    final inv = _invoice;
    final bolt11 = inv?.bolt11;
    if (inv == null || bolt11 == null || _checkingReceipt) return;
    _checkingReceipt = true;
    try {
      final found = await widget.authViewModel.checkStationZapReceipt(
        stationAddress: widget.station.address,
        bolt11: bolt11,
        sinceUnix: _invoiceIssuedAt,
      );
      if (found && mounted && _confirmation == null) {
        _confirm(
          _ZapConfirmation(
            amountSats: inv.amountSats,
            settlement: ZapSettlement.externalWallet,
            detail: 'kind 9735 receipt received',
          ),
        );
      }
    } finally {
      _checkingReceipt = false;
    }
  }

  Future<void> _openInExternalWallet(String bolt11) async {
    final uri = Uri.parse('lightning:$bolt11');
    var launched = false;
    try {
      launched = await launchUrl(uri, mode: LaunchMode.externalApplication);
    } catch (_) {}
    if (!launched && mounted) {
      await Clipboard.setData(ClipboardData(text: bolt11));
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('No Lightning wallet app found — invoice copied instead'),
        ),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final bottomInset = MediaQuery.of(context).viewInsets.bottom;

    return ListenableBuilder(
      listenable: widget.authViewModel,
      builder: (context, _) {
        final nwc = widget.authViewModel.nwcStatus;
        final cashu = widget.authViewModel.cashuStatus;

        return Container(
          decoration: const BoxDecoration(
            color: SonicColors.foundation,
            border: Border(top: BorderSide(color: SonicColors.ink, width: 3)),
          ),
          padding: EdgeInsets.only(bottom: bottomInset),
          child: SafeArea(
            top: false,
            child: SingleChildScrollView(
              padding: const EdgeInsets.fromLTRB(20, 12, 20, 24),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Center(
                    child: Container(
                      width: 48,
                      height: 4,
                      color: SonicColors.ink,
                    ),
                  ),
                  const SizedBox(height: 14),
                  _buildHeader(context, nwc, cashu),
                  const SizedBox(height: 16),
                  if (_confirmation != null)
                    _buildSuccessView(_confirmation!)
                  else if (_invoice?.bolt11 != null && !_isBusy)
                    _buildInvoiceQrView(_invoice!)
                  else
                    ..._buildAmountForm(nwc, cashu),
                ],
              ),
            ),
          ),
        );
      },
    );
  }

  Widget _buildHeader(
    BuildContext context,
    NwcWalletStatus nwc,
    CashuWalletStatus cashu,
  ) {
    return Row(
      children: [
        StationThumbnail(
          url: widget.station.thumbnail,
          size: 46,
          highlight: _confirmation != null,
        ),
        const SizedBox(width: 12),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                'ZAP // NIP-57 + NIP-61',
                style: SonicMachineTheme.labelTech(
                  fontSize: 9.5,
                  color: SonicColors.signalRed,
                  letterSpacing: 1.5,
                ),
              ),
              const SizedBox(height: 2),
              Text(
                widget.station.name,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: Theme.of(context).textTheme.titleMedium,
              ),
            ],
          ),
        ),
        Column(
          crossAxisAlignment: CrossAxisAlignment.end,
          children: [
            if (nwc.connected)
              SonicTag(
                label: nwc.balanceSats != null
                    ? 'NWC ${nwc.balanceSats}'
                    : 'NWC READY',
                highlighted: true,
              ),
            if (cashu.initialized && cashu.totalBalanceSats > 0) ...[
              if (nwc.connected) const SizedBox(height: 4),
              SonicTag(label: 'ECASH ${cashu.totalBalanceSats}'),
            ],
          ],
        ),
      ],
    );
  }

  List<Widget> _buildAmountForm(NwcWalletStatus nwc, CashuWalletStatus cashu) {
    final amount = _effectiveSats;
    final nutzapBalance = _compatibleNutzapBalance(cashu);
    final canNutzap = cashu.initialized &&
        (_nutzapInfo?.acceptsNutzaps ?? false) &&
        nutzapBalance >= amount;
    final canMelt = cashu.initialized && _maxSingleMintBalance(cashu) >= amount;

    final actions = <Widget>[];
    void addAction(Widget w) {
      if (actions.isNotEmpty) actions.add(const SizedBox(height: 8));
      actions.add(SizedBox(width: double.infinity, child: w));
    }

    var primaryUsed = false;
    if (canNutzap) {
      addAction(
        SonicPowerButton(
          label: _isBusy ? (_busyLabel ?? 'Working...') : 'Nutzap $amount Sats (Instant)',
          icon: Icons.toll,
          onPressed: _isBusy ? null : _sendNutzap,
        ),
      );
      primaryUsed = true;
    }
    if (nwc.connected) {
      addAction(
        SonicPowerButton(
          label: _isBusy && !primaryUsed
              ? (_busyLabel ?? 'Working...')
              : 'Zap $amount Sats (NWC)',
          icon: Icons.bolt,
          primary: !primaryUsed,
          compact: primaryUsed,
          onPressed: _isBusy ? null : _zapWithNwc,
        ),
      );
      primaryUsed = true;
    }
    if (canMelt) {
      addAction(
        SonicPowerButton(
          label: _isBusy && !primaryUsed
              ? (_busyLabel ?? 'Working...')
              : 'Zap $amount Sats (Ecash)',
          icon: Icons.local_fire_department_outlined,
          primary: !primaryUsed,
          compact: primaryUsed,
          onPressed: _isBusy ? null : _zapWithCashuMelt,
        ),
      );
      primaryUsed = true;
    }
    addAction(
      SonicPowerButton(
        label: _isBusy && !primaryUsed
            ? (_busyLabel ?? 'Fetching Invoice...')
            : primaryUsed
                ? 'Pay With Another Wallet (QR)'
                : 'Generate $amount Sat Invoice',
        icon: primaryUsed ? Icons.qr_code_2 : Icons.bolt,
        primary: !primaryUsed,
        compact: primaryUsed,
        onPressed: _isBusy ? null : _generateQrInvoice,
      ),
    );
    if (!nwc.connected && widget.onOpenWalletSettings != null) {
      addAction(
        SonicPowerButton(
          label: cashu.totalBalanceSats > 0
              ? 'Wallet Settings'
              : 'Set Up Wallet for 1-Tap Zaps',
          icon: Icons.account_balance_wallet_outlined,
          primary: false,
          compact: true,
          onPressed: () {
            Navigator.of(context).pop();
            widget.onOpenWalletSettings!();
          },
        ),
      );
    }

    return [
      const SonicSectionHeader(title: 'SELECT_AMOUNT_SATS'),
      const SizedBox(height: 10),
      Wrap(
        spacing: 8,
        runSpacing: 8,
        children: _presets.map((preset) {
          final selected =
              _customAmountController.text.isEmpty && _selectedSats == preset;
          return GestureDetector(
            onTap: () => setState(() {
              _selectedSats = preset;
              _customAmountController.clear();
            }),
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
              decoration: BoxDecoration(
                color: selected ? SonicColors.voltageCyan : SonicColors.surfacePlate,
                border: Border.all(color: SonicColors.ink, width: 2),
                boxShadow: selected
                    ? const [
                        BoxShadow(
                          color: SonicColors.ink,
                          offset: Offset(2, 2),
                          blurRadius: 0,
                        ),
                      ]
                    : null,
              ),
              child: Text(
                '⚡ ${preset >= 1000 ? '${preset ~/ 1000}K' : preset}',
                style: SonicMachineTheme.labelTech(
                  fontSize: 11,
                  color: SonicColors.ink,
                ),
              ),
            ),
          );
        }).toList(),
      ),
      const SizedBox(height: 10),
      TextField(
        controller: _customAmountController,
        keyboardType: TextInputType.number,
        onChanged: (_) => setState(() {}),
        decoration: const InputDecoration(
          hintText: 'OR CUSTOM AMOUNT (SATS)...',
          prefixIcon: Icon(Icons.bolt, color: SonicColors.ink),
        ),
      ),
      const SizedBox(height: 10),
      TextField(
        controller: _commentController,
        maxLength: 140,
        decoration: const InputDecoration(
          hintText: 'OPTIONAL ZAP MESSAGE...',
          counterText: '',
          prefixIcon: Icon(Icons.chat_bubble_outline, color: SonicColors.ink),
        ),
      ),
      const SizedBox(height: 8),
      _buildNutzapHint(cashu, nutzapBalance),
      if (_error != null) ...[
        const SizedBox(height: 10),
        SonicPlate(
          backgroundColor: SonicColors.signalRed,
          shadowOffset: Offset.zero,
          padding: const EdgeInsets.all(10),
          child: Text(
            _error!,
            style: SonicMachineTheme.labelTech(
              fontSize: 10.5,
              color: SonicColors.onSignal,
              letterSpacing: 0.4,
            ),
          ),
        ),
      ],
      const SizedBox(height: 14),
      ...actions,
    ];
  }

  Widget _buildNutzapHint(CashuWalletStatus cashu, int nutzapBalance) {
    String text;
    if (!_nutzapInfoLoaded) {
      text = 'CHECKING NUTZAP SUPPORT...';
    } else if (!(_nutzapInfo?.acceptsNutzaps ?? false)) {
      text = 'OWNER HAS NO NUTZAP MINTS — LIGHTNING ONLY';
    } else if (!cashu.initialized) {
      text = 'NUTZAP READY — ECASH WALLET STARTING...';
    } else if (nutzapBalance <= 0) {
      text = 'NUTZAP OK VIA ${_nutzapInfo!.mints.length} MINT(S) — NO MATCHING ECASH';
    } else {
      text = 'NUTZAP OK — $nutzapBalance SATS ON A COMPATIBLE MINT';
    }
    return Text(
      text,
      style: SonicMachineTheme.labelTech(
        fontSize: 9,
        color: SonicColors.seamMuted,
        letterSpacing: 0.6,
      ),
    );
  }

  Widget _buildInvoiceQrView(ZapInvoiceResult invoice) {
    final bolt11 = invoice.bolt11!;
    final watching = _receiptTimer != null;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        SonicPlate(
          backgroundColor: SonicColors.ink,
          shadowColor: SonicColors.voltageCyan,
          padding: const EdgeInsets.all(14),
          child: Column(
            children: [
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Text(
                    '⚡ ${invoice.amountSats} SATS',
                    style: SonicMachineTheme.labelTech(
                      fontSize: 13,
                      color: SonicColors.voltageCyan,
                    ),
                  ),
                  Flexible(
                    child: Text(
                      invoice.recipientLud16,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: SonicMachineTheme.labelTech(
                        fontSize: 9.5,
                        color: SonicColors.seamMuted,
                        letterSpacing: 0.4,
                      ),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 12),
              Container(
                color: Colors.white,
                padding: const EdgeInsets.all(10),
                child: QrImageView(
                  data: bolt11.toUpperCase(),
                  version: QrVersions.auto,
                  size: 196,
                  backgroundColor: Colors.white,
                ),
              ),
              const SizedBox(height: 10),
              Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  if (watching) ...[
                    const SizedBox(
                      width: 10,
                      height: 10,
                      child: CircularProgressIndicator(
                        strokeWidth: 2,
                        color: SonicColors.voltageCyan,
                      ),
                    ),
                    const SizedBox(width: 8),
                  ],
                  Flexible(
                    child: Text(
                      watching
                          ? (invoice.allowsNostr
                              ? 'WATCHING RELAYS FOR ZAP RECEIPT...'
                              : 'WAITING FOR PAYMENT...')
                          : 'RECEIPT WATCH STOPPED — TAP MARK PAID',
                      textAlign: TextAlign.center,
                      style: SonicMachineTheme.labelTech(
                        fontSize: 9,
                        color: SonicColors.foundation,
                      ),
                    ),
                  ),
                ],
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
                onPressed: () => _openInExternalWallet(bolt11),
              ),
            ),
            const SizedBox(width: 8),
            Expanded(
              child: SonicPowerButton(
                label: 'Copy Invoice',
                icon: Icons.copy,
                primary: false,
                onPressed: () {
                  Clipboard.setData(ClipboardData(text: bolt11));
                  ScaffoldMessenger.of(context).showSnackBar(
                    const SnackBar(content: Text('BOLT11 invoice copied')),
                  );
                },
              ),
            ),
          ],
        ),
        const SizedBox(height: 8),
        Row(
          children: [
            Expanded(
              child: SonicPowerButton(
                label: 'Mark Paid',
                icon: Icons.check,
                primary: false,
                compact: true,
                onPressed: () => _confirm(
                  _ZapConfirmation(
                    amountSats: invoice.amountSats,
                    settlement: ZapSettlement.externalWallet,
                    detail: 'marked paid manually',
                  ),
                ),
              ),
            ),
            const SizedBox(width: 8),
            Expanded(
              child: SonicPowerButton(
                label: 'Change Amount',
                primary: false,
                compact: true,
                onPressed: () {
                  _receiptTimer?.cancel();
                  _receiptTimer = null;
                  setState(() => _invoice = null);
                },
              ),
            ),
          ],
        ),
      ],
    );
  }

  Widget _buildSuccessView(_ZapConfirmation c) {
    final method = switch (c.settlement) {
      ZapSettlement.nwc => 'PAID VIA NWC',
      ZapSettlement.cashuMelt => 'PAID WITH ECASH (MELT)',
      ZapSettlement.nutzap => 'NUTZAP PUBLISHED (P2PK)',
      ZapSettlement.externalWallet => 'EXTERNAL WALLET',
    };
    final detail = c.detail;
    final shortDetail = detail == null
        ? null
        : detail.length > 24
            ? '${detail.substring(0, 10)}...${detail.substring(detail.length - 8)}'
            : detail;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        SonicPlate(
          backgroundColor: SonicColors.ink,
          shadowColor: SonicColors.voltageCyan,
          padding: const EdgeInsets.all(16),
          child: Column(
            children: [
              const Icon(Icons.bolt, color: SonicColors.voltageCyan, size: 40),
              const SizedBox(height: 8),
              Text(
                'ZAP CONFIRMED // ${c.amountSats} SATS',
                style: SonicMachineTheme.labelTech(
                  fontSize: 12.5,
                  color: SonicColors.voltageCyan,
                ),
              ),
              const SizedBox(height: 4),
              Text(
                method,
                style: SonicMachineTheme.labelTech(
                  fontSize: 9.5,
                  color: SonicColors.foundation,
                ),
              ),
              if (shortDetail != null) ...[
                const SizedBox(height: 2),
                Text(
                  shortDetail.toUpperCase(),
                  style: SonicMachineTheme.labelTech(
                    fontSize: 9,
                    color: SonicColors.seamMuted,
                  ),
                ),
              ],
            ],
          ),
        ),
        const SizedBox(height: 12),
        SonicPowerButton(
          label: 'Done',
          onPressed: () => Navigator.of(context).pop(),
        ),
      ],
    );
  }
}
