import 'package:flutter_test/flutter_test.dart';
import 'package:kaundia_app/core/format/bn_format.dart';

void main() {
  test('bnMonthName gives Bangla or English month names', () {
    expect(bnMonthName(3), 'মার্চ');
    expect(bnMonthName(3, locale: 'en'), 'Mar');
  });

  final oct11 = DateTime(2026, 10, 11);

  group('bnDate', () {
    test('long Bangla', () => expect(bnDate(oct11), '১১ অক্টোবর ২০২৬'));
    test('short Bangla', () => expect(bnDate(oct11, short: true), '১১/১০/২০২৬'));
    test('long English', () => expect(bnDate(oct11, locale: 'en'), '11 Oct 2026'));
    test('short English', () => expect(bnDate(oct11, locale: 'en', short: true), '11/10/2026'));
    test('zero-pads single digit day and month in short form', () {
      expect(bnDate(DateTime(2026, 1, 5), short: true), '০৫/০১/২০২৬');
      expect(bnDate(DateTime(2026, 1, 5), locale: 'en', short: true), '05/01/2026');
    });
    test('does not pad day in long form', () {
      expect(bnDate(DateTime(2026, 1, 5)), '৫ জানুয়ারি ২০২৬');
    });
    test('knows all twelve Bangla months', () {
      const expected = [
        'জানুয়ারি', 'ফেব্রুয়ারি', 'মার্চ', 'এপ্রিল', 'মে', 'জুন',
        'জুলাই', 'আগস্ট', 'সেপ্টেম্বর', 'অক্টোবর', 'নভেম্বর', 'ডিসেম্বর',
      ];
      for (var m = 1; m <= 12; m++) {
        expect(bnDate(DateTime(2026, m, 10)), '১০ ${expected[m - 1]} ২০২৬');
      }
    });
    test('unknown locale falls back to English', () {
      expect(bnDate(oct11, locale: 'fr'), '11 Oct 2026');
    });
  });

  group('bnNumber', () {
    test('Bangla digits in bn locale', () => expect(bnNumber(1234567), '১২৩৪৫৬৭'));
    test('keeps ASCII digits in en locale', () => expect(bnNumber(1234, locale: 'en'), '1234'));
    test('handles decimals, negatives and strings', () {
      expect(bnNumber(12.5), '১২.৫');
      expect(bnNumber(-3), '-৩');
      expect(bnNumber('017-12'), '০১৭-১২');
    });
    test('zero', () => expect(bnNumber(0), '০'));
  });

  group('taka', () {
    test('Bangla digits with grouping', () => expect(taka(1200), '৳ ১,২০০'));
    test('English digits', () => expect(taka(1200, locale: 'en'), '৳ 1,200'));
    test('uses lakh/crore grouping', () {
      expect(taka(1234567), '৳ ১২,৩৪,৫৬৭');
      expect(taka(123456789, locale: 'en'), '৳ 12,34,56,789');
    });
    test('small values and zero', () {
      expect(taka(0), '৳ ০');
      expect(taka(999), '৳ ৯৯৯');
    });
    test('whole-valued doubles show no decimals; fractions show two', () {
      expect(taka(1200.0), '৳ ১,২০০');
      expect(taka(1200.5), '৳ ১,২০০.৫০');
      expect(taka(0.25, locale: 'en'), '৳ 0.25');
    });
    test('negative amounts', () => expect(taka(-1500, locale: 'en'), '-৳ 1,500'));
    test('accepts numeric strings from the API (decimal strings)', () {
      expect(taka('1200.00'), '৳ ১,২০০');
    });
    test('unparseable input yields a dash instead of throwing', () {
      expect(taka('abc'), '—');
      expect(taka(null), '—');
    });
  });
}
