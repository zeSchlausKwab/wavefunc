import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/gestures.dart';
import 'package:material_ui/material_ui.dart';
import 'package:url_launcher/url_launcher.dart';

import '../theme/sonic_machine_theme.dart';
import 'sonic_plate.dart';
import 'video_player_sheet.dart';

final _urlRegex = RegExp(r'https?://[^\s<>()]+', caseSensitive: false);

({String url, String trailing}) _stripTrailingPunctuation(String raw) {
  var url = raw;
  var trailing = '';
  while (url.isNotEmpty && '.,!?;:\'")'.contains(url[url.length - 1])) {
    trailing = url[url.length - 1] + trailing;
    url = url.substring(0, url.length - 1);
  }
  return (url: url, trailing: trailing);
}

/// Renders a Nostr post body with clickable links plus Constructivist cards for
/// attached videos (`.mp4`/`.webm`), audio files (`.m4a`/`.mp3`), and images.
class RichNoteContent extends StatelessWidget {
  const RichNoteContent({
    super.key,
    required this.content,
    this.textStyle,
    this.onPlayAudioUrl,
    this.onBeforePlayVideo,
  });

  final String content;
  final TextStyle? textStyle;
  final void Function(String url)? onPlayAudioUrl;
  final Future<void> Function()? onBeforePlayVideo;

  Future<void> _launchExternal(String url) async {
    final uri = Uri.tryParse(url);
    if (uri != null) {
      await launchUrl(uri, mode: LaunchMode.externalApplication);
    }
  }

  @override
  Widget build(BuildContext context) {
    final baseStyle = textStyle ??
        Theme.of(context).textTheme.bodyMedium?.copyWith(height: 1.4) ??
        const TextStyle(fontSize: 14, color: SonicColors.ink);

    final spans = <InlineSpan>[];
    final videos = <String>[];
    final audios = <String>[];
    final images = <String>[];
    final seen = <String>{};

    var lastEnd = 0;
    for (final match in _urlRegex.allMatches(content)) {
      if (match.start > lastEnd) {
        spans.add(TextSpan(text: content.substring(lastEnd, match.start)));
      }
      final raw = match.group(0)!;
      final split = _stripTrailingPunctuation(raw);
      final url = split.url;

      if (isVideoMediaUrl(url)) {
        if (seen.add(url)) videos.add(url);
        if (split.trailing.isNotEmpty) {
          spans.add(TextSpan(text: split.trailing));
        }
      } else if (isAudioMediaUrl(url)) {
        if (seen.add(url)) audios.add(url);
        if (split.trailing.isNotEmpty) {
          spans.add(TextSpan(text: split.trailing));
        }
      } else if (isImageMediaUrl(url)) {
        if (seen.add(url)) images.add(url);
        if (split.trailing.isNotEmpty) {
          spans.add(TextSpan(text: split.trailing));
        }
      } else {
        spans.add(
          TextSpan(
            text: url,
            style: baseStyle.copyWith(
              color: SonicColors.signalRed,
              decoration: TextDecoration.underline,
              decorationColor: SonicColors.signalRed,
              fontWeight: FontWeight.w700,
            ),
            recognizer: TapGestureRecognizer()
              ..onTap = () => _launchExternal(url),
          ),
        );
        if (split.trailing.isNotEmpty) {
          spans.add(TextSpan(text: split.trailing));
        }
      }
      lastEnd = match.end;
    }

    if (lastEnd < content.length) {
      spans.add(TextSpan(text: content.substring(lastEnd)));
    }

    final plainTextCheck = spans
        .whereType<TextSpan>()
        .map((s) => s.text ?? '')
        .join()
        .trim();

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        if (plainTextCheck.isNotEmpty)
          Text.rich(
            TextSpan(style: baseStyle, children: spans),
          ),
        for (final url in videos) ...[
          const SizedBox(height: 8),
          SonicPlate(
            backgroundColor: SonicColors.ink,
            shadowOffset: const Offset(3, 3),
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
            onTap: () => VideoPlayerSheet.open(
              context,
              url: url,
              title: 'ATTACHED VIDEO',
              subtitle: Uri.tryParse(url)?.host,
              onBeforeOpen: onBeforePlayVideo,
            ),
            child: Row(
              children: [
                Container(
                  width: 36,
                  height: 36,
                  color: SonicColors.signalRed,
                  alignment: Alignment.center,
                  child: const Icon(
                    Icons.play_arrow,
                    color: SonicColors.onSignal,
                    size: 22,
                  ),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        'PLAY ATTACHED VIDEO',
                        style: SonicMachineTheme.labelTech(
                          fontSize: 10,
                          color: SonicColors.voltageCyan,
                          letterSpacing: 1.0,
                        ),
                      ),
                      const SizedBox(height: 2),
                      Text(
                        Uri.tryParse(url)?.host ?? url,
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
                const Icon(
                  Icons.smart_display_outlined,
                  size: 18,
                  color: SonicColors.foundation,
                ),
              ],
            ),
          ),
        ],
        for (final url in audios) ...[
          const SizedBox(height: 8),
          SonicPlate(
            backgroundColor: SonicColors.surfacePlate,
            shadowOffset: const Offset(2, 2),
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 9),
            onTap: () => onPlayAudioUrl != null
                ? onPlayAudioUrl!(url)
                : _launchExternal(url),
            child: Row(
              children: [
                Container(
                  width: 32,
                  height: 32,
                  color: SonicColors.signalRed,
                  alignment: Alignment.center,
                  child: const Icon(
                    Icons.audiotrack,
                    color: SonicColors.onSignal,
                    size: 18,
                  ),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        'PLAY ATTACHED AUDIO',
                        style: SonicMachineTheme.labelTech(
                          fontSize: 9.5,
                          color: SonicColors.ink,
                          letterSpacing: 1.0,
                        ),
                      ),
                      Text(
                        Uri.tryParse(url)?.host ?? url,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: SonicMachineTheme.labelTech(
                          fontSize: 8.5,
                          color: SonicColors.seamOutline,
                        ),
                      ),
                    ],
                  ),
                ),
                const Icon(Icons.play_arrow, size: 18, color: SonicColors.signalRed),
              ],
            ),
          ),
        ],
        if (images.isNotEmpty) ...[
          const SizedBox(height: 8),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: images.map((url) {
              return GestureDetector(
                onTap: () => _launchExternal(url),
                child: Container(
                  constraints: const BoxConstraints(
                    maxWidth: 320,
                    maxHeight: 220,
                  ),
                  decoration: BoxDecoration(
                    border: Border.all(color: SonicColors.ink, width: 2),
                    color: SonicColors.thumbnailDark,
                  ),
                  child: CachedNetworkImage(
                    imageUrl: url,
                    fit: BoxFit.cover,
                    errorWidget: (_, _, _) => Padding(
                      padding: const EdgeInsets.all(10),
                      child: Text(
                        url,
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                        style: SonicMachineTheme.labelTech(
                          fontSize: 9,
                          color: SonicColors.voltageCyan,
                        ),
                      ),
                    ),
                  ),
                ),
              );
            }).toList(),
          ),
        ],
      ],
    );
  }
}
