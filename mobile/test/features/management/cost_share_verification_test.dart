import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:kaundia_app/core/network/api_client.dart';
import 'package:kaundia_app/features/management/data/admin_repository.dart';
import 'package:kaundia_app/features/management/data/cost_share_payment_repository.dart';
import 'package:kaundia_app/features/management/domain/cost_share_verification_entities.dart';
import 'package:kaundia_app/features/management/pages/payment_verifications_page.dart';
import 'package:kaundia_app/features/management/presentation/bloc/cost_share_verification_cubit.dart';
import 'package:mocktail/mocktail.dart';

import '../../support/pump_app.dart';

class _MockApi extends Mock implements ApiClient {}

class _MockRepo extends Mock implements CostSharePaymentRepository {}

class _MockInstallments extends Mock implements InstallmentPaymentRepository {}

Map<String, dynamic> _json(int id, {String status = 'pending'}) => {
      'id': id,
      'member_id': 3,
      'member_name': 'রহিম',
      'member_display_id': 'M-3',
      'share_id': 8,
      'cost_title': 'রাস্তা মেরামত',
      'amount_due': '1000.00',
      'amount_paid': '200.00',
      'remaining': '800.00',
      'method': 'bkash',
      'transaction_ref': 'TX$id',
      'sender_account': '017',
      'amount': '300.50',
      'paid_on': '2026-10-01',
      'proof_url': null,
      'note': 'নোট',
      'status': status,
      'rejection_reason': null,
      'reviewed_at': null,
      'created_at': '2026-10-01T00:00:00Z',
    };

void main() {
  group('repository', () {
    late _MockApi api;
    late CostSharePaymentRepository repo;
    setUp(() {
      api = _MockApi();
      repo = CostSharePaymentRepository(apiClient: api);
    });

    test('list maps rows and passes the status filter', () async {
      when(() => api.getUri('/admin/cost-share-payments', query: {'status': 'pending'}))
          .thenAnswer((_) async => [_json(4)]);
      final rows = await repo.list(status: 'pending');
      expect(rows.single.id, 4);
      expect(rows.single.amount, 300.5);
      expect(rows.single.remaining, 800);
      expect(rows.single.costTitle, 'রাস্তা মেরামত');
      expect(rows.single.isPending, isTrue);
    });

    test('approve and reject post to /{id}/approve|reject; reject sends the reason', () async {
      when(() => api.post(any(), any())).thenAnswer((_) async => _json(4, status: 'approved'));
      final approved = await repo.approve(4);
      await repo.reject(9, 'ভুল আইডি');
      expect(approved.status, 'approved');
      verify(() => api.post('/admin/cost-share-payments/4/approve', {})).called(1);
      verify(() => api.post('/admin/cost-share-payments/9/reject', {'reason': 'ভুল আইডি'})).called(1);
    });

    test('pendingCounts maps cost_share and defaults other_fee to 0', () async {
      when(() => api.getUri('/admin/payment-verifications/pending-count'))
          .thenAnswer((_) async => {'installment': 2, 'cost_share': 3, 'total': 5});
      final c = await repo.pendingCounts();
      expect([c.installment, c.costShare, c.otherFee, c.total], [2, 3, 0, 5]);
    });
  });

  group('cubit', () {
    late _MockRepo repo;
    setUp(() {
      repo = _MockRepo();
      when(() => repo.list(status: any(named: 'status')))
          .thenAnswer((_) async => [AdminCostSharePayment.fromJson(_json(4)), AdminCostSharePayment.fromJson(_json(5))]);
    });

    test('approve removes the row; reject sends the reason', () async {
      when(() => repo.approve(any())).thenAnswer((_) async => AdminCostSharePayment.fromJson(_json(4)));
      when(() => repo.reject(any(), any())).thenAnswer((_) async => AdminCostSharePayment.fromJson(_json(5)));
      final c = CostShareVerificationCubit(repository: repo);
      await c.load();
      await c.approve(c.state.rows.first);
      expect(c.state.rows.map((r) => r.id), [5]);
      await c.reject(c.state.rows.first, 'ভুল আইডি');
      verify(() => repo.reject(5, 'ভুল আইডি')).called(1);
      expect(c.state.rows, isEmpty);
    });

    test('a failed approve keeps the error and reloads', () async {
      when(() => repo.approve(any())).thenThrow(Exception('x'));
      final c = CostShareVerificationCubit(repository: repo);
      await c.load();
      await c.approve(c.state.rows.first);
      expect(c.state.rows, hasLength(2));
      verify(() => repo.list(status: 'pending')).called(2);
    });

    test('setStatus reloads with the new filter', () async {
      final c = CostShareVerificationCubit(repository: repo);
      await c.setStatus('approved');
      expect(c.state.statusFilter, 'approved');
      verify(() => repo.list(status: 'approved')).called(1);
    });
  });

  group('page tab', () {
    late _MockInstallments installments;
    late _MockRepo shares;
    setUp(() {
      installments = _MockInstallments();
      shares = _MockRepo();
      when(() => installments.listForAdmin(status: any(named: 'status'))).thenAnswer((_) async => []);
      when(() => shares.list(status: any(named: 'status')))
          .thenAnswer((_) async => [AdminCostSharePayment.fromJson(_json(4))]);
      when(() => shares.pendingCounts()).thenAnswer(
          (_) async => const PendingVerificationCounts(installment: 0, costShare: 1, otherFee: 0, total: 1));
      when(() => shares.approve(any())).thenAnswer((_) async => AdminCostSharePayment.fromJson(_json(4)));
    });

    testWidgets('cost-share tab lists shares, shows the count and approves one', (tester) async {
      await pumpBn(
          tester,
          PaymentVerificationsPage(
              repository: installments, otherFeesEnabled: false, costShareRepository: shares));
      expect(find.byKey(const Key('pvTab_cost_share')), findsOneWidget);
      expect(find.byKey(const Key('pvTab_other_fee')), findsNothing);
      expect(find.textContaining('১'), findsWidgets, reason: 'pending count on the chip');
      await tester.tap(find.byKey(const Key('pvTab_cost_share')));
      await tester.pumpAndSettle();
      expect(find.byKey(const Key('costShareCard_4')), findsOneWidget);
      expect(find.text('রাস্তা মেরামত'), findsOneWidget);
      await tester.tap(find.byKey(const Key('costShareApprove_4')));
      await tester.pumpAndSettle();
      verify(() => shares.approve(4)).called(1);
      expect(find.byKey(const Key('costShareCard_4')), findsNothing);
      verify(() => shares.pendingCounts()).called(greaterThan(1));
    });
  });
}
