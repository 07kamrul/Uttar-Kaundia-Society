import 'package:flutter/widgets.dart';

import 'gov_strings_bn.dart';
import 'gov_strings_en.dart';

/// Text for the membership / governance-admin pages, keyed exactly like the
/// Angular translation keys so the two apps stay in step. `{{name}}`
/// placeholders are filled from [params].
String gt(BuildContext context, String key, [Map<String, Object> params = const {}]) =>
    govText(Localizations.localeOf(context).languageCode, key, params);

/// Locale-explicit lookup (also used by tests). Falls back to English, then to
/// [fallback] or a dash: a raw key is never shown.
String govText(String lang, String key, [Map<String, Object> params = const {}, String? fallback]) {
  final table = lang == 'bn' ? govStringsBn : govStringsEn;
  var text = table[key] ?? govStringsEn[key] ?? fallback ?? '—';
  params.forEach((name, value) => text = text.replaceAll('{{$name}}', '$value'));
  return text;
}

/// Label for a status code under [prefix] (e.g. `membershipGov.statuses`);
/// an unknown code shows [fallbackKey]'s text or a dash, never the raw code.
String gtCode(BuildContext context, String prefix, String code) {
  final lang = Localizations.localeOf(context).languageCode;
  return govText(lang, '$prefix.$code', const {}, '—');
}
