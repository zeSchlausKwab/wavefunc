import 'dart:async';

import 'package:flutter/services.dart';
import 'package:material_ui/material_ui.dart';

import '../../../domain/models/station.dart';
import '../../core/theme/sonic_machine_theme.dart';
import '../../core/widgets/sonic_gear_backdrop.dart';
import '../auth/view_models/auth_view_model.dart';
import '../auth/views/login_sheet.dart';
import '../auth/views/onboarding_flow.dart';
import '../auth/views/session_sheet.dart';
import '../browse/views/browse_facets_view.dart';
import '../crate/view_models/crate_view_model.dart';
import '../discover/view_models/discover_view_model.dart';
import '../discover/views/discover_view.dart';
import '../favorites/views/favorites_sheets.dart';
import '../favorites/views/library_view.dart';
import '../player/view_models/player_view_model.dart';
import '../player/views/expanded_player_sheet.dart';
import '../player/views/floating_player_bar.dart';
import '../player/views/studio_player_deck.dart';
import '../settings/views/settings_view.dart';
import '../social/view_models/community_view_model.dart';
import '../social/views/community_view.dart';
import '../station_detail/views/station_detail_sheet.dart';
import '../wallet/views/zap_sheet.dart';
import 'desktop_inspector.dart';
import 'desktop_sidebar.dart';

/// 3-tier responsive Constructivist shell:
/// - Phone (`< 720px`): Bottom nav + FloatingPlayerBar + modal bottom sheets
/// - Tablet (`720px–1180px`): Compact 74px rail + docked StudioPlayerDeck + slide-over Inspector
/// - Desktop (`≥ 1180px`): 228px console sidebar (pinned Curated & My Lists) + docked collapsible
///   Right Inspector + full-width StudioPlayerDeck + keyboard shortcuts (`⌘K`, `/`, `Space`, `M`, `Esc`)
class AppShell extends StatefulWidget {
  const AppShell({
    super.key,
    required this.discoverViewModel,
    required this.playerViewModel,
    required this.authViewModel,
    required this.communityViewModel,
    required this.crateViewModel,
  });

  final DiscoverViewModel discoverViewModel;
  final PlayerViewModel playerViewModel;
  final AuthViewModel authViewModel;
  final CommunityViewModel communityViewModel;
  final CrateViewModel crateViewModel;

  @override
  State<AppShell> createState() => _AppShellState();
}

class _AppShellState extends State<AppShell> with WidgetsBindingObserver {
  static const double _tabletBreakpoint = 720;
  static const double _desktopBreakpoint = 1180;

  int _selectedIndex = 0;
  bool _communityLoaded = false;
  bool _onboardingPromptChecked = false;
  InspectorState? _inspector;
  int _inspectorToken = 0;

  final FocusNode _searchFocusNode = FocusNode();

  bool get _isWideViewport =>
      MediaQuery.of(context).size.width >= _tabletBreakpoint;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    widget.authViewModel.addListener(_maybeShowFirstRunOnboarding);
    WidgetsBinding.instance.addPostFrameCallback((_) {
      _maybeShowFirstRunOnboarding();
    });
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) {
      widget.playerViewModel.handleAppResumed();
      unawaited(widget.discoverViewModel.handleAppResumed());
    }
  }

  void _maybeShowFirstRunOnboarding() {
    if (_onboardingPromptChecked || !mounted) return;
    final auth = widget.authViewModel;
    if (auth.isBusy) return;
    if (auth.isLoggedIn || auth.hasCompletedOnboarding) {
      _onboardingPromptChecked = true;
      return;
    }
    _onboardingPromptChecked = true;
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted &&
          !widget.authViewModel.isLoggedIn &&
          !widget.authViewModel.hasCompletedOnboarding) {
        _openOnboarding(startAtKeyCreation: false);
      }
    });
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    widget.authViewModel.removeListener(_maybeShowFirstRunOnboarding);
    _searchFocusNode.dispose();
    super.dispose();
  }

  void _selectTab(int index) {
    setState(() => _selectedIndex = index);
    if (index == 2 && !_communityLoaded) {
      _communityLoaded = true;
      widget.communityViewModel.refresh();
    } else if (index == 3 && widget.authViewModel.isLoggedIn) {
      widget.discoverViewModel.syncUserFavorites();
      widget.crateViewModel.refresh();
    }
  }

  void _syncAccountData() {
    widget.discoverViewModel.syncUserFavorites();
    widget.crateViewModel.refresh();
  }

  void _openOnboarding({bool startAtKeyCreation = false}) {
    if (_isWideViewport) {
      showDialog<void>(
        context: context,
        barrierDismissible: false,
        builder: (_) => Dialog(
          backgroundColor: Colors.transparent,
          elevation: 0,
          insetPadding: const EdgeInsets.all(24),
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 500),
            child: OnboardingFlow(
              authViewModel: widget.authViewModel,
              startAtKeyCreation: startAtKeyCreation,
              isDialog: true,
              onCompleted: _syncAccountData,
              onOpenExistingLogin: _openLoginSheet,
              onSelectGenreAndFinish: (genre) {
                _syncAccountData();
                _selectTab(0);
                widget.discoverViewModel.selectGenre(genre);
              },
            ),
          ),
        ),
      );
      return;
    }

    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      isDismissible: false,
      enableDrag: false,
      backgroundColor: Colors.transparent,
      builder: (_) => OnboardingFlow(
        authViewModel: widget.authViewModel,
        startAtKeyCreation: startAtKeyCreation,
        onCompleted: _syncAccountData,
        onOpenExistingLogin: _openLoginSheet,
        onSelectGenreAndFinish: (genre) {
          _syncAccountData();
          _selectTab(0);
          widget.discoverViewModel.selectGenre(genre);
        },
      ),
    );
  }

  void _openLoginSheet() {
    if (_isWideViewport) {
      showDialog<void>(
        context: context,
        builder: (_) => Dialog(
          backgroundColor: Colors.transparent,
          elevation: 0,
          insetPadding: const EdgeInsets.all(24),
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 460),
            child: LoginSheet(
              authViewModel: widget.authViewModel,
              onSignedIn: _syncAccountData,
              onStartOnboarding: () =>
                  _openOnboarding(startAtKeyCreation: true),
              isDialog: true,
            ),
          ),
        ),
      );
      return;
    }

    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (_) => LoginSheet(
        authViewModel: widget.authViewModel,
        onSignedIn: _syncAccountData,
        onStartOnboarding: () => _openOnboarding(startAtKeyCreation: true),
      ),
    );
  }

  void _openSessionMenu() {
    if (!widget.authViewModel.isLoggedIn &&
        widget.authViewModel.savedAccounts.isEmpty) {
      _openLoginSheet();
      return;
    }
    if (_isWideViewport) {
      showDialog<void>(
        context: context,
        builder: (_) => Dialog(
          backgroundColor: Colors.transparent,
          elevation: 0,
          insetPadding: const EdgeInsets.all(24),
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 460),
            child: AccountSessionSheet(
              authViewModel: widget.authViewModel,
              onAddAccount: _openLoginSheet,
              onAccountChanged: _syncAccountData,
            ),
          ),
        ),
      );
      return;
    }

    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (_) => AccountSessionSheet(
        authViewModel: widget.authViewModel,
        onAddAccount: _openLoginSheet,
        onAccountChanged: _syncAccountData,
      ),
    );
  }

  void _openFavoritesPicker(Station station) {
    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (_) => StationFavoritesPickerSheet(
        station: station,
        discoverViewModel: widget.discoverViewModel,
      ),
    );
  }

  void _openStationDetail(Station station, {bool focusComment = false}) {
    if (_isWideViewport) {
      setState(() {
        _inspector = InspectorState.station(
          station,
          focusComment: focusComment,
          requestToken: ++_inspectorToken,
        );
      });
      return;
    }

    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (_) => StationDetailSheet(
        crateViewModel: widget.crateViewModel,
        station: station,
        discoverViewModel: widget.discoverViewModel,
        playerViewModel: widget.playerViewModel,
        authViewModel: widget.authViewModel,
        onRequestLogin: _openLoginSheet,
        onOpenFavoritesPicker: () => _openFavoritesPicker(station),
        onOpenZap: () => _openStationZap(station),
        focusComment: focusComment,
      ),
    );
  }

  void _openStationZap(Station station) {
    if (_isWideViewport) {
      setState(() {
        _inspector = InspectorState.zap(
          station,
          requestToken: ++_inspectorToken,
        );
      });
      return;
    }

    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (_) => ZapSheet(
        station: station,
        authViewModel: widget.authViewModel,
        discoverViewModel: widget.discoverViewModel,
        onOpenWalletSettings: () => _selectTab(4),
      ),
    );
  }

  void _openFeaturedList(FeaturedList list) {
    if (_isWideViewport) {
      _selectTab(0);
      widget.discoverViewModel.openListInStage(list);
      return;
    }

    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (_) => CompactListDetailSheet(
        list: list,
        discoverViewModel: widget.discoverViewModel,
        playerViewModel: widget.playerViewModel,
        onOpenStationDetail: _openStationDetail,
      ),
    );
  }

  void _openExpandedPlayer() {
    if (_isWideViewport) {
      _toggleDeckInspector();
      return;
    }

    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (_) => ExpandedPlayerSheet(
        playerViewModel: widget.playerViewModel,
        crateViewModel: widget.crateViewModel,
        authViewModel: widget.authViewModel,
        onOpenStationDetail: _openStationDetail,
        onRequestLogin: _openLoginSheet,
      ),
    );
  }

  void _toggleDeckInspector() {
    setState(() {
      if (_inspector != null) {
        _inspector = null;
      } else {
        _inspector = InspectorState.nowPlaying(requestToken: ++_inspectorToken);
      }
    });
  }

  bool get _isTextInputFocused {
    final primary = FocusManager.instance.primaryFocus;
    final ctx = primary?.context;
    if (ctx == null) return false;
    return ctx.widget is EditableText ||
        ctx.findAncestorWidgetOfExactType<EditableText>() != null;
  }

  void _focusSearch() {
    if (_selectedIndex != 0) _selectTab(0);
    _searchFocusNode.requestFocus();
  }

  void _handleEscape() {
    if (_inspector != null) {
      setState(() => _inspector = null);
    } else if (widget.discoverViewModel.activeList != null) {
      widget.discoverViewModel.clearActiveList();
    }
  }

  @override
  Widget build(BuildContext context) {
    const navItems = [
      (Icons.sensors, 'LIVE'),
      (Icons.graphic_eq, 'BROWSE'),
      (Icons.forum, 'FEED'),
      (Icons.bookmarks, 'LIBRARY'),
      (Icons.settings_input_antenna, 'SYSTEM'),
    ];

    return LayoutBuilder(
      builder: (context, constraints) {
        final width = constraints.maxWidth;
        final isWide = width >= _tabletBreakpoint;
        final isDesktop = width >= _desktopBreakpoint;

        final pages = [
          DiscoverView(
            discoverViewModel: widget.discoverViewModel,
            playerViewModel: widget.playerViewModel,
            authViewModel: widget.authViewModel,
            crateViewModel: widget.crateViewModel,
            searchFocusNode: _searchFocusNode,
            isWideLayout: isWide,
            isExpandedDesktop: isDesktop,
            onOpenStationDetail: (s) => _openStationDetail(s),
            onOpenStationComment: (s) =>
                _openStationDetail(s, focusComment: true),
            onOpenStationZap: _openStationZap,
            onOpenFeaturedList: _openFeaturedList,
            onOpenFavoritesPicker: _openFavoritesPicker,
            onOpenSessionMenu: _openSessionMenu,
            onRequestLogin: _openLoginSheet,
          ),
          BrowseFacetsView(
            discoverViewModel: widget.discoverViewModel,
            onFacetApplied: () => _selectTab(0),
          ),
          CommunityView(
            communityViewModel: widget.communityViewModel,
            authViewModel: widget.authViewModel,
            playerViewModel: widget.playerViewModel,
            crateViewModel: widget.crateViewModel,
            onRequestLogin: _openLoginSheet,
          ),
          LibraryView(
            discoverViewModel: widget.discoverViewModel,
            playerViewModel: widget.playerViewModel,
            crateViewModel: widget.crateViewModel,
            authViewModel: widget.authViewModel,
            onRequestLogin: _openLoginSheet,
            onOpenStationDetail: _openStationDetail,
          ),
          SettingsView(
            discoverViewModel: widget.discoverViewModel,
            authViewModel: widget.authViewModel,
            onRequestLogin: _openSessionMenu,
            onStartOnboarding: () => _openOnboarding(startAtKeyCreation: true),
          ),
        ];

        // ── Phone Shell (< 720px) ──
        if (!isWide) {
          final mobileBody = SonicGearBackdrop(
            child: SafeArea(
              bottom: true,
              child: Stack(
                children: [
                  IndexedStack(index: _selectedIndex, children: pages),
                  Align(
                    alignment: Alignment.bottomCenter,
                    child: FloatingPlayerBar(
                      playerViewModel: widget.playerViewModel,
                      onExpand: _openExpandedPlayer,
                    ),
                  ),
                ],
              ),
            ),
          );

          return Scaffold(
            body: mobileBody,
            bottomNavigationBar: Container(
              decoration: const BoxDecoration(
                color: SonicColors.foundation,
                border: Border(
                  top: BorderSide(color: SonicColors.ink, width: 2.5),
                ),
              ),
              child: SafeArea(
                top: false,
                child: Row(
                  children: [
                    for (var i = 0; i < navItems.length; i++)
                      _BottomNavSlot(
                        icon: navItems[i].$1,
                        label: navItems[i].$2,
                        selected: _selectedIndex == i,
                        onTap: () => _selectTab(i),
                      ),
                  ],
                ),
              ),
            ),
          );
        }

        // ── Tablet (720–1180px) & Desktop (≥ 1180px) Studio Console Shell ──
        final inspectorWidget = _inspector == null
            ? null
            : DesktopInspector(
                state: _inspector!,
                discoverViewModel: widget.discoverViewModel,
                playerViewModel: widget.playerViewModel,
                authViewModel: widget.authViewModel,
                crateViewModel: widget.crateViewModel,
                onClose: () => setState(() => _inspector = null),
                onRequestLogin: _openLoginSheet,
                onOpenFavoritesPicker: _openFavoritesPicker,
                onOpenZap: _openStationZap,
                onOpenWalletSettings: () => _selectTab(4),
              );

        return CallbackShortcuts(
          bindings: <ShortcutActivator, VoidCallback>{
            const SingleActivator(LogicalKeyboardKey.keyK, meta: true):
                _focusSearch,
            const SingleActivator(LogicalKeyboardKey.keyK, control: true):
                _focusSearch,
            const SingleActivator(LogicalKeyboardKey.slash): () {
              if (!_isTextInputFocused) _focusSearch();
            },
            const SingleActivator(LogicalKeyboardKey.space): () {
              if (!_isTextInputFocused) {
                final player = widget.playerViewModel;
                if (player.currentStation != null) {
                  player.isPlaying ? player.pause() : player.resume();
                }
              }
            },
            const SingleActivator(LogicalKeyboardKey.keyM): () {
              if (!_isTextInputFocused) {
                widget.playerViewModel.toggleMute();
              }
            },
            const SingleActivator(LogicalKeyboardKey.escape): _handleEscape,
          },
          child: Focus(
            autofocus: true,
            child: Scaffold(
              body: Column(
                children: [
                  Expanded(
                    child: Row(
                      children: [
                        DesktopSidebar(
                          expanded: isDesktop,
                          selectedIndex: _selectedIndex,
                          navItems: navItems,
                          discoverViewModel: widget.discoverViewModel,
                          authViewModel: widget.authViewModel,
                          playerViewModel: widget.playerViewModel,
                          onSelectTab: _selectTab,
                          onSelectList: _openFeaturedList,
                          onOpenSessionMenu: _openSessionMenu,
                        ),
                        Expanded(
                          child: SonicGearBackdrop(
                            child: Stack(
                              children: [
                                IndexedStack(
                                  index: _selectedIndex,
                                  children: pages,
                                ),
                                // Slide-over inspector on Tablets (< 1180px)
                                if (!isDesktop && inspectorWidget != null) ...[
                                  Positioned.fill(
                                    child: GestureDetector(
                                      onTap: () =>
                                          setState(() => _inspector = null),
                                      child: Container(
                                        color: SonicColors.ink
                                            .withValues(alpha: 0.3),
                                      ),
                                    ),
                                  ),
                                  Align(
                                    alignment: Alignment.centerRight,
                                    child: inspectorWidget,
                                  ),
                                ],
                              ],
                            ),
                          ),
                        ),
                        // Docked 3rd pane inspector on Desktop (≥ 1180px)
                        if (isDesktop && inspectorWidget != null)
                          inspectorWidget,
                      ],
                    ),
                  ),
                  StudioPlayerDeck(
                    playerViewModel: widget.playerViewModel,
                    crateViewModel: widget.crateViewModel,
                    authViewModel: widget.authViewModel,
                    inspectorOpen: _inspector != null,
                    onToggleInspector: _toggleDeckInspector,
                    onOpenStationInspector: (s) => _openStationDetail(s),
                    onOpenZap: _openStationZap,
                    onRequestLogin: _openLoginSheet,
                  ),
                ],
              ),
            ),
          ),
        );
      },
    );
  }
}

class _BottomNavSlot extends StatelessWidget {
  const _BottomNavSlot({
    required this.icon,
    required this.label,
    required this.selected,
    required this.onTap,
  });

  final IconData icon;
  final String label;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Expanded(
      child: InkWell(
        onTap: onTap,
        child: Container(
          padding: const EdgeInsets.symmetric(vertical: 9),
          decoration: BoxDecoration(
            color: selected ? SonicColors.ink : SonicColors.foundation,
          ),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(
                icon,
                size: 19,
                color: selected ? SonicColors.voltageCyan : SonicColors.ink,
              ),
              const SizedBox(height: 3),
              Text(
                label,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: SonicMachineTheme.labelTech(
                  fontSize: 8.5,
                  letterSpacing: 0.9,
                  color: selected ? SonicColors.foundation : SonicColors.ink,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
