import 'package:flutter/services.dart';
import 'package:material_ui/material_ui.dart';

import '../../../../domain/models/social.dart';
import '../../../core/theme/sonic_machine_theme.dart';
import '../../../core/widgets/sonic_plate.dart';
import '../../../core/widgets/station_thumbnail.dart';
import '../../auth/view_models/auth_view_model.dart';
import '../view_models/crate_view_model.dart';

class _BlossomServerOption {
  const _BlossomServerOption({required this.label, required this.url});

  final String label;
  final String url;
}

const List<_BlossomServerOption> _kBlossomServers = [
  _BlossomServerOption(label: 'BLOSSOM.BAND', url: 'https://blossom.band'),
  _BlossomServerOption(label: 'HZRD149', url: 'https://cdn.hzrd149.com'),
  _BlossomServerOption(label: 'V0L.IO', url: 'https://files.v0l.io'),
];

/// Constructivist Blossom Media Backup modal (`MEDIA_FORGE`):
/// searches YouTube via ContextVM, downloads & hashes media, signs a BUD-02
/// `kind 24242` auth event, uploads to Blossom, and attaches the URL to the song.
class MediaForgeSheet extends StatefulWidget {
  const MediaForgeSheet({
    super.key,
    required this.crateViewModel,
    required this.authViewModel,
    required this.onRequestLogin,
    this.existingSong,
    this.recording,
    this.fallbackTitle,
    this.fallbackArtist,
  });

  final CrateViewModel crateViewModel;
  final AuthViewModel authViewModel;
  final VoidCallback onRequestLogin;
  final SavedSong? existingSong;
  final MusicBrainzRecording? recording;
  final String? fallbackTitle;
  final String? fallbackArtist;

  static Future<void> open(
    BuildContext context, {
    required CrateViewModel crateViewModel,
    required AuthViewModel authViewModel,
    required VoidCallback onRequestLogin,
    SavedSong? existingSong,
    MusicBrainzRecording? recording,
    String? fallbackTitle,
    String? fallbackArtist,
  }) {
    final sheet = MediaForgeSheet(
      crateViewModel: crateViewModel,
      authViewModel: authViewModel,
      onRequestLogin: onRequestLogin,
      existingSong: existingSong,
      recording: recording,
      fallbackTitle: fallbackTitle,
      fallbackArtist: fallbackArtist,
    );
    final wide = MediaQuery.of(context).size.width >= 720;
    if (wide) {
      return showDialog<void>(
        context: context,
        builder: (_) => Dialog(
          backgroundColor: SonicColors.foundation,
          shape: const RoundedRectangleBorder(
            side: BorderSide(color: SonicColors.ink, width: 3),
          ),
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 560, maxHeight: 740),
            child: sheet,
          ),
        ),
      );
    }
    return showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      backgroundColor: SonicColors.foundation,
      shape: const RoundedRectangleBorder(),
      builder: (_) => ConstrainedBox(
        constraints: BoxConstraints(
          maxHeight: MediaQuery.of(context).size.height * 0.9,
        ),
        child: sheet,
      ),
    );
  }

  @override
  State<MediaForgeSheet> createState() => _MediaForgeSheetState();
}

class _MediaForgeSheetState extends State<MediaForgeSheet> {
  late final TextEditingController _queryController;
  final TextEditingController _customBlossomController =
      TextEditingController();

  String _format = 'audio';
  String _selectedBlossomUrl = _kBlossomServers.first.url;
  bool _useCustomBlossom = false;

  bool _searching = false;
  bool _transferring = false;
  String? _progressStage;
  String? _progressMessage;
  String? _error;
  List<YouTubeSearchResult> _results = const [];
  UploadedMedia? _uploaded;

  String get _displayTitle =>
      widget.existingSong?.title ??
      widget.recording?.title ??
      widget.fallbackTitle ??
      'Track';

  String? get _displayArtist =>
      widget.existingSong?.artist ??
      widget.recording?.artist ??
      widget.fallbackArtist;

  String get _effectiveBlossomUrl => _useCustomBlossom
      ? _customBlossomController.text.trim()
      : _selectedBlossomUrl;

  @override
  void initState() {
    super.initState();
    final initialQuery = [
      _displayTitle,
      if (_displayArtist != null && _displayArtist!.trim().isNotEmpty)
        _displayArtist!,
    ].join(' ');
    _queryController = TextEditingController(text: initialQuery);
    _runSearch();
  }

  @override
  void dispose() {
    _queryController.dispose();
    _customBlossomController.dispose();
    super.dispose();
  }

  Future<void> _runSearch() async {
    final q = _queryController.text.trim();
    if (q.isEmpty) return;
    setState(() {
      _searching = true;
      _error = null;
    });
    try {
      final hits = await widget.crateViewModel.searchYouTube(q);
      if (!mounted) return;
      setState(() => _results = hits);
    } catch (e) {
      if (!mounted) return;
      setState(() => _error = e.toString().replaceFirst('Exception: ', ''));
    } finally {
      if (mounted) setState(() => _searching = false);
    }
  }

  Future<void> _backupResult(YouTubeSearchResult result) async {
    if (!widget.authViewModel.isLoggedIn) {
      Navigator.of(context).pop();
      widget.onRequestLogin();
      return;
    }
    final blossom = _effectiveBlossomUrl;
    if (!blossom.startsWith('https://')) {
      setState(() => _error = 'Choose a valid https:// Blossom server first.');
      return;
    }

    setState(() {
      _transferring = true;
      _error = null;
      _progressStage = 'starting';
      _progressMessage = 'Preparing Blossom media transfer...';
    });

    try {
      final uploaded = await widget.crateViewModel.backupSongToBlossom(
        existingSong: widget.existingSong,
        recording: widget.recording,
        fallbackTitle: widget.fallbackTitle,
        fallbackArtist: widget.fallbackArtist,
        videoId: result.videoId,
        format: _format,
        blossomUrl: blossom,
        onProgress: (stage, msg) {
          if (!mounted) return;
          setState(() {
            _progressStage = stage;
            _progressMessage = msg;
          });
        },
      );
      if (!mounted) return;
      HapticFeedback.mediumImpact();
      setState(() {
        _uploaded = uploaded;
        _transferring = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _error = e.toString().replaceFirst('Exception: ', '');
        _transferring = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final bottomInset = MediaQuery.of(context).viewInsets.bottom;

    return Container(
      color: SonicColors.foundation,
      padding: EdgeInsets.only(bottom: bottomInset),
      child: SafeArea(
        top: false,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            // Header bar
            Container(
              color: SonicColors.ink,
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
              child: Row(
                children: [
                  const Icon(
                    Icons.cloud_upload_outlined,
                    color: SonicColors.voltageCyan,
                    size: 18,
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          'MEDIA_FORGE // BLOSSOM BACKUP',
                          style: SonicMachineTheme.labelTech(
                            fontSize: 10,
                            color: SonicColors.voltageCyan,
                            letterSpacing: 1.4,
                          ),
                        ),
                        const SizedBox(height: 2),
                        Text(
                          _displayArtist != null && _displayArtist!.isNotEmpty
                              ? '$_displayTitle · $_displayArtist'
                              : _displayTitle,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: SonicMachineTheme.labelTech(
                            fontSize: 11,
                            color: SonicColors.foundation,
                            letterSpacing: 0.4,
                          ),
                        ),
                      ],
                    ),
                  ),
                  IconButton(
                    icon: const Icon(
                      Icons.close,
                      color: SonicColors.foundation,
                      size: 18,
                    ),
                    onPressed:
                        _transferring ? null : () => Navigator.of(context).pop(),
                  ),
                ],
              ),
            ),

            Flexible(
              child: SingleChildScrollView(
                padding: const EdgeInsets.all(16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    if (_uploaded != null)
                      _buildSuccessView(_uploaded!)
                    else if (_transferring)
                      _buildProgressView()
                    else ...[
                      // Format selector
                      const SonicSectionHeader(title: 'MEDIA_FORMAT'),
                      const SizedBox(height: 8),
                      Wrap(
                        spacing: 6,
                        runSpacing: 6,
                        children: [
                          for (final opt in const [
                            ('audio', 'AUDIO (M4A)'),
                            ('360p', 'VIDEO 360P'),
                            ('480p', 'VIDEO 480P'),
                            ('720p', 'VIDEO 720P'),
                          ])
                            SonicTag(
                              label: opt.$2,
                              highlighted: _format == opt.$1,
                              onTap: () => setState(() => _format = opt.$1),
                            ),
                        ],
                      ),
                      const SizedBox(height: 14),

                      // Blossom server selector
                      const SonicSectionHeader(title: 'BLOSSOM_SERVER'),
                      const SizedBox(height: 8),
                      Wrap(
                        spacing: 6,
                        runSpacing: 6,
                        children: [
                          for (final s in _kBlossomServers)
                            SonicTag(
                              label: s.label,
                              highlighted: !_useCustomBlossom &&
                                  _selectedBlossomUrl == s.url,
                              onTap: () => setState(() {
                                _useCustomBlossom = false;
                                _selectedBlossomUrl = s.url;
                              }),
                            ),
                          SonicTag(
                            label: 'CUSTOM',
                            highlighted: _useCustomBlossom,
                            onTap: () =>
                                setState(() => _useCustomBlossom = true),
                          ),
                        ],
                      ),
                      if (_useCustomBlossom) ...[
                        const SizedBox(height: 8),
                        TextField(
                          controller: _customBlossomController,
                          keyboardType: TextInputType.url,
                          decoration: const InputDecoration(
                            hintText: 'https://your-blossom-server.example',
                            prefixIcon: Icon(
                              Icons.dns_outlined,
                              color: SonicColors.ink,
                            ),
                          ),
                        ),
                      ],
                      const SizedBox(height: 14),

                      // YouTube search bar
                      const SonicSectionHeader(title: 'YOUTUBE_SOURCE_MATCH'),
                      const SizedBox(height: 8),
                      Row(
                        children: [
                          Expanded(
                            child: TextField(
                              controller: _queryController,
                              onSubmitted: (_) => _runSearch(),
                              decoration: const InputDecoration(
                                hintText: 'SEARCH YOUTUBE...',
                                prefixIcon: Icon(
                                  Icons.search,
                                  color: SonicColors.ink,
                                ),
                              ),
                            ),
                          ),
                          const SizedBox(width: 8),
                          SonicPowerButton(
                            label: 'Find',
                            compact: true,
                            onPressed: _searching ? null : _runSearch,
                          ),
                        ],
                      ),

                      if (_error != null) ...[
                        const SizedBox(height: 10),
                        SonicPlate(
                          backgroundColor: SonicColors.signalRed,
                          shadowOffset: Offset.zero,
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
                      ],
                      const SizedBox(height: 12),

                      if (_searching)
                        const Padding(
                          padding: EdgeInsets.symmetric(vertical: 28),
                          child: Center(
                            child: CircularProgressIndicator(
                              color: SonicColors.signalRed,
                            ),
                          ),
                        )
                      else if (_results.isEmpty)
                        SonicPlate(
                          padding: const EdgeInsets.all(14),
                          shadowOffset: Offset.zero,
                          child: Text(
                            'NO YOUTUBE MATCHES YET — EDIT THE QUERY AND TAP FIND',
                            textAlign: TextAlign.center,
                            style: SonicMachineTheme.labelTech(
                              fontSize: 9.5,
                              color: SonicColors.seamOutline,
                            ),
                          ),
                        )
                      else
                        for (final item in _results)
                          Padding(
                            padding: const EdgeInsets.only(bottom: 8),
                            child: SonicPlate(
                              shadowOffset: const Offset(3, 3),
                              padding: const EdgeInsets.all(9),
                              child: Row(
                                children: [
                                  StationThumbnail(
                                    url: item.thumbnailUrl,
                                    size: 48,
                                    borderWidth: 1.5,
                                  ),
                                  const SizedBox(width: 10),
                                  Expanded(
                                    child: Column(
                                      crossAxisAlignment:
                                          CrossAxisAlignment.start,
                                      children: [
                                        Text(
                                          item.title,
                                          maxLines: 2,
                                          overflow: TextOverflow.ellipsis,
                                          style: Theme.of(context)
                                              .textTheme
                                              .titleSmall,
                                        ),
                                        const SizedBox(height: 2),
                                        Text(
                                          [
                                            if (item.channel != null)
                                              item.channel!.toUpperCase(),
                                            if (item.formattedDuration != null)
                                              item.formattedDuration!,
                                          ].join(' · '),
                                          maxLines: 1,
                                          overflow: TextOverflow.ellipsis,
                                          style: SonicMachineTheme.labelTech(
                                            fontSize: 9,
                                            color: SonicColors.seamOutline,
                                          ),
                                        ),
                                      ],
                                    ),
                                  ),
                                  const SizedBox(width: 8),
                                  SonicPowerButton(
                                    label: 'Backup',
                                    icon: Icons.cloud_upload_outlined,
                                    compact: true,
                                    onPressed: () => _backupResult(item),
                                  ),
                                ],
                              ),
                            ),
                          ),
                    ],
                  ],
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildProgressView() {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 18),
      child: SonicPlate(
        backgroundColor: SonicColors.ink,
        shadowColor: SonicColors.voltageCyan,
        padding: const EdgeInsets.all(18),
        child: Column(
          children: [
            const CircularProgressIndicator(color: SonicColors.voltageCyan),
            const SizedBox(height: 14),
            Text(
              (_progressStage ?? 'WORKING').toUpperCase(),
              style: SonicMachineTheme.labelTech(
                fontSize: 11,
                color: SonicColors.voltageCyan,
                letterSpacing: 1.4,
              ),
            ),
            const SizedBox(height: 6),
            Text(
              _progressMessage ?? 'Transferring media to Blossom...',
              textAlign: TextAlign.center,
              style: SonicMachineTheme.labelTech(
                fontSize: 9.5,
                color: SonicColors.foundation,
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildSuccessView(UploadedMedia uploaded) {
    final sizeMb = (uploaded.size / (1024 * 1024)).toStringAsFixed(2);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        SonicPlate(
          backgroundColor: SonicColors.ink,
          shadowColor: SonicColors.voltageCyan,
          padding: const EdgeInsets.all(16),
          child: Column(
            children: [
              const Icon(
                Icons.cloud_done_outlined,
                color: SonicColors.voltageCyan,
                size: 38,
              ),
              const SizedBox(height: 8),
              Text(
                'BACKED UP TO BLOSSOM',
                style: SonicMachineTheme.labelTech(
                  fontSize: 12,
                  color: SonicColors.voltageCyan,
                ),
              ),
              const SizedBox(height: 4),
              Text(
                '$sizeMb MB · ${uploaded.mimeType.toUpperCase()}',
                style: SonicMachineTheme.labelTech(
                  fontSize: 9.5,
                  color: SonicColors.foundation,
                ),
              ),
              const SizedBox(height: 6),
              Text(
                uploaded.url,
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
                textAlign: TextAlign.center,
                style: SonicMachineTheme.labelTech(
                  fontSize: 8.5,
                  color: SonicColors.seamMuted,
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
                label: 'Copy URL',
                icon: Icons.copy,
                primary: false,
                onPressed: () {
                  Clipboard.setData(ClipboardData(text: uploaded.url));
                  ScaffoldMessenger.of(context).showSnackBar(
                    const SnackBar(content: Text('Blossom URL copied')),
                  );
                },
              ),
            ),
            const SizedBox(width: 8),
            Expanded(
              child: SonicPowerButton(
                label: 'Done',
                onPressed: () => Navigator.of(context).pop(),
              ),
            ),
          ],
        ),
      ],
    );
  }
}
