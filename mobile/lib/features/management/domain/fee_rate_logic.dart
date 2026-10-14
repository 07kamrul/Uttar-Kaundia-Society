import 'admin_entities.dart';

/// Date only `yyyy-MM-dd`.
String isoDay(DateTime d) =>
    '${d.year.toString().padLeft(4, '0')}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')}';

DateTime _day(DateTime d) => DateTime(d.year, d.month, d.day);

/// How far ahead the wizard may schedule a rate.
const feeWizardMaxDaysAhead = 365;

/// The rate in force today: the newest row whose `start_date` is on or before
/// [today]. The server's `status == 1` row is not used because a future-dated
/// version also shows as active there.
FeeSetting? currentRate(List<FeeSetting> history, DateTime today) {
  final cutoff = isoDay(today);
  FeeSetting? best;
  for (final row in history) {
    if (row.startDate.compareTo(cutoff) > 0) continue;
    if (best == null || row.startDate.compareTo(best.startDate) > 0) best = row;
  }
  return best;
}

/// A version starting after [today] is already scheduled.
bool hasFutureVersion(List<FeeSetting> history, DateTime today) {
  final cutoff = isoDay(today);
  return history.any((r) => r.startDate.compareTo(cutoff) > 0);
}

/// Effective date: today up to +365 days (backdating stays in Advanced).
bool isEffectiveDateAllowed(DateTime date, DateTime today) {
  final d = _day(date);
  final t = _day(today);
  return !d.isBefore(t) && !d.isAfter(t.add(const Duration(days: feeWizardMaxDaysAhead)));
}
