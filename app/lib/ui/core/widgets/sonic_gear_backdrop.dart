import 'package:material_ui/material_ui.dart';

import '../theme/sonic_machine_theme.dart';

/// Architectural Constructivist backdrop with non-functional circular "gear" arcs
/// and subtle blueprint grid lines behind the content surface.
class SonicGearBackdrop extends StatelessWidget {
  const SonicGearBackdrop({super.key, required this.child});

  final Widget child;

  @override
  Widget build(BuildContext context) {
    return Stack(
      children: [
        const Positioned.fill(
          child: IgnorePointer(
            child: CustomPaint(painter: _ConstructivistBackdropPainter()),
          ),
        ),
        child,
      ],
    );
  }
}

class _ConstructivistBackdropPainter extends CustomPainter {
  const _ConstructivistBackdropPainter();

  @override
  void paint(Canvas canvas, Size size) {
    // Large architectural circular arc tucked in top-right corner.
    final arcPaint = Paint()
      ..color = SonicColors.seamOutline.withValues(alpha: 0.14)
      ..style = PaintingStyle.stroke
      ..strokeWidth = 2.0;

    canvas.drawCircle(
      Offset(size.width * 0.92, 64),
      138,
      arcPaint,
    );
    canvas.drawCircle(
      Offset(size.width * 0.92, 64),
      92,
      arcPaint..strokeWidth = 1.2,
    );

    // Subtle secondary mechanical ring near bottom-left.
    final cyanRing = Paint()
      ..color = SonicColors.voltageCyan.withValues(alpha: 0.12)
      ..style = PaintingStyle.stroke
      ..strokeWidth = 3.0;
    canvas.drawCircle(
      Offset(-20, size.height * 0.78),
      110,
      cyanRing,
    );

    // Blueprint crosshair ticks (gives tactile drafting-table feel at <6% opacity).
    final tickPaint = Paint()
      ..color = SonicColors.ink.withValues(alpha: 0.05)
      ..strokeWidth = 1.0;

    const step = 48.0;
    for (double y = step; y < size.height; y += step * 2) {
      for (double x = step; x < size.width; x += step * 2) {
        canvas.drawLine(Offset(x - 3, y), Offset(x + 3, y), tickPaint);
        canvas.drawLine(Offset(x, y - 3), Offset(x, y + 3), tickPaint);
      }
    }
  }

  @override
  bool shouldRepaint(covariant CustomPainter oldDelegate) => false;
}
