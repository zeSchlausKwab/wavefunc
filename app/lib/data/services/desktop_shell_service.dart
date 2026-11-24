import 'dart:async';
import 'dart:io';

import 'package:flutter/foundation.dart';
import 'package:material_ui/material_ui.dart';
import 'package:tray_manager/tray_manager.dart';
import 'package:window_manager/window_manager.dart';

import '../../ui/features/player/view_models/player_view_model.dart';

/// Desktop OS integration (macOS / Linux / Windows):
/// - Window sizing, minimum bounds, and title (`window_manager`)
/// - Menu bar / system tray icon with live Now Playing readout & playback controls (`tray_manager`)
class DesktopShellService with TrayListener, WindowListener {
  DesktopShellService._();

  static final DesktopShellService instance = DesktopShellService._();

  static bool get isDesktop =>
      !kIsWeb && (Platform.isMacOS || Platform.isLinux || Platform.isWindows);

  PlayerViewModel? _playerViewModel;
  bool _initialized = false;
  String _lastTraySummary = '';

  Future<void> initializeWindow() async {
    if (!isDesktop || _initialized) return;
    try {
      await windowManager.ensureInitialized();
      const options = WindowOptions(
        size: Size(1340, 860),
        minimumSize: Size(920, 620),
        center: true,
        title: 'WaveFunc Radio',
        backgroundColor: Color(0xFFFEF9EA),
      );
      await windowManager.waitUntilReadyToShow(options, () async {
        await windowManager.show();
        await windowManager.focus();
      });
      windowManager.addListener(this);
      _initialized = true;
    } catch (e) {
      debugPrint('[WaveFunc] Desktop window_manager skipped: $e');
    }
  }

  Future<void> attachPlayer(PlayerViewModel playerViewModel) async {
    if (!isDesktop) return;
    _playerViewModel?.removeListener(_syncTray);
    _playerViewModel = playerViewModel;
    playerViewModel.addListener(_syncTray);

    try {
      trayManager.addListener(this);
      await trayManager.setIcon(
        Platform.isWindows
            ? 'assets/icons/tray_icon.ico'
            : 'assets/icons/tray_icon.png',
      );
      await _rebuildTrayMenu(force: true);
    } catch (e) {
      debugPrint('[WaveFunc] Desktop tray_manager skipped: $e');
    }
  }

  void _syncTray() {
    unawaited(_rebuildTrayMenu());
  }

  Future<void> _rebuildTrayMenu({bool force = false}) async {
    final player = _playerViewModel;
    final station = player?.currentStation;
    final meta = player?.snapshot.metadata;
    final playing = player?.isPlaying ?? false;

    final trackLine = meta?.displayTitle;
    final statusLabel = station == null
        ? 'IDLE — NO SIGNAL'
        : (trackLine != null && trackLine.isNotEmpty
            ? '${station.name} • $trackLine'
            : station.name);

    final signature = '$playing|$statusLabel';
    if (!force && signature == _lastTraySummary) return;
    _lastTraySummary = signature;

    try {
      if (Platform.isMacOS) {
        final shortTitle = station == null
            ? ''
            : (playing ? ' ▶ ${_truncate(station.name, 18)}' : '');
        await trayManager.setTitle(shortTitle);
      }
      await trayManager.setToolTip(
        station == null ? 'WaveFunc Radio' : 'WaveFunc — $statusLabel',
      );
      await trayManager.setContextMenu(
        Menu(
          items: [
            MenuItem(
              key: 'status',
              label: _truncate(statusLabel, 42),
              disabled: true,
            ),
            MenuItem.separator(),
            if (station != null)
              MenuItem(
                key: 'toggle_play',
                label: playing ? 'Pause Stream' : 'Resume Stream',
              ),
            if (station != null)
              MenuItem(
                key: 'stop',
                label: 'Stop Playback',
              ),
            if (station != null) MenuItem.separator(),
            MenuItem(key: 'show', label: 'Show WaveFunc'),
            MenuItem(key: 'quit', label: 'Quit WaveFunc'),
          ],
        ),
      );
    } catch (_) {}
  }

  String _truncate(String input, int maxLen) =>
      input.length <= maxLen ? input : '${input.substring(0, maxLen - 1)}…';

  @override
  void onTrayIconMouseDown() {
    if (Platform.isMacOS) {
      trayManager.popUpContextMenu();
    } else {
      unawaited(_showAndFocus());
    }
  }

  @override
  void onTrayIconRightMouseDown() {
    trayManager.popUpContextMenu();
  }

  @override
  void onTrayMenuItemClick(MenuItem menuItem) {
    final player = _playerViewModel;
    switch (menuItem.key) {
      case 'toggle_play':
        if (player != null) {
          unawaited(player.isPlaying ? player.pause() : player.resume());
        }
        break;
      case 'stop':
        if (player != null) unawaited(player.stop());
        break;
      case 'show':
        unawaited(_showAndFocus());
        break;
      case 'quit':
        unawaited(_quit());
        break;
    }
  }

  Future<void> _showAndFocus() async {
    try {
      await windowManager.show();
      await windowManager.focus();
    } catch (_) {}
  }

  Future<void> _quit() async {
    try {
      await _playerViewModel?.stop();
      await trayManager.destroy();
    } catch (_) {}
    exit(0);
  }
}
