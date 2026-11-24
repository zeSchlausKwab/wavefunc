import 'dart:io';

import 'package:flutter/foundation.dart';
import 'package:material_ui/material_ui.dart';
import 'package:mobile_scanner/mobile_scanner.dart';

import '../theme/sonic_machine_theme.dart';
import 'sonic_plate.dart';

/// Brutal Constructivist camera QR scanner sheet for mobile (Android / iOS).
/// Used to scan NIP-46 bunker URIs, NWC wallet strings, and Cashu ecash tokens.
class QrScannerSheet extends StatefulWidget {
  const QrScannerSheet({
    super.key,
    required this.title,
    required this.hint,
  });

  final String title;
  final String hint;

  static bool get isSupported =>
      !kIsWeb && (Platform.isAndroid || Platform.isIOS);

  static Future<String?> scan(
    BuildContext context, {
    required String title,
    required String hint,
  }) {
    if (!isSupported) return Future.value(null);
    return showModalBottomSheet<String>(
      context: context,
      isScrollControlled: true,
      backgroundColor: SonicColors.foundation,
      shape: const RoundedRectangleBorder(),
      builder: (_) => QrScannerSheet(title: title, hint: hint),
    );
  }

  @override
  State<QrScannerSheet> createState() => _QrScannerSheetState();
}

class _QrScannerSheetState extends State<QrScannerSheet> {
  final MobileScannerController _controller = MobileScannerController(
    detectionSpeed: DetectionSpeed.noDuplicates,
  );
  bool _captured = false;
  bool _torchOn = false;

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  void _onDetect(BarcodeCapture capture) {
    if (_captured) return;
    for (final barcode in capture.barcodes) {
      final value = barcode.rawValue?.trim();
      if (value != null && value.isNotEmpty) {
        _captured = true;
        Navigator.of(context).pop(value);
        return;
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: const BoxDecoration(
        color: SonicColors.foundation,
        border: Border(top: BorderSide(color: SonicColors.ink, width: 3)),
      ),
      child: SafeArea(
        top: false,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(20, 14, 20, 20),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Row(
                children: [
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          'OPTICAL_SCANNER // QR',
                          style: SonicMachineTheme.labelTech(
                            fontSize: 9.5,
                            color: SonicColors.signalRed,
                            letterSpacing: 1.5,
                          ),
                        ),
                        const SizedBox(height: 2),
                        Text(
                          widget.title,
                          style: Theme.of(context).textTheme.titleMedium,
                        ),
                      ],
                    ),
                  ),
                  IconButton(
                    tooltip: 'Toggle flash',
                    icon: Icon(
                      _torchOn ? Icons.flash_on : Icons.flash_off,
                      color: SonicColors.ink,
                    ),
                    onPressed: () async {
                      await _controller.toggleTorch();
                      if (mounted) setState(() => _torchOn = !_torchOn);
                    },
                  ),
                  IconButton(
                    tooltip: 'Close scanner',
                    icon: const Icon(Icons.close, color: SonicColors.ink),
                    onPressed: () => Navigator.of(context).pop(),
                  ),
                ],
              ),
              const SizedBox(height: 10),
              SonicPlate(
                backgroundColor: SonicColors.ink,
                shadowColor: SonicColors.voltageCyan,
                padding: EdgeInsets.zero,
                child: SizedBox(
                  height: 300,
                  child: Stack(
                    fit: StackFit.expand,
                    children: [
                      MobileScanner(
                        controller: _controller,
                        onDetect: _onDetect,
                      ),
                      Center(
                        child: Container(
                          width: 210,
                          height: 210,
                          decoration: BoxDecoration(
                            border: Border.all(
                              color: SonicColors.voltageCyan,
                              width: 2.5,
                            ),
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
              ),
              const SizedBox(height: 10),
              Text(
                widget.hint,
                textAlign: TextAlign.center,
                style: SonicMachineTheme.labelTech(
                  fontSize: 9.5,
                  color: SonicColors.seamOutline,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
