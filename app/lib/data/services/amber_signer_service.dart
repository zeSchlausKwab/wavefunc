import 'dart:convert';
import 'dart:io';

import 'package:flutter/services.dart';

class AmberPublicKeyResult {
  const AmberPublicKeyResult({required this.pubkey, this.signerPackage});

  final String pubkey;
  final String? signerPackage;
}

/// Dart client for Android NIP-55 external signers (Amber, etc.) via MethodChannel.
class AmberSignerService {
  static const _channel = MethodChannel('live.wavefunc.app/amber');

  static final String _defaultPermissionsJson = jsonEncode([
    {'type': 'sign_event', 'kind': 1},
    {'type': 'sign_event', 'kind': 7},
    {'type': 'sign_event', 'kind': 1111},
    {'type': 'sign_event', 'kind': 30078},
    {'type': 'sign_event', 'kind': 30315},
    {'type': 'sign_event', 'kind': 31337},
  ]);

  Future<bool> isAvailable() async {
    if (!Platform.isAndroid) return false;
    try {
      return await _channel.invokeMethod<bool>('isAvailable') ?? false;
    } catch (_) {
      return false;
    }
  }

  Future<AmberPublicKeyResult> getPublicKey() async {
    final res = await _channel.invokeMapMethod<String, dynamic>(
      'getPublicKey',
      {'permissions': _defaultPermissionsJson},
    );
    final pubkey = res?['pubkey'] as String?;
    if (pubkey == null || pubkey.trim().isEmpty) {
      throw const FormatException('Amber did not return a public key.');
    }
    return AmberPublicKeyResult(
      pubkey: pubkey.trim(),
      signerPackage: res?['package'] as String?,
    );
  }

  Future<String> signEvent({
    required String unsignedEventJson,
    String? currentUser,
    String? signerPackage,
  }) async {
    final signed = await _channel.invokeMethod<String>('signEvent', {
      'eventJson': unsignedEventJson,
      'currentUser': currentUser,
      'signerPackage': signerPackage,
    });
    if (signed == null || signed.trim().isEmpty) {
      throw const FormatException('Amber did not return a signed event.');
    }
    return signed;
  }
}
