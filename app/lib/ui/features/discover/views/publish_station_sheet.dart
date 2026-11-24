import 'package:material_ui/material_ui.dart';

import '../../../core/theme/sonic_machine_theme.dart';
import '../../../core/widgets/sonic_plate.dart';
import '../../auth/view_models/auth_view_model.dart';
import '../../discover/view_models/discover_view_model.dart';

/// Constructivist modal to publish a new NIP-XX Internet Radio station (`kind 31237`).
class PublishStationSheet extends StatefulWidget {
  const PublishStationSheet({
    super.key,
    required this.authViewModel,
    required this.discoverViewModel,
  });

  final AuthViewModel authViewModel;
  final DiscoverViewModel discoverViewModel;

  static Future<bool?> open(
    BuildContext context, {
    required AuthViewModel authViewModel,
    required DiscoverViewModel discoverViewModel,
  }) {
    final sheet = PublishStationSheet(
      authViewModel: authViewModel,
      discoverViewModel: discoverViewModel,
    );
    if (MediaQuery.of(context).size.width >= 720) {
      return showDialog<bool>(
        context: context,
        builder: (_) => Dialog(
          backgroundColor: SonicColors.foundation,
          shape: const RoundedRectangleBorder(
            side: BorderSide(color: SonicColors.ink, width: 3),
          ),
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 520, maxHeight: 720),
            child: sheet,
          ),
        ),
      );
    }
    return showModalBottomSheet<bool>(
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
  State<PublishStationSheet> createState() => _PublishStationSheetState();
}

class _PublishStationSheetState extends State<PublishStationSheet> {
  final _nameController = TextEditingController();
  final _streamController = TextEditingController();
  final _descController = TextEditingController();
  final _websiteController = TextEditingController();
  final _countryController = TextEditingController();
  final _genresController = TextEditingController();
  final _thumbController = TextEditingController();

  String _format = 'mp3';
  int _bitrateBps = 128000;
  bool _submitting = false;
  String? _error;

  @override
  void dispose() {
    _nameController.dispose();
    _streamController.dispose();
    _descController.dispose();
    _websiteController.dispose();
    _countryController.dispose();
    _genresController.dispose();
    _thumbController.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    final name = _nameController.text.trim();
    final stream = _streamController.text.trim();
    if (name.isEmpty ||
        !(stream.startsWith('http://') || stream.startsWith('https://'))) {
      setState(
        () => _error = 'Enter a station name and a valid http(s):// stream URL.',
      );
      return;
    }

    setState(() {
      _submitting = true;
      _error = null;
    });

    try {
      final genres = _genresController.text
          .split(',')
          .map((g) => g.trim())
          .where((g) => g.isNotEmpty)
          .toList();
      await widget.authViewModel.executeSignedAction(
        (backend) => backend.publishStation(
          name: name,
          streamUrl: stream,
          format: _format,
          bitrateBps: _bitrateBps,
          description:
              _descController.text.trim().isEmpty ? null : _descController.text,
          website: _websiteController.text.trim().isEmpty
              ? null
              : _websiteController.text,
          countryCode: _countryController.text.trim().isEmpty
              ? null
              : _countryController.text,
          thumbnail: _thumbController.text.trim().isEmpty
              ? null
              : _thumbController.text,
          genres: genres,
        ),
      );
      await widget.discoverViewModel.refresh();
      if (mounted) Navigator.of(context).pop(true);
    } catch (e) {
      if (mounted) {
        setState(() => _error = e.toString().replaceFirst('Exception: ', ''));
      }
    } finally {
      if (mounted) setState(() => _submitting = false);
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
                          'BROADCAST_DIRECTORY // KIND 31237',
                          style: SonicMachineTheme.labelTech(
                            fontSize: 9.5,
                            color: SonicColors.signalRed,
                            letterSpacing: 1.5,
                          ),
                        ),
                        const SizedBox(height: 2),
                        Text(
                          'SUBMIT RADIO STATION',
                          style: Theme.of(context).textTheme.titleMedium,
                        ),
                      ],
                    ),
                  ),
                  IconButton(
                    icon: const Icon(Icons.close, color: SonicColors.ink),
                    onPressed:
                        _submitting ? null : () => Navigator.of(context).pop(),
                  ),
                ],
              ),
              const SizedBox(height: 12),
              TextField(
                controller: _nameController,
                decoration: const InputDecoration(
                  labelText: 'STATION NAME *',
                  prefixIcon: Icon(Icons.radio, color: SonicColors.ink),
                ),
              ),
              const SizedBox(height: 10),
              TextField(
                controller: _streamController,
                keyboardType: TextInputType.url,
                decoration: const InputDecoration(
                  labelText: 'STREAM URL (HTTP/HTTPS) *',
                  hintText: 'https://stream.example.org/live.mp3',
                  prefixIcon: Icon(Icons.cell_tower, color: SonicColors.ink),
                ),
              ),
              const SizedBox(height: 10),
              Row(
                children: [
                  Expanded(
                    child: Wrap(
                      spacing: 6,
                      runSpacing: 6,
                      children: [
                        for (final f in const ['mp3', 'aac', 'ogg', 'hls'])
                          SonicTag(
                            label: f.toUpperCase(),
                            highlighted: _format == f,
                            onTap: () => setState(() => _format = f),
                          ),
                      ],
                    ),
                  ),
                  const SizedBox(width: 8),
                  DropdownButton<int>(
                    value: _bitrateBps,
                    dropdownColor: SonicColors.foundation,
                    items: const [
                      DropdownMenuItem(value: 64000, child: Text('64k')),
                      DropdownMenuItem(value: 128000, child: Text('128k')),
                      DropdownMenuItem(value: 192000, child: Text('192k')),
                      DropdownMenuItem(value: 320000, child: Text('320k')),
                    ],
                    onChanged: (v) {
                      if (v != null) setState(() => _bitrateBps = v);
                    },
                  ),
                ],
              ),
              const SizedBox(height: 10),
              TextField(
                controller: _genresController,
                decoration: const InputDecoration(
                  labelText: 'GENRES (COMMA SEPARATED)',
                  hintText: 'electronic, ambient, dub',
                ),
              ),
              const SizedBox(height: 10),
              Row(
                children: [
                  SizedBox(
                    width: 110,
                    child: TextField(
                      controller: _countryController,
                      maxLength: 2,
                      decoration: const InputDecoration(
                        labelText: 'COUNTRY',
                        hintText: 'DE',
                        counterText: '',
                      ),
                    ),
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: TextField(
                      controller: _websiteController,
                      keyboardType: TextInputType.url,
                      decoration: const InputDecoration(
                        labelText: 'WEBSITE (OPTIONAL)',
                      ),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 10),
              TextField(
                controller: _thumbController,
                keyboardType: TextInputType.url,
                decoration: const InputDecoration(
                  labelText: 'LOGO / THUMBNAIL URL (OPTIONAL)',
                ),
              ),
              const SizedBox(height: 10),
              TextField(
                controller: _descController,
                maxLines: 2,
                decoration: const InputDecoration(
                  labelText: 'DESCRIPTION (OPTIONAL)',
                ),
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
                    ),
                  ),
                ),
              ],
              const SizedBox(height: 14),
              SonicPowerButton(
                label: _submitting ? 'Publishing...' : 'Publish Station to Nostr',
                icon: Icons.publish,
                onPressed: _submitting ? null : _submit,
              ),
            ],
          ),
        ),
      ),
    );
  }
}
