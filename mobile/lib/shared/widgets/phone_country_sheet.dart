import 'package:flutter/material.dart';

import '../../core/phone/phone_countries.dart';
import '../../l10n/app_localizations.dart';

/// Bottom sheet to pick a phone country: pinned countries first, then the full
/// searchable list. Resolves to the picked ISO code, or null when dismissed.
Future<String?> showPhoneCountrySheet(
  BuildContext context, {
  required String selectedIso,
  required String lang,
}) {
  return showModalBottomSheet<String>(
    context: context,
    isScrollControlled: true,
    useSafeArea: true,
    showDragHandle: true,
    builder: (_) => _PhoneCountrySheet(selectedIso: selectedIso, lang: lang),
  );
}

class _PhoneCountrySheet extends StatefulWidget {
  const _PhoneCountrySheet({required this.selectedIso, required this.lang});

  final String selectedIso;
  final String lang;

  @override
  State<_PhoneCountrySheet> createState() => _PhoneCountrySheetState();
}

class _PhoneCountrySheetState extends State<_PhoneCountrySheet> {
  String _query = '';

  late final List<PhoneCountry> _all = listPhoneCountries(lang: widget.lang);

  List<PhoneCountry> get _filtered => filterPhoneCountries(_all, _query);

  void _pick(PhoneCountry country) => Navigator.of(context).pop(country.iso);

  void _pickFirst() {
    final list = _filtered;
    if (list.isNotEmpty) _pick(list.first);
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final countries = _filtered;
    final searching = _query.trim().isNotEmpty;
    final rows = _rows(countries, searching, l10n);

    return Padding(
      padding: EdgeInsets.only(bottom: MediaQuery.viewInsetsOf(context).bottom),
      child: SizedBox(
        height: MediaQuery.sizeOf(context).height * 0.8,
        child: Column(
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 0, 16, 8),
              child: TextField(
                key: const Key('phoneCountrySearch'),
                autofocus: false,
                textInputAction: TextInputAction.search,
                decoration: InputDecoration(
                  hintText: l10n.phoneFieldSearchCountry,
                  prefixIcon: const Icon(Icons.search),
                ),
                onChanged: (v) => setState(() => _query = v),
                onSubmitted: (_) => _pickFirst(),
              ),
            ),
            Expanded(
              child: countries.isEmpty
                  ? Center(child: Text(l10n.phoneFieldNoCountry))
                  : ListView.builder(
                      itemCount: rows.length,
                      itemBuilder: (_, i) => rows[i](context),
                    ),
            ),
          ],
        ),
      ),
    );
  }

  /// Row builders: optional section headers (only when not searching) plus one
  /// tile per country.
  List<WidgetBuilder> _rows(List<PhoneCountry> countries, bool searching, AppLocalizations l10n) {
    final rows = <WidgetBuilder>[];
    var addedAllHeader = false;
    for (var i = 0; i < countries.length; i++) {
      final c = countries[i];
      if (!searching) {
        if (i == 0 && c.isPinned) {
          rows.add((_) => _SectionHeader(l10n.phoneFieldSectionFrequent));
        } else if (!c.isPinned && !addedAllHeader) {
          addedAllHeader = true;
          rows.add((_) => _SectionHeader(l10n.phoneFieldSectionAll));
        }
      }
      rows.add((_) => _CountryTile(
            country: c,
            selected: c.iso == widget.selectedIso,
            onTap: () => _pick(c),
          ));
    }
    return rows;
  }
}

class _SectionHeader extends StatelessWidget {
  const _SectionHeader(this.text);

  final String text;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 4),
      child: Text(
        text,
        style: theme.textTheme.labelLarge?.copyWith(color: theme.colorScheme.primary),
      ),
    );
  }
}

class _CountryTile extends StatelessWidget {
  const _CountryTile({required this.country, required this.selected, required this.onTap});

  final PhoneCountry country;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return ListTile(
      key: ValueKey('phoneCountry-${country.iso}'),
      minTileHeight: 48,
      selected: selected,
      leading: Text(country.flag, style: const TextStyle(fontSize: 24)),
      title: Text(country.name),
      trailing: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Text(country.dialCode, textDirection: TextDirection.ltr),
          if (selected) ...[
            const SizedBox(width: 8),
            const Icon(Icons.check, size: 20),
          ],
        ],
      ),
      onTap: onTap,
    );
  }
}
