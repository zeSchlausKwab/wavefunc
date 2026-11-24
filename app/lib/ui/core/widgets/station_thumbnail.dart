import 'package:cached_network_image/cached_network_image.dart';
import 'package:material_ui/material_ui.dart';

import '../theme/sonic_machine_theme.dart';

/// Square 0px-radius station artwork with `#252418` Constructivist radio fallback.
class StationThumbnail extends StatelessWidget {
  const StationThumbnail({
    super.key,
    required this.url,
    this.size = 56,
    this.borderWidth = 2,
    this.highlight = false,
  });

  final String? url;
  final double size;
  final double borderWidth;
  final bool highlight;

  @override
  Widget build(BuildContext context) {
    final cleanUrl = url?.trim();
    final hasValidUrl = cleanUrl != null &&
        (cleanUrl.startsWith('http://') || cleanUrl.startsWith('https://'));

    return Container(
      width: size,
      height: size,
      decoration: BoxDecoration(
        color: SonicColors.thumbnailDark,
        border: Border.all(
          color: highlight ? SonicColors.voltageCyan : SonicColors.ink,
          width: borderWidth,
        ),
      ),
      child: hasValidUrl
          ? CachedNetworkImage(
              imageUrl: cleanUrl,
              fit: BoxFit.cover,
              fadeInDuration: const Duration(milliseconds: 120),
              placeholder: (_, _) => _fallback(),
              errorWidget: (_, _, _) => _fallback(),
            )
          : _fallback(),
    );
  }

  Widget _fallback() {
    return Container(
      color: SonicColors.thumbnailDark,
      alignment: Alignment.center,
      child: Icon(
        Icons.radio,
        size: size * 0.48,
        color: SonicColors.foundation.withValues(alpha: 0.22),
      ),
    );
  }
}
