import 'dart:async';

import 'package:flutter/services.dart';
import 'package:material_ui/material_ui.dart';
import 'package:qr_flutter/qr_flutter.dart';

import '../../../../domain/models/social.dart';
import '../../../core/theme/sonic_machine_theme.dart';
import '../../../core/widgets/sonic_plate.dart';
import '../../../core/widgets/station_thumbnail.dart';
import '../view_models/auth_view_model.dart';

enum _OnboardingStep { welcome, keys, profile, ready }

/// Guided 3-step Constructivist onboarding wizard for new Nostr / WaveFunc users
/// (mirrors `src/components/SignupDialog.tsx` with native OS Keychain/Keystore backup
/// and live kind-0 profile publishing).
class OnboardingFlow extends StatefulWidget {
  const OnboardingFlow({
    super.key,
    required this.authViewModel,
    required this.onCompleted,
    required this.onOpenExistingLogin,
    required this.onSelectGenreAndFinish,
    this.isDialog = false,
    this.startAtKeyCreation = false,
  });

  final AuthViewModel authViewModel;
  final VoidCallback onCompleted;
  final VoidCallback onOpenExistingLogin;
  final ValueChanged<String> onSelectGenreAndFinish;
  final bool isDialog;
  final bool startAtKeyCreation;

  @override
  State<OnboardingFlow> createState() => _OnboardingFlowState();
}

class _OnboardingFlowState extends State<OnboardingFlow> {
  late _OnboardingStep _step;
  GeneratedAccount? _draft;
  bool _nsecCopied = false;
  bool _npubCopied = false;
  bool _showQrBackup = false;
  bool _keyConfirmed = false;
  bool _busy = false;
  String? _error;

  final _nameController = TextEditingController();
  final _aboutController = TextEditingController();
  final _pictureController = TextEditingController();
  final _lud16Controller = TextEditingController();

  static const _starterGenres = [
    'electronic',
    'ambient',
    'jazz',
    'techno',
    'rock',
    'hip-hop',
    'classical',
    'lo-fi',
  ];

  @override
  void initState() {
    super.initState();
    _step = widget.startAtKeyCreation
        ? _OnboardingStep.keys
        : _OnboardingStep.welcome;
    if (_step == _OnboardingStep.keys) {
      unawaited(_generateDraft());
    }
  }

  @override
  void dispose() {
    _nameController.dispose();
    _aboutController.dispose();
    _pictureController.dispose();
    _lud16Controller.dispose();
    super.dispose();
  }

  Future<void> _generateDraft() async {
    setState(() {
      _busy = true;
      _error = null;
      _keyConfirmed = false;
      _nsecCopied = false;
      _npubCopied = false;
    });
    final gen = await widget.authViewModel.generateKeypairDraft();
    if (!mounted) return;
    setState(() {
      _draft = gen;
      _busy = false;
      if (gen == null) {
        _error = widget.authViewModel.errorMessage ??
            'Could not generate Nostr keypair.';
      }
    });
  }

  Future<void> _commitKeysAndAdvance() async {
    final draft = _draft;
    if (draft == null || !_keyConfirmed) return;
    setState(() {
      _busy = true;
      _error = null;
    });
    final ok = await widget.authViewModel.loginWithNsec(draft.nsec);
    if (!mounted) return;
    if (ok) {
      await widget.authViewModel.markOnboardingCompleted();
      setState(() {
        _busy = false;
        _step = _OnboardingStep.profile;
      });
    } else {
      setState(() {
        _busy = false;
        _error = widget.authViewModel.errorMessage ?? 'Could not save keypair.';
      });
    }
  }

  Future<void> _publishProfile({bool skip = false}) async {
    final name = _nameController.text.trim();
    final about = _aboutController.text.trim();
    final picture = _pictureController.text.trim();
    final lud16 = _lud16Controller.text.trim();

    if (skip ||
        (name.isEmpty && about.isEmpty && picture.isEmpty && lud16.isEmpty)) {
      setState(() => _step = _OnboardingStep.ready);
      return;
    }

    setState(() {
      _busy = true;
      _error = null;
    });
    final ok = await widget.authViewModel.publishProfile(
      name: name.isEmpty ? null : name,
      about: about.isEmpty ? null : about,
      picture: picture.isEmpty ? null : picture,
      lud16: lud16.isEmpty ? null : lud16,
    );
    if (!mounted) return;
    setState(() {
      _busy = false;
      if (!ok) {
        _error = widget.authViewModel.errorMessage ??
            'Profile publish failed — you can update it later.';
      }
      _step = _OnboardingStep.ready;
    });
  }

  Future<void> _skipAll() async {
    await widget.authViewModel.markOnboardingCompleted();
    if (!mounted) return;
    Navigator.of(context).pop();
    widget.onCompleted();
  }

  Future<void> _finish({String? genre}) async {
    await widget.authViewModel.markOnboardingCompleted();
    if (!mounted) return;
    Navigator.of(context).pop();
    if (genre != null) {
      widget.onSelectGenreAndFinish(genre);
    } else {
      widget.onCompleted();
    }
  }

  String get _headerKicker => switch (_step) {
        _OnboardingStep.welcome => 'WAVEFUNC // DECENTRALIZED RADIO',
        _OnboardingStep.keys => 'STEP 1 OF 3 — SAVE YOUR KEYS',
        _OnboardingStep.profile => 'STEP 2 OF 3 — OPTIONAL PROFILE',
        _OnboardingStep.ready => 'STEP 3 OF 3 — SIGNAL LOCKED',
      };

  String get _headerTitle => switch (_step) {
        _OnboardingStep.welcome => 'WELCOME TO THE SIGNAL',
        _OnboardingStep.keys => 'YOUR NOSTR IDENTITY',
        _OnboardingStep.profile => 'SET UP YOUR PROFILE',
        _OnboardingStep.ready => "YOU'RE ON NOSTR",
      };

  @override
  Widget build(BuildContext context) {
    final bottomInset =
        widget.isDialog ? 0.0 : MediaQuery.of(context).viewInsets.bottom;

    return Container(
      decoration: BoxDecoration(
        color: SonicColors.foundation,
        border: widget.isDialog
            ? Border.all(color: SonicColors.ink, width: 3)
            : const Border(top: BorderSide(color: SonicColors.ink, width: 3)),
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
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            mainAxisSize: MainAxisSize.min,
            children: [
              // ── Dark Constructivist Masthead ──
              Container(
                padding: const EdgeInsets.fromLTRB(18, 16, 18, 14),
                decoration: const BoxDecoration(
                  color: SonicColors.ink,
                  border: Border(
                    bottom: BorderSide(color: SonicColors.ink, width: 3),
                  ),
                ),
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    if (_step == _OnboardingStep.keys &&
                        !widget.startAtKeyCreation) ...[
                      InkWell(
                        onTap: () =>
                            setState(() => _step = _OnboardingStep.welcome),
                        child: Container(
                          width: 28,
                          height: 28,
                          margin: const EdgeInsets.only(right: 10, top: 2),
                          decoration: BoxDecoration(
                            color: SonicColors.thumbnailDark,
                            border: Border.all(
                              color: SonicColors.seamOutline,
                              width: 1.5,
                            ),
                          ),
                          alignment: Alignment.center,
                          child: const Icon(
                            Icons.arrow_back,
                            size: 16,
                            color: SonicColors.foundation,
                          ),
                        ),
                      ),
                    ],
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            _headerKicker,
                            style: SonicMachineTheme.labelTech(
                              fontSize: 9.5,
                              color: SonicColors.voltageCyan,
                              letterSpacing: 1.6,
                            ),
                          ),
                          const SizedBox(height: 3),
                          Text(
                            _headerTitle,
                            style: Theme.of(context)
                                .textTheme
                                .headlineSmall
                                ?.copyWith(
                                  color: SonicColors.foundation,
                                  fontWeight: FontWeight.w800,
                                ),
                          ),
                        ],
                      ),
                    ),
                    InkWell(
                      onTap: _skipAll,
                      child: Container(
                        width: 28,
                        height: 28,
                        decoration: BoxDecoration(
                          color: SonicColors.thumbnailDark,
                          border: Border.all(
                            color: SonicColors.seamOutline,
                            width: 1.5,
                          ),
                        ),
                        alignment: Alignment.center,
                        child: const Icon(
                          Icons.close,
                          size: 15,
                          color: SonicColors.foundation,
                        ),
                      ),
                    ),
                  ],
                ),
              ),

              // ── Step Content ──
              Padding(
                padding: const EdgeInsets.fromLTRB(18, 16, 18, 20),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    if (_error != null) ...[
                      SonicPlate(
                        backgroundColor: SonicColors.signalRed,
                        shadowOffset: const Offset(3, 3),
                        padding: const EdgeInsets.all(10),
                        child: Text(
                          _error!,
                          style: SonicMachineTheme.labelTech(
                            fontSize: 10,
                            color: SonicColors.onSignal,
                            letterSpacing: 0.4,
                          ),
                        ),
                      ),
                      const SizedBox(height: 12),
                    ],
                    switch (_step) {
                      _OnboardingStep.welcome => _buildWelcomeStep(context),
                      _OnboardingStep.keys => _buildKeysStep(context),
                      _OnboardingStep.profile => _buildProfileStep(context),
                      _OnboardingStep.ready => _buildReadyStep(context),
                    },
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildWelcomeStep(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Text(
          'WaveFunc is an open internet radio network built on Nostr — no corporate logins, no gatekeepers, and your favorites & song crate travel with your cryptographic identity.',
          style: Theme.of(context).textTheme.bodyMedium?.copyWith(height: 1.4),
        ),
        const SizedBox(height: 14),
        const _FeatureBullet(
          icon: Icons.sensors,
          title: 'GLOBAL LIVE STATIONS',
          detail: 'Stream thousands of independent stations with live track ID.',
        ),
        const SizedBox(height: 8),
        const _FeatureBullet(
          icon: Icons.bookmarks,
          title: 'SYNCED LISTS & SONG CRATE',
          detail: 'Save favorite stations & tracks across phone and desktop.',
        ),
        const SizedBox(height: 8),
        const _FeatureBullet(
          icon: Icons.bolt,
          title: 'ZAPS, LIKES & COMMENTS',
          detail: 'Support stations directly with Bitcoin Lightning & Nostr notes.',
        ),
        const SizedBox(height: 18),
        SonicPowerButton(
          label: 'Create Nostr Identity',
          icon: Icons.auto_awesome,
          onPressed: () {
            setState(() => _step = _OnboardingStep.keys);
            unawaited(_generateDraft());
          },
        ),
        const SizedBox(height: 10),
        SonicPowerButton(
          label: 'Sign In (Existing Nostr)',
          icon: Icons.key,
          primary: false,
          onPressed: () async {
            await widget.authViewModel.markOnboardingCompleted();
            if (!context.mounted) return;
            Navigator.of(context).pop();
            widget.onOpenExistingLogin();
          },
        ),
        const SizedBox(height: 10),
        Center(
          child: TextButton(
            onPressed: _skipAll,
            child: Text(
              'JUST LISTEN FOR NOW (SKIP)',
              style: SonicMachineTheme.labelTech(
                fontSize: 10,
                color: SonicColors.seamOutline,
                letterSpacing: 1.2,
              ),
            ),
          ),
        ),
      ],
    );
  }

  Widget _buildKeysStep(BuildContext context) {
    final draft = _draft;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Text(
          'Nostr accounts are cryptographic keypairs — no email or password. Save your private key (nsec) in a password manager before continuing.',
          style: Theme.of(context).textTheme.bodySmall?.copyWith(height: 1.4),
        ),
        const SizedBox(height: 14),
        // Private Key Box
        Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            Text(
              'PRIVATE KEY (NSEC) — NEVER SHARE',
              style: SonicMachineTheme.labelTech(
                fontSize: 9.5,
                color: SonicColors.signalRed,
              ),
            ),
            InkWell(
              onTap: _busy ? null : _generateDraft,
              child: Row(
                children: [
                  const Icon(Icons.refresh, size: 13),
                  const SizedBox(width: 3),
                  Text(
                    'REGEN',
                    style: SonicMachineTheme.labelTech(fontSize: 9),
                  ),
                ],
              ),
            ),
          ],
        ),
        const SizedBox(height: 6),
        Container(
          padding: const EdgeInsets.all(10),
          decoration: BoxDecoration(
            color: SonicColors.signalRed.withValues(alpha: 0.08),
            border: Border.all(color: SonicColors.signalRed, width: 2.5),
          ),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(
                child: SelectableText(
                  draft?.nsec ?? 'GENERATING...',
                  style: SonicMachineTheme.labelTech(
                    fontSize: 10,
                    letterSpacing: 0.2,
                  ),
                ),
              ),
              const SizedBox(width: 8),
              InkWell(
                onTap: draft == null
                    ? null
                    : () {
                        Clipboard.setData(ClipboardData(text: draft.nsec));
                        setState(() => _nsecCopied = true);
                      },
                child: Container(
                  padding: const EdgeInsets.all(6),
                  decoration: BoxDecoration(
                    color: SonicColors.foundation,
                    border: Border.all(color: SonicColors.ink, width: 1.5),
                  ),
                  child: Icon(
                    _nsecCopied ? Icons.check : Icons.copy,
                    size: 15,
                  ),
                ),
              ),
            ],
          ),
        ),
        const SizedBox(height: 12),

        // Public Key Box
        Text(
          'PUBLIC KEY (NPUB) — SAFE TO SHARE',
          style: SonicMachineTheme.labelTech(
            fontSize: 9.5,
            color: SonicColors.seamOutline,
          ),
        ),
        const SizedBox(height: 6),
        Container(
          padding: const EdgeInsets.all(10),
          decoration: BoxDecoration(
            color: SonicColors.surfaceLow,
            border: Border.all(color: SonicColors.ink, width: 2),
          ),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(
                child: SelectableText(
                  draft?.npub ?? 'GENERATING...',
                  style: SonicMachineTheme.labelTech(
                    fontSize: 10,
                    letterSpacing: 0.2,
                  ),
                ),
              ),
              const SizedBox(width: 8),
              InkWell(
                onTap: draft == null
                    ? null
                    : () {
                        Clipboard.setData(ClipboardData(text: draft.npub));
                        setState(() => _npubCopied = true);
                      },
                child: Container(
                  padding: const EdgeInsets.all(6),
                  decoration: BoxDecoration(
                    color: SonicColors.foundation,
                    border: Border.all(color: SonicColors.ink, width: 1.5),
                  ),
                  child: Icon(
                    _npubCopied ? Icons.check : Icons.copy,
                    size: 15,
                  ),
                ),
              ),
            ],
          ),
        ),

        if (draft != null) ...[
          const SizedBox(height: 10),
          Align(
            alignment: Alignment.centerLeft,
            child: SonicTag(
              label: _showQrBackup ? 'HIDE BACKUP QR' : 'SHOW NSEC BACKUP QR',
              onTap: () => setState(() => _showQrBackup = !_showQrBackup),
            ),
          ),
          if (_showQrBackup) ...[
            const SizedBox(height: 10),
            Center(
              child: Container(
                padding: const EdgeInsets.all(8),
                decoration: BoxDecoration(
                  color: Colors.white,
                  border: Border.all(color: SonicColors.ink, width: 2),
                ),
                child: QrImageView(
                  data: draft.nsec,
                  size: 156,
                  backgroundColor: Colors.white,
                ),
              ),
            ),
          ],
        ],

        const SizedBox(height: 14),
        // Mandatory confirmation checkbox
        InkWell(
          onTap: () => setState(() => _keyConfirmed = !_keyConfirmed),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Container(
                width: 20,
                height: 20,
                margin: const EdgeInsets.only(top: 1),
                decoration: BoxDecoration(
                  color:
                      _keyConfirmed ? SonicColors.ink : SonicColors.foundation,
                  border: Border.all(color: SonicColors.ink, width: 2),
                ),
                alignment: Alignment.center,
                child: _keyConfirmed
                    ? const Icon(
                        Icons.check,
                        size: 14,
                        color: SonicColors.voltageCyan,
                      )
                    : null,
              ),
              const SizedBox(width: 10),
              Expanded(
                child: Text(
                  'I HAVE SAVED MY PRIVATE KEY SAFELY — IT WILL BE STORED IN ${AuthViewModel.platformKeystoreLabel.toUpperCase()} AND CANNOT BE RECOVERED IF LOST.',
                  style: SonicMachineTheme.labelTech(
                    fontSize: 9.5,
                    letterSpacing: 0.4,
                  ),
                ),
              ),
            ],
          ),
        ),
        const SizedBox(height: 16),
        SonicPowerButton(
          label: _busy ? 'Securing Identity...' : 'Save & Continue',
          icon: Icons.arrow_forward,
          onPressed: (_busy || draft == null || !_keyConfirmed)
              ? null
              : _commitKeysAndAdvance,
        ),
      ],
    );
  }

  Widget _buildProfileStep(BuildContext context) {
    final previewName = _nameController.text.trim().isNotEmpty
        ? _nameController.text.trim()
        : (widget.authViewModel.session?.shortNpub ?? 'Radio Listener');
    final previewPic = _pictureController.text.trim();

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        SonicPlate(
          backgroundColor: SonicColors.surfacePlate,
          shadowOffset: const Offset(3, 3),
          padding: const EdgeInsets.all(10),
          child: Row(
            children: [
              StationThumbnail(
                url: previewPic.startsWith('http') ? previewPic : null,
                size: 46,
                highlight: true,
              ),
              const SizedBox(width: 10),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      previewName,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: Theme.of(context).textTheme.titleMedium,
                    ),
                    Text(
                      widget.authViewModel.session?.shortNpub ?? '',
                      style: SonicMachineTheme.labelTech(
                        fontSize: 9,
                        color: SonicColors.seamOutline,
                      ),
                    ),
                  ],
                ),
              ),
              const SonicTag(label: 'KIND 0', inverted: true),
            ],
          ),
        ),
        const SizedBox(height: 14),
        TextField(
          controller: _nameController,
          onChanged: (_) => setState(() {}),
          decoration: const InputDecoration(
            hintText: 'DISPLAY NAME (E.G. DJ SIGNAL)',
            prefixIcon: Icon(Icons.person_outline, color: SonicColors.ink),
          ),
        ),
        const SizedBox(height: 10),
        TextField(
          controller: _aboutController,
          maxLines: 2,
          decoration: const InputDecoration(
            hintText: 'SHORT BIO / FAVORITE GENRES (OPTIONAL)',
            prefixIcon: Icon(Icons.notes, color: SonicColors.ink),
          ),
        ),
        const SizedBox(height: 10),
        TextField(
          controller: _pictureController,
          onChanged: (_) => setState(() {}),
          decoration: const InputDecoration(
            hintText: 'AVATAR IMAGE URL (HTTPS://..., OPTIONAL)',
            prefixIcon: Icon(Icons.image_outlined, color: SonicColors.ink),
          ),
        ),
        const SizedBox(height: 10),
        TextField(
          controller: _lud16Controller,
          decoration: const InputDecoration(
            hintText: 'LIGHTNING ADDRESS (YOU@DOMAIN.COM, OPTIONAL)',
            prefixIcon: Icon(Icons.bolt, color: SonicColors.ink),
          ),
        ),
        const SizedBox(height: 16),
        Row(
          children: [
            Expanded(
              child: SonicPowerButton(
                label: 'Skip',
                primary: false,
                compact: true,
                onPressed: _busy ? null : () => _publishProfile(skip: true),
              ),
            ),
            const SizedBox(width: 10),
            Expanded(
              flex: 2,
              child: SonicPowerButton(
                label: _busy ? 'Publishing...' : 'Publish Profile',
                icon: Icons.check,
                compact: true,
                onPressed: _busy ? null : () => _publishProfile(skip: false),
              ),
            ),
          ],
        ),
      ],
    );
  }

  Widget _buildReadyStep(BuildContext context) {
    final session = widget.authViewModel.session;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        SonicPlate(
          backgroundColor: SonicColors.ink,
          shadowColor: SonicColors.voltageCyan,
          padding: const EdgeInsets.all(14),
          child: Row(
            children: [
              StationThumbnail(
                url: session?.profile?.picture,
                size: 52,
                highlight: true,
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      (session?.displayName ?? 'OPERATOR').toUpperCase(),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: SonicMachineTheme.labelTech(
                        fontSize: 12,
                        color: SonicColors.voltageCyan,
                      ),
                    ),
                    const SizedBox(height: 3),
                    Text(
                      session?.shortNpub ?? '',
                      style: SonicMachineTheme.labelTech(
                        fontSize: 9.5,
                        color: SonicColors.seamMuted,
                      ),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      'SECURED IN ${AuthViewModel.platformKeystoreLabel.toUpperCase()}',
                      style: SonicMachineTheme.labelTech(
                        fontSize: 8.5,
                        color: SonicColors.foundation,
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
        const SizedBox(height: 16),
        const SonicSectionHeader(title: 'JUMP_INTO_A_FREQUENCY'),
        const SizedBox(height: 10),
        Wrap(
          spacing: 8,
          runSpacing: 8,
          children: _starterGenres
              .map(
                (genre) => SonicTag(
                  label: genre,
                  onTap: () => _finish(genre: genre),
                ),
              )
              .toList(),
        ),
        const SizedBox(height: 18),
        SonicPowerButton(
          label: 'Start Listening',
          icon: Icons.play_arrow,
          onPressed: () => _finish(),
        ),
      ],
    );
  }
}

class _FeatureBullet extends StatelessWidget {
  const _FeatureBullet({
    required this.icon,
    required this.title,
    required this.detail,
  });

  final IconData icon;
  final String title;
  final String detail;

  @override
  Widget build(BuildContext context) {
    return SonicPlate(
      backgroundColor: SonicColors.surfacePlate,
      shadowOffset: const Offset(2, 2),
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
      child: Row(
        children: [
          Container(
            width: 30,
            height: 30,
            color: SonicColors.ink,
            alignment: Alignment.center,
            child: Icon(icon, size: 16, color: SonicColors.voltageCyan),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  title,
                  style: SonicMachineTheme.labelTech(fontSize: 9.5),
                ),
                const SizedBox(height: 1),
                Text(
                  detail,
                  style: Theme.of(context).textTheme.bodySmall,
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
