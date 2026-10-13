import { formatBnDate, formatBnNumber, formatTakaAmount, toBanglaDigits } from './bn-format';

// 11 Oct 2026, local time (the pipes display in the browser's time zone, like `| date`).
const OCT_11 = new Date(2026, 9, 11, 14, 30);

describe('toBanglaDigits', () => {
  it('converts ASCII digits only', () => {
    expect(toBanglaDigits('1,23,456.50 kg')).toBe('১,২৩,৪৫৬.৫০ kg');
    expect(toBanglaDigits('')).toBe('');
  });
});

describe('formatBnDate', () => {
  it('formats the default long style in Bangla', () => {
    expect(formatBnDate(OCT_11, 'bn')).toBe('১১ অক্টোবর ২০২৬');
  });

  it('formats the short style in Bangla with zero padding', () => {
    expect(formatBnDate(OCT_11, 'bn', 'short')).toBe('১১/১০/২০২৬');
    expect(formatBnDate(new Date(2026, 2, 5), 'bn', 'short')).toBe('০৫/০৩/২০২৬');
  });

  it('formats English long and short styles', () => {
    expect(formatBnDate(OCT_11, 'en')).toBe('11 Oct 2026');
    expect(formatBnDate(OCT_11, 'en', 'short')).toBe('11/10/2026');
    expect(formatBnDate(new Date(2026, 8, 3), 'en')).toBe('3 Sep 2026');
  });

  it('does not pad the day in the long style', () => {
    expect(formatBnDate(new Date(2026, 2, 5), 'bn')).toBe('৫ মার্চ ২০২৬');
  });

  it('treats a date-only string as a local calendar day (no time zone shift)', () => {
    expect(formatBnDate('2026-10-11', 'en')).toBe('11 Oct 2026');
    expect(formatBnDate('2026-01-01', 'bn', 'short')).toBe('০১/০১/২০২৬');
  });

  it('accepts ISO timestamps and epoch milliseconds', () => {
    expect(formatBnDate('2026-10-11T12:00:00', 'en')).toBe('11 Oct 2026');
    expect(formatBnDate(OCT_11.getTime(), 'en')).toBe('11 Oct 2026');
  });

  it('returns an empty string for null, undefined, empty and invalid input', () => {
    expect(formatBnDate(null, 'bn')).toBe('');
    expect(formatBnDate(undefined, 'bn')).toBe('');
    expect(formatBnDate('', 'bn')).toBe('');
    expect(formatBnDate('not a date', 'bn')).toBe('');
    expect(formatBnDate(new Date('x'), 'en')).toBe('');
  });
});

describe('formatBnNumber', () => {
  it('uses Bangla digits in bn and standard digits in en', () => {
    expect(formatBnNumber(1200, 'bn')).toBe('১,২০০');
    expect(formatBnNumber(1200, 'en')).toBe('1,200');
  });

  it('groups in the Bangladesh/South-Asian lakh style', () => {
    expect(formatBnNumber(123456, 'en')).toBe('1,23,456');
    expect(formatBnNumber(12345678, 'bn')).toBe('১,২৩,৪৫,৬৭৮');
  });

  it('keeps fractions up to two places by default and supports explicit decimals', () => {
    expect(formatBnNumber(1234.5, 'en')).toBe('1,234.5');
    expect(formatBnNumber(1234.5678, 'en')).toBe('1,234.57');
    expect(formatBnNumber(1234.5, 'bn', 2)).toBe('১,২৩৪.৫০');
    expect(formatBnNumber(1234.5, 'en', 0)).toBe('1,235');
  });

  it('handles zero, negatives and numeric strings (API decimals)', () => {
    expect(formatBnNumber(0, 'bn')).toBe('০');
    expect(formatBnNumber(-1500, 'en')).toBe('-1,500');
    expect(formatBnNumber('2500.00', 'bn')).toBe('২,৫০০');
  });

  it('returns an empty string for null, undefined, empty and non-numeric input', () => {
    expect(formatBnNumber(null, 'bn')).toBe('');
    expect(formatBnNumber(undefined, 'bn')).toBe('');
    expect(formatBnNumber('', 'bn')).toBe('');
    expect(formatBnNumber('abc', 'en')).toBe('');
    expect(formatBnNumber(Number.NaN, 'en')).toBe('');
    expect(formatBnNumber(Number.POSITIVE_INFINITY, 'en')).toBe('');
  });
});

describe('formatTakaAmount', () => {
  it('prefixes the taka sign with Bangla or standard digits', () => {
    expect(formatTakaAmount(1200, 'bn')).toBe('৳ ১,২০০');
    expect(formatTakaAmount(1200, 'en')).toBe('৳ 1,200');
  });

  it('shows decimals only when needed by default', () => {
    expect(formatTakaAmount(1200.5, 'en')).toBe('৳ 1,200.50');
    expect(formatTakaAmount(1200, 'en')).toBe('৳ 1,200');
    expect(formatTakaAmount('1200.00', 'bn')).toBe('৳ ১,২০০');
  });

  it('honours explicit decimals', () => {
    expect(formatTakaAmount(1200, 'bn', 2)).toBe('৳ ১,২০০.০০');
    expect(formatTakaAmount(1200.6, 'en', 0)).toBe('৳ 1,201');
  });

  it('places the sign before the taka symbol for negatives', () => {
    expect(formatTakaAmount(-500, 'en')).toBe('-৳ 500');
    expect(formatTakaAmount(-500, 'bn')).toBe('-৳ ৫০০');
  });

  it('returns an empty string for missing or invalid amounts', () => {
    expect(formatTakaAmount(null, 'bn')).toBe('');
    expect(formatTakaAmount(undefined, 'en')).toBe('');
    expect(formatTakaAmount('x', 'en')).toBe('');
  });
});
