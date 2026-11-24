import 'dart:async';
import 'dart:io';

import 'package:flutter/foundation.dart';
import 'package:path_provider/path_provider.dart';

import '../../../../data/repositories/auth_repository.dart';
import '../../../../data/services/secure_auth_storage.dart';
import '../../../../data/services/wavefunc_backend.dart';
import '../../../../domain/models/social.dart';

/// MVVM ViewModel for multi-account Nostr sessions, signers, and NIP-38 status.
class AuthViewModel extends ChangeNotifier {
  AuthViewModel({required this._authRepository}) {
    _nip38Enabled = _authRepository.nip38StatusEnabled;
  }

  /// Whether this OS supports Android NIP-55 Amber intent signing.
  static bool get supportsAmberPlatform => !kIsWeb && Platform.isAndroid;

  /// Whether `nostrconnect://` deep links can launch a local mobile signer app.
  static bool get supportsMobileSignerDeepLink =>
      !kIsWeb && (Platform.isAndroid || Platform.isIOS);

  /// Distinct platform-scoped NIP-46 client label shown in Amber / bunker app lists
  /// (mirrors `src/lib/nostr/nip46.ts`).
  static String get nip46ClientName {
    final platform = kIsWeb
        ? 'Web'
        : Platform.isMacOS
            ? 'macOS'
            : Platform.isAndroid
                ? 'Android'
                : Platform.isIOS
                    ? 'iOS'
                    : Platform.isLinux
                        ? 'Linux'
                        : Platform.isWindows
                            ? 'Windows'
                            : 'App';
    final appName = kReleaseMode ? 'Wavefunc Radio' : 'Wavefunc Radio DEV';
    return '$appName · $platform';
  }

  static String get platformKeystoreLabel {
    if (kIsWeb) return 'browser storage';
    if (Platform.isMacOS) return 'macOS Keychain';
    if (Platform.isIOS) return 'iOS Keychain';
    if (Platform.isAndroid) return 'Android Keystore';
    if (Platform.isLinux) return 'Linux Secret Service';
    if (Platform.isWindows) return 'Windows Credential Manager';
    return 'system keychain';
  }

  final AuthRepository _authRepository;

  AccountSession? _session;
  NwcWalletStatus _nwcStatus = const NwcWalletStatus();
  CashuWalletStatus _cashuStatus = const CashuWalletStatus();
  bool _isAmberAvailable = false;
  bool _isBusy = false;
  bool _isWalletBusy = false;
  bool _nip38Enabled = false;
  String? _errorMessage;
  GeneratedAccount? _lastGeneratedAccount;

  AccountSession? get session => _session;
  NwcWalletStatus get nwcStatus => _nwcStatus;
  CashuWalletStatus get cashuStatus => _cashuStatus;
  bool get isCashuReady => _cashuStatus.initialized;
  int get cashuBalanceSats => _cashuStatus.totalBalanceSats;
  bool get isNwcConnected => _nwcStatus.connected;
  List<StoredAuthCredentials> get savedAccounts =>
      _authRepository.savedAccounts;
  bool get isLoggedIn => _session != null;
  bool get supportsSigning => _authRepository.supportsSigning;
  bool get isAmberAvailable => _isAmberAvailable;
  bool get isBusy => _isBusy;
  bool get isWalletBusy => _isWalletBusy;
  bool get nip38Enabled => _nip38Enabled;
  bool get hasCompletedOnboarding => _authRepository.hasCompletedOnboarding;
  String? get errorMessage => _errorMessage;
  GeneratedAccount? get lastGeneratedAccount => _lastGeneratedAccount;

  Future<void> markOnboardingCompleted() async {
    await _authRepository.setOnboardingCompleted(true);
    notifyListeners();
  }

  Future<GeneratedAccount?> generateKeypairDraft() =>
      _runAuth(() => _authRepository.generateAccount());

  Future<bool> publishProfile({
    String? name,
    String? about,
    String? picture,
    String? lud16,
  }) async {
    final res = await _runAuth(() async {
      final updated = await _authRepository.publishProfile(
        name: name,
        about: about,
        picture: picture,
        lud16: lud16,
      );
      if (updated != null) _session = updated;
      return true;
    });
    return res ?? false;
  }

  Future<void> initialize() async {
    _isAmberAvailable =
        supportsAmberPlatform && await _authRepository.isAmberAvailable();
    _session = await _authRepository.restoreSession();
    _nwcStatus = await _authRepository.restoreNwc();
    notifyListeners();
    // Cashu wallet opens asynchronously (mint keyset fetches may be slow).
    unawaited(_restoreCashu());
  }

  Future<void> _restoreCashu() async {
    try {
      final dir = await getApplicationSupportDirectory();
      await initCashuAt('${dir.path}${Platform.pathSeparator}cashu');
    } catch (_) {
      _cashuStatus = const CashuWalletStatus();
      notifyListeners();
    }
  }

  /// Opens the embedded Cashu wallet stored in [dbDir].
  Future<void> initCashuAt(String dbDir) async {
    _cashuStatus = await _authRepository.restoreCashu(dbDir);
    notifyListeners();
  }

  Future<GeneratedAccount?> generateAndLogin() async {
    return _runAuth(() async {
      final generated = await _authRepository.generateAccount();
      _lastGeneratedAccount = generated;
      _session = await _authRepository.loginWithNsec(generated.nsec);
      return generated;
    });
  }

  Future<bool> loginWithNsec(String secret) async {
    final res = await _runAuth(() async {
      _lastGeneratedAccount = null;
      _session = await _authRepository.loginWithNsec(secret);
      return true;
    });
    return res ?? false;
  }

  Future<bool> loginWithBunker(String bunkerUri) async {
    final res = await _runAuth(() async {
      _lastGeneratedAccount = null;
      _session = await _authRepository.loginWithBunker(bunkerUri);
      return true;
    });
    return res ?? false;
  }

  Future<NostrConnectChallenge?> startNostrConnect({
    String? relayUrl,
    String? clientName,
  }) async {
    return _runAuth(
      () => _authRepository.startNostrConnect(
        relayUrl: relayUrl,
        clientName: clientName ?? nip46ClientName,
      ),
    );
  }

  Future<bool> awaitNostrConnect(String sessionId) async {
    final res = await _runAuth(() async {
      _lastGeneratedAccount = null;
      _session = await _authRepository.awaitNostrConnect(sessionId);
      return true;
    });
    return res ?? false;
  }

  Future<void> cancelNostrConnect(String sessionId) =>
      _authRepository.cancelNostrConnect(sessionId);

  Future<bool> loginWithAmber() async {
    final res = await _runAuth(() async {
      _lastGeneratedAccount = null;
      _session = await _authRepository.loginWithAmber();
      return true;
    });
    return res ?? false;
  }

  Future<bool> switchAccount(String pubkey) async {
    final res = await _runAuth(() async {
      _session = await _authRepository.switchAccount(pubkey);
      return true;
    });
    return res ?? false;
  }

  Future<void> removeAccount(String pubkey) async {
    await _runAuth(() async {
      _session = await _authRepository.removeAccount(pubkey);
    });
  }

  Future<void> logout() async {
    await _runAuth(() async {
      await _authRepository.logout();
      _session = null;
      _lastGeneratedAccount = null;
    });
  }

  Future<void> setNip38Enabled(bool enabled) async {
    _nip38Enabled = enabled;
    await _authRepository.setNip38StatusEnabled(enabled);
    notifyListeners();
  }

  Future<ActionOutcome> executeSignedAction(
    Future<ActionOutcome> Function(WavefuncBackend backend) operation,
  ) {
    return _authRepository.completeAction(operation);
  }

  Future<bool> connectNwc(String nwcUri) async {
    _isWalletBusy = true;
    _errorMessage = null;
    notifyListeners();
    try {
      _nwcStatus = await _authRepository.connectNwc(nwcUri);
      return true;
    } catch (e) {
      _errorMessage = e.toString().replaceFirst('Exception: ', '');
      return false;
    } finally {
      _isWalletBusy = false;
      notifyListeners();
    }
  }

  Future<void> disconnectNwc() async {
    _isWalletBusy = true;
    notifyListeners();
    try {
      await _authRepository.disconnectNwc();
      _nwcStatus = const NwcWalletStatus();
    } finally {
      _isWalletBusy = false;
      notifyListeners();
    }
  }

  Future<void> refreshNwcBalance() async {
    if (!_nwcStatus.connected) return;
    _isWalletBusy = true;
    notifyListeners();
    try {
      _nwcStatus = await _authRepository.refreshNwcBalance();
    } catch (_) {
      // Keep last known status if balance check times out.
    } finally {
      _isWalletBusy = false;
      notifyListeners();
    }
  }

  Future<ZapInvoiceResult> prepareStationZap({
    required String stationPubkey,
    required String stationAddress,
    required int amountSats,
    String? comment,
  }) {
    return _authRepository.prepareStationZap(
      stationPubkey: stationPubkey,
      stationAddress: stationAddress,
      amountSats: amountSats,
      comment: comment,
    );
  }

  Future<ZapPaymentResult> payInvoiceNwc({
    required String bolt11,
    required int amountSats,
  }) async {
    final res = await _authRepository.payInvoiceNwc(
      bolt11: bolt11,
      amountSats: amountSats,
    );
    _nwcStatus = _authRepository.nwcStatus;
    notifyListeners();
    return res;
  }

  Future<bool> checkStationZapReceipt({
    required String stationAddress,
    required String bolt11,
    required int sinceUnix,
  }) =>
      _authRepository.checkStationZapReceipt(
        stationAddress: stationAddress,
        bolt11: bolt11,
        sinceUnix: sinceUnix,
      );

  // ── Cashu ecash wallet ────────────────────────────────────────────────────

  Future<void> refreshCashu() async {
    if (!_cashuStatus.initialized) {
      await _restoreCashu();
      return;
    }
    try {
      _cashuStatus = await _authRepository.refreshCashu();
      notifyListeners();
    } catch (_) {}
  }

  Future<T> _runWallet<T>(Future<T> Function() fn) async {
    _isWalletBusy = true;
    notifyListeners();
    try {
      final res = await fn();
      _cashuStatus = _authRepository.cashuStatus;
      return res;
    } finally {
      _isWalletBusy = false;
      notifyListeners();
    }
  }

  Future<CashuWalletStatus> addCashuMint(String mintUrl) =>
      _runWallet(() => _authRepository.addCashuMint(mintUrl));

  Future<CashuMintQuoteInfo> createCashuMintQuote({
    required String mintUrl,
    required int amountSats,
  }) =>
      _runWallet(
        () => _authRepository.createCashuMintQuote(
          mintUrl: mintUrl,
          amountSats: amountSats,
        ),
      );

  /// Claim without toggling the busy flag (used by background polling).
  Future<CashuWalletStatus> claimCashuMintQuote({
    required String mintUrl,
    required String quoteId,
  }) async {
    final status = await _authRepository.claimCashuMintQuote(
      mintUrl: mintUrl,
      quoteId: quoteId,
    );
    _cashuStatus = status;
    notifyListeners();
    return status;
  }

  Future<CashuReceiveResult> receiveCashuToken(String token) =>
      _runWallet(() => _authRepository.receiveCashuToken(token));

  Future<CashuSendResult> sendCashuToken({
    String? mintUrl,
    required int amountSats,
    String? memo,
  }) =>
      _runWallet(
        () => _authRepository.sendCashuToken(
          mintUrl: mintUrl,
          amountSats: amountSats,
          memo: memo,
        ),
      );

  Future<ZapPaymentResult> payInvoiceCashu({
    String? mintUrl,
    required String bolt11,
    required int amountSats,
  }) =>
      _runWallet(
        () => _authRepository.payInvoiceCashu(
          mintUrl: mintUrl,
          bolt11: bolt11,
          amountSats: amountSats,
        ),
      );

  Future<RecipientNutzapInfo?> fetchRecipientNutzapInfo(String pubkeyHex) =>
      _authRepository.fetchRecipientNutzapInfo(pubkeyHex);

  Future<ActionOutcome> sendStationNutzap({
    required String stationEventId,
    required String stationPubkey,
    required String stationAddress,
    required int amountSats,
    String? comment,
  }) =>
      _runWallet(
        () => _authRepository.sendStationNutzap(
          stationEventId: stationEventId,
          stationPubkey: stationPubkey,
          stationAddress: stationAddress,
          amountSats: amountSats,
          comment: comment,
        ),
      );

  void clearError() {
    _errorMessage = null;
    notifyListeners();
  }

  Future<T?> _runAuth<T>(Future<T> Function() fn) async {
    _isBusy = true;
    _errorMessage = null;
    notifyListeners();
    try {
      return await fn();
    } catch (e) {
      _errorMessage = e.toString().replaceFirst('Exception: ', '');
      return null;
    } finally {
      _isBusy = false;
      notifyListeners();
    }
  }
}
