import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../core/phone/phone.dart';
import '../../core/phone/phone_countries.dart';
import '../../core/theme/app_theme.dart';
import '../../core/validation/bd_input.dart' show toAsciiDigits;
import '../../l10n/app_localizations.dart';
import 'phone_country_sheet.dart';

/// Digits (ASCII, Bangla, Arabic-Indic), "+" and the usual separators.
final _allowedInput = FilteringTextInputFormatter.allow(RegExp('[0-9০-৯٠-٩+\\s\\-().]'));

/// International phone input: country selector (bottom sheet) + number field.
/// Mirrors frontend/src/app/shared/phone-input.
///
/// [value] and [onChanged] carry E.164 ("+8801712345678"); legacy national
/// values are read as [defaultIso] numbers. While the typed text cannot be
/// parsed yet, a best-effort plus, calling code and digits is emitted so validators flag it
/// instead of the form looking empty. Pasting a "+" / "00" number switches the
/// country. Invalid numbers show a localized error once the field loses focus;
/// possible-but-unknown numbers only show a non-blocking warning.
class PhoneField extends StatefulWidget {
  const PhoneField({
    super.key,
    required this.value,
    required this.onChanged,
    this.label,
    this.errorText,
    this.defaultIso = defaultPhoneIso,
    this.enabled = true,
    this.dense = false,
    this.textInputAction,
    this.autofillHints,
  });

  final String value;
  final ValueChanged<String> onChanged;
  final String? label;

  /// Error from the parent form (e.g. "required"); wins over the built-in one.
  final String? errorText;
  final String defaultIso;
  final bool enabled;

  /// Compact paddings matching the registration wizard fields.
  final bool dense;
  final TextInputAction? textInputAction;
  final Iterable<String>? autofillHints;

  @override
  State<PhoneField> createState() => _PhoneFieldState();
}

class _PhoneFieldState extends State<PhoneField> {
  late final TextEditingController _controller;
  final FocusNode _focus = FocusNode();
  late String _iso;
  late String _lastEmitted;
  bool _touched = false;

  @override
  void initState() {
    super.initState();
    final split = splitPhone(widget.value, fallbackIso: widget.defaultIso);
    _iso = split.iso;
    _controller = TextEditingController(text: split.nationalNumber);
    _lastEmitted = widget.value;
    // A stored value that is already wrong is flagged straight away.
    _touched = widget.value.trim().isNotEmpty;
    _focus.addListener(_onFocusChanged);
  }

  @override
  void didUpdateWidget(covariant PhoneField oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (widget.value == _lastEmitted) return;
    // The parent changed the value (draft restore, programmatic reset).
    _lastEmitted = widget.value;
    final split = splitPhone(widget.value, fallbackIso: widget.defaultIso, preferredIso: _iso);
    _iso = split.iso;
    _controller.value = TextEditingValue(
      text: split.nationalNumber,
      selection: TextSelection.collapsed(offset: split.nationalNumber.length),
    );
  }

  @override
  void dispose() {
    _focus
      ..removeListener(_onFocusChanged)
      ..dispose();
    _controller.dispose();
    super.dispose();
  }

  void _onFocusChanged() {
    if (!_focus.hasFocus && !_touched) setState(() => _touched = true);
  }

  bool _isInternational(String text) {
    final trimmed = toAsciiDigits(text).trimLeft();
    return trimmed.startsWith('+') || trimmed.startsWith('00');
  }

  void _onTextChanged(String text) {
    var iso = _iso;
    var shown = text;
    if (_isInternational(text)) {
      final parsed = normalizePhone(text);
      final callingCode = parsed.callingCode;
      if (callingCode != null) {
        // A full international number was typed or pasted: switch country and
        // show the national part in the field.
        iso = isoForCallingCode(callingCode, preferred: _iso);
        shown = splitPhone(parsed.e164, fallbackIso: iso).nationalNumber;
      }
    }
    if (shown != text) {
      _controller.value = TextEditingValue(
        text: shown,
        selection: TextSelection.collapsed(offset: shown.length),
      );
    }
    _emit(iso, shown);
  }

  void _emit(String iso, String text) {
    final composed = composePhone(iso, text);
    setState(() {
      _iso = iso;
      _lastEmitted = composed;
    });
    widget.onChanged(composed);
  }

  Future<void> _pickCountry() async {
    final lang = _lang(context);
    final picked = await showPhoneCountrySheet(context, selectedIso: _iso, lang: lang);
    if (picked == null || !mounted) return;
    _emit(picked, _controller.text);
  }

  String _lang(BuildContext context) =>
      Localizations.localeOf(context).languageCode == 'bn' ? 'bn' : 'en';

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final theme = Theme.of(context);
    final lang = _lang(context);
    final country = phoneCountryByIso(_iso, lang: lang);
    final text = _controller.text;
    final status = text.trim().isEmpty
        ? null
        : normalizePhone(composePhone(_iso, text), defaultIso: _iso).status;
    final showFeedback = _touched || widget.errorText != null;

    final error = widget.errorText ??
        (showFeedback && status == PhoneStatus.invalid ? l10n.phoneFieldInvalid : null);
    final warn = error == null && showFeedback && status == PhoneStatus.possible;
    final hint = phoneExampleHint(_iso);

    return TextField(
      key: const Key('phoneFieldNumber'),
      controller: _controller,
      focusNode: _focus,
      enabled: widget.enabled,
      keyboardType: TextInputType.phone,
      textInputAction: widget.textInputAction ?? TextInputAction.next,
      autofillHints: widget.autofillHints,
      inputFormatters: [_allowedInput],
      textDirection: TextDirection.ltr,
      onChanged: _onTextChanged,
      decoration: InputDecoration(
        labelText: widget.label,
        hintText: hint.isEmpty ? null : hint,
        errorText: error,
        errorMaxLines: 4,
        isDense: widget.dense,
        contentPadding: widget.dense ? const EdgeInsets.symmetric(horizontal: 12, vertical: 14) : null,
        helper: warn ? _Warning(l10n.phoneFieldPossibleWarning) : null,
        helperMaxLines: 4,
        prefixIconConstraints: const BoxConstraints(minWidth: 48, minHeight: 48),
        prefixIcon: _CountryButton(
          country: country,
          fallbackDial: dialCodeForIso(_iso),
          enabled: widget.enabled,
          semanticsLabel: l10n.phoneFieldCountrySemantics(
            country?.name ?? _iso,
            country?.dialCode ?? dialCodeForIso(_iso),
          ),
          onTap: _pickCountry,
          color: theme.colorScheme.onSurface,
        ),
      ),
    );
  }
}

class _CountryButton extends StatelessWidget {
  const _CountryButton({
    required this.country,
    required this.fallbackDial,
    required this.enabled,
    required this.semanticsLabel,
    required this.onTap,
    required this.color,
  });

  final PhoneCountry? country;
  final String fallbackDial;
  final bool enabled;
  final String semanticsLabel;
  final VoidCallback onTap;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      button: true,
      enabled: enabled,
      label: semanticsLabel,
      excludeSemantics: true,
      child: InkWell(
        key: const Key('phoneFieldCountryButton'),
        onTap: enabled ? onTap : null,
        borderRadius: BorderRadius.circular(AppRadius.sm),
        child: ConstrainedBox(
          constraints: const BoxConstraints(minWidth: 48, minHeight: 48),
          child: Padding(
            padding: const EdgeInsetsDirectional.only(start: 12, end: 4),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(country?.flag ?? '', style: const TextStyle(fontSize: 20)),
                const SizedBox(width: 6),
                Text(
                  country?.dialCode ?? fallbackDial,
                  textDirection: TextDirection.ltr,
                  style: TextStyle(color: color, fontWeight: FontWeight.w600),
                ),
                Icon(Icons.arrow_drop_down, color: color),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _Warning extends StatelessWidget {
  const _Warning(this.message);

  final String message;

  @override
  Widget build(BuildContext context) {
    final style = Theme.of(context).textTheme.bodySmall?.copyWith(color: AppColors.goldStrong);
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Icon(Icons.warning_amber_rounded, size: 16, color: AppColors.goldStrong),
        const SizedBox(width: 4),
        Expanded(child: Text(message, style: style)),
      ],
    );
  }
}
