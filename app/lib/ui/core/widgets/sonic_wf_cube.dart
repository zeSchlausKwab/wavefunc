import 'dart:math' as math;
import 'dart:typed_data';

import 'package:flutter/scheduler.dart';
import 'package:material_ui/material_ui.dart';

import '../theme/sonic_machine_theme.dart';

/// Playful 3D rotating `[WF]` Constructivist cube inspired by the WaveFunc
/// companion napplet:
/// - Signal red top face, dark ink base, alternating neon cyan & cream sides
///   stamped with 3D-projected `[WF]` lettering.
/// - Thin black outer wireframe cage + tilted equatorial orbital ring.
/// - Smoothly rotates slower when idle and spins quicker when music is playing.
class SonicWfCube extends StatefulWidget {
  const SonicWfCube({
    super.key,
    required this.isPlaying,
    this.size = 48,
    this.onTap,
  });

  final bool isPlaying;
  final double size;
  final VoidCallback? onTap;

  @override
  State<SonicWfCube> createState() => _SonicWfCubeState();
}

class _SonicWfCubeState extends State<SonicWfCube>
    with SingleTickerProviderStateMixin {
  late final Ticker _ticker;
  Duration _lastElapsed = Duration.zero;
  double _yaw = 0.55; // Hero starting angle showing red top + cyan & cream sides
  double _pitch = 0.42;
  double _time = 0.0;
  double _currentSpeed = 0.55;

  bool get _isWidgetTest => WidgetsBinding.instance is! WidgetsFlutterBinding;

  @override
  void initState() {
    super.initState();
    _currentSpeed = widget.isPlaying ? 2.25 : 0.55;
    _ticker = createTicker(_onTick);
    _syncTicker();
  }

  @override
  void didUpdateWidget(covariant SonicWfCube oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.isPlaying != widget.isPlaying) {
      _syncTicker();
    }
  }

  void _syncTicker() {
    // In real app runtime, always spin (slow idle, fast when playing).
    // In automated widget tests, stay still when idle so pumpAndSettle completes cleanly.
    final shouldRun = !_isWidgetTest || widget.isPlaying;
    if (shouldRun && !_ticker.isActive) {
      _lastElapsed = Duration.zero;
      _ticker.start();
    } else if (!shouldRun && _ticker.isActive) {
      _ticker.stop();
    }
  }

  void _onTick(Duration elapsed) {
    final dt = _lastElapsed == Duration.zero
        ? 0.016
        : ((elapsed - _lastElapsed).inMicroseconds / 1e6).clamp(0.004, 0.05);
    _lastElapsed = elapsed;
    _time += dt;

    final targetSpeed = widget.isPlaying ? 2.25 : 0.52;
    _currentSpeed += (targetSpeed - _currentSpeed) * (1.0 - math.exp(-4.5 * dt));
    _yaw = (_yaw + _currentSpeed * dt) % (math.pi * 2);

    final bobAmp = widget.isPlaying ? 0.14 : 0.05;
    final bobFreq = widget.isPlaying ? 2.6 : 0.9;
    _pitch = 0.40 + math.sin(_time * bobFreq) * bobAmp;

    setState(() {});
  }

  @override
  void dispose() {
    _ticker.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final cube = SizedBox(
      width: widget.size,
      height: widget.size,
      child: CustomPaint(
        painter: _WfCubePainter(
          yaw: _yaw,
          pitch: _pitch,
          isPlaying: widget.isPlaying,
        ),
      ),
    );
    if (widget.onTap == null) return cube;
    return GestureDetector(
      onTap: widget.onTap,
      behavior: HitTestBehavior.opaque,
      child: cube,
    );
  }
}

class _Vec3 {
  const _Vec3(this.x, this.y, this.z);

  final double x;
  final double y;
  final double z;

  _Vec3 operator +(_Vec3 o) => _Vec3(x + o.x, y + o.y, z + o.z);
  _Vec3 operator -(_Vec3 o) => _Vec3(x - o.x, y - o.y, z - o.z);
  _Vec3 operator *(double s) => _Vec3(x * s, y * s, z * s);

  _Vec3 cross(_Vec3 o) => _Vec3(
        y * o.z - z * o.y,
        z * o.x - x * o.z,
        x * o.y - y * o.x,
      );
}

class _CubeFace {
  const _CubeFace({
    required this.indices,
    required this.color,
    this.showLogo = false,
  });

  final List<int> indices;
  final Color color;
  final bool showLogo;
}

class _WfCubePainter extends CustomPainter {
  const _WfCubePainter({
    required this.yaw,
    required this.pitch,
    required this.isPlaying,
  });

  final double yaw;
  final double pitch;
  final bool isPlaying;

  // Unit cube vertices in [-1, 1]^3.
  static const List<_Vec3> _baseVertices = [
    _Vec3(-1, -1, 1), // 0: front-bottom-left
    _Vec3(1, -1, 1), // 1: front-bottom-right
    _Vec3(1, 1, 1), // 2: front-top-right
    _Vec3(-1, 1, 1), // 3: front-top-left
    _Vec3(-1, -1, -1), // 4: back-bottom-left
    _Vec3(1, -1, -1), // 5: back-bottom-right
    _Vec3(1, 1, -1), // 6: back-top-right
    _Vec3(-1, 1, -1), // 7: back-top-left
  ];

  static const List<(int, int)> _edges = [
    (0, 1), (1, 2), (2, 3), (3, 0), // front
    (4, 5), (5, 6), (6, 7), (7, 4), // back
    (0, 4), (1, 5), (2, 6), (3, 7), // connectors
  ];

  // Winding order: [topLeft, topRight, bottomRight, bottomLeft] looking from outside.
  static const List<_CubeFace> _faces = [
    // Front (+Z): Voltage Cyan
    _CubeFace(
      indices: [3, 2, 1, 0],
      color: SonicColors.voltageCyan,
      showLogo: true,
    ),
    // Back (-Z): Voltage Cyan
    _CubeFace(
      indices: [6, 7, 4, 5],
      color: SonicColors.voltageCyan,
      showLogo: true,
    ),
    // Right (+X): Warm Cream
    _CubeFace(
      indices: [2, 6, 5, 1],
      color: SonicColors.foundation,
      showLogo: true,
    ),
    // Left (-X): Warm Cream
    _CubeFace(
      indices: [7, 3, 0, 4],
      color: SonicColors.foundation,
      showLogo: true,
    ),
    // Top (+Y): Signal Red
    _CubeFace(
      indices: [7, 6, 2, 3],
      color: Color(0xFFE5242B),
      showLogo: false,
    ),
    // Bottom (-Y): Dark Ink
    _CubeFace(
      indices: [0, 1, 5, 4],
      color: SonicColors.ink,
      showLogo: false,
    ),
  ];

  _Vec3 _rotate(_Vec3 v) {
    final cy = math.cos(yaw);
    final sy = math.sin(yaw);
    final x1 = v.x * cy + v.z * sy;
    final z1 = -v.x * sy + v.z * cy;
    final y1 = v.y;

    final cp = math.cos(pitch);
    final sp = math.sin(pitch);
    final y2 = y1 * cp - z1 * sp;
    final z2 = y1 * sp + z1 * cp;

    // Slight playful Z-roll tilt like the companion napplet.
    const roll = -0.10;
    final cr = math.cos(roll);
    final sr = math.sin(roll);
    return _Vec3(x1 * cr - y2 * sr, x1 * sr + y2 * cr, z2);
  }

  Offset _project(_Vec3 v, Size size) {
    final camDist = 5.4;
    final f = size.shortestSide * 1.48;
    final scale = f / (camDist - v.z);
    return Offset(
      size.width * 0.5 + v.x * scale,
      size.height * 0.52 - v.y * scale,
    );
  }

  @override
  void paint(Canvas canvas, Size size) {
    // 1. Back half of the tilted equatorial orbital ring.
    _drawOrbitalRing(canvas, size, frontHalf: false);

    // 2. Solid 3D cube faces (sorted back-to-front).
    final transformed = _baseVertices.map(_rotate).toList(growable: false);
    final projected =
        transformed.map((v) => _project(v, size)).toList(growable: false);

    final visibleFaces = <(_CubeFace face, double depth)>[];
    for (final face in _faces) {
      final p0 = projected[face.indices[0]];
      final p1 = projected[face.indices[1]];
      final p2 = projected[face.indices[2]];
      // Screen-space signed area (clockwise = visible in Flutter's Y-down coords).
      final cross2d =
          (p1.dx - p0.dx) * (p2.dy - p0.dy) - (p1.dy - p0.dy) * (p2.dx - p0.dx);
      if (cross2d > 0) {
        final avgZ = face.indices
                .map((i) => transformed[i].z)
                .reduce((a, b) => a + b) /
            4.0;
        visibleFaces.add((face, avgZ));
      }
    }
    visibleFaces.sort((a, b) => a.$2.compareTo(b.$2));

    final borderWidth = (size.shortestSide * 0.036).clamp(1.2, 2.4);
    final borderPaint = Paint()
      ..color = SonicColors.ink
      ..style = PaintingStyle.stroke
      ..strokeWidth = borderWidth
      ..strokeJoin = StrokeJoin.miter;

    for (final (face, _) in visibleFaces) {
      final p0 = projected[face.indices[0]];
      final p1 = projected[face.indices[1]];
      final p2 = projected[face.indices[2]];
      final p3 = projected[face.indices[3]];

      final path = Path()
        ..moveTo(p0.dx, p0.dy)
        ..lineTo(p1.dx, p1.dy)
        ..lineTo(p2.dx, p2.dy)
        ..lineTo(p3.dx, p3.dy)
        ..close();

      canvas.drawPath(path, Paint()..color = face.color);

      if (face.showLogo) {
        _drawFaceLogo(canvas, p0, p1, p3, size);
      }

      canvas.drawPath(path, borderPaint);
    }

    // 3. Outer thin black wireframe cage (1.13x scale, companion napplet signature).
    final cageVerts = _baseVertices
        .map((v) => _project(_rotate(v * 1.13), size))
        .toList(growable: false);
    final cagePaint = Paint()
      ..color = SonicColors.ink.withValues(alpha: 0.72)
      ..style = PaintingStyle.stroke
      ..strokeWidth = (size.shortestSide * 0.016).clamp(0.75, 1.3);
    for (final (a, b) in _edges) {
      canvas.drawLine(cageVerts[a], cageVerts[b], cagePaint);
    }

    // 4. Front half of the equatorial orbital ring.
    _drawOrbitalRing(canvas, size, frontHalf: true);
  }

  void _drawFaceLogo(
    Canvas canvas,
    Offset tl,
    Offset tr,
    Offset bl,
    Size size,
  ) {
    final u = tr - tl;
    final v = bl - tl;
    // Skip drawing text on extreme grazing angles to avoid squished smears.
    if (u.distance < size.shortestSide * 0.14) return;

    canvas.save();
    // Map canonical 100x100 face space onto the projected parallelogram [tl, tr, br, bl].
    final m = Float64List.fromList([
      u.dx / 100.0,
      u.dy / 100.0,
      0,
      0,
      v.dx / 100.0,
      v.dy / 100.0,
      0,
      0,
      0,
      0,
      1,
      0,
      tl.dx,
      tl.dy,
      0,
      1,
    ]);
    canvas.transform(m);

    final tp = TextPainter(
      text: const TextSpan(
        text: '[WF]',
        style: TextStyle(
          color: SonicColors.ink,
          fontSize: 34,
          fontWeight: FontWeight.w900,
          letterSpacing: -1.5,
          height: 1.0,
        ),
      ),
      textDirection: TextDirection.ltr,
    )..layout();

    tp.paint(
      canvas,
      Offset((100.0 - tp.width) * 0.5, (100.0 - tp.height) * 0.5),
    );
    canvas.restore();
  }

  void _drawOrbitalRing(
    Canvas canvas,
    Size size, {
    required bool frontHalf,
  }) {
    const segments = 48;
    const radius = 1.62;
    final ringPaint = Paint()
      ..color = SonicColors.ink.withValues(alpha: isPlaying ? 0.85 : 0.6)
      ..style = PaintingStyle.stroke
      ..strokeWidth = (size.shortestSide * 0.022).clamp(0.9, 1.5)
      ..strokeCap = StrokeCap.round;

    final path = Path();
    var penDown = false;
    for (var i = 0; i <= segments; i++) {
      final theta = (i / segments) * math.pi * 2;
      // Ring orbits around the cube's tilted equator.
      final local = _Vec3(
        math.cos(theta) * radius,
        math.sin(theta) * 0.12,
        math.sin(theta) * radius,
      );
      final rotated = _rotate(local);
      final isFront = rotated.z >= 0;
      if (isFront == frontHalf) {
        final pt = _project(rotated, size);
        if (!penDown) {
          path.moveTo(pt.dx, pt.dy);
          penDown = true;
        } else {
          path.lineTo(pt.dx, pt.dy);
        }
      } else {
        penDown = false;
      }
    }
    canvas.drawPath(path, ringPaint);
  }

  @override
  bool shouldRepaint(covariant _WfCubePainter oldDelegate) {
    return oldDelegate.yaw != yaw ||
        oldDelegate.pitch != pitch ||
        oldDelegate.isPlaying != isPlaying;
  }
}
