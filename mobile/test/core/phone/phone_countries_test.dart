import 'package:flutter_test/flutter_test.dart';
import 'package:kaundia_app/core/phone/phone_countries.dart';
import 'package:phone_numbers_parser/phone_numbers_parser.dart';

void main() {
  group('pinned countries', () {
    test('are in the agreed order', () {
      expect(pinnedPhoneIsoCodes, [
        'BD', 'SA', 'AE', 'QA', 'KW', 'OM', 'BH', 'MY', 'SG', 'GB', 'US', 'IT', 'MV', 'JP', 'AU',
      ]);
    });

    test('list starts with the pinned countries in order, with dial codes', () {
      final list = listPhoneCountries(lang: 'en');
      expect(list.take(15).map((c) => c.iso), pinnedPhoneIsoCodes);
      expect(list.take(15).map((c) => c.dialCode), [
        '+880', '+966', '+971', '+974', '+965', '+968', '+973', '+60', '+65', '+44', '+1', '+39',
        '+960', '+81', '+61',
      ]);
      expect(list.first.isPinned, isTrue);
      expect(list[15].isPinned, isFalse);
    });

    test('Bangladesh is the default', () {
      expect(defaultPhoneIso, 'BD');
    });
  });

  group('full list', () {
    test('has every country exactly once', () {
      final list = listPhoneCountries(lang: 'en');
      expect(list.length, IsoCode.values.length);
      expect(list.map((c) => c.iso).toSet().length, list.length);
    });

    test('rest is sorted by English name after the pinned block', () {
      final rest = listPhoneCountries(lang: 'en').skip(15).map((c) => c.name).toList();
      final sorted = [...rest]..sort((a, b) => a.toLowerCase().compareTo(b.toLowerCase()));
      expect(rest, sorted);
    });

    test('every country has an English name that is not just its code', () {
      for (final c in listPhoneCountries(lang: 'en')) {
        expect(c.name.length, greaterThan(2), reason: c.iso);
      }
    });

    test('flag emoji is derived from the ISO code', () {
      expect(phoneFlagEmoji('BD'), '\u{1F1E7}\u{1F1E9}');
      expect(phoneFlagEmoji('GB'), '\u{1F1EC}\u{1F1E7}');
    });
  });

  group('names', () {
    test('Bangla names for the pinned countries in bn', () {
      final list = listPhoneCountries(lang: 'bn');
      expect(list[0].name, 'বাংলাদেশ');
      expect(list[1].name, 'সৌদি আরব');
      expect(list[2].name, 'সংযুক্ত আরব আমিরাত');
      expect(list[3].name, 'কাতার');
      expect(list[4].name, 'কুয়েত');
      expect(list[5].name, 'ওমান');
      expect(list[6].name, 'বাহরাইন');
      expect(list[7].name, 'মালয়েশিয়া');
      expect(list[8].name, 'সিঙ্গাপুর');
      expect(list[9].name, 'যুক্তরাজ্য');
      expect(list[10].name, 'যুক্তরাষ্ট্র');
      expect(list[11].name, 'ইতালি');
      expect(list[12].name, 'মালদ্বীপ');
      expect(list[13].name, 'জাপান');
      expect(list[14].name, 'অস্ট্রেলিয়া');
    });

    test('countries without a Bangla name fall back to English', () {
      final names = {for (final c in listPhoneCountries(lang: 'bn')) c.iso: c.name};
      expect(names['AD'], 'Andorra');
    });

    test('English names in en', () {
      expect(listPhoneCountries(lang: 'en').first.name, 'Bangladesh');
    });

    test('phoneCountryByIso returns null for unknown', () {
      expect(phoneCountryByIso('ZZ'), isNull);
      expect(phoneCountryByIso('bd')?.iso, 'BD');
    });
  });

  group('filterPhoneCountries', () {
    final list = listPhoneCountries(lang: 'en');

    test('empty query returns everything', () {
      expect(filterPhoneCountries(list, '  ').length, list.length);
    });

    test('matches by name, case-insensitive', () {
      final r = filterPhoneCountries(list, 'saudi');
      expect(r.map((c) => c.iso), ['SA']);
    });

    test('matches by ISO code', () {
      expect(filterPhoneCountries(list, 'gb').first.iso, 'GB');
    });

    test('matches by dial code with or without plus', () {
      expect(filterPhoneCountries(list, '+966').map((c) => c.iso), contains('SA'));
      expect(filterPhoneCountries(list, '966').map((c) => c.iso), contains('SA'));
    });

    test('keeps pinned order first when several match', () {
      final r = filterPhoneCountries(list, '+1').map((c) => c.iso).toList();
      expect(r.first, 'US');
    });

    test('Bangla names are searchable in bn', () {
      final bn = listPhoneCountries(lang: 'bn');
      expect(filterPhoneCountries(bn, 'সৌদি').map((c) => c.iso), ['SA']);
    });

    test('no match gives empty', () {
      expect(filterPhoneCountries(list, 'zzzzzz'), isEmpty);
    });
  });
}
