import 'package:material_ui/material_ui.dart';

import '../../../../domain/models/station.dart';
import '../../../core/theme/sonic_machine_theme.dart';
import '../../../core/widgets/sonic_plate.dart';
import '../../discover/view_models/discover_view_model.dart';

enum _FacetTab { genres, languages, countries }

/// Browse screen mirroring `src/routes/browse.genres.tsx`:
/// OSCILLATION_TYPES (genres), TRANSMISSION_LANGUAGES, BROADCAST_REGIONS.
class BrowseFacetsView extends StatefulWidget {
  const BrowseFacetsView({
    super.key,
    required this.discoverViewModel,
    required this.onFacetApplied,
  });

  final DiscoverViewModel discoverViewModel;
  final VoidCallback onFacetApplied;

  @override
  State<BrowseFacetsView> createState() => _BrowseFacetsViewState();
}

class _BrowseFacetsViewState extends State<BrowseFacetsView> {
  _FacetTab _tab = _FacetTab.genres;
  String _filter = '';

  @override
  Widget build(BuildContext context) {
    return ListenableBuilder(
      listenable: widget.discoverViewModel,
      builder: (context, _) {
        final facets = widget.discoverViewModel.facets;
        final List<FacetCount> source;
        final String sectionTitle;
        final String placeholder;

        switch (_tab) {
          case _FacetTab.genres:
            source = facets.genres;
            sectionTitle = 'OSCILLATION_TYPES';
            placeholder = 'FILTER_GENRES...';
          case _FacetTab.languages:
            source = facets.languages;
            sectionTitle = 'TRANSMISSION_LANGUAGES';
            placeholder = 'FILTER_LANGUAGES...';
          case _FacetTab.countries:
            source = facets.countries;
            sectionTitle = 'BROADCAST_REGIONS';
            placeholder = 'FILTER_REGIONS...';
        }

        final visible = _filter.trim().isEmpty
            ? source
            : source
                .where(
                  (f) => f.name
                      .toLowerCase()
                      .contains(_filter.trim().toLowerCase()),
                )
                .toList();

        return CustomScrollView(
          slivers: [
            SliverToBoxAdapter(
              child: Padding(
                padding: const EdgeInsets.fromLTRB(16, 16, 16, 12),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'SPECTRUM_DIRECTORY',
                      style: SonicMachineTheme.labelTech(
                        fontSize: 10,
                        color: SonicColors.signalRed,
                        letterSpacing: 2.0,
                      ),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      'BROWSE FREQUENCIES',
                      style: Theme.of(context)
                          .textTheme
                          .displayMedium
                          ?.copyWith(fontSize: 28),
                    ),
                    const SizedBox(height: 14),
                    Row(
                      children: [
                        _TabButton(
                          label: 'GENRES',
                          selected: _tab == _FacetTab.genres,
                          onTap: () => setState(() {
                            _tab = _FacetTab.genres;
                            _filter = '';
                          }),
                        ),
                        const SizedBox(width: 8),
                        _TabButton(
                          label: 'LANGUAGES',
                          selected: _tab == _FacetTab.languages,
                          onTap: () => setState(() {
                            _tab = _FacetTab.languages;
                            _filter = '';
                          }),
                        ),
                        const SizedBox(width: 8),
                        _TabButton(
                          label: 'REGIONS',
                          selected: _tab == _FacetTab.countries,
                          onTap: () => setState(() {
                            _tab = _FacetTab.countries;
                            _filter = '';
                          }),
                        ),
                      ],
                    ),
                    const SizedBox(height: 12),
                    TextField(
                      onChanged: (v) => setState(() => _filter = v),
                      decoration: InputDecoration(
                        hintText: placeholder,
                        prefixIcon:
                            const Icon(Icons.tune, color: SonicColors.ink),
                      ),
                    ),
                    const SizedBox(height: 14),
                    SonicSectionHeader(
                      title: sectionTitle,
                      trailing: Text(
                        '${visible.length} BANDS',
                        style: SonicMachineTheme.labelTech(
                          fontSize: 10,
                          color: SonicColors.seamOutline,
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ),
            if (visible.isEmpty)
              const SliverFillRemaining(
                hasScrollBody: false,
                child: Center(child: Text('NO BANDS AVAILABLE YET')),
              )
            else
              SliverPadding(
                padding: const EdgeInsets.fromLTRB(16, 4, 16, 120),
                sliver: SliverGrid(
                  gridDelegate: const SliverGridDelegateWithMaxCrossAxisExtent(
                    maxCrossAxisExtent: 220,
                    mainAxisSpacing: 10,
                    crossAxisSpacing: 10,
                    mainAxisExtent: 64,
                  ),
                  delegate: SliverChildBuilderDelegate(
                    (context, index) {
                      final item = visible[index];
                      return SonicPlate(
                        backgroundColor: SonicColors.surfacePlate,
                        shadowOffset: const Offset(3, 3),
                        padding: const EdgeInsets.symmetric(
                          horizontal: 12,
                          vertical: 8,
                        ),
                        onTap: () async {
                          switch (_tab) {
                            case _FacetTab.genres:
                              final loading = widget.discoverViewModel.openGenre(item.name);
                              widget.onFacetApplied();
                              await loading;
                              return;
                            case _FacetTab.languages:
                              await widget.discoverViewModel
                                  .selectLanguage(item.name);
                            case _FacetTab.countries:
                              await widget.discoverViewModel
                                  .selectCountry(item.name);
                          }
                          widget.onFacetApplied();
                        },
                        child: Row(
                          children: [
                            Expanded(
                              child: Text(
                                item.name.toUpperCase(),
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                                style: SonicMachineTheme.labelTech(
                                  fontSize: 11.5,
                                  letterSpacing: 1.0,
                                ),
                              ),
                            ),
                            const SizedBox(width: 6),
                            Container(
                              padding: const EdgeInsets.symmetric(
                                horizontal: 6,
                                vertical: 2,
                              ),
                              color: SonicColors.ink,
                              child: Text(
                                '${item.count}',
                                style: SonicMachineTheme.labelTech(
                                  fontSize: 10,
                                  color: SonicColors.voltageCyan,
                                ),
                              ),
                            ),
                          ],
                        ),
                      );
                    },
                    childCount: visible.length,
                  ),
                ),
              ),
          ],
        );
      },
    );
  }
}

class _TabButton extends StatelessWidget {
  const _TabButton({
    required this.label,
    required this.selected,
    required this.onTap,
  });

  final String label;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Expanded(
      child: SonicPlate(
        backgroundColor:
            selected ? SonicColors.ink : SonicColors.surfacePlate,
        shadowColor: selected ? SonicColors.voltageCyan : SonicColors.ink,
        shadowOffset: const Offset(3, 3),
        padding: const EdgeInsets.symmetric(vertical: 10),
        onTap: onTap,
        child: Center(
          child: Text(
            label,
            style: SonicMachineTheme.labelTech(
              fontSize: 10.5,
              color: selected ? SonicColors.foundation : SonicColors.ink,
            ),
          ),
        ),
      ),
    );
  }
}
