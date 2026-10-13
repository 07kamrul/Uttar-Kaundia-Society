/// Country data for the phone picker: every region the parser knows, with the
/// society's pinned countries first. Mirrors listPhoneCountries /
/// filterPhoneCountries in frontend/src/app/shared/phone-input/phone-number.ts.
///
/// Flutter has no Intl.DisplayNames, so names live in const maps: English for
/// every region, Bangla for the pinned and most common ones (others fall back
/// to English).
library;

import 'package:phone_numbers_parser/metadata.dart';
import 'package:phone_numbers_parser/phone_numbers_parser.dart';

import '../validation/bd_input.dart' show toAsciiDigits;

export 'phone.dart' show defaultPhoneIso;

/// Shown first, in this order (where the members live and work).
const List<String> pinnedPhoneIsoCodes = [
  'BD', 'SA', 'AE', 'QA', 'KW', 'OM', 'BH', 'MY', 'SG', 'GB', 'US', 'IT', 'MV', 'JP', 'AU',
];

class PhoneCountry {
  const PhoneCountry({
    required this.iso,
    required this.name,
    required this.englishName,
    required this.dialCode,
    required this.flag,
    required this.isPinned,
  });

  /// ISO 3166-1 alpha-2 ("BD").
  final String iso;

  /// Name in the requested language.
  final String name;
  final String englishName;

  /// "+880".
  final String dialCode;

  /// Flag emoji.
  final String flag;
  final bool isPinned;
}

const int _regionalIndicatorOffset = 0x1F1E6 - 0x41;

/// Flag emoji for an ISO code ("BD" -> regional indicator pair).
String phoneFlagEmoji(String iso) => String.fromCharCodes(
      iso.toUpperCase().codeUnits.map((c) => c + _regionalIndicatorOffset),
    );

final Map<String, List<PhoneCountry>> _cache = {};

PhoneCountry _build(IsoCode code, String lang) {
  final iso = code.name;
  final english = _englishNames[iso] ?? iso;
  return PhoneCountry(
    iso: iso,
    name: lang == 'bn' ? (_banglaNames[iso] ?? english) : english,
    englishName: english,
    dialCode: '+${metadataByIsoCode[code]!.countryCode}',
    flag: phoneFlagEmoji(iso),
    isPinned: pinnedPhoneIsoCodes.contains(iso),
  );
}

/// Pinned countries (in [pinnedPhoneIsoCodes] order), then every other region
/// sorted by English name. [lang] is 'bn' for Bangla names, anything else
/// English.
List<PhoneCountry> listPhoneCountries({String lang = 'bn'}) {
  final key = lang == 'bn' ? 'bn' : 'en';
  return _cache.putIfAbsent(key, () {
    final byIso = {for (final c in IsoCode.values) c.name: _build(c, key)};
    final rest = byIso.values.where((c) => !c.isPinned).toList()
      ..sort((a, b) => a.englishName.toLowerCase().compareTo(b.englishName.toLowerCase()));
    return List.unmodifiable([
      for (final iso in pinnedPhoneIsoCodes) byIso[iso]!,
      ...rest,
    ]);
  });
}

/// Country for [iso] (case-insensitive), or null when unknown.
PhoneCountry? phoneCountryByIso(String iso, {String lang = 'bn'}) {
  final upper = iso.trim().toUpperCase();
  for (final c in listPhoneCountries(lang: lang)) {
    if (c.iso == upper) return c;
  }
  return null;
}

/// Filters by name (current and English), ISO code, or dial code (with or
/// without "+"). Keeps the input order, so pinned countries stay on top.
List<PhoneCountry> filterPhoneCountries(List<PhoneCountry> countries, String query) {
  final term = toAsciiDigits(query).trim().toLowerCase();
  if (term.isEmpty) return countries;
  final digits = term.replaceAll(RegExp(r'\D'), '');
  return countries
      .where((c) =>
          c.name.toLowerCase().contains(term) ||
          c.englishName.toLowerCase().contains(term) ||
          c.iso.toLowerCase() == term ||
          (digits.isNotEmpty && c.dialCode.substring(1).startsWith(digits)))
      .toList();
}

const Map<String, String> _banglaNames = {
  // Pinned.
  'BD': 'বাংলাদেশ',
  'SA': 'সৌদি আরব',
  'AE': 'সংযুক্ত আরব আমিরাত',
  'QA': 'কাতার',
  'KW': 'কুয়েত',
  'OM': 'ওমান',
  'BH': 'বাহরাইন',
  'MY': 'মালয়েশিয়া',
  'SG': 'সিঙ্গাপুর',
  'GB': 'যুক্তরাজ্য',
  'US': 'যুক্তরাষ্ট্র',
  'IT': 'ইতালি',
  'MV': 'মালদ্বীপ',
  'JP': 'জাপান',
  'AU': 'অস্ট্রেলিয়া',
  // Common others.
  'IN': 'ভারত',
  'PK': 'পাকিস্তান',
  'NP': 'নেপাল',
  'BT': 'ভুটান',
  'LK': 'শ্রীলঙ্কা',
  'MM': 'মিয়ানমার',
  'AF': 'আফগানিস্তান',
  'CN': 'চীন',
  'HK': 'হংকং',
  'TW': 'তাইওয়ান',
  'KR': 'দক্ষিণ কোরিয়া',
  'TH': 'থাইল্যান্ড',
  'ID': 'ইন্দোনেশিয়া',
  'BN': 'ব্রুনাই',
  'PH': 'ফিলিপাইন',
  'VN': 'ভিয়েতনাম',
  'KH': 'কম্বোডিয়া',
  'JO': 'জর্ডান',
  'LB': 'লেবানন',
  'IQ': 'ইরাক',
  'IR': 'ইরান',
  'IL': 'ইসরায়েল',
  'PS': 'ফিলিস্তিন',
  'YE': 'ইয়েমেন',
  'SY': 'সিরিয়া',
  'TR': 'তুরস্ক',
  'EG': 'মিশর',
  'LY': 'লিবিয়া',
  'SD': 'সুদান',
  'MA': 'মরক্কো',
  'DZ': 'আলজেরিয়া',
  'NG': 'নাইজেরিয়া',
  'KE': 'কেনিয়া',
  'ZA': 'দক্ষিণ আফ্রিকা',
  'MU': 'মরিশাস',
  'SC': 'সেশেলস',
  'CA': 'কানাডা',
  'MX': 'মেক্সিকো',
  'BR': 'ব্রাজিল',
  'AR': 'আর্জেন্টিনা',
  'NZ': 'নিউজিল্যান্ড',
  'DE': 'জার্মানি',
  'FR': 'ফ্রান্স',
  'ES': 'স্পেন',
  'PT': 'পর্তুগাল',
  'NL': 'নেদারল্যান্ডস',
  'BE': 'বেলজিয়াম',
  'AT': 'অস্ট্রিয়া',
  'CH': 'সুইজারল্যান্ড',
  'SE': 'সুইডেন',
  'NO': 'নরওয়ে',
  'DK': 'ডেনমার্ক',
  'FI': 'ফিনল্যান্ড',
  'IE': 'আয়ারল্যান্ড',
  'GR': 'গ্রিস',
  'RU': 'রাশিয়া',
};

const Map<String, String> _englishNames = {
  'AC': 'Ascension Island',
  'AD': 'Andorra',
  'AE': 'United Arab Emirates',
  'AF': 'Afghanistan',
  'AG': 'Antigua and Barbuda',
  'AI': 'Anguilla',
  'AL': 'Albania',
  'AM': 'Armenia',
  'AO': 'Angola',
  'AR': 'Argentina',
  'AS': 'American Samoa',
  'AT': 'Austria',
  'AU': 'Australia',
  'AW': 'Aruba',
  'AX': 'Aland Islands',
  'AZ': 'Azerbaijan',
  'BA': 'Bosnia and Herzegovina',
  'BB': 'Barbados',
  'BD': 'Bangladesh',
  'BE': 'Belgium',
  'BF': 'Burkina Faso',
  'BG': 'Bulgaria',
  'BH': 'Bahrain',
  'BI': 'Burundi',
  'BJ': 'Benin',
  'BL': 'Saint Barthelemy',
  'BM': 'Bermuda',
  'BN': 'Brunei',
  'BO': 'Bolivia',
  'BQ': 'Caribbean Netherlands',
  'BR': 'Brazil',
  'BS': 'Bahamas',
  'BT': 'Bhutan',
  'BW': 'Botswana',
  'BY': 'Belarus',
  'BZ': 'Belize',
  'CA': 'Canada',
  'CC': 'Cocos (Keeling) Islands',
  'CD': 'Congo (DRC)',
  'CF': 'Central African Republic',
  'CG': 'Congo (Republic)',
  'CH': 'Switzerland',
  'CI': "Cote d'Ivoire",
  'CK': 'Cook Islands',
  'CL': 'Chile',
  'CM': 'Cameroon',
  'CN': 'China',
  'CO': 'Colombia',
  'CR': 'Costa Rica',
  'CU': 'Cuba',
  'CV': 'Cape Verde',
  'CW': 'Curacao',
  'CX': 'Christmas Island',
  'CY': 'Cyprus',
  'CZ': 'Czechia',
  'DE': 'Germany',
  'DJ': 'Djibouti',
  'DK': 'Denmark',
  'DM': 'Dominica',
  'DO': 'Dominican Republic',
  'DZ': 'Algeria',
  'EC': 'Ecuador',
  'EE': 'Estonia',
  'EG': 'Egypt',
  'EH': 'Western Sahara',
  'ER': 'Eritrea',
  'ES': 'Spain',
  'ET': 'Ethiopia',
  'FI': 'Finland',
  'FJ': 'Fiji',
  'FK': 'Falkland Islands',
  'FM': 'Micronesia',
  'FO': 'Faroe Islands',
  'FR': 'France',
  'GA': 'Gabon',
  'GB': 'United Kingdom',
  'GD': 'Grenada',
  'GE': 'Georgia',
  'GF': 'French Guiana',
  'GG': 'Guernsey',
  'GH': 'Ghana',
  'GI': 'Gibraltar',
  'GL': 'Greenland',
  'GM': 'Gambia',
  'GN': 'Guinea',
  'GP': 'Guadeloupe',
  'GQ': 'Equatorial Guinea',
  'GR': 'Greece',
  'GT': 'Guatemala',
  'GU': 'Guam',
  'GW': 'Guinea-Bissau',
  'GY': 'Guyana',
  'HK': 'Hong Kong',
  'HN': 'Honduras',
  'HR': 'Croatia',
  'HT': 'Haiti',
  'HU': 'Hungary',
  'ID': 'Indonesia',
  'IE': 'Ireland',
  'IL': 'Israel',
  'IM': 'Isle of Man',
  'IN': 'India',
  'IO': 'British Indian Ocean Territory',
  'IQ': 'Iraq',
  'IR': 'Iran',
  'IS': 'Iceland',
  'IT': 'Italy',
  'JE': 'Jersey',
  'JM': 'Jamaica',
  'JO': 'Jordan',
  'JP': 'Japan',
  'KE': 'Kenya',
  'KG': 'Kyrgyzstan',
  'KH': 'Cambodia',
  'KI': 'Kiribati',
  'KM': 'Comoros',
  'KN': 'Saint Kitts and Nevis',
  'KP': 'North Korea',
  'KR': 'South Korea',
  'KW': 'Kuwait',
  'KY': 'Cayman Islands',
  'KZ': 'Kazakhstan',
  'LA': 'Laos',
  'LB': 'Lebanon',
  'LC': 'Saint Lucia',
  'LI': 'Liechtenstein',
  'LK': 'Sri Lanka',
  'LR': 'Liberia',
  'LS': 'Lesotho',
  'LT': 'Lithuania',
  'LU': 'Luxembourg',
  'LV': 'Latvia',
  'LY': 'Libya',
  'MA': 'Morocco',
  'MC': 'Monaco',
  'MD': 'Moldova',
  'ME': 'Montenegro',
  'MF': 'Saint Martin',
  'MG': 'Madagascar',
  'MH': 'Marshall Islands',
  'MK': 'North Macedonia',
  'ML': 'Mali',
  'MM': 'Myanmar',
  'MN': 'Mongolia',
  'MO': 'Macao',
  'MP': 'Northern Mariana Islands',
  'MQ': 'Martinique',
  'MR': 'Mauritania',
  'MS': 'Montserrat',
  'MT': 'Malta',
  'MU': 'Mauritius',
  'MV': 'Maldives',
  'MW': 'Malawi',
  'MX': 'Mexico',
  'MY': 'Malaysia',
  'MZ': 'Mozambique',
  'NA': 'Namibia',
  'NC': 'New Caledonia',
  'NE': 'Niger',
  'NF': 'Norfolk Island',
  'NG': 'Nigeria',
  'NI': 'Nicaragua',
  'NL': 'Netherlands',
  'NO': 'Norway',
  'NP': 'Nepal',
  'NR': 'Nauru',
  'NU': 'Niue',
  'NZ': 'New Zealand',
  'OM': 'Oman',
  'PA': 'Panama',
  'PE': 'Peru',
  'PF': 'French Polynesia',
  'PG': 'Papua New Guinea',
  'PH': 'Philippines',
  'PK': 'Pakistan',
  'PL': 'Poland',
  'PM': 'Saint Pierre and Miquelon',
  'PR': 'Puerto Rico',
  'PS': 'Palestine',
  'PT': 'Portugal',
  'PW': 'Palau',
  'PY': 'Paraguay',
  'QA': 'Qatar',
  'RE': 'Reunion',
  'RO': 'Romania',
  'RS': 'Serbia',
  'RU': 'Russia',
  'RW': 'Rwanda',
  'SA': 'Saudi Arabia',
  'SB': 'Solomon Islands',
  'SC': 'Seychelles',
  'SD': 'Sudan',
  'SE': 'Sweden',
  'SG': 'Singapore',
  'SH': 'Saint Helena',
  'SI': 'Slovenia',
  'SJ': 'Svalbard and Jan Mayen',
  'SK': 'Slovakia',
  'SL': 'Sierra Leone',
  'SM': 'San Marino',
  'SN': 'Senegal',
  'SO': 'Somalia',
  'SR': 'Suriname',
  'SS': 'South Sudan',
  'ST': 'Sao Tome and Principe',
  'SV': 'El Salvador',
  'SX': 'Sint Maarten',
  'SY': 'Syria',
  'SZ': 'Eswatini',
  'TA': 'Tristan da Cunha',
  'TC': 'Turks and Caicos Islands',
  'TD': 'Chad',
  'TG': 'Togo',
  'TH': 'Thailand',
  'TJ': 'Tajikistan',
  'TK': 'Tokelau',
  'TL': 'Timor-Leste',
  'TM': 'Turkmenistan',
  'TN': 'Tunisia',
  'TO': 'Tonga',
  'TR': 'Turkey',
  'TT': 'Trinidad and Tobago',
  'TV': 'Tuvalu',
  'TW': 'Taiwan',
  'TZ': 'Tanzania',
  'UA': 'Ukraine',
  'UG': 'Uganda',
  'US': 'United States',
  'UY': 'Uruguay',
  'UZ': 'Uzbekistan',
  'VA': 'Vatican City',
  'VC': 'Saint Vincent and the Grenadines',
  'VE': 'Venezuela',
  'VG': 'British Virgin Islands',
  'VI': 'U.S. Virgin Islands',
  'VN': 'Vietnam',
  'VU': 'Vanuatu',
  'WF': 'Wallis and Futuna',
  'WS': 'Samoa',
  'XK': 'Kosovo',
  'YE': 'Yemen',
  'YT': 'Mayotte',
  'ZA': 'South Africa',
  'ZM': 'Zambia',
  'ZW': 'Zimbabwe',
};
