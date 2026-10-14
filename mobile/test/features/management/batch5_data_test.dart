import 'package:bloc_test/bloc_test.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:kaundia_app/core/enums/enums.dart';
import 'package:kaundia_app/core/network/api_client.dart';
import 'package:kaundia_app/core/network/api_exception.dart';
import 'package:kaundia_app/features/management/data/admin_repository.dart';
import 'package:kaundia_app/features/management/domain/bulk_entities.dart';
import 'package:kaundia_app/features/management/domain/finance_entities.dart';
import 'package:kaundia_app/features/management/domain/today_entities.dart';
import 'package:kaundia_app/features/management/presentation/bloc/members_bloc.dart';
import 'package:kaundia_app/features/management/presentation/bloc/payment_verifications_bloc.dart';
import 'package:kaundia_app/features/management/presentation/bloc/submissions_bloc.dart';
import 'package:kaundia_app/features/management/presentation/bloc/today_cubit.dart';
import 'package:mocktail/mocktail.dart';

class _MockApi extends Mock implements ApiClient {}

class _MockAdmin extends Mock implements AdminRepository {}

class _MockPayRepo extends Mock implements InstallmentPaymentRepository {}

class _MockToday extends Mock implements AdminRepository {}

const _todayJson = {
  'as_of': '2026-10-13T08:00:00Z',
  'applications': {
    'registrations_pending': 4,
    'membership_applications_open': 2,
    'total': 6,
  },
  'needs_dag': 1,
  'payment_verifications': {'installment': 3, 'cost_share': 1, 'total': 4},
  'complaints': {'open': 7, 'due_soon': 2, 'overdue': 1},
  'property_requests': {'pending': 2},
  'boundaries': {'pending': 3},
  'committee_terms': {'expiring_soon': 1, 'expired': 0, 'window_days': 60},
  'phone_fixes': {'open': 5},
};

AdminInstallmentPayment _pay(int id, num amount) => AdminInstallmentPayment(
      id: id,
      method: 'bkash',
      transactionRef: 'T$id',
      amount: amount,
      paidOn: '2026-10-01',
      status: 'pending',
      createdAt: '2026-10-01',
      installments: const [],
      memberId: id,
    );

void main() {
  group('TodaySummary', () {
    test('reads every section with its snake_case spelling', () {
      final t = TodaySummary.fromJson(_todayJson);
      expect(t.applications!.registrationsPending, 4);
      expect(t.applications!.membershipApplicationsOpen, 2);
      expect(t.applications!.total, 6);
      expect(t.needsDag, 1);
      expect(t.paymentVerifications!.installment, 3);
      expect(t.paymentVerifications!.costShare, 1);
      expect(t.paymentVerifications!.total, 4);
      expect(t.complaints!.open, 7);
      expect(t.complaints!.dueSoon, 2);
      expect(t.complaints!.overdue, 1);
      expect(t.propertyRequests, 2);
      expect(t.boundaries, 3);
      expect(t.committeeTerms!.expiringSoon, 1);
      expect(t.committeeTerms!.expired, 0);
      expect(t.committeeTerms!.windowDays, 60);
      expect(t.phoneFixes, 5);
      expect(t.isEmpty, isFalse);
    });

    test('a null section stays null (the caller lacks that permission)', () {
      final t = TodaySummary.fromJson({
        'as_of': '2026-10-13T08:00:00Z',
        'applications': null,
        'needs_dag': null,
        'payment_verifications': {'installment': 1, 'cost_share': 0, 'total': 1},
        'complaints': null,
        'property_requests': null,
        'boundaries': null,
        'committee_terms': null,
        'phone_fixes': null,
      });
      expect(t.applications, isNull);
      expect(t.needsDag, isNull);
      expect(t.complaints, isNull);
      expect(t.propertyRequests, isNull);
      expect(t.paymentVerifications!.total, 1);
      expect(t.isEmpty, isFalse);
    });

    test('all zero or all null counts as nothing to do', () {
      expect(TodaySummary.fromJson(const {}).isEmpty, isTrue);
      expect(
        TodaySummary.fromJson({
          'applications': {'total': 0},
          'needs_dag': 0,
          'payment_verifications': {'total': 0},
          'complaints': {'open': 0, 'due_soon': 0, 'overdue': 0},
          'property_requests': {'pending': 0},
          'boundaries': {'pending': 0},
          'committee_terms': {'expiring_soon': 0, 'expired': 0},
          'phone_fixes': {'open': 0},
        }).isEmpty,
        isTrue,
      );
    });
  });

  group('AdminRepository (Batch 5)', () {
    late _MockApi api;
    late AdminRepository repo;

    setUp(() {
      api = _MockApi();
      repo = AdminRepository(apiClient: api);
    });

    test('today() reads /admin/today', () async {
      when(() => api.getUri('/admin/today')).thenAnswer((_) async => _todayJson);
      final t = await repo.today();
      expect(t.needsDag, 1);
    });

    test('listSubmissions and listMembers send the search term only when set',
        () async {
      when(() => api.getUri(any(), query: any(named: 'query')))
          .thenAnswer((_) async => []);
      when(() => api.getUri('/admin/members')).thenAnswer((_) async => []);

      await repo.listSubmissions(status: SubmissionStatus.pending, search: 'রহিম');
      await repo.listSubmissions(status: SubmissionStatus.pending);
      final queries = verify(() =>
              api.getUri('/admin/submissions', query: captureAny(named: 'query')))
          .captured
          .cast<Map<String, dynamic>>();
      expect(queries[0]['search'], 'রহিম');
      expect(queries[1].containsKey('search'), isFalse);

      await repo.listMembers(search: '01712');
      verify(() => api.getUri('/admin/members', query: {'search': '01712'}))
          .called(1);
      await repo.listMembers();
      verify(() => api.getUri('/admin/members')).called(1);
    });

    test('bulkApprove posts kind/id items with the stale-guard totals',
        () async {
      when(() => api.post(any(), any())).thenAnswer((_) async => {
            'batch_id': 'b7f3c2a1',
            'approved_count': 1,
            'approved_total': '500.00',
            'approved': [
              {'kind': 'installment', 'id': 12, 'amount': '500.00'}
            ],
            'failed': [
              {'kind': 'installment', 'id': 13, 'code': 'NO_LONGER_DUE'}
            ],
          });
      final payRepo = InstallmentPaymentRepository(apiClient: api);

      final result = await payRepo.bulkApprove(
        const [12, 13],
        expectedCount: 2,
        expectedTotal: '1500.00',
      );

      final body = verify(() => api.post(
              '/admin/payment-verifications/bulk-approve', captureAny()))
          .captured
          .single as Map<String, dynamic>;
      expect(body, {
        'items': [
          {'kind': 'installment', 'id': 12},
          {'kind': 'installment', 'id': 13},
        ],
        'expected_count': 2,
        'expected_total': '1500.00',
      });
      expect(result.batchId, 'b7f3c2a1');
      expect(result.approvedCount, 1);
      expect(result.approvedIds, [12]);
      expect(result.failed.single.id, 13);
      expect(result.failed.single.code, 'NO_LONGER_DUE');
    });
  });

  group('bulk helpers', () {
    test('the total is exact in cents and formatted with two decimals', () {
      expect(bulkTotalString([_pay(1, 500), _pay(2, 999.99), _pay(3, 0.01)]),
          '1500.00');
      expect(bulkTotalString([_pay(1, 0.1), _pay(2, 0.2)]), '0.30');
      expect(bulkTotalString(const []), '0.00');
    });
  });

  group('list search', () {
    late _MockAdmin repo;
    setUp(() {
      repo = _MockAdmin();
      when(() => repo.listSubmissions(
          status: any(named: 'status'),
          search: any(named: 'search'))).thenAnswer((_) async => []);
      when(() => repo.listMembers(search: any(named: 'search')))
          .thenAnswer((_) async => []);
    });

    blocTest<SubmissionsBloc, SubmissionsState>(
      'a search of two or more characters reloads with the term',
      build: () => SubmissionsBloc(repository: repo),
      act: (b) => b.add(const SubmissionsSearchChanged(' রহিম ')),
      verify: (b) {
        expect(b.state.search, 'রহিম');
        verify(() => repo.listSubmissions(
            status: SubmissionStatus.pending, search: 'রহিম')).called(1);
      },
    );

    blocTest<SubmissionsBloc, SubmissionsState>(
      'one character is not searched; clearing returns to the full list',
      build: () => SubmissionsBloc(repository: repo),
      act: (b) async {
        b.add(const SubmissionsSearchChanged('র'));
        await pumpEventQueue();
        b.add(const SubmissionsSearchChanged('রহ'));
        await pumpEventQueue();
        b.add(const SubmissionsSearchChanged(''));
      },
      verify: (b) {
        expect(b.state.search, '');
        verify(() => repo.listSubmissions(
            status: SubmissionStatus.pending, search: 'রহ')).called(1);
        verify(() => repo.listSubmissions(
            status: SubmissionStatus.pending, search: null)).called(1);
      },
    );

    blocTest<MembersBloc, MembersState>(
      'members reload with the search term and drop it below two characters',
      build: () => MembersBloc(repository: repo),
      act: (b) async {
        b.add(const MembersSearchChanged('01712'));
        await pumpEventQueue();
        b.add(const MembersSearchChanged('0'));
      },
      verify: (b) {
        verify(() => repo.listMembers(search: '01712')).called(1);
        verify(() => repo.listMembers(search: null)).called(1);
      },
    );
  });

  group('PaymentVerificationsBloc bulk approve', () {
    late _MockPayRepo repo;
    final a = _pay(1, 500);
    final b = _pay(2, 1000);
    final c = _pay(3, 250);

    setUp(() {
      repo = _MockPayRepo();
      when(() => repo.listForAdmin(status: any(named: 'status')))
          .thenAnswer((_) async => [a, b, c]);
    });

    Future<PaymentVerificationsBloc> loaded() async {
      final bloc = PaymentVerificationsBloc(repository: repo)
        ..add(const PaymentVerificationsLoadRequested());
      await bloc.stream.firstWhere((s) => !s.loading);
      return bloc;
    }

    test('selection toggles; the bar figures come from the selected rows',
        () async {
      final bloc = await loaded();
      addTearDown(bloc.close);
      bloc
        ..add(const PaymentVerificationsToggled(1))
        ..add(const PaymentVerificationsToggled(2));
      await pumpEventQueue();
      expect(bloc.state.selected, {1, 2});
      expect(bloc.state.selectedPayments.map((p) => p.id), [1, 2]);
      expect(bloc.state.selectedTotal, '1500.00');

      bloc.add(const PaymentVerificationsToggled(1));
      await pumpEventQueue();
      expect(bloc.state.selected, {2});
      bloc.add(const PaymentVerificationsSelectionCleared());
      await pumpEventQueue();
      expect(bloc.state.selected, isEmpty);
    });

    test('approved rows leave the list; failed rows stay selected', () async {
      when(() => repo.bulkApprove(any(),
          expectedCount: any(named: 'expectedCount'),
          expectedTotal: any(named: 'expectedTotal'))).thenAnswer(
        (_) async => const BulkApproveResult(
          batchId: 'x',
          approvedCount: 1,
          approvedTotal: '500.00',
          approved: [BulkApprovedItem(kind: 'installment', id: 1)],
          failed: [
            BulkFailedItem(kind: 'installment', id: 2, code: 'NO_LONGER_DUE')
          ],
        ),
      );
      final bloc = await loaded();
      addTearDown(bloc.close);
      bloc
        ..add(const PaymentVerificationsToggled(1))
        ..add(const PaymentVerificationsToggled(2))
        ..add(const PaymentVerificationsBulkApproveRequested());
      await bloc.stream.firstWhere((s) => s.bulkResult != null);

      verify(() => repo.bulkApprove(const [1, 2],
          expectedCount: 2, expectedTotal: '1500.00')).called(1);
      expect(bloc.state.payments.map((p) => p.id), [2, 3]);
      expect(bloc.state.selected, {2});
      expect(bloc.state.bulkResult!.failed.single.code, 'NO_LONGER_DUE');
      expect(bloc.state.bulkBusy, isFalse);

      bloc.add(const PaymentVerificationsToggled(3));
      await pumpEventQueue();
      expect(bloc.state.bulkResult, isNull, reason: 'any change clears it');
    });

    test('a stale selection refreshes the list and says so', () async {
      when(() => repo.bulkApprove(any(),
              expectedCount: any(named: 'expectedCount'),
              expectedTotal: any(named: 'expectedTotal')))
          .thenThrow(const ApiException(
        type: ApiExceptionType.server,
        statusCode: 409,
        errorCode: 'BULK_SELECTION_STALE',
      ));
      final bloc = await loaded();
      addTearDown(bloc.close);
      bloc
        ..add(const PaymentVerificationsToggled(1))
        ..add(const PaymentVerificationsBulkApproveRequested());
      await bloc.stream.firstWhere((s) => s.stale);

      expect(bloc.state.selected, isEmpty);
      verify(() => repo.listForAdmin(status: 'pending')).called(2);
    });

    test('nothing selected means nothing is sent', () async {
      final bloc = await loaded();
      addTearDown(bloc.close);
      bloc.add(const PaymentVerificationsBulkApproveRequested());
      await pumpEventQueue();
      verifyNever(() => repo.bulkApprove(any(),
          expectedCount: any(named: 'expectedCount'),
          expectedTotal: any(named: 'expectedTotal')));
    });

    test('another failure keeps the selection and reports the error',
        () async {
      when(() => repo.bulkApprove(any(),
              expectedCount: any(named: 'expectedCount'),
              expectedTotal: any(named: 'expectedTotal')))
          .thenThrow(const ApiException(type: ApiExceptionType.network));
      final bloc = await loaded();
      addTearDown(bloc.close);
      bloc
        ..add(const PaymentVerificationsToggled(1))
        ..add(const PaymentVerificationsBulkApproveRequested());
      await bloc.stream.firstWhere((s) => s.error != null);
      expect(bloc.state.selected, {1});
      expect(bloc.state.bulkBusy, isFalse);
    });

    test('changing the status filter clears the selection', () async {
      final bloc = await loaded();
      addTearDown(bloc.close);
      bloc.add(const PaymentVerificationsToggled(1));
      await pumpEventQueue();
      bloc.add(const PaymentVerificationsStatusFilterChanged(status: 'approved'));
      await pumpEventQueue();
      expect(bloc.state.selected, isEmpty);
    });
  });

  group('TodayCubit', () {
    test('loads, and retries after a failure', () async {
      final repo = _MockToday();
      var calls = 0;
      when(repo.today).thenAnswer((_) async {
        calls++;
        if (calls == 1) throw const ApiException(type: ApiExceptionType.network);
        return TodaySummary.fromJson(_todayJson);
      });
      final cubit = TodayCubit(repository: repo);
      addTearDown(cubit.close);

      await cubit.load();
      expect(cubit.state.status, TodayStatus.error);
      await cubit.load();
      expect(cubit.state.status, TodayStatus.loaded);
      expect(cubit.state.summary!.needsDag, 1);
    });
  });
}
