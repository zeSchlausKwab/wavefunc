import 'package:material_ui/material_ui.dart';
import 'package:google_fonts/google_fonts.dart';

/// Brutal Constructivist Editorial design system ("The Sonic Machine").
/// Directly implements `DESIGN.md`:
/// - Cream paper foundation (`#FEF9EA`)
/// - Deep charcoal structural ink (`#1D1C13`)
/// - High-alert signal red (`#B60013`)
/// - High-voltage neon cyan (`#00DBE9`)
/// - Heavy structural seams (`#926E6B`)
/// - 0px border radius everywhere; hard offset shadows only
class SonicColors {
  SonicColors._();

  static const Color foundation = Color(0xFFFEF9EA);
  static const Color surfaceLow = Color(0xFFF7F2E2);
  static const Color surfacePlate = Color(0xFFE7E2D3);
  static const Color ink = Color(0xFF1D1C13);
  static const Color thumbnailDark = Color(0xFF252418);
  static const Color signalRed = Color(0xFFB60013);
  static const Color signalRedDark = Color(0xFF8C000E);
  static const Color voltageCyan = Color(0xFF00DBE9);
  static const Color seamOutline = Color(0xFF926E6B);
  static const Color seamMuted = Color(0xFFB7A69D);
  static const Color onSignal = Color(0xFFFEF9EA);
}

class SonicMachineTheme {
  SonicMachineTheme._();

  static TextStyle labelTech({
    double fontSize = 11,
    Color color = SonicColors.ink,
    FontWeight fontWeight = FontWeight.w700,
    double letterSpacing = 1.4,
  }) {
    return GoogleFonts.spaceGrotesk(
      fontSize: fontSize,
      fontWeight: fontWeight,
      letterSpacing: letterSpacing,
      color: color,
    );
  }

  static ThemeData build() {
    TextStyle font({
      required double size,
      FontWeight weight = FontWeight.w400,
      double? letterSpacing,
      double? height,
      Color color = SonicColors.ink,
    }) {
      return GoogleFonts.spaceGrotesk(
        fontSize: size,
        fontWeight: weight,
        letterSpacing: letterSpacing,
        height: height,
        color: color,
      );
    }

    final textTheme = TextTheme(
      displayLarge: font(size: 48, weight: FontWeight.w700, letterSpacing: -1.2, height: 0.95),
      displayMedium: font(size: 36, weight: FontWeight.w700, letterSpacing: -0.8, height: 1.0),
      displaySmall: font(size: 28, weight: FontWeight.w700, letterSpacing: -0.5),
      headlineMedium: font(size: 24, weight: FontWeight.w700, letterSpacing: -0.4),
      headlineSmall: font(size: 20, weight: FontWeight.w700),
      titleLarge: font(size: 20, weight: FontWeight.w700),
      titleMedium: font(size: 15, weight: FontWeight.w700),
      titleSmall: font(size: 13, weight: FontWeight.w700),
      bodyLarge: font(size: 16),
      bodyMedium: font(size: 14),
      bodySmall: font(size: 12),
      labelLarge: labelTech(fontSize: 12),
      labelMedium: labelTech(),
      labelSmall: labelTech(fontSize: 9.5),
    );

    const colorScheme = ColorScheme(
      brightness: Brightness.light,
      primary: SonicColors.signalRed,
      onPrimary: SonicColors.onSignal,
      secondary: SonicColors.voltageCyan,
      onSecondary: SonicColors.ink,
      error: SonicColors.signalRed,
      onError: SonicColors.onSignal,
      surface: SonicColors.foundation,
      onSurface: SonicColors.ink,
      surfaceContainerHighest: SonicColors.surfacePlate,
      outline: SonicColors.seamOutline,
    );

    return ThemeData(
      useMaterial3: true,
      colorScheme: colorScheme,
      scaffoldBackgroundColor: SonicColors.foundation,
      textTheme: textTheme,
      appBarTheme: AppBarTheme(
        backgroundColor: SonicColors.foundation,
        foregroundColor: SonicColors.ink,
        elevation: 0,
        scrolledUnderElevation: 0,
        surfaceTintColor: Colors.transparent,
        titleTextStyle: GoogleFonts.spaceGrotesk(
          fontSize: 18,
          fontWeight: FontWeight.w700,
          letterSpacing: 1.2,
          color: SonicColors.ink,
        ),
      ),
      dividerTheme: const DividerThemeData(
        color: SonicColors.seamOutline,
        thickness: 2,
        space: 2,
      ),
      cardTheme: const CardThemeData(
        color: SonicColors.surfacePlate,
        elevation: 0,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.zero,
          side: BorderSide(color: SonicColors.ink, width: 2),
        ),
      ),
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: SonicColors.surfaceLow,
        border: const UnderlineInputBorder(
          borderRadius: BorderRadius.zero,
          borderSide: BorderSide(color: SonicColors.ink, width: 2),
        ),
        enabledBorder: const UnderlineInputBorder(
          borderRadius: BorderRadius.zero,
          borderSide: BorderSide(color: SonicColors.ink, width: 2),
        ),
        focusedBorder: const UnderlineInputBorder(
          borderRadius: BorderRadius.zero,
          borderSide: BorderSide(color: SonicColors.voltageCyan, width: 3),
        ),
        hintStyle: labelTech(
          fontSize: 12,
          color: SonicColors.seamOutline,
          fontWeight: FontWeight.w600,
        ),
      ),
      snackBarTheme: SnackBarThemeData(
        backgroundColor: SonicColors.ink,
        contentTextStyle: GoogleFonts.spaceGrotesk(
          color: SonicColors.foundation,
          fontWeight: FontWeight.w600,
          fontSize: 13,
        ),
        shape: const RoundedRectangleBorder(
          borderRadius: BorderRadius.zero,
          side: BorderSide(color: SonicColors.voltageCyan, width: 2),
        ),
        behavior: SnackBarBehavior.floating,
      ),
    );
  }
}
