import 'dart:math' as math;

import 'package:material_ui/material_ui.dart';

import '../theme/sonic_machine_theme.dart';

/// 60fps Constructivist 16x8 mechanical signal spectrogram rendered via `CustomPainter`.
///
/// Mirrors `src/components/Spectrogram.tsx` without DOM repaints. When live audio
/// is playing, harmonic oscillators animate across 16 frequency bands; when paused
/// or idle, cells settle cleanly to the baseline grid.
class SonicVisualizer extends StatefulWidget {
  const SonicVisualizer({
    super.key,
    required this.isPlaying,
    this.isBuffering = false,
    this.activeColor = SonicColors.voltageCyan,
    this.columns = 16,
    this.rows = 8,
    this.height = 72,
  });

  final bool isPlaying;
  final bool isBuffering;
  final Color activeColor;
  final int columns;
  final int rows;
  final double height;

  @override
  State<SonicVisualizer> createState() => _SonicVisualizerState();
}

class _SonicVisualizerState extends State<SonicVisualizer>
    with SingleTickerProviderStateMixin {
  late final AnimationController _controller;

  @override
  void initState() {
    super.initState();
    _controller = AnimationController(
      vsync: this,
      duration: const Duration(seconds: 6),
    );
    _syncAnimation();
  }

  @override
  void didUpdateWidget(covariant SonicVisualizer oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.isPlaying != widget.isPlaying ||
        oldWidget.isBuffering != widget.isBuffering) {
      _syncAnimation();
    }
  }

  void _syncAnimation() {
    if (widget.isPlaying || widget.isBuffering) {
      if (!_controller.isAnimating) {
        _controller.repeat();
      }
    } else {
      _controller.stop();
    }
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      height: widget.height,
      width: double.infinity,
      child: AnimatedBuilder(
        animation: _controller,
        builder: (context, _) {
          return CustomPaint(
            painter: _SpectrogramPainter(
              phase: _controller.value * math.pi * 2,
              isPlaying: widget.isPlaying,
              isBuffering: widget.isBuffering,
              activeColor: widget.activeColor,
              columns: widget.columns,
              rows: widget.rows,
            ),
          );
        },
      ),
    );
  }
}

class _SpectrogramPainter extends CustomPainter {
  const _SpectrogramPainter({
    required this.phase,
    required this.isPlaying,
    required this.isBuffering,
    required this.activeColor,
    required this.columns,
    required this.rows,
  });

  final double phase;
  final bool isPlaying;
  final bool isBuffering;
  final Color activeColor;
  final int columns;
  final int rows;

  @override
  void paint(Canvas canvas, Size size) {
    const gap = 2.0;
    final cellW = (size.width - gap * (columns - 1)) / columns;
    final cellH = (size.height - gap * (rows - 1)) / rows;
    if (cellW <= 0 || cellH <= 0) return;

    final paint = Paint()..style = PaintingStyle.fill;

    for (var col = 0; col < columns; col++) {
      final double level;
      if (isPlaying) {
        // Multi-harmonic signal envelope shaped like a real radio spectrum
        // (stronger bass/mids, livelier treble).
        final bassBias = 1.0 - (col / columns) * 0.35;
        final w1 = math.sin(phase * 3.0 + col * 0.55);
        final w2 = math.sin(phase * 5.0 - col * 0.92) * 0.5;
        final w3 = math.cos(phase * 8.0 + col * 1.45) * 0.3;
        level = (((w1 + w2 + w3) * 0.3 + 0.55) * bassBias).clamp(0.12, 1.0);
      } else if (isBuffering) {
        final sweep = ((phase / (math.pi * 2)) * columns) % columns;
        final dist = (col - sweep).abs();
        level = dist < 2.2 ? (1.0 - dist / 2.5) * 0.65 : 0.08;
      } else {
        level = 0.0;
      }

      final activeRows = (level * rows).round();

      for (var row = 0; row < rows; row++) {
        final isActive = row >= rows - activeRows;
        final isPeak = isActive && row == rows - activeRows && level > 0.72;
        if (isPeak) {
          paint.color = SonicColors.signalRed;
        } else if (isActive) {
          paint.color = activeColor.withValues(alpha: 0.35 + level * 0.65);
        } else {
          paint.color = SonicColors.ink.withValues(alpha: 0.07);
        }

        final rect = Rect.fromLTWH(
          col * (cellW + gap),
          row * (cellH + gap),
          cellW,
          cellH,
        );
        canvas.drawRect(rect, paint);
      }
    }
  }

  @override
  bool shouldRepaint(covariant _SpectrogramPainter oldDelegate) {
    return oldDelegate.phase != phase ||
        oldDelegate.isPlaying != isPlaying ||
        oldDelegate.isBuffering != isBuffering ||
        oldDelegate.activeColor != activeColor;
  }
}
