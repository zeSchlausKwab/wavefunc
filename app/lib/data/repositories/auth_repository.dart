import '../../domain/models/social.dart';
import '../services/amber_signer_service.dart';
import '../services/preferences_service.dart';
import '../services/secure_auth_storage.dart';
import '../services/wavefunc_backend.dart';

/// Coordinates multi-account Nostr sessions (local nsec, NIP-46 Bunker / QR,
/// NIP-55 Amber), encrypted Keystore/Keychain vault persistence, and transparent
/// external Amber signing.
class AuthRepository {
  AuthRepository({
    required this._backend,
    required this._storage,
    required this._amber,
    required this._preferences,
  });

  final WavefuncBackend _backend;
  final SecureAuthStorage _storage;
  final AmberSignerService _amber;
  final PreferencesService _preferences;

  AccountSession? _session;
  List<StoredAuthCredentials> _savedAccounts = const [];
  NwcWalletStatus _nwcStatus = const NwcWalletStatus();

  AccountSession? get session => _session;
  List<StoredAuthCredentials> get savedAccounts => _savedAccounts;
  NwcWalletStatus get nwcStatus => _nwcStatus;
  bool get supportsSigning => _backend.supportsSigning;
  bool get nip38StatusEnabled => _preferences.nip38StatusEnabled;
  bool get hasCompletedOnboarding => _preferences.hasCompletedOnboarding;

  Future<void> setNip38StatusEnabled(bool enabled) =>
      _preferences.setNip38StatusEnabled(enabled);

  Future<void> setOnboardingCompleted(bool completed) =>
      _preferences.setOnboardingCompleted(completed);

  Future<bool> isAmberAvailable() => _amber.isAvailable();

  /// Restore previously active Nostr session and list of saved accounts.
  Future<AccountSession?> restoreSession() async {
    final vault = await _storage.readVault();
    _savedAccounts = vault.accounts;
    if (!_backend.supportsSigning) return null;

    final active = vault.activeAccount;
    if (active == null) return null;
    try {
      return await _activateCredentials(active);
    } catch (_) {
      return null;
    }
  }

  Future<AccountSession> _activateCredentials(
    StoredAuthCredentials creds,
  ) async {
    switch (creds.mode) {
      case StoredAuthMode.localKey:
        final session = await _backend.loginWithNsec(creds.nsec!);
        final vault = await _storage.upsertAndActivate(
          StoredAuthCredentials(
            pubkey: session.pubkey,
            npub: session.npub,
            mode: StoredAuthMode.localKey,
            label: session.displayName,
            nsec: creds.nsec,
          ),
        );
        _savedAccounts = vault.accounts;
        _session = session;
        return session;

      case StoredAuthMode.bunker:
        final res = await _backend.loginWithBunker(
          creds.bunkerUri!,
          appNsec: creds.bunkerAppNsec,
        );
        final vault = await _storage.upsertAndActivate(
          StoredAuthCredentials(
            pubkey: res.session.pubkey,
            npub: res.session.npub,
            mode: StoredAuthMode.bunker,
            label: res.session.displayName,
            bunkerUri: res.bunkerUri,
            bunkerAppNsec: res.appNsec,
          ),
        );
        _savedAccounts = vault.accounts;
        _session = res.session;
        return res.session;

      case StoredAuthMode.amber:
        final base = await _backend.loginWithAmber(creds.pubkey);
        final session = AccountSession(
          pubkey: base.pubkey,
          npub: base.npub,
          signerKind: base.signerKind,
          profile: base.profile,
          amberPackage: creds.amberPackage,
        );
        final vault = await _storage.upsertAndActivate(
          StoredAuthCredentials(
            pubkey: session.pubkey,
            npub: session.npub,
            mode: StoredAuthMode.amber,
            label: session.displayName,
            amberPackage: creds.amberPackage,
          ),
        );
        _savedAccounts = vault.accounts;
        _session = session;
        return session;
    }
  }

  Future<GeneratedAccount> generateAccount() => _backend.generateAccount();

  Future<AccountSession?> publishProfile({
    String? name,
    String? about,
    String? picture,
    String? lud16,
  }) async {
    await completeAction(
      (backend) => backend.publishProfile(
        name: name,
        about: about,
        picture: picture,
        lud16: lud16,
      ),
    );
    final updated = await _backend.currentAccount();
    if (updated != null) {
      _session = AccountSession(
        pubkey: updated.pubkey,
        npub: updated.npub,
        signerKind: updated.signerKind,
        profile: updated.profile,
        amberPackage: _session?.amberPackage,
      );
      // Update cached display label in encrypted vault too.
      final vault = await _storage.readVault();
      final match =
          vault.accounts.where((a) => a.pubkey == updated.pubkey).firstOrNull;
      if (match != null) {
        final nextVault = await _storage.upsertAndActivate(
          StoredAuthCredentials(
            pubkey: match.pubkey,
            npub: match.npub,
            mode: match.mode,
            label: _session!.displayName,
            nsec: match.nsec,
            bunkerUri: match.bunkerUri,
            bunkerAppNsec: match.bunkerAppNsec,
            amberPackage: match.amberPackage,
          ),
        );
        _savedAccounts = nextVault.accounts;
      }
    }
    return _session;
  }

  Future<AccountSession> loginWithNsec(String secret) async {
    final trimmed = secret.trim();
    final session = await _backend.loginWithNsec(trimmed);
    final vault = await _storage.upsertAndActivate(
      StoredAuthCredentials(
        pubkey: session.pubkey,
        npub: session.npub,
        mode: StoredAuthMode.localKey,
        label: session.displayName,
        nsec: trimmed,
      ),
    );
    _savedAccounts = vault.accounts;
    _session = session;
    return session;
  }

  Future<AccountSession> loginWithBunker(String bunkerUri) async {
    final res = await _backend.loginWithBunker(bunkerUri.trim());
    final vault = await _storage.upsertAndActivate(
      StoredAuthCredentials(
        pubkey: res.session.pubkey,
        npub: res.session.npub,
        mode: StoredAuthMode.bunker,
        label: res.session.displayName,
        bunkerUri: res.bunkerUri,
        bunkerAppNsec: res.appNsec,
      ),
    );
    _savedAccounts = vault.accounts;
    _session = res.session;
    return res.session;
  }

  Future<NostrConnectChallenge> startNostrConnect({
    String? relayUrl,
    String? clientName,
  }) =>
      _backend.startNostrConnectSession(
        relayUrl: relayUrl,
        clientName: clientName,
      );

  Future<AccountSession> awaitNostrConnect(String sessionId) async {
    final res = await _backend.awaitNostrConnectSession(sessionId);
    final vault = await _storage.upsertAndActivate(
      StoredAuthCredentials(
        pubkey: res.session.pubkey,
        npub: res.session.npub,
        mode: StoredAuthMode.bunker,
        label: res.session.displayName,
        bunkerUri: res.bunkerUri,
        bunkerAppNsec: res.appNsec,
      ),
    );
    _savedAccounts = vault.accounts;
    _session = res.session;
    return res.session;
  }

  Future<void> cancelNostrConnect(String sessionId) =>
      _backend.cancelNostrConnectSession(sessionId);

  Future<AccountSession> loginWithAmber() async {
    final amberKey = await _amber.getPublicKey();
    final base = await _backend.loginWithAmber(amberKey.pubkey);
    final session = AccountSession(
      pubkey: base.pubkey,
      npub: base.npub,
      signerKind: base.signerKind,
      profile: base.profile,
      amberPackage: amberKey.signerPackage,
    );
    final vault = await _storage.upsertAndActivate(
      StoredAuthCredentials(
        pubkey: session.pubkey,
        npub: session.npub,
        mode: StoredAuthMode.amber,
        label: session.displayName,
        amberPackage: amberKey.signerPackage,
      ),
    );
    _savedAccounts = vault.accounts;
    _session = session;
    return session;
  }

  Future<AccountSession> switchAccount(String pubkey) async {
    final vault = await _storage.readVault();
    final target = vault.accounts.firstWhere(
      (a) => a.pubkey == pubkey,
      orElse: () => throw StateError('Saved account not found.'),
    );
    return _activateCredentials(target);
  }

  Future<AccountSession?> removeAccount(String pubkey) async {
    final wasActive = _session?.pubkey == pubkey;
    final vault = await _storage.removeAccount(pubkey);
    _savedAccounts = vault.accounts;

    if (!wasActive) return _session;
    await _backend.logoutAccount();
    _session = null;
    final next = vault.activeAccount;
    if (next != null) {
      return _activateCredentials(next);
    }
    return null;
  }

  Future<void> logout() async {
    await _backend.logoutAccount();
    final vault = await _storage.setActivePubkey(null);
    _savedAccounts = vault.accounts;
    _session = null;
  }

  Future<ActionOutcome> completeAction(
    Future<ActionOutcome> Function(WavefuncBackend backend) operation,
  ) async {
    final outcome = await operation(_backend);
    if (outcome.published) return outcome;

    final unsignedJson = outcome.unsignedEventJson;
    if (unsignedJson == null || unsignedJson.isEmpty) {
      throw StateError('Signer did not publish or return an unsigned event.');
    }

    final signedJson = await _amber.signEvent(
      unsignedEventJson: unsignedJson,
      currentUser: _session?.pubkey,
      signerPackage: _session?.amberPackage,
    );
    final published = await _backend.publishSignedEvent(signedJson);
    return ActionOutcome(
      published: published.published,
      eventId: published.eventId,
      targetAddress: outcome.targetAddress ?? published.targetAddress,
    );
  }

  // ── NWC (NIP-47) Wallet & NIP-57 Lightning Zaps ───────────────────────────

  Future<NwcWalletStatus> restoreNwc() async {
    if (!_backend.supportsSigning) return const NwcWalletStatus();
    final savedUri = await _storage.readNwcUri();
    if (savedUri == null || savedUri.isEmpty) {
      _nwcStatus = const NwcWalletStatus();
      return _nwcStatus;
    }
    try {
      _nwcStatus = await _backend.connectNwc(savedUri);
    } catch (_) {
      _nwcStatus = const NwcWalletStatus();
    }
    return _nwcStatus;
  }

  Future<NwcWalletStatus> connectNwc(String nwcUri) async {
    final trimmed = nwcUri.trim();
    final status = await _backend.connectNwc(trimmed);
    await _storage.saveNwcUri(trimmed);
    _nwcStatus = status;
    return status;
  }

  Future<void> disconnectNwc() async {
    await _backend.disconnectNwc();
    await _storage.saveNwcUri(null);
    _nwcStatus = const NwcWalletStatus();
  }

  Future<NwcWalletStatus> refreshNwcBalance() async {
    _nwcStatus = await _backend.refreshNwcBalance();
    return _nwcStatus;
  }

  Future<ZapInvoiceResult> prepareStationZap({
    required String stationPubkey,
    required String stationAddress,
    required int amountSats,
    String? comment,
  }) async {
    final first = await _backend.prepareStationZap(
      stationPubkey: stationPubkey,
      stationAddress: stationAddress,
      amountSats: amountSats,
      comment: comment,
    );
    if (first.bolt11 != null && first.bolt11!.isNotEmpty) {
      return first;
    }

    final unsignedZap = first.unsignedZapRequestJson;
    if (unsignedZap == null || unsignedZap.isEmpty) {
      throw StateError('Unable to prepare Lightning invoice.');
    }

    // Transparently sign NIP-57 kind 9734 via Android NIP-55 Amber.
    final signedZap = await _amber.signEvent(
      unsignedEventJson: unsignedZap,
      currentUser: _session?.pubkey,
      signerPackage: _session?.amberPackage,
    );
    return _backend.completeStationZapWithSignedRequest(
      callbackUrl: first.callbackUrl,
      amountSats: amountSats,
      comment: comment,
      signedZapRequestJson: signedZap,
      recipientLud16: first.recipientLud16,
    );
  }

  Future<ZapPaymentResult> payInvoiceNwc({
    required String bolt11,
    required int amountSats,
  }) async {
    final result = await _backend.payInvoiceNwc(
      bolt11: bolt11,
      amountSats: amountSats,
    );
    _nwcStatus = await _backend.getNwcStatus();
    return result;
  }

  Future<bool> checkStationZapReceipt({
    required String stationAddress,
    required String bolt11,
    required int sinceUnix,
  }) async {
    try {
      return await _backend.checkStationZapReceipt(
        stationAddress: stationAddress,
        bolt11: bolt11,
        sinceUnix: sinceUnix,
      );
    } catch (_) {
      return false;
    }
  }

  // ── Embedded Cashu Ecash Wallet (CDK) & NIP-61 Nutzaps ────────────────────

  CashuWalletStatus _cashuStatus = const CashuWalletStatus();
  CashuWalletStatus get cashuStatus => _cashuStatus;

  /// Open (or create) the on-device Cashu wallet at [dbDir] using a securely
  /// persisted random seed from the platform keystore.
  Future<CashuWalletStatus> restoreCashu(String dbDir) async {
    if (!_backend.supportsSigning) return const CashuWalletStatus();
    try {
      final seed = await _storage.readOrCreateCashuSeed();
      final mints = await _storage.readCashuMints();
      _cashuStatus = await _backend.initCashuWallet(
        dbDir: dbDir,
        seedMaterial: seed,
        mints: mints,
      );
    } catch (_) {
      _cashuStatus = const CashuWalletStatus();
    }
    return _cashuStatus;
  }

  Future<CashuWalletStatus> refreshCashu() async {
    _cashuStatus = await _backend.getCashuStatus();
    return _cashuStatus;
  }

  Future<CashuWalletStatus> addCashuMint(String mintUrl) async {
    _cashuStatus = await _backend.addCashuMint(mintUrl.trim());
    await _storage.saveCashuMints(
      _cashuStatus.mints.map((m) => m.mintUrl).toList(),
    );
    return _cashuStatus;
  }

  Future<CashuMintQuoteInfo> createCashuMintQuote({
    required String mintUrl,
    required int amountSats,
  }) =>
      _backend.createCashuMintQuote(mintUrl: mintUrl, amountSats: amountSats);

  Future<CashuWalletStatus> claimCashuMintQuote({
    required String mintUrl,
    required String quoteId,
  }) async {
    _cashuStatus = await _backend.claimCashuMintQuote(
      mintUrl: mintUrl,
      quoteId: quoteId,
    );
    return _cashuStatus;
  }

  Future<CashuReceiveResult> receiveCashuToken(String token) async {
    final res = await _backend.receiveCashuToken(token.trim());
    _cashuStatus = res.status;
    await _storage.saveCashuMints(
      _cashuStatus.mints.map((m) => m.mintUrl).toList(),
    );
    return res;
  }

  Future<CashuSendResult> sendCashuToken({
    String? mintUrl,
    required int amountSats,
    String? memo,
  }) async {
    final res = await _backend.sendCashuToken(
      mintUrl: mintUrl,
      amountSats: amountSats,
      memo: memo,
    );
    _cashuStatus = res.status;
    return res;
  }

  Future<ZapPaymentResult> payInvoiceCashu({
    String? mintUrl,
    required String bolt11,
    required int amountSats,
  }) async {
    final res = await _backend.payInvoiceCashu(
      mintUrl: mintUrl,
      bolt11: bolt11,
      amountSats: amountSats,
    );
    _cashuStatus = await _backend.getCashuStatus();
    return res;
  }

  Future<RecipientNutzapInfo?> fetchRecipientNutzapInfo(String pubkeyHex) async {
    try {
      return await _backend.fetchRecipientNutzapInfo(pubkeyHex);
    } catch (_) {
      return null;
    }
  }

  /// Send a P2PK-locked NIP-61 nutzap; signs via Amber transparently when needed.
  Future<ActionOutcome> sendStationNutzap({
    required String stationEventId,
    required String stationPubkey,
    required String stationAddress,
    required int amountSats,
    String? comment,
  }) async {
    final outcome = await completeAction(
      (backend) => backend.sendStationNutzap(
        stationEventId: stationEventId,
        stationPubkey: stationPubkey,
        stationAddress: stationAddress,
        amountSats: amountSats,
        comment: comment,
      ),
    );
    _cashuStatus = await _backend.getCashuStatus();
    return outcome;
  }
}
