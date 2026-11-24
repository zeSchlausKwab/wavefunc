import 'dart:math' as math;

import 'package:flutter/scheduler.dart';
import 'package:material_ui/material_ui.dart';

import '../../../src/rust/api/wavefunc.dart' as frb;
import '../../../src/rust/frb_generated.dart';
import '../theme/sonic_machine_theme.dart';

/// 60fps Constructivist LED matrix spectrometer (`CustomPainter`).
///
/// Driven by real-time 16-band logarithmic FFT audio data decoded from the live
/// radio stream by `wavefunc-core`'s pure-Rust `symphonia` audio proxy (zero
/// microphone permission required across macOS, Android, Linux, and Windows).
/// Falls back cleanly to a calm carrier wave when playing HLS or in tests.
class SonicVisualizer extends StatefulWidget {
  const SonicVisualizer({
    super.key,
    required this.isPlaying,
    this.isBuffering = false,
    this.activeColor = SonicColors.voltageCyan,
    this.columns = 16,
    this.rows = 8,
    this.height = 72,
    this.subtleBackground = false,
  });

  final bool isPlaying;
  final bool isBuffering;
  final Color activeColor;
  final int columns;
  final int rows;
  final double height;

  /// When true, renders softly behind player chrome (e.g. mobile bottom bar)
  /// with translucent bars and no heavy inactive cell grid.
  final bool subtleBackground;

  @override
  State<SonicVisualizer> createState() => _SonicVisualizerState();
}

class _SonicVisualizerState extends State<SonicVisualizer>
    with SingleTickerProviderStateMixin {
  late final Ticker _ticker;
  Duration _lastElapsed = Duration.zero;
  double _time = 0.0;
  late List<double> _levels;
  late List<double> _peaks;
  late List<double> _peakVelocities;

  @override
  void initState() {
    super.initState();
    _initBands(widget.columns);
    _ticker = createTicker(_onTick);
    _syncTicker();
  }

  void _initBands(int count) {
    _levels = List<double>.filled(count, 0.0);
    _peaks = List<double>.filled(count, 0.0);
    _peakVelocities = List<double>.filled(count, 0.0);
  }

  @override
  void didUpdateWidget(covariant SonicVisualizer oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.columns != widget.columns) {
      _initBands(widget.columns);
    }
    if (oldWidget.isPlaying != widget.isPlaying ||
        oldWidget.isBuffering != widget.isBuffering) {
      _syncTicker();
    }
  }

  void _syncTicker() {
    if (widget.isPlaying || widget.isBuffering) {
      if (!_ticker.isActive) {
        _lastElapsed = Duration.zero;
        _ticker.start();
      }
    } else {
      if (_ticker.isActive) {
        _ticker.stop();
      }
      setState(() {
        for (var i = 0; i < _levels.length; i++) {
          _levels[i] = 0.0;
          _peaks[i] = 0.0;
          _peakVelocities[i] = 0.0;
        }
      });
    }
  }

  frb.FrbAudioSpectrum? _readLiveSpectrum() {
    if (!widget.isPlaying || !RustLib.instance.initialized) return null;
    try {
      final snap = frb.getAudioSpectrum();
      if (snap.isLive && snap.bands.isNotEmpty) {
        return snap;
      }
    } catch (_) {}
    return null;
  }

  void _onTick(Duration elapsed) {
    final dt = _lastElapsed == Duration.zero
        ? 0.016
        : ((elapsed - _lastElapsed).inMicroseconds / 1e6).clamp(0.004, 0.05);
    _lastElapsed = elapsed;
    _time += dt;

    final cols = widget.columns;
    final live = _readLiveSpectrum();

    for (var col = 0; col < cols; col++) {
      final double target;
      if (live != null) {
        // Linearly resample the 16 real FFT bands across `cols`.
        final bands = live.bands;
        final pos = cols <= 1
            ? 0.0
            : (col / (cols - 1)) * (bands.length - 1);
        final lo = pos.floor().clamp(0, bands.length - 1);
        final hi = pos.ceil().clamp(0, bands.length - 1);
        final frac = pos - lo;
        final raw = bands[lo] * (1.0 - frac) + bands[hi] * frac;
        target = raw.clamp(0.0, 1.0);
      } else if (widget.isBuffering) {
        final sweep = (_time * cols * 1.4) % cols;
        final dist = (col - sweep).abs();
        target = dist < 2.2 ? (1.0 - dist / 2.4) * 0.72 : 0.08;
      } else if (widget.isPlaying) {
        // Gentle carrier indicator for streams without raw PCM tap (e.g. HLS).
        final norm = cols <= 1 ? 0.0 : col / (cols - 1);
        final carrier =
            0.22 + 0.14 * math.sin(_time * 4.5 + norm * math.pi * 2.0);
        target = carrier.clamp(0.08, 0.42);
      } else {
        target = 0.0;
      }

      // Crisp fast attack for real transients, smooth natural release.
      final cur = _levels[col];
      final rate = live != null
          ? (target > cur ? 42.0 : 14.0)
          : (target > cur ? 18.0 : 9.0);
      final next = cur + (target - cur) * (1.0 - math.exp(-rate * dt));
      _levels[col] = next;

      // Gravity peak-hold indicator.
      if (next >= _peaks[col]) {
        _peaks[col] = next;
        _peakVelocities[col] = 0.0;
      } else {
        _peakVelocities[col] += 1.65 * dt;
        _peaks[col] = math.max(next, _peaks[col] - _peakVelocities[col] * dt);
      }
    }

    setState(() {});
  }

  @override
  void dispose() {
    _ticker.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      height: widget.height,
      width: double.infinity,
      child: CustomPaint(
        painter: _SpectrogramPainter(
          levels: _levels,
          peaks: _peaks,
          isPlaying: widget.isPlaying,
          isBuffering: widget.isBuffering,
          activeColor: widget.activeColor,
          rows: widget.rows,
          subtleBackground: widget.subtleBackground,
        ),
      ),
    );
  }
}

class _SpectrogramPainter extends CustomPainter {
  const _SpectrogramPainter({
    required this.levels,
    required this.peaks,
    required this.isPlaying,
    required this.isBuffering,
    required this.activeColor,
    required this.rows,
    required this.subtleBackground,
  });

  final List<double> levels;
  final List<double> peaks;
  final bool isPlaying;
  final bool isBuffering;
  final Color activeColor;
  final int rows;
  final bool subtleBackground;

  @override
  void paint(Canvas canvas, Size size) {
    final columns = levels.length;
    if (columns == 0) return;

    final gap = subtleBackground ? 2.5 : 2.0;
    final cellW = (size.width - gap * (columns - 1)) / columns;
    final cellH = (size.height - gap * (rows - 1)) / rows;
    if (cellW <= 0 || cellH <= 0) return;

    final paint = Paint()..style = PaintingStyle.fill;

    for (var col = 0; col < columns; col++) {
      final level = levels[col];
      final peak = peaks[col];
      final activeRows = (level * rows).round().clamp(0, rows);
      final peakRow =
          peak > 0.12 ? (rows - (peak * rows).round().clamp(1, rows)) : -1;

      for (var row = 0; row < rows; row++) {
        final isActive = row >= rows - activeRows;
        final isPeakCap = !subtleBackground &&
            isPlaying &&
            row == peakRow &&
            peak > 0.58;
        final isSubtlePeak =
            subtleBackground && isPlaying && row == peakRow && peak > 0.72;

        if (isPeakCap) {
          paint.color = SonicColors.signalRed;
        } else if (isSubtlePeak) {
          paint.color = SonicColors.signalRed.withValues(alpha: 0.34);
        } else if (isActive) {
          if (subtleBackground) {
            final heightRatio = (rows - row) / rows;
            paint.color =
                activeColor.withValues(alpha: 0.08 + heightRatio * 0.16);
          } else {
            paint.color = activeColor.withValues(alpha: 0.38 + level * 0.62);
          }
        } else {
          if (subtleBackground) continue;
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
  bool shouldRepaint(covariant _SpectrogramPainter oldDelegate) => true;
}
