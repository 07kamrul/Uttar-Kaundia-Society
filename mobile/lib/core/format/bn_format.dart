/// Bangla-first formatting helpers. Pure Dart (no intl locale data needed) so
/// they work identically in tests and on device.
///
/// [locale] is a language code: 'bn' (default) renders Bangla digits and month
/// names; anything else renders English ('en').
library;

const _bnDigits = ['০', '১', '২', '৩', '৪', '৫', '৬', '৭', '৮', '৯'];

const _bnMonths = [
  'জানুয়ারি', 'ফেব্রুয়ারি', 'মার্চ', 'এপ্রিল', 'মে', 'জুন',
  'জুলাই', 'আগস্ট', 'সেপ্টেম্বর', 'অক্টোবর', 'নভেম্বর', 'ডিসেম্বর',
];

const _enMonths = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

bool _isBn(String locale) => locale == 'bn';

String _digits(String s, String locale) {
  if (!_isBn(locale)) return s;
  final b = StringBuffer();
  for (final unit in s.codeUnits) {
    if (unit >= 0x30 && unit <= 0x39) {
      b.write(_bnDigits[unit - 0x30]);
    } else {
      b.writeCharCode(unit);
    }
  }
  return b.toString();
}

String _two(int n) => n.toString().padLeft(2, '0');

/// `১১ অক্টোবর ২০২৬` / short `১১/১০/২০২৬`; English `11 Oct 2026` / `11/10/2026`.
/// Formats the calendar fields of [date] as given (convert to local first).
String bnDate(DateTime date, {String locale = 'bn', bool short = false}) {
  if (short) {
    return _digits('${_two(date.day)}/${_two(date.month)}/${date.year}', locale);
  }
  final month = (_isBn(locale) ? _bnMonths : _enMonths)[date.month - 1];
  return _digits('${date.day} ', locale) + month + _digits(' ${date.year}', locale);
}

/// Month name for [month] 1-12: `মার্চ` (Bangla) / `Mar` (English).
String bnMonthName(int month, {String locale = 'bn'}) =>
    (_isBn(locale) ? _bnMonths : _enMonths)[month - 1];

/// Replaces ASCII digits with Bangla digits when [locale] is 'bn'.
String bnNumber(Object value, {String locale = 'bn'}) => _digits(value.toString(), locale);

/// `৳ ১,২০০` (Bangla) / `৳ 1,200` (English), lakh/crore grouping (12,34,567).
/// Whole amounts show no decimals, fractional amounts two. Accepts numbers and
/// numeric strings (the API serialises decimals as strings); anything else
/// yields an em dash.
String taka(Object? amount, {String locale = 'bn'}) {
  final value = switch (amount) {
    num n => n,
    String s => num.tryParse(s.trim()),
    _ => null,
  };
  if (value == null || value.isNaN || value.isInfinite) return '—';

  final negative = value < 0;
  final abs = value.abs();
  final cents = (abs * 100).round();
  final whole = cents ~/ 100;
  final fraction = cents % 100;

  var text = _groupIndian(whole.toString());
  if (fraction != 0) text = '$text.${_two(fraction)}';
  return '${negative && cents != 0 ? '-' : ''}৳ ${_digits(text, locale)}';
}

String _groupIndian(String digits) {
  if (digits.length <= 3) return digits;
  final last3 = digits.substring(digits.length - 3);
  var rest = digits.substring(0, digits.length - 3);
  final parts = <String>[];
  while (rest.length > 2) {
    parts.insert(0, rest.substring(rest.length - 2));
    rest = rest.substring(0, rest.length - 2);
  }
  if (rest.isNotEmpty) parts.insert(0, rest);
  return '${parts.join(',')},$last3';
}
