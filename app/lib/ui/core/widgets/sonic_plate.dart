import 'package:material_ui/material_ui.dart';

import '../theme/sonic_machine_theme.dart';

/// Rectangular Constructivist "plate" with 0px radius, heavy border, and hard offset shadow.
class SonicPlate extends StatelessWidget {
  const SonicPlate({
    super.key,
    required this.child,
    this.backgroundColor = SonicColors.surfacePlate,
    this.borderColor = SonicColors.ink,
    this.shadowColor = SonicColors.ink,
    this.borderWidth = 2.0,
    this.shadowOffset = const Offset(4, 4),
    this.padding,
    this.onTap,
  });

  final Widget child;
  final Color backgroundColor;
  final Color borderColor;
  final Color shadowColor;
  final double borderWidth;
  final Offset shadowOffset;
  final EdgeInsetsGeometry? padding;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final container = Container(
      decoration: BoxDecoration(
        color: backgroundColor,
        border: Border.all(color: borderColor, width: borderWidth),
        boxShadow: shadowOffset == Offset.zero
            ? null
            : [
                BoxShadow(
                  color: shadowColor,
                  offset: shadowOffset,
                  blurRadius: 0,
                  spreadRadius: 0,
                ),
              ],
      ),
      padding: padding,
      child: child,
    );

    if (onTap == null) return container;

    return Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: onTap,
        splashColor: SonicColors.voltageCyan.withValues(alpha: 0.25),
        highlightColor: SonicColors.voltageCyan.withValues(alpha: 0.12),
        child: container,
      ),
    );
  }
}

/// Primary Constructivist "Power Switch" button (`primary` signal red + 4px hard offset shadow).
class SonicPowerButton extends StatelessWidget {
  const SonicPowerButton({
    super.key,
    required this.label,
    required this.onPressed,
    this.icon,
    this.primary = true,
    this.active = false,
    this.compact = false,
  });

  final String label;
  final VoidCallback? onPressed;
  final IconData? icon;
  final bool primary;
  final bool active;
  final bool compact;

  @override
  Widget build(BuildContext context) {
    final bg = active
        ? SonicColors.voltageCyan
        : (primary ? SonicColors.signalRed : SonicColors.foundation);
    final fg = active
        ? SonicColors.ink
        : (primary ? SonicColors.onSignal : SonicColors.ink);
    final shadow = onPressed == null
        ? Offset.zero
        : (primary ? const Offset(4, 4) : const Offset(3, 3));

    return Opacity(
      opacity: onPressed == null ? 0.5 : 1.0,
      child: SonicPlate(
        backgroundColor: bg,
        borderColor: SonicColors.ink,
        shadowColor: SonicColors.ink,
        shadowOffset: shadow,
        padding: EdgeInsets.symmetric(
          horizontal: compact ? 10 : 16,
          vertical: compact ? 7 : 11,
        ),
        onTap: onPressed,
        child: Row(
          mainAxisSize: MainAxisSize.min,
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            if (icon != null) ...[
              Icon(icon, size: compact ? 15 : 18, color: fg),
              const SizedBox(width: 6),
            ],
            Flexible(
              child: Text(
                label.toUpperCase(),
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: SonicMachineTheme.labelTech(
                  fontSize: compact ? 10 : 12,
                  color: fg,
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// Heavy 2px structural seam with Constructivist crosshair markers and technical title.
class SonicSectionHeader extends StatelessWidget {
  const SonicSectionHeader({
    super.key,
    required this.title,
    this.trailing,
    this.accent = false,
  });

  final String title;
  final Widget? trailing;
  final bool accent;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Row(
          children: [
            Container(
              width: 10,
              height: 10,
              color: accent ? SonicColors.signalRed : SonicColors.ink,
            ),
            const SizedBox(width: 8),
            Expanded(
              child: Text(
                title.toUpperCase(),
                style: SonicMachineTheme.labelTech(
                  fontSize: 12,
                  color: SonicColors.ink,
                  letterSpacing: 1.8,
                ),
              ),
            ),
            ?trailing,
          ],
        ),
        const SizedBox(height: 6),
        Container(height: 2, color: SonicColors.seamOutline),
      ],
    );
  }
}

/// Technical tag badge (0px radius, uppercase).
class SonicTag extends StatelessWidget {
  const SonicTag({
    super.key,
    required this.label,
    this.highlighted = false,
    this.inverted = false,
    this.onTap,
  });

  final String label;
  final bool highlighted;
  final bool inverted;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final bg = highlighted
        ? SonicColors.voltageCyan
        : (inverted ? SonicColors.ink : SonicColors.foundation);
    final fg = highlighted
        ? SonicColors.ink
        : (inverted ? SonicColors.foundation : SonicColors.ink);

    final badge = Container(
      padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 3),
      decoration: BoxDecoration(
        color: bg,
        border: Border.all(
          color: inverted ? SonicColors.ink : SonicColors.seamOutline,
          width: 1.5,
        ),
      ),
      child: Text(
        label.toUpperCase(),
        style: SonicMachineTheme.labelTech(
          fontSize: 9.5,
          color: fg,
          letterSpacing: 1.0,
        ),
      ),
    );

    if (onTap == null) return badge;
    return GestureDetector(onTap: onTap, child: badge);
  }
}
