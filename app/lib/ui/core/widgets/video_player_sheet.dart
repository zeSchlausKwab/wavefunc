import 'dart:io';

import 'package:flutter/foundation.dart';
import 'package:material_ui/material_ui.dart';
import 'package:url_launcher/url_launcher.dart';
import 'package:video_player/video_player.dart';

import '../theme/sonic_machine_theme.dart';
import 'sonic_plate.dart';

/// Returns true when [url] points to a video container (`.mp4`, `.webm`, `.mov`, `.m4v`, `.ogv`).
bool isVideoMediaUrl(String? url) {
  if (url == null || url.trim().isEmpty) return false;
  final uri = Uri.tryParse(url.trim());
  final path = (uri?.path ?? url).toLowerCase();
  return path.endsWith('.mp4') ||
      path.endsWith('.webm') ||
      path.endsWith('.mov') ||
      path.endsWith('.m4v') ||
      path.endsWith('.ogv');
}

/// Returns true when [url] points to an audio file (`.mp3`, `.m4a`, `.ogg`, `.wav`, `.flac`, `.opus`, `.aac`).
bool isAudioMediaUrl(String? url) {
  if (url == null || url.trim().isEmpty) return false;
  final uri = Uri.tryParse(url.trim());
  final path = (uri?.path ?? url).toLowerCase();
  return path.endsWith('.mp3') ||
      path.endsWith('.m4a') ||
      path.endsWith('.ogg') ||
      path.endsWith('.wav') ||
      path.endsWith('.flac') ||
      path.endsWith('.opus') ||
      path.endsWith('.aac');
}

/// Returns true when [url] points to an image file or common Nostr image host.
bool isImageMediaUrl(String? url) {
  if (url == null || url.trim().isEmpty) return false;
  final uri = Uri.tryParse(url.trim());
  final path = (uri?.path ?? url).toLowerCase();
  final host = (uri?.host ?? '').toLowerCase();
  return path.endsWith('.jpg') ||
      path.endsWith('.jpeg') ||
      path.endsWith('.png') ||
      path.endsWith('.gif') ||
      path.endsWith('.webp') ||
      path.endsWith('.avif') ||
      host.contains('image.nostr.build') ||
      host.contains('i.nostr.build');
}

/// Constructivist native video player dialog/sheet for Blossom & feed videos.
class VideoPlayerSheet extends StatefulWidget {
  const VideoPlayerSheet({
    super.key,
    required this.url,
    required this.title,
    this.subtitle,
  });

  final String url;
  final String title;
  final String? subtitle;

  static Future<void> open(
    BuildContext context, {
    required String url,
    required String title,
    String? subtitle,
    Future<void> Function()? onBeforeOpen,
  }) async {
    if (onBeforeOpen != null) {
      await onBeforeOpen();
    }
    if (!context.mounted) return;
    await showDialog<void>(
      context: context,
      barrierColor: Colors.black.withValues(alpha: 0.84),
      builder: (_) => Dialog(
        backgroundColor: SonicColors.ink,
        insetPadding: const EdgeInsets.all(16),
        shape: const RoundedRectangleBorder(
          side: BorderSide(color: SonicColors.foundation, width: 3),
        ),
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 760),
          child: VideoPlayerSheet(
            url: url,
            title: title,
            subtitle: subtitle,
          ),
        ),
      ),
    );
  }

  @override
  State<VideoPlayerSheet> createState() => _VideoPlayerSheetState();
}

class _VideoPlayerSheetState extends State<VideoPlayerSheet> {
  VideoPlayerController? _controller;
  bool _initializing = true;
  String? _error;

  bool get _supportsInlineVideo {
    if (kIsWeb) return true;
    return Platform.isAndroid || Platform.isIOS || Platform.isMacOS;
  }

  @override
  void initState() {
    super.initState();
    _initController();
  }

  Future<void> _initController() async {
    if (!_supportsInlineVideo) {
      setState(() {
        _initializing = false;
        _error = 'Inline video playback is unavailable on this desktop OS.';
      });
      return;
    }
    try {
      final ctrl = VideoPlayerController.networkUrl(Uri.parse(widget.url));
      _controller = ctrl;
      await ctrl.initialize();
      ctrl.addListener(_onControllerTick);
      await ctrl.play();
      if (mounted) {
        setState(() => _initializing = false);
      }
    } catch (e) {
      if (mounted) {
        setState(() {
          _initializing = false;
          _error = e.toString().replaceFirst('Exception: ', '');
        });
      }
    }
  }

  void _onControllerTick() {
    if (mounted) setState(() {});
  }

  @override
  void dispose() {
    _controller?.removeListener(_onControllerTick);
    _controller?.dispose();
    super.dispose();
  }

  String _fmt(Duration d) {
    final m = d.inMinutes;
    final s = d.inSeconds % 60;
    return '$m:${s.toString().padLeft(2, '0')}';
  }

  Future<void> _openExternal() async {
    final uri = Uri.tryParse(widget.url);
    if (uri != null) {
      await launchUrl(uri, mode: LaunchMode.externalApplication);
    }
  }

  @override
  Widget build(BuildContext context) {
    final ctrl = _controller;
    final initialized = ctrl != null && ctrl.value.isInitialized;
    final playing = initialized && ctrl.value.isPlaying;
    final duration = initialized ? ctrl.value.duration : Duration.zero;
    final position = initialized ? ctrl.value.position : Duration.zero;
    final ratio = initialized && ctrl.value.aspectRatio > 0
        ? ctrl.value.aspectRatio
        : 16 / 9;

    return Column(
      mainAxisSize: MainAxisSize.min,
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Container(
          color: SonicColors.ink,
          padding: const EdgeInsets.fromLTRB(14, 10, 8, 10),
          child: Row(
            children: [
              const Icon(
                Icons.smart_display,
                size: 18,
                color: SonicColors.voltageCyan,
              ),
              const SizedBox(width: 8),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      widget.title.toUpperCase(),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: SonicMachineTheme.labelTech(
                        fontSize: 11,
                        color: SonicColors.foundation,
                        letterSpacing: 0.8,
                      ),
                    ),
                    if (widget.subtitle != null &&
                        widget.subtitle!.trim().isNotEmpty)
                      Text(
                        widget.subtitle!.toUpperCase(),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: SonicMachineTheme.labelTech(
                          fontSize: 8.5,
                          color: SonicColors.seamMuted,
                        ),
                      ),
                  ],
                ),
              ),
              IconButton(
                tooltip: 'Open video externally',
                icon: const Icon(
                  Icons.open_in_new,
                  size: 18,
                  color: SonicColors.foundation,
                ),
                onPressed: _openExternal,
              ),
              IconButton(
                tooltip: 'Close video',
                icon: const Icon(
                  Icons.close,
                  size: 20,
                  color: SonicColors.foundation,
                ),
                onPressed: () => Navigator.of(context).pop(),
              ),
            ],
          ),
        ),
        Container(
          color: Colors.black,
          constraints: BoxConstraints(
            maxHeight: MediaQuery.of(context).size.height * 0.56,
          ),
          child: Center(
            child: _initializing
                ? const Padding(
                    padding: EdgeInsets.all(48),
                    child: CircularProgressIndicator(
                      color: SonicColors.voltageCyan,
                    ),
                  )
                : _error != null || !initialized
                    ? Padding(
                        padding: const EdgeInsets.all(24),
                        child: Column(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            Text(
                              _error ?? 'Could not load video.',
                              textAlign: TextAlign.center,
                              style: SonicMachineTheme.labelTech(
                                fontSize: 10,
                                color: SonicColors.foundation,
                              ),
                            ),
                            const SizedBox(height: 12),
                            SonicPowerButton(
                              label: 'Open Video URL',
                              icon: Icons.open_in_new,
                              compact: true,
                              onPressed: _openExternal,
                            ),
                          ],
                        ),
                      )
                    : AspectRatio(
                        aspectRatio: ratio,
                        child: GestureDetector(
                          onTap: () => playing ? ctrl.pause() : ctrl.play(),
                          child: VideoPlayer(ctrl),
                        ),
                      ),
          ),
        ),
        if (initialized)
          Container(
            color: SonicColors.ink,
            padding: const EdgeInsets.fromLTRB(12, 6, 12, 10),
            child: Row(
              children: [
                IconButton(
                  icon: Icon(
                    playing ? Icons.pause : Icons.play_arrow,
                    color: SonicColors.voltageCyan,
                  ),
                  onPressed: () => playing ? ctrl.pause() : ctrl.play(),
                ),
                Text(
                  _fmt(position),
                  style: SonicMachineTheme.labelTech(
                    fontSize: 9.5,
                    color: SonicColors.foundation,
                  ),
                ),
                Expanded(
                  child: SliderTheme(
                    data: SliderTheme.of(context).copyWith(
                      activeTrackColor: SonicColors.signalRed,
                      inactiveTrackColor:
                          SonicColors.foundation.withValues(alpha: 0.2),
                      thumbColor: SonicColors.voltageCyan,
                      trackHeight: 3,
                    ),
                    child: Slider(
                      value: duration.inMilliseconds > 0
                          ? position.inMilliseconds
                              .clamp(0, duration.inMilliseconds)
                              .toDouble()
                          : 0.0,
                      max: duration.inMilliseconds > 0
                          ? duration.inMilliseconds.toDouble()
                          : 1.0,
                      onChanged: (v) =>
                          ctrl.seekTo(Duration(milliseconds: v.round())),
                    ),
                  ),
                ),
                Text(
                  _fmt(duration),
                  style: SonicMachineTheme.labelTech(
                    fontSize: 9.5,
                    color: SonicColors.seamMuted,
                  ),
                ),
              ],
            ),
          ),
      ],
    );
  }
}
