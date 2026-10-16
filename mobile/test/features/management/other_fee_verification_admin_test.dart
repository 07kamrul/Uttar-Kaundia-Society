import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:kaundia_app/core/network/api_client.dart';
import 'package:kaundia_app/features/management/data/admin_repository.dart';
import 'package:kaundia_app/features/management/data/cost_share_payment_repository.dart';
import 'package:kaundia_app/features/management/domain/cost_share_verification_entities.dart';
import 'package:kaundia_app/features/management/data/other_fee_verification_repository.dart';
import 'package:kaundia_app/features/management/domain/bulk_entities.dart';
import 'package:kaundia_app/features/management/domain/other_fee_verification_entities.dart';
import 'package:kaundia_app/features/management/pages/payment_verifications_page.dart';
import 'package:kaundia_app/features/management/presentation/bloc/other_fee_verification_cubit.dart';
import 'package:kaundia_app/l10n/app_localizations_bn.dart';
import 'package:mocktail/mocktail.dart';

import '../../support/pump_app.dart';

class _MockApi extends Mock implements ApiClient {}

class _MockRepo extends Mock implements OtherFeeVerificationRepository {}

class _MockInstallments extends Mock implements InstallmentPaymentRepository {}

class _MockCostShares extends Mock implements CostSharePaymentRepository {}

_MockCostShares _costShares() {
  final m = _MockCostShares();
  when(() => m.list(status: any(named: 'status'))).thenAnswer((_) async => []);
  when(() => m.pendingCounts()).thenAnswer(
      (_) async => const PendingVerificationCounts(installment: 0, costShare: 0, otherFee: 0, total: 0));
  return m;
}

Map<String, dynamic> _json(int id, String kind, {String status = 'pending', String amount = '500.00'}) => {
      'id': id,
      'kind': kind,
      'member_id': 3,
      'member_name': 'রহিম',
      'member_display_id': 'M-3',
      'fee_label': 'পিকনিক',
      'amount': amount,
      'payment_method': 'bkash',
      'receipt_no': 'TX$id',
      'payment_date': '2026-10-01',
      'proof_url': null,
      'status': status,
      'rejection_reason': null,
    };

AdminOtherFeePayment _row(int id, OtherFeeKind kind, {String amount = '500.00'}) =>
    AdminOtherFeePayment.fromJson(_json(id, kind.apiValue, amount: amount));

void main() {
  final bn = AppLocalizationsBn();

  setUpAll(() {
    registerFallbackValue(OtherFeeKind.fee);
  });

  group('repository', () {
    late _MockApi api;
    late OtherFeeVerificationRepository repo;
    setUp(() {
      api = _MockApi();
      repo = OtherFeeVerificationRepository(apiClient: api);
    });

    test('list maps the array shape and passes the status', () async {
      when(() => api.getUri('/admin/other-fee-payments', query: {'status': 'pending'}))
          .thenAnswer((_) async => [_json(4, 'picnic'), _json(4, 'fee')]);
      final rows = await repo.list(status: 'pending');
      expect(rows.map((r) => r.key), ['picnic:4', 'fee:4'], reason: 'ids overlap, kind disambiguates');
      expect(rows.first.amount, 500);
      expect(rows.first.feeLabel, 'পিকনিক');
    });

    test('approve and reject hit /{kind}/{id}/...; reject sends the reason', () async {
      when(() => api.post(any(), any())).thenAnswer((_) async => {});
      await repo.approve(OtherFeeKind.picnic, 4);
      await repo.reject(OtherFeeKind.fee, 9, 'ভুল আইডি');
      verify(() => api.post('/admin/other-fee-payments/picnic/4/approve', {})).called(1);
      verify(() => api.post('/admin/other-fee-payments/fee/9/reject', {'reason': 'ভুল আইডি'})).called(1);
    });

    test('bulk items are other_fee with id_ref', () async {
      when(() => api.post('/admin/payment-verifications/bulk-approve', any())).thenAnswer((_) async => {
            'batch_id': 'b',
            'approved_count': 1,
            'approved_total': '500.00',
            'approved': [
              {'kind': 'other_fee', 'id': 4, 'id_ref': 'picnic:4', 'amount': '500.00'}
            ],
            'failed': [],
          });
      final r = await repo.bulkApprove([_row(4, OtherFeeKind.picnic)], expectedCount: 1, expectedTotal: '500.00');
      final body = verify(() => api.post('/admin/payment-verifications/bulk-approve', captureAny())).captured.single
          as Map;
      expect(body['items'], [
        {'kind': 'other_fee', 'id': 4, 'id_ref': 'picnic:4'}
      ]);
      expect(body['expected_count'], 1);
      expect(body['expected_total'], '500.00');
      expect(r.approved.single.idRef, 'picnic:4');
    });
  });

  group('cubit', () {
    late _MockRepo repo;
    setUp(() {
      repo = _MockRepo();
      when(() => repo.list(status: any(named: 'status')))
          .thenAnswer((_) async => [_row(4, OtherFeeKind.picnic), _row(4, OtherFeeKind.fee, amount: '100.50')]);
    });

    test('selection is keyed by kind so overlapping ids stay distinct', () async {
      final c = OtherFeeVerificationCubit(repository: repo);
      await c.load();
      c.toggle('picnic:4');
      expect(c.state.selected, {'picnic:4'});
      expect(c.state.selectedTotal, '500.00');
      c.toggle('fee:4');
      expect(c.state.selectedTotal, '600.50');
    });

    test('approve removes the row; reject sends the reason', () async {
      when(() => repo.approve(any(), any())).thenAnswer((_) async {});
      when(() => repo.reject(any(), any(), any())).thenAnswer((_) async {});
      final c = OtherFeeVerificationCubit(repository: repo);
      await c.load();
      await c.approve(c.state.rows.first);
      expect(c.state.rows.map((r) => r.key), ['fee:4']);
      await c.reject(c.state.rows.first, 'ভুল আইডি');
      verify(() => repo.reject(OtherFeeKind.fee, 4, 'ভুল আইডি')).called(1);
      expect(c.state.rows, isEmpty);
    });

    test('bulk approve sends the stale guard and drops only approved rows', () async {
      when(() => repo.bulkApprove(any(),
              expectedCount: any(named: 'expectedCount'), expectedTotal: any(named: 'expectedTotal')))
          .thenAnswer((_) async => const BulkApproveResult(
                batchId: 'b',
                approvedCount: 1,
                approvedTotal: '500.00',
                approved: [BulkApprovedItem(kind: 'other_fee', id: 4, idRef: 'picnic:4')],
                failed: [BulkFailedItem(kind: 'other_fee', id: 4, code: 'NO_LONGER_DUE', idRef: 'fee:4')],
              ));
      final c = OtherFeeVerificationCubit(repository: repo);
      await c.load();
      c.toggle('picnic:4');
      c.toggle('fee:4');
      await c.bulkApprove();
      verify(() => repo.bulkApprove(any(), expectedCount: 2, expectedTotal: '600.50')).called(1);
      expect(c.state.rows.map((r) => r.key), ['fee:4']);
      expect(c.state.selected, {'fee:4'}, reason: 'failed rows stay selected');
    });
  });

  group('page tab', () {
    late _MockInstallments installments;
    late _MockRepo other;
    setUp(() {
      installments = _MockInstallments();
      other = _MockRepo();
      when(() => installments.listForAdmin(status: any(named: 'status'))).thenAnswer((_) async => []);
      when(() => other.list(status: any(named: 'status'))).thenAnswer((_) async => [_row(4, OtherFeeKind.picnic)]);
      when(() => other.approve(any(), any())).thenAnswer((_) async {});
    });

    testWidgets('flag off: no other-fee tab', (tester) async {
      await pumpBn(
          tester,
          PaymentVerificationsPage(
              repository: installments, otherFeesEnabled: false, otherFeeRepository: other, costShareRepository: _costShares()));
      expect(find.byKey(const Key('pvTab_other_fee')), findsNothing);
      verifyNever(() => other.list(status: any(named: 'status')));
    });

    testWidgets('flag on: tab lists other fees and approves one', (tester) async {
      await pumpBn(
          tester,
          PaymentVerificationsPage(
              repository: installments, otherFeesEnabled: true, otherFeeRepository: other, costShareRepository: _costShares()));
      expect(find.byKey(const Key('pvTab_other_fee')), findsOneWidget);
      await tester.tap(find.byKey(const Key('pvTab_other_fee')));
      await tester.pumpAndSettle();
      expect(find.byKey(const Key('otherFeeCard_picnic:4')), findsOneWidget);
      expect(find.text(bn.mpayKindOtherFee), findsWidgets);
      await tester.tap(find.byKey(const Key('otherFeeApprove_picnic:4')));
      await tester.pumpAndSettle();
      verify(() => other.approve(OtherFeeKind.picnic, 4)).called(1);
      expect(find.byKey(const Key('otherFeeCard_picnic:4')), findsNothing);
    });
  });
}
