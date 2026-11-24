import 'dart:convert';
import 'dart:math';

import 'package:flutter_secure_storage/flutter_secure_storage.dart';

enum StoredAuthMode { localKey, bunker, amber }

class StoredAuthCredentials {
  const StoredAuthCredentials({
    required this.pubkey,
    required this.npub,
    required this.mode,
    this.label,
    this.nsec,
    this.bunkerUri,
    this.bunkerAppNsec,
    this.amberPackage,
  });

  final String pubkey;
  final String npub;
  final StoredAuthMode mode;
  final String? label;
  final String? nsec;
  final String? bunkerUri;
  final String? bunkerAppNsec;
  final String? amberPackage;

  Map<String, dynamic> toJson() => {
        'pubkey': pubkey,
        'npub': npub,
        'mode': mode.name,
        'label': label,
        'nsec': nsec,
        'bunkerUri': bunkerUri,
        'bunkerAppNsec': bunkerAppNsec,
        'amberPackage': amberPackage,
      };

  static StoredAuthCredentials? fromJson(Map<String, dynamic> json) {
    final pubkey = json['pubkey'] as String?;
    final npub = json['npub'] as String?;
    final modeRaw = json['mode'] as String?;
    if (pubkey == null || npub == null || modeRaw == null) return null;

    final StoredAuthMode? mode = switch (modeRaw) {
      'localKey' => StoredAuthMode.localKey,
      'bunker' => StoredAuthMode.bunker,
      'amber' => StoredAuthMode.amber,
      _ => null,
    };
    if (mode == null) return null;

    return StoredAuthCredentials(
      pubkey: pubkey,
      npub: npub,
      mode: mode,
      label: json['label'] as String?,
      nsec: json['nsec'] as String?,
      bunkerUri: json['bunkerUri'] as String?,
      bunkerAppNsec: json['bunkerAppNsec'] as String?,
      amberPackage: json['amberPackage'] as String?,
    );
  }
}

class StoredSessionVault {
  const StoredSessionVault({
    this.activePubkey,
    this.accounts = const [],
  });

  final String? activePubkey;
  final List<StoredAuthCredentials> accounts;

  StoredAuthCredentials? get activeAccount {
    if (activePubkey == null) return null;
    for (final acc in accounts) {
      if (acc.pubkey == activePubkey) return acc;
    }
    return null;
  }
}

/// Multi-account encrypted credential store backed by Android Keystore / iOS Keychain.
class SecureAuthStorage {
  SecureAuthStorage({FlutterSecureStorage? storage})
      : _storage = storage ??
            const FlutterSecureStorage(
              aOptions: AndroidOptions(encryptedSharedPreferences: true),
              mOptions: MacOsOptions(useDataProtectionKeyChain: false),
            );

  static const _kVault = 'wf_auth_vault_v2';
  static const _kNwcUri = 'wf_nwc_uri_v1';
  static const _kCashuSeed = 'wf_cashu_seed_v1';
  static const _kCashuMints = 'wf_cashu_mints_v1';
  // Legacy v1 keys for seamless migration.
  static const _kLegacyMode = 'wf_auth_mode';
  static const _kLegacyNsec = 'wf_auth_nsec';
  static const _kLegacyBunkerUri = 'wf_auth_bunker_uri';
  static const _kLegacyBunkerAppNsec = 'wf_auth_bunker_app_nsec';
  static const _kLegacyAmberPubkey = 'wf_auth_amber_pubkey';
  static const _kLegacyAmberPackage = 'wf_auth_amber_package';

  final FlutterSecureStorage _storage;

  Future<StoredSessionVault> readVault() async {
    try {
      final raw = await _storage.read(key: _kVault);
      if (raw != null && raw.isNotEmpty) {
        final decoded = jsonDecode(raw);
        if (decoded is Map<String, dynamic>) {
          final active = decoded['activePubkey'] as String?;
          final list = (decoded['accounts'] as List<dynamic>? ?? const [])
              .whereType<Map<String, dynamic>>()
              .map(StoredAuthCredentials.fromJson)
              .whereType<StoredAuthCredentials>()
              .toList();
          return StoredSessionVault(activePubkey: active, accounts: list);
        }
      }

      // Migrate legacy v1 single-account storage if present.
      final legacyMode = await _storage.read(key: _kLegacyMode);
      if (legacyMode != null) {
        StoredAuthCredentials? migrated;
        if (legacyMode == 'localKey') {
          final nsec = await _storage.read(key: _kLegacyNsec);
          if (nsec != null && nsec.isNotEmpty) {
            migrated = StoredAuthCredentials(
              pubkey: 'legacy-local',
              npub: 'legacy-local',
              mode: StoredAuthMode.localKey,
              nsec: nsec,
            );
          }
        } else if (legacyMode == 'bunker') {
          final uri = await _storage.read(key: _kLegacyBunkerUri);
          final appNsec = await _storage.read(key: _kLegacyBunkerAppNsec);
          if (uri != null && uri.isNotEmpty) {
            migrated = StoredAuthCredentials(
              pubkey: 'legacy-bunker',
              npub: 'legacy-bunker',
              mode: StoredAuthMode.bunker,
              bunkerUri: uri,
              bunkerAppNsec: appNsec,
            );
          }
        } else if (legacyMode == 'amber') {
          final pk = await _storage.read(key: _kLegacyAmberPubkey);
          final pkg = await _storage.read(key: _kLegacyAmberPackage);
          if (pk != null && pk.isNotEmpty) {
            migrated = StoredAuthCredentials(
              pubkey: pk,
              npub: pk,
              mode: StoredAuthMode.amber,
              amberPackage: pkg,
            );
          }
        }
        if (migrated != null) {
          return StoredSessionVault(
            activePubkey: migrated.pubkey,
            accounts: [migrated],
          );
        }
      }
    } catch (_) {}
    return const StoredSessionVault();
  }

  Future<void> _writeVault(StoredSessionVault vault) async {
    final encoded = jsonEncode({
      'activePubkey': vault.activePubkey,
      'accounts': vault.accounts.map((a) => a.toJson()).toList(),
    });
    await _storage.write(key: _kVault, value: encoded);
  }

  Future<StoredSessionVault> upsertAndActivate(
    StoredAuthCredentials credentials,
  ) async {
    final current = await readVault();
    final filtered = current.accounts
        .where(
          (a) =>
              a.pubkey != credentials.pubkey &&
              !a.pubkey.startsWith('legacy-'),
        )
        .toList();
    filtered.insert(0, credentials);
    final next = StoredSessionVault(
      activePubkey: credentials.pubkey,
      accounts: filtered,
    );
    await _writeVault(next);
    return next;
  }

  Future<StoredSessionVault> setActivePubkey(String? pubkey) async {
    final current = await readVault();
    final next = StoredSessionVault(
      activePubkey: pubkey,
      accounts: current.accounts,
    );
    await _writeVault(next);
    return next;
  }

  Future<StoredSessionVault> removeAccount(String pubkey) async {
    final current = await readVault();
    final remaining =
        current.accounts.where((a) => a.pubkey != pubkey).toList();
    final nextActive = current.activePubkey == pubkey
        ? (remaining.isNotEmpty ? remaining.first.pubkey : null)
        : current.activePubkey;
    final next = StoredSessionVault(
      activePubkey: nextActive,
      accounts: remaining,
    );
    await _writeVault(next);
    return next;
  }

  Future<String?> readNwcUri() async {
    try {
      final raw = await _storage.read(key: _kNwcUri);
      if (raw != null && raw.trim().isNotEmpty) return raw.trim();
    } catch (_) {}
    return null;
  }

  Future<void> saveNwcUri(String? uri) async {
    try {
      final cleaned = uri?.trim();
      if (cleaned == null || cleaned.isEmpty) {
        await _storage.delete(key: _kNwcUri);
      } else {
        await _storage.write(key: _kNwcUri, value: cleaned);
      }
    } catch (_) {}
  }

  /// Reads the persisted 32-byte hex Cashu wallet seed, or generates and stores one securely.
  Future<String> readOrCreateCashuSeed() async {
    try {
      final existing = await _storage.read(key: _kCashuSeed);
      if (existing != null && existing.trim().length >= 32) {
        return existing.trim();
      }
    } catch (_) {}

    final rng = Random.secure();
    final bytes = List<int>.generate(32, (_) => rng.nextInt(256));
    final hex = bytes.map((b) => b.toRadixString(16).padLeft(2, '0')).join();
    try {
      await _storage.write(key: _kCashuSeed, value: hex);
    } catch (_) {}
    return hex;
  }

  Future<List<String>> readCashuMints() async {
    try {
      final raw = await _storage.read(key: _kCashuMints);
      if (raw != null && raw.isNotEmpty) {
        final decoded = jsonDecode(raw);
        if (decoded is List) {
          return decoded.whereType<String>().where((s) => s.startsWith('http')).toList();
        }
      }
    } catch (_) {}
    return const [];
  }

  Future<void> saveCashuMints(List<String> mints) async {
    try {
      final cleaned = mints.map((m) => m.trim()).where((m) => m.startsWith('http')).toSet().toList();
      await _storage.write(key: _kCashuMints, value: jsonEncode(cleaned));
    } catch (_) {}
  }

  Future<void> clearAll() async {
    try {
      await _storage.delete(key: _kVault);
      await _storage.delete(key: _kNwcUri);
      await _storage.delete(key: _kLegacyMode);
      await _storage.delete(key: _kLegacyNsec);
      await _storage.delete(key: _kLegacyBunkerUri);
      await _storage.delete(key: _kLegacyBunkerAppNsec);
      await _storage.delete(key: _kLegacyAmberPubkey);
      await _storage.delete(key: _kLegacyAmberPackage);
    } catch (_) {}
  }
}
