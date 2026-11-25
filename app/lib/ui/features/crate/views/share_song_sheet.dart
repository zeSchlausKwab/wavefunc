import 'package:material_ui/material_ui.dart';

import '../../../../domain/models/social.dart';
import '../../../core/theme/sonic_machine_theme.dart';
import '../../../core/widgets/sonic_plate.dart';
import '../../auth/view_models/auth_view_model.dart';

/// Constructivist sheet to share a Crate song as a Nostr `kind 1` note
/// (mirrors web's `ShareSongDialog.tsx`).
class ShareSongSheet extends StatefulWidget {
  const ShareSongSheet({
    super.key,
    required this.song,
    required this.authViewModel,
  });

  final SavedSong song;
  final AuthViewModel authViewModel;

  static Future<bool?> open(
    BuildContext context, {
    required SavedSong song,
    required AuthViewModel authViewModel,
    required VoidCallback onRequestLogin,
  }) async {
    if (!authViewModel.isLoggedIn) {
      onRequestLogin();
      return null;
    }
    final sheet = ShareSongSheet(song: song, authViewModel: authViewModel);
    final bool? shared;
    if (MediaQuery.of(context).size.width >= 720) {
      shared = await showDialog<bool>(
        context: context,
        builder: (_) => Dialog(
          backgroundColor: SonicColors.foundation,
          shape: const RoundedRectangleBorder(
            side: BorderSide(color: SonicColors.ink, width: 3),
          ),
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 520, maxHeight: 680),
            child: sheet,
          ),
        ),
      );
    } else {
      shared = await showModalBottomSheet<bool>(
        context: context,
        isScrollControlled: true,
        backgroundColor: SonicColors.foundation,
        shape: const RoundedRectangleBorder(),
        builder: (_) => ConstrainedBox(
          constraints: BoxConstraints(
            maxHeight: MediaQuery.of(context).size.height * 0.88,
          ),
          child: sheet,
        ),
      );
    }
    if (shared == true && context.mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Shared song to Nostr')),
      );
    }
    return shared;
  }

  @override
  State<ShareSongSheet> createState() => _ShareSongSheetState();
}

class _ShareSongSheetState extends State<ShareSongSheet> {
  final _controller = TextEditingController();
  late final String? _author;
  bool _includeMediaUrl = true;
  bool _includeWavefuncRef = true;
  bool _tagWavefunc = true;
  bool _tagSongstr = true;
  bool _tagTunestr = true;
  bool _edited = false;
  bool _publishing = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    _author = widget.authViewModel.session?.pubkey;
    _controller.text = _buildAutoContent();
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  String _formatDuration(int secs) {
    final m = secs ~/ 60;
    final s = secs % 60;
    return '$m:${s.toString().padLeft(2, '0')}';
  }

  String _buildAutoContent() {
    final song = widget.song;
    final parts = <String>[];

    final metaPieces = <String>['"${song.title}"'];
    if (song.artist != null && song.artist!.trim().isNotEmpty) {
      metaPieces.add('by ${song.artist!.trim()}');
    }
    var line = '🎵 ${metaPieces.join(' ')}';
    if (song.album != null && song.album!.trim().isNotEmpty) {
      line += ' · ${song.album!.trim()}';
    }
    if (song.releaseYear != null) {
      line += ' (${song.releaseYear})';
    }
    if (song.durationSecs != null && song.durationSecs! > 0) {
      line += ' [${_formatDuration(song.durationSecs!)}]';
    }
    parts.add(line);

    if (_includeMediaUrl &&
        song.audioUrl != null &&
        song.audioUrl!.trim().isNotEmpty) {
      parts.add(song.audioUrl!.trim());
    }

    if (_includeWavefuncRef) {
      parts.add('Found via wavefunc.live — internet radio on nostr');
    }

    final tags = <String>[
      if (_tagWavefunc) '#wavefunc',
      if (_tagSongstr) '#songstr',
      if (_tagTunestr) '#tunestr',
    ];
    if (tags.isNotEmpty) parts.add(tags.join(' '));

    return parts.join('\n\n');
  }

  void _syncAuto() {
    if (!_edited) {
      _controller.text = _buildAutoContent();
    }
  }

  Future<void> _publish() async {
    final text = _controller.text.trim();
    if (_publishing || text.isEmpty) return;

    setState(() {
      _publishing = true;
      _error = null;
    });

    try {
      final hashtags = <String>[
        if (_tagWavefunc) 'wavefunc',
        if (_tagSongstr) 'songstr',
        if (_tagTunestr) 'tunestr',
      ];
      await widget.authViewModel.executeSignedAction(
        (backend) => backend.publishSongShareNote(
          content: text,
          songAddress: widget.song.address,
          audioUrl: _includeMediaUrl ? widget.song.audioUrl : null,
          hashtags: hashtags,
        ),
        expectedAuthor: _author,
      );
      if (mounted) Navigator.of(context).pop(true);
    } catch (e) {
      if (mounted) {
        setState(() => _error = e.toString().replaceFirst('Exception: ', ''));
      }
    } finally {
      if (mounted) setState(() => _publishing = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final hasMedia = widget.song.audioUrl != null &&
        widget.song.audioUrl!.trim().isNotEmpty;
    final bottomInset = MediaQuery.of(context).viewInsets.bottom;

    return Container(
      color: SonicColors.foundation,
      padding: EdgeInsets.only(bottom: bottomInset),
      child: SafeArea(
        top: false,
        child: SingleChildScrollView(
          padding: const EdgeInsets.fromLTRB(20, 14, 20, 24),
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
                          'SHARE_NOTE // KIND 1',
                          style: SonicMachineTheme.labelTech(
                            fontSize: 9.5,
                            color: SonicColors.signalRed,
                            letterSpacing: 1.5,
                          ),
                        ),
                        const SizedBox(height: 2),
                        Text(
                          widget.song.title.toUpperCase(),
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: Theme.of(context).textTheme.titleMedium,
                        ),
                      ],
                    ),
                  ),
                  IconButton(
                    icon: const Icon(Icons.close, color: SonicColors.ink),
                    onPressed:
                        _publishing ? null : () => Navigator.of(context).pop(),
                  ),
                ],
              ),
              const SizedBox(height: 10),
              Wrap(
                spacing: 6,
                runSpacing: 6,
                children: [
                  if (hasMedia)
                    SonicTag(
                      label: 'BLOSSOM LINK',
                      highlighted: _includeMediaUrl,
                      onTap: () {
                        setState(() => _includeMediaUrl = !_includeMediaUrl);
                        _syncAuto();
                      },
                    ),
                  SonicTag(
                    label: 'WAVEFUNC.LIVE',
                    highlighted: _includeWavefuncRef,
                    onTap: () {
                      setState(
                        () => _includeWavefuncRef = !_includeWavefuncRef,
                      );
                      _syncAuto();
                    },
                  ),
                  SonicTag(
                    label: '#WAVEFUNC',
                    highlighted: _tagWavefunc,
                    onTap: () {
                      setState(() => _tagWavefunc = !_tagWavefunc);
                      _syncAuto();
                    },
                  ),
                  SonicTag(
                    label: '#SONGSTR',
                    highlighted: _tagSongstr,
                    onTap: () {
                      setState(() => _tagSongstr = !_tagSongstr);
                      _syncAuto();
                    },
                  ),
                  SonicTag(
                    label: '#TUNESTR',
                    highlighted: _tagTunestr,
                    onTap: () {
                      setState(() => _tagTunestr = !_tagTunestr);
                      _syncAuto();
                    },
                  ),
                ],
              ),
              const SizedBox(height: 12),
              TextField(
                controller: _controller,
                maxLines: 6,
                onChanged: (_) {
                  if (!_edited) setState(() => _edited = true);
                },
                decoration: const InputDecoration(
                  labelText: 'NOSTR NOTE CONTENT',
                ),
              ),
              if (_edited) ...[
                const SizedBox(height: 6),
                Align(
                  alignment: Alignment.centerRight,
                  child: GestureDetector(
                    onTap: () {
                      setState(() {
                        _edited = false;
                        _controller.text = _buildAutoContent();
                      });
                    },
                    child: Text(
                      'RESET TEMPLATE',
                      style: SonicMachineTheme.labelTech(
                        fontSize: 9,
                        color: SonicColors.signalRed,
                      ),
                    ),
                  ),
                ),
              ],
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
                    ),
                  ),
                ),
              ],
              const SizedBox(height: 14),
              SonicPowerButton(
                label: _publishing ? 'Publishing...' : 'Publish Share Note',
                icon: Icons.share,
                onPressed: _publishing ? null : _publish,
              ),
            ],
          ),
        ),
      ),
    );
  }
}
