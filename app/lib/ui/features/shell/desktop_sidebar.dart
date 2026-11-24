import 'package:material_ui/material_ui.dart';

import '../../../domain/models/station.dart';
import '../../core/theme/sonic_machine_theme.dart';
import '../../core/widgets/sonic_plate.dart';
import '../../core/widgets/station_thumbnail.dart';
import '../auth/view_models/auth_view_model.dart';
import '../discover/view_models/discover_view_model.dart';

/// Left structural console rail for Desktop (`228px` expanded with pinned Curated
/// & User Favorites Lists + Account/NWC badge) and Tablet (`72px` compact icon rail).
class DesktopSidebar extends StatelessWidget {
  const DesktopSidebar({
    super.key,
    required this.expanded,
    required this.selectedIndex,
    required this.navItems,
    required this.discoverViewModel,
    required this.authViewModel,
    required this.onSelectTab,
    required this.onSelectList,
    required this.onOpenSessionMenu,
  });

  final bool expanded;
  final int selectedIndex;
  final List<(IconData, String)> navItems;
  final DiscoverViewModel discoverViewModel;
  final AuthViewModel authViewModel;
  final ValueChanged<int> onSelectTab;
  final ValueChanged<FeaturedList> onSelectList;
  final VoidCallback onOpenSessionMenu;

  @override
  Widget build(BuildContext context) {
    return ListenableBuilder(
      listenable: Listenable.merge([discoverViewModel, authViewModel]),
      builder: (context, _) {
        final status = discoverViewModel.relayStatus;
        final session = authViewModel.session;
        final nwc = authViewModel.nwcStatus;
        final cashu = authViewModel.cashuStatus;
        final hasWalletSats =
            nwc.connected || (cashu.initialized && cashu.totalBalanceSats > 0);
        final totalWalletSats =
            (nwc.connected ? (nwc.balanceSats ?? 0) : 0) +
                (cashu.initialized ? cashu.totalBalanceSats : 0);

        return Container(
          width: expanded ? 228 : 74,
          decoration: const BoxDecoration(
            color: SonicColors.surfacePlate,
            border: Border(
              right: BorderSide(color: SonicColors.ink, width: 2.5),
            ),
          ),
          child: SafeArea(
            bottom: false,
            child: Column(
              crossAxisAlignment:
                  expanded ? CrossAxisAlignment.stretch : CrossAxisAlignment.center,
              children: [
                // ── Brand Header ──
                Padding(
                  padding: EdgeInsets.fromLTRB(
                    expanded ? 14 : 12,
                    14,
                    expanded ? 14 : 12,
                    12,
                  ),
                  child: Row(
                    mainAxisAlignment: expanded
                        ? MainAxisAlignment.start
                        : MainAxisAlignment.center,
                    children: [
                      Container(
                        width: 36,
                        height: 36,
                        decoration: BoxDecoration(
                          color: SonicColors.signalRed,
                          border: Border.all(color: SonicColors.ink, width: 2),
                          boxShadow: const [
                            BoxShadow(
                              color: SonicColors.ink,
                              offset: Offset(2, 2),
                              blurRadius: 0,
                            ),
                          ],
                        ),
                        alignment: Alignment.center,
                        child: const Icon(
                          Icons.radio,
                          color: SonicColors.onSignal,
                          size: 20,
                        ),
                      ),
                      if (expanded) ...[
                        const SizedBox(width: 10),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                'WAVEFUNC',
                                style: SonicMachineTheme.labelTech(
                                  fontSize: 13,
                                  letterSpacing: 1.5,
                                ),
                              ),
                              Row(
                                children: [
                                  Container(
                                    width: 6,
                                    height: 6,
                                    color: (status?.connected ?? false)
                                        ? SonicColors.voltageCyan
                                        : SonicColors.signalRed,
                                  ),
                                  const SizedBox(width: 5),
                                  Text(
                                    (status?.connected ?? false)
                                        ? 'RELAY ONLINE'
                                        : 'CONNECTING',
                                    style: SonicMachineTheme.labelTech(
                                      fontSize: 8.5,
                                      color: SonicColors.seamOutline,
                                      letterSpacing: 0.9,
                                    ),
                                  ),
                                ],
                              ),
                            ],
                          ),
                        ),
                      ],
                    ],
                  ),
                ),
                Container(height: 2, color: SonicColors.ink),

                // ── Scrollable Nav + Pinned Lists ──
                Expanded(
                  child: ListView(
                    padding: EdgeInsets.symmetric(
                      horizontal: expanded ? 10 : 8,
                      vertical: 10,
                    ),
                    children: [
                      for (var i = 0; i < navItems.length; i++) ...[
                        _SidebarNavButton(
                          icon: navItems[i].$1,
                          label: navItems[i].$2,
                          expanded: expanded,
                          selected: selectedIndex == i &&
                              (i != 0 || discoverViewModel.activeList == null),
                          onTap: () {
                            if (i == 0) {
                              discoverViewModel.clearActiveList();
                            }
                            onSelectTab(i);
                          },
                        ),
                        const SizedBox(height: 6),
                      ],
                      if (expanded && discoverViewModel.featuredLists.isNotEmpty) ...[
                        const SizedBox(height: 10),
                        Container(height: 1.5, color: SonicColors.seamOutline),
                        const SizedBox(height: 10),
                        Padding(
                          padding: const EdgeInsets.symmetric(horizontal: 6),
                          child: Text(
                            'CURATED_LISTS',
                            style: SonicMachineTheme.labelTech(
                              fontSize: 9,
                              color: SonicColors.signalRed,
                              letterSpacing: 1.4,
                            ),
                          ),
                        ),
                        const SizedBox(height: 6),
                        for (final list in discoverViewModel.featuredLists)
                          _SidebarListTile(
                            list: list,
                            selected:
                                selectedIndex == 0 &&
                                    discoverViewModel.activeList?.address ==
                                        list.address,
                            onTap: () => onSelectList(list),
                          ),
                      ],
                      if (expanded &&
                          discoverViewModel.userFavoriteLists.isNotEmpty) ...[
                        const SizedBox(height: 10),
                        Container(height: 1.5, color: SonicColors.seamOutline),
                        const SizedBox(height: 10),
                        Padding(
                          padding: const EdgeInsets.symmetric(horizontal: 6),
                          child: Text(
                            'MY_LISTS',
                            style: SonicMachineTheme.labelTech(
                              fontSize: 9,
                              color: SonicColors.seamOutline,
                              letterSpacing: 1.4,
                            ),
                          ),
                        ),
                        const SizedBox(height: 6),
                        for (final list in discoverViewModel.userFavoriteLists)
                          _SidebarListTile(
                            list: list,
                            selected:
                                selectedIndex == 0 &&
                                    discoverViewModel.activeList?.address ==
                                        list.address,
                            onTap: () => onSelectList(list),
                          ),
                      ],
                    ],
                  ),
                ),

                // ── Account & NWC Footer Plate ──
                Container(height: 2, color: SonicColors.ink),
                Padding(
                  padding: EdgeInsets.all(expanded ? 10 : 8),
                  child: expanded
                      ? SonicPlate(
                          backgroundColor: session != null
                              ? SonicColors.ink
                              : SonicColors.foundation,
                          shadowColor: hasWalletSats
                              ? SonicColors.voltageCyan
                              : SonicColors.ink,
                          shadowOffset: const Offset(3, 3),
                          padding: const EdgeInsets.all(9),
                          onTap: onOpenSessionMenu,
                          child: Row(
                            children: [
                              if (session != null)
                                StationThumbnail(
                                  url: session.profile?.picture,
                                  size: 30,
                                  borderWidth: 1.5,
                                  highlight: true,
                                )
                              else
                                Container(
                                  width: 30,
                                  height: 30,
                                  color: SonicColors.signalRed,
                                  alignment: Alignment.center,
                                  child: const Icon(
                                    Icons.key,
                                    size: 16,
                                    color: SonicColors.onSignal,
                                  ),
                                ),
                              const SizedBox(width: 8),
                              Expanded(
                                child: Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    Text(
                                      session != null
                                          ? session.displayName.toUpperCase()
                                          : 'SIGN IN',
                                      maxLines: 1,
                                      overflow: TextOverflow.ellipsis,
                                      style: SonicMachineTheme.labelTech(
                                        fontSize: 10,
                                        color: session != null
                                            ? SonicColors.foundation
                                            : SonicColors.ink,
                                      ),
                                    ),
                                    const SizedBox(height: 2),
                                    Text(
                                      hasWalletSats
                                          ? '⚡ $totalWalletSats SATS'
                                          : (session != null
                                              ? session.signerBadge
                                              : 'NOSTR IDENTITY'),
                                      maxLines: 1,
                                      overflow: TextOverflow.ellipsis,
                                      style: SonicMachineTheme.labelTech(
                                        fontSize: 8.5,
                                        color: hasWalletSats
                                            ? SonicColors.voltageCyan
                                            : SonicColors.seamMuted,
                                      ),
                                    ),
                                  ],
                                ),
                              ),
                            ],
                          ),
                        )
                      : Tooltip(
                          message: session?.displayName ?? 'Sign In',
                          child: InkWell(
                            onTap: onOpenSessionMenu,
                            child: Container(
                              width: 44,
                              height: 44,
                              decoration: BoxDecoration(
                                color: session != null
                                    ? SonicColors.ink
                                    : SonicColors.signalRed,
                                border: Border.all(
                                  color: SonicColors.ink,
                                  width: 2,
                                ),
                              ),
                              alignment: Alignment.center,
                              child: session != null
                                  ? StationThumbnail(
                                      url: session.profile?.picture,
                                      size: 40,
                                      borderWidth: 0,
                                      highlight: true,
                                    )
                                  : const Icon(
                                      Icons.key,
                                      color: SonicColors.onSignal,
                                      size: 20,
                                    ),
                            ),
                          ),
                        ),
                ),
              ],
            ),
          ),
        );
      },
    );
  }
}

class _SidebarNavButton extends StatelessWidget {
  const _SidebarNavButton({
    required this.icon,
    required this.label,
    required this.expanded,
    required this.selected,
    required this.onTap,
  });

  final IconData icon;
  final String label;
  final bool expanded;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      child: Container(
        padding: EdgeInsets.symmetric(
          horizontal: expanded ? 10 : 0,
          vertical: 9,
        ),
        decoration: BoxDecoration(
          color: selected ? SonicColors.ink : Colors.transparent,
          border: Border.all(
            color: selected ? SonicColors.ink : Colors.transparent,
            width: 2,
          ),
          boxShadow: selected
              ? const [
                  BoxShadow(
                    color: SonicColors.voltageCyan,
                    offset: Offset(2, 2),
                    blurRadius: 0,
                  ),
                ]
              : null,
        ),
        child: expanded
            ? Row(
                children: [
                  Icon(
                    icon,
                    size: 18,
                    color: selected ? SonicColors.voltageCyan : SonicColors.ink,
                  ),
                  const SizedBox(width: 10),
                  Text(
                    label,
                    style: SonicMachineTheme.labelTech(
                      fontSize: 10.5,
                      letterSpacing: 1.2,
                      color:
                          selected ? SonicColors.foundation : SonicColors.ink,
                    ),
                  ),
                ],
              )
            : Column(
                children: [
                  Icon(
                    icon,
                    size: 20,
                    color: selected ? SonicColors.voltageCyan : SonicColors.ink,
                  ),
                  const SizedBox(height: 3),
                  Text(
                    label,
                    style: SonicMachineTheme.labelTech(
                      fontSize: 8,
                      color:
                          selected ? SonicColors.foundation : SonicColors.ink,
                    ),
                  ),
                ],
              ),
      ),
    );
  }
}

class _SidebarListTile extends StatelessWidget {
  const _SidebarListTile({
    required this.list,
    required this.selected,
    required this.onTap,
  });

  final FeaturedList list;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 4),
      child: InkWell(
        onTap: onTap,
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 7),
          decoration: BoxDecoration(
            color: selected ? SonicColors.ink : SonicColors.foundation,
            border: Border.all(
              color: selected ? SonicColors.ink : SonicColors.seamOutline,
              width: selected ? 2 : 1,
            ),
          ),
          child: Row(
            children: [
              Container(
                width: 24,
                height: 20,
                color: selected
                    ? SonicColors.signalRed
                    : SonicColors.thumbnailDark,
                alignment: Alignment.center,
                child: Text(
                  '${list.stationAddresses.length}'.padLeft(2, '0'),
                  style: SonicMachineTheme.labelTech(
                    fontSize: 9,
                    color: selected
                        ? SonicColors.onSignal
                        : SonicColors.voltageCyan,
                    letterSpacing: 0.2,
                  ),
                ),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: Text(
                  list.name.toUpperCase(),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: SonicMachineTheme.labelTech(
                    fontSize: 9.5,
                    color: selected ? SonicColors.foundation : SonicColors.ink,
                    letterSpacing: 0.5,
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
