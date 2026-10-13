import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';

import '../../../../core/format/bn_format.dart';
import '../../../../core/phone/phone_countries.dart';
import '../../../../core/theme/app_theme.dart';
import '../../../../l10n/app_localizations.dart';
import '../../../../shared/widgets/phone_country_sheet.dart';
import '../../domain/registration_validators.dart';
import '../bloc/registration_bloc.dart';
import 'registration_inputs.dart';
import 'registration_l10n.dart';

/// Step 1 pieces that only exist behind regSimplifiedUi / regAbroadAddress.

const _firstBirthYear = 1900;

int _daysInMonth(int year, int month) => DateTime(year, month + 1, 0).day;

String _iso(int y, int m, int d) =>
    '${y.toString().padLeft(4, '0')}-${m.toString().padLeft(2, '0')}-${d.toString().padLeft(2, '0')}';

/// Date of birth as three plain dropdowns (দিন / মাস / বছর). Writes the
/// ISO `YYYY-MM-DD` date once all three are chosen, and an empty value while
/// the selection is incomplete.
class DobDropdowns extends StatefulWidget {
  const DobDropdowns({super.key});

  @override
  State<DobDropdowns> createState() => _DobDropdownsState();
}

class _DobDropdownsState extends State<DobDropdowns> {
  int? _day;
  int? _month;
  int? _year;

  @override
  void initState() {
    super.initState();
    final dob = context.read<RegistrationBloc>().state.form.dob;
    _lastEmitted = dob;
    _seed(dob);
  }

  /// Last value this widget wrote or read, to tell external changes (draft
  /// restore / discard) from our own pending edits.
  String _lastEmitted = '';

  void _seed(String dob) {
    final parsed = DateTime.tryParse(dob);
    _year = parsed?.year;
    _month = parsed?.month;
    _day = parsed?.day;
  }

  String get _composed => (_day != null && _month != null && _year != null) ? _iso(_year!, _month!, _day!) : '';

  void _changed({int? day, int? month, int? year}) {
    setState(() {
      _day = day ?? _day;
      _month = month ?? _month;
      _year = year ?? _year;
      if (_day != null && _month != null && _year != null) {
        final max = _daysInMonth(_year!, _month!);
        if (_day! > max) _day = max;
      }
    });
    _lastEmitted = _composed;
    context.read<RegistrationBloc>().add(MemberFieldChanged(MemberField.dob, _composed));
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final lang = l10n.localeName;
    final state = context.watch<RegistrationBloc>().state;
    final stored = state.form.dob;
    // External change (draft restore / discard): follow the stored value.
    if (stored != _lastEmitted) {
      _lastEmitted = stored;
      _seed(stored);
    }
    final error = findError(state.stepErrors, RegErrorKind.dobRequired) != null;
    final theme = Theme.of(context);
    final thisYear = DateTime.now().year;

    Widget dropdown<T>({
      required Key key,
      required String hint,
      required T? value,
      required List<T> items,
      required String Function(T) label,
      required ValueChanged<T?> onChanged,
      int flex = 1,
    }) =>
        Expanded(
          flex: flex,
          child: DropdownButtonFormField<T>(
            key: key,
            initialValue: value,
            isExpanded: true,
            menuMaxHeight: 360,
            hint: Text(hint, overflow: TextOverflow.ellipsis),
            items: [
              for (final item in items) DropdownMenuItem<T>(value: item, child: Text(label(item))),
            ],
            onChanged: onChanged,
            decoration: const InputDecoration(
              isDense: true,
              contentPadding: EdgeInsets.symmetric(horizontal: 10, vertical: 14),
            ),
          ),
        );

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        RegLabel(required: true, text: l10n.registrationMemberInfoDobLabel),
        const SizedBox(height: 6),
        Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            dropdown<int>(
              key: ValueKey('dobDay-$_day-$_month-$_year'),
              hint: l10n.regDobDay,
              value: _day,
              items: [for (var d = 1; d <= 31; d++) d],
              label: (d) => bnNumber(d, locale: lang),
              onChanged: (v) => _changed(day: v),
            ),
            const SizedBox(width: 8),
            dropdown<int>(
              key: ValueKey('dobMonth-$_month'),
              hint: l10n.regDobMonth,
              value: _month,
              items: [for (var m = 1; m <= 12; m++) m],
              label: (m) => bnMonthName(m, locale: lang),
              onChanged: (v) => _changed(month: v),
              flex: 2,
            ),
            const SizedBox(width: 8),
            dropdown<int>(
              key: ValueKey('dobYear-$_year'),
              hint: l10n.regDobYear,
              value: _year,
              items: [for (var y = thisYear; y >= _firstBirthYear; y--) y],
              label: (y) => bnNumber(y, locale: lang),
              onChanged: (v) => _changed(year: v),
              flex: 2,
            ),
          ],
        ),
        if (error)
          Padding(
            padding: const EdgeInsets.only(top: 4),
            child: Text(
              l10n.registrationValidationDobRequired,
              style: theme.textTheme.bodySmall?.copyWith(color: theme.colorScheme.error),
            ),
          ),
      ],
    );
  }
}

/// Current address abroad: country picker (the phone country list), city and
/// a free-text address. The permanent address stays in Bangladesh.
class AbroadAddressFields extends StatelessWidget {
  const AbroadAddressFields({super.key});

  Future<void> _pickCountry(BuildContext context, String currentIso) async {
    final bloc = context.read<RegistrationBloc>();
    final iso = await showPhoneCountrySheet(
      context,
      selectedIso: currentIso.isEmpty ? 'SA' : currentIso,
      lang: AppLocalizations.of(context).localeName,
    );
    if (iso != null) bloc.add(AbroadFieldChanged(AbroadField.country, iso));
  }

  @override
  Widget build(BuildContext context) {
    final state = context.watch<RegistrationBloc>().state;
    final bloc = context.read<RegistrationBloc>();
    final l10n = AppLocalizations.of(context);
    final theme = Theme.of(context);
    final f = state.form;
    final country = phoneCountryByIso(f.currentCountry, lang: l10n.localeName);

    String? err(RegErrorKind kind) {
      final e = findError(state.stepErrors, kind);
      return e == null ? null : regErrorMessage(l10n, e, flags: state.flags);
    }

    final countryError = err(RegErrorKind.abroadCountryRequired);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        RegLabel(required: true, text: l10n.regAbroadCountry),
        const SizedBox(height: 6),
        InkWell(
          key: const Key('abroadCountryButton'),
          borderRadius: BorderRadius.circular(AppRadius.sm),
          onTap: () => _pickCountry(context, f.currentCountry),
          child: InputDecorator(
            decoration: InputDecoration(
              isDense: true,
              errorText: countryError,
              suffixIcon: const Icon(Icons.arrow_drop_down),
              contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 14),
            ),
            child: Text(
              country == null ? l10n.regAbroadCountryPick : '${country.flag}  ${country.name}',
              style: country == null
                  ? theme.textTheme.bodyLarge?.copyWith(color: theme.colorScheme.onSurfaceVariant)
                  : theme.textTheme.bodyLarge,
            ),
          ),
        ),
        const SizedBox(height: 12),
        RegTextField(
          key: const Key('abroadCityField'),
          label: l10n.regAbroadCity,
          required: true,
          value: f.currentCity,
          error: err(RegErrorKind.abroadCityRequired),
          onChanged: (v) => bloc.add(AbroadFieldChanged(AbroadField.city, v)),
        ),
        const SizedBox(height: 12),
        RegTextField(
          key: const Key('abroadTextField'),
          label: l10n.regAbroadAddressText,
          required: true,
          value: f.currentAddressText,
          maxLines: 3,
          error: err(RegErrorKind.abroadAddressRequired),
          onChanged: (v) => bloc.add(AbroadFieldChanged(AbroadField.text, v)),
        ),
        const SizedBox(height: 8),
        Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Icon(Icons.info_outline, size: 18, color: theme.colorScheme.onSurfaceVariant),
            const SizedBox(width: 6),
            Expanded(child: Text(l10n.regAbroadPermanentNote, style: theme.textTheme.bodySmall)),
          ],
        ),
      ],
    );
  }
}
