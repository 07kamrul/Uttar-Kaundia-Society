import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:kaundia_app/core/network/api_client.dart';
import 'package:kaundia_app/features/management/data/admin_repository.dart';
import 'package:kaundia_app/features/management/domain/admin_entities.dart';
import 'package:kaundia_app/features/management/domain/fee_rate_logic.dart';
import 'package:kaundia_app/features/management/pages/fee_settings_page.dart';
import 'package:kaundia_app/features/management/presentation/bloc/fee_rate_wizard_cubit.dart';
import 'package:kaundia_app/l10n/app_localizations_bn.dart';
import 'package:mocktail/mocktail.dart';

import '../../support/pump_app.dart';

class _MockRepo extends Mock implements AdminRepository {}

class _MockApi extends Mock implements ApiClient {}

FeeSetting _row(String id, num value, String start, {int status = 0, String? unit = 'taka', String? category}) =>
    FeeSetting(id: id, key: 'admission_fee', value: value, startDate: start, status: status, unit: unit, feeCategory: category);

void main() {
  final bn = AppLocalizationsBn();
  final today = DateTime(2026, 10, 14);

  group('fee rate logic', () {
    test('current rate is the newest row started on or before today, not status==1', () {
      final history = [
        _row('1', 100, '2026-01-01'),
        _row('2', 200, '2026-10-14', status: 0),
        _row('3', 300, '2026-11-01', status: 1), // future row flagged active by the server
      ];
      expect(currentRate(history, today)!.value, 200);
    });

    test('a future-dated version blocks the wizard', () {
      expect(hasFutureVersion([_row('1', 100, '2026-01-01')], today), isFalse);
      expect(hasFutureVersion([_row('1', 100, '2026-01-01'), _row('2', 150, '2026-10-15')], today), isTrue);
    });

    test('effective date range is today to +365 days', () {
      expect(isEffectiveDateAllowed(today, today), isTrue);
      expect(isEffectiveDateAllowed(DateTime(2027, 10, 14), today), isTrue);
      expect(isEffectiveDateAllowed(DateTime(2027, 10, 15), today), isFalse);
      expect(isEffectiveDateAllowed(DateTime(2026, 10, 13), today), isFalse);
    });

    test('date only ISO string', () {
      expect(isoDay(DateTime(2026, 3, 5, 23, 59)), '2026-03-05');
    });
  });

  group('FeeRateWizardCubit', () {
    late _MockRepo repo;
    setUp(() {
      repo = _MockRepo();
      when(() => repo.getFeeSettingHistory('admission_fee'))
          .thenAnswer((_) async => [_row('1', 1000, '2026-01-01', status: 1, category: 'general')]);
      when(() => repo.createFeeSettingVersion(
            key: any(named: 'key'),
            value: any(named: 'value'),
            unit: any(named: 'unit'),
            startDate: any(named: 'startDate'),
            feeCategory: any(named: 'feeCategory'),
          )).thenAnswer((_) async => _row('2', 1500, '2026-10-14'));
    });

    FeeRateWizardCubit make() => FeeRateWizardCubit(repository: repo, now: () => today);

    test('choosing a fee loads its history and derives the current rate', () async {
      final c = make();
      await c.selectKey('admission_fee');
      expect(c.state.current!.value, 1000);
      expect(c.state.blocked, isFalse);
    });

    test('next needs a fee, a positive amount and an unblocked history', () async {
      final c = make();
      expect(c.state.canNext, isFalse);
      await c.selectKey('admission_fee');
      expect(c.state.canNext, isFalse, reason: 'no amount yet');
      c.setAmount('1500');
      expect(c.state.canNext, isTrue);
      c.setAmount('0');
      expect(c.state.canNext, isFalse);
    });

    test('a scheduled future version blocks the wizard', () async {
      when(() => repo.getFeeSettingHistory('admission_fee')).thenAnswer((_) async =>
          [_row('1', 1000, '2026-01-01'), _row('2', 1200, '2026-12-01', status: 1)]);
      final c = make();
      await c.selectKey('admission_fee');
      c.setAmount('1500');
      expect(c.state.blocked, isTrue);
      expect(c.state.canNext, isFalse);
    });

    test('default date is today, out-of-range dates are refused', () async {
      final c = make();
      expect(c.state.date, today);
      await c.selectKey('admission_fee');
      c.setAmount('1500');
      c.next();
      expect(c.state.step, 2);
      c.setDate(DateTime(2028, 1, 1));
      expect(c.state.date, today, reason: 'unchanged');
      c.setDate(DateTime(2026, 11, 1));
      expect(c.state.date, DateTime(2026, 11, 1));
    });

    test('confirm POSTs key, value, the current unit and category and the date', () async {
      final c = make();
      await c.selectKey('admission_fee');
      c.setAmount('1500');
      c.next();
      c.setDate(DateTime(2026, 11, 1));
      c.next();
      expect(c.state.step, 3);
      await c.confirm();
      verify(() => repo.createFeeSettingVersion(
            key: 'admission_fee',
            value: 1500,
            unit: 'taka',
            startDate: '2026-11-01',
            feeCategory: 'general',
          )).called(1);
      expect(c.state.done, isTrue);
    });

    test('a failed save keeps the error for the page to map by code', () async {
      when(() => repo.createFeeSettingVersion(
            key: any(named: 'key'),
            value: any(named: 'value'),
            unit: any(named: 'unit'),
            startDate: any(named: 'startDate'),
            feeCategory: any(named: 'feeCategory'),
          )).thenThrow(Exception('x'));
      final c = make();
      await c.selectKey('admission_fee');
      c.setAmount('1500');
      c.next();
      c.next();
      await c.confirm();
      expect(c.state.done, isFalse);
      expect(c.state.error, isNotNull);
      expect(c.state.saving, isFalse);
    });
  });

  group('repository passes fee_category', () {
    test('POST body includes it only when given', () async {
      final api = _MockApi();
      when(() => api.post('/admin/fee-settings', any())).thenAnswer((_) async => {
            'id': 1, 'key': 'admission_fee', 'value': 5, 'start_date': '2026-10-14', 'status': 1,
          });
      final repo = AdminRepository(apiClient: api);
      await repo.createFeeSettingVersion(key: 'admission_fee', value: 5, unit: 'taka', startDate: '2026-10-14', feeCategory: 'general');
      await repo.createFeeSettingVersion(key: 'admission_fee', value: 5);
      verify(() => api.post('/admin/fee-settings',
          {'key': 'admission_fee', 'value': 5, 'unit': 'taka', 'start_date': '2026-10-14', 'fee_category': 'general'})).called(1);
      verify(() => api.post('/admin/fee-settings', {'key': 'admission_fee', 'value': 5})).called(1);
    });
  });

  group('FeeSettingsPage', () {
    late _MockRepo repo;
    setUp(() {
      repo = _MockRepo();
      when(() => repo.getActiveFeeSettings()).thenAnswer((_) async => [
            _row('1', 1000, '2026-01-01', status: 1),
          ]);
      when(() => repo.getFeeSettingHistory(any())).thenAnswer((_) async => [_row('1', 1000, '2026-01-01', status: 1)]);
      when(() => repo.createFeeSettingVersion(
            key: any(named: 'key'),
            value: any(named: 'value'),
            unit: any(named: 'unit'),
            startDate: any(named: 'startDate'),
            feeCategory: any(named: 'feeCategory'),
          )).thenAnswer((_) async => _row('2', 1500, '2026-10-14'));
    });

    testWidgets('flag off: no wizard, no Advanced fold (unchanged page)', (tester) async {
      await pumpBn(tester, FeeSettingsPage(repository: repo, wizardEnabled: false));
      expect(find.byKey(const Key('feeWizard')), findsNothing);
      expect(find.text(bn.feeWizardAdvanced), findsNothing);
    });

    testWidgets('flag on: wizard on top, the old tools folded under Advanced', (tester) async {
      await pumpBn(tester, FeeSettingsPage(repository: repo, wizardEnabled: true));
      expect(find.byKey(const Key('feeWizard')), findsOneWidget);
      expect(find.text(bn.feeWizardAdvanced), findsOneWidget);
    });

    testWidgets('three steps: fee + amount, date, confirm old -> new, then POST', (tester) async {
      await pumpBn(tester, FeeSettingsPage(repository: repo, wizardEnabled: true));
      await tester.tap(find.byKey(const Key('feeWizardFee_admission_fee')));
      await tester.pumpAndSettle();
      await tester.enterText(find.byKey(const Key('feeWizardAmount')), '1500');
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const Key('feeWizardNext')));
      await tester.pumpAndSettle();
      // Step 2 defaults to today.
      await tester.tap(find.byKey(const Key('feeWizardNext')));
      await tester.pumpAndSettle();
      expect(find.byKey(const Key('feeWizardConfirmText')), findsOneWidget);
      final text = tester.widget<Text>(find.byKey(const Key('feeWizardConfirmText'))).data!;
      expect(text, contains('১,০০০'));
      expect(text, contains('১,৫০০'));
      await tester.tap(find.byKey(const Key('feeWizardConfirm')));
      await tester.pumpAndSettle();
      verify(() => repo.createFeeSettingVersion(
            key: 'admission_fee',
            value: 1500,
            unit: 'taka',
            startDate: any(named: 'startDate'),
            feeCategory: any(named: 'feeCategory'),
          )).called(1);
      expect(find.text(bn.feeWizardDone), findsOneWidget);
    });

    testWidgets('a scheduled version shows the blocked message', (tester) async {
      final future = DateTime.now().add(const Duration(days: 30));
      final iso = isoDay(future);
      when(() => repo.getFeeSettingHistory(any())).thenAnswer((_) async => [
            _row('1', 1000, '2026-01-01'),
            _row('2', 1200, iso, status: 1),
          ]);
      await pumpBn(tester, FeeSettingsPage(repository: repo, wizardEnabled: true));
      await tester.tap(find.byKey(const Key('feeWizardFee_admission_fee')));
      await tester.pumpAndSettle();
      expect(find.text(bn.feeWizardBlocked), findsOneWidget);
      expect(find.byKey(const Key('feeWizardAmount')), findsNothing);
    });
  });
}
