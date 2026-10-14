import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:kaundia_app/core/auth/session.dart';
import 'package:kaundia_app/core/di/injector.dart';
import 'package:kaundia_app/core/enums/enums.dart';
import 'package:kaundia_app/core/feature_flags/feature_flags_repository.dart';
import 'package:kaundia_app/core/feature_flags/feature_flags_service.dart';
import 'package:kaundia_app/core/network/api_exception.dart';
import 'package:kaundia_app/core/router/app_router.dart';
import 'package:kaundia_app/features/management/data/admin_repository.dart';
import 'package:kaundia_app/features/management/domain/admin_entities.dart';
import 'package:kaundia_app/features/management/domain/bulk_entities.dart';
import 'package:kaundia_app/features/management/domain/finance_entities.dart';
import 'package:kaundia_app/features/management/domain/today_entities.dart';
import 'package:kaundia_app/features/management/pages/members_list_page.dart';
import 'package:kaundia_app/features/management/pages/payment_verifications_page.dart';
import 'package:kaundia_app/features/management/pages/submissions_list_page.dart';
import 'package:kaundia_app/features/management/pages/today_page.dart';
import 'package:kaundia_app/features/management/presentation/widgets/queue_search_field.dart';
import 'package:kaundia_app/l10n/app_localizations.dart';
import 'package:kaundia_app/l10n/app_localizations_bn.dart';
import 'package:mocktail/mocktail.dart';

import '../../support/pump_app.dart';

class _MockAdmin extends Mock implements AdminRepository {}

class _MockPay extends Mock implements InstallmentPaymentRepository {}

class _FlagsRepo implements FeatureFlagsRepository {
  _FlagsRepo(this.flags);
  final Map<String, bool> flags;
  @override
  Future<Map<String, bool>> fetch() async => flags;
}

TodaySummary _summary({
  TodayComplaints? complaints = const TodayComplaints(open: 7, dueSoon: 2, overdue: 1),
  TodayPayments? payments = const TodayPayments(installment: 3, costShare: 1, total: 4),
  int? propertyRequests = 2,
  int? phoneFixes = 5,
}) =>
    TodaySummary(
      applications: const TodayApplications(
          registrationsPending: 4, membershipApplicationsOpen: 2, total: 6),
      needsDag: 1,
      paymentVerifications: payments,
      complaints: complaints,
      propertyRequests: propertyRequests,
      boundaries: null,
      committeeTerms: const TodayCommitteeTerms(expiringSoon: 1, expired: 1),
      phoneFixes: phoneFixes,
    );

AdminInstallmentPayment _pay(int id, num amount, {String status = 'pending'}) =>
    AdminInstallmentPayment(
      id: id,
      method: 'bkash',
      transactionRef: 'TRX$id',
      amount: amount,
      paidOn: '2026-10-01',
      status: status,
      createdAt: '2026-10-01',
      installments: const [],
      memberId: id,
      memberName: 'সদস্য $id',
    );

Future<void> _pumpRouter(WidgetTester tester, Widget home) async {
  useTallViewport(tester);
  final router = GoRouter(routes: [
    GoRoute(path: '/', builder: (_, __) => Scaffold(body: home)),
    GoRoute(path: '/payment-verifications', builder: (_, __) => const Text('pv-page')),
    GoRoute(path: '/submissions', builder: (_, __) => const Text('subs-page')),
    GoRoute(path: '/property-requests', builder: (_, __) => const Text('pr-page')),
  ]);
  await tester.pumpWidget(MaterialApp.router(
    routerConfig: router,
    theme: ThemeData(snackBarTheme: const SnackBarThemeData(behavior: SnackBarBehavior.floating)),
    locale: const Locale('bn'),
    localizationsDelegates: AppLocalizations.localizationsDelegates,
    supportedLocales: AppLocalizations.supportedLocales,
  ));
  await tester.pumpAndSettle();
}

void main() {
  final bn = AppLocalizationsBn();

  group('TodayPage', () {
    late _MockAdmin repo;
    setUp(() => repo = _MockAdmin());

    testWidgets('shows a card per section the caller can see, with Bangla numbers',
        (tester) async {
      when(repo.today).thenAnswer((_) async => _summary());
      await _pumpRouter(tester, TodayPage(repository: repo));

      expect(find.text(bn.todayTitle), findsOneWidget);
      for (final key in [
        'registrations', 'membershipApplications', 'needsDag', 'payments',
        'complaints', 'propertyRequests', 'committee', 'phoneFixes',
      ]) {
        expect(find.byKey(Key('today_$key')), findsOneWidget, reason: key);
      }
      expect(find.byKey(const Key('today_boundaries')), findsNothing,
          reason: 'null section is hidden');
      expect(find.descendant(of: find.byKey(const Key('today_payments')), matching: find.text('৪')),
          findsOneWidget);
    });

    testWidgets('overdue counts are red and say "দেরি হয়েছে"', (tester) async {
      when(repo.today).thenAnswer((_) async => _summary());
      await _pumpRouter(tester, TodayPage(repository: repo));

      final overdue = find.descendant(
          of: find.byKey(const Key('today_complaints')),
          matching: find.textContaining(bn.todayOverdue));
      expect(overdue, findsOneWidget);
      expect(tester.widget<Text>(overdue).style?.color, isNotNull);
      expect(find.descendant(
              of: find.byKey(const Key('today_complaints')),
              matching: find.textContaining(bn.todayDueSoon)),
          findsOneWidget);
    });

    testWidgets('cards that have a Flutter page open it; the others do not',
        (tester) async {
      when(repo.today).thenAnswer((_) async => _summary());
      await _pumpRouter(tester, TodayPage(repository: repo));

      await tester.tap(find.byKey(const Key('today_payments')));
      await tester.pumpAndSettle();
      expect(find.text('pv-page'), findsOneWidget);
    });

    testWidgets('each card is at least 48 px tall', (tester) async {
      when(repo.today).thenAnswer((_) async => _summary());
      await _pumpRouter(tester, TodayPage(repository: repo));
      for (final e in tester.widgetList(find.byWidgetPredicate(
          (w) => w.key is ValueKey<String> && (w.key as ValueKey<String>).value.startsWith('today_')))) {
        final size = tester.getSize(find.byWidget(e));
        expect(size.height, greaterThanOrEqualTo(48));
      }
    });

    testWidgets('nothing waiting shows the calm empty state', (tester) async {
      when(repo.today).thenAnswer((_) async => const TodaySummary(
          applications: TodayApplications(), needsDag: 0, phoneFixes: 0));
      await _pumpRouter(tester, TodayPage(repository: repo));
      expect(find.text(bn.todayEmpty), findsOneWidget);
    });

    testWidgets('a failure shows retry, which loads again', (tester) async {
      var calls = 0;
      when(repo.today).thenAnswer((_) async {
        calls++;
        if (calls == 1) throw const ApiException(type: ApiExceptionType.network);
        return _summary();
      });
      await _pumpRouter(tester, TodayPage(repository: repo));
      expect(find.text(bn.todayLoadError), findsOneWidget);

      await tester.tap(find.text(bn.commonRetry));
      await tester.pumpAndSettle();
      expect(find.byKey(const Key('today_payments')), findsOneWidget);
    });
  });

  group('DashboardSwitch (admin landing)', () {
    Future<void> setup(WidgetTester tester, {required String role, required bool consoleOn}) async {
      await sl.reset();
      sl.registerSingleton<SessionManager>(SessionManager()
        ..set(Session(accessToken: 't', role: role, permissions: const {'manage_finance'})));
      final flags = FeatureFlagsService(_FlagsRepo({'admin_console': consoleOn}));
      await flags.load();
      sl.registerSingleton<FeatureFlagsService>(flags);
      addTearDown(sl.reset);
      await pumpBn(
        tester,
        const DashboardSwitch(legacy: Text('legacy-dashboard'), today: Text('today-page')),
      );
    }

    testWidgets('admin_console off: the old dashboard, unchanged', (tester) async {
      await setup(tester, role: 'finance_admin', consoleOn: false);
      expect(find.text('legacy-dashboard'), findsOneWidget);
    });

    testWidgets('admin_console on: management lands on the today page', (tester) async {
      await setup(tester, role: 'finance_admin', consoleOn: true);
      expect(find.text('today-page'), findsOneWidget);
    });

    testWidgets('members never see the admin page', (tester) async {
      await setup(tester, role: 'member', consoleOn: true);
      expect(find.text('legacy-dashboard'), findsOneWidget);
    });
  });

  group('QueueSearchField', () {
    testWidgets('waits 300 ms after the last key before reporting', (tester) async {
      final seen = <String>[];
      await pumpBn(tester, QueueSearchField(onChanged: seen.add));

      await tester.enterText(find.byType(TextField), 'রহি');
      await tester.pump(const Duration(milliseconds: 200));
      await tester.enterText(find.byType(TextField), 'রহিম');
      await tester.pump(const Duration(milliseconds: 200));
      expect(seen, isEmpty);
      await tester.pump(const Duration(milliseconds: 150));
      expect(seen, ['রহিম']);
      expect(find.text(bn.adminSearchHint), findsOneWidget);
    });

    testWidgets('clearing reports an empty term and the field is a search field',
        (tester) async {
      final seen = <String>[];
      await pumpBn(tester, QueueSearchField(onChanged: seen.add));
      await tester.enterText(find.byType(TextField), 'রহিম');
      await tester.pump(const Duration(milliseconds: 350));
      await tester.tap(find.byIcon(Icons.close));
      await tester.pump(const Duration(milliseconds: 350));
      expect(seen, ['রহিম', '']);
      expect(tester.widget<TextField>(find.byType(TextField)).textInputAction,
          TextInputAction.search);
    });
  });

  group('list pages search', () {
    late _MockAdmin repo;
    setUp(() async {
      repo = _MockAdmin();
      await sl.reset();
      when(() => repo.listSubmissions(
          status: any(named: 'status'), search: any(named: 'search'))).thenAnswer((_) async => []);
      when(() => repo.listMembers(search: any(named: 'search'))).thenAnswer((_) async => [
            const Member(id: '1', status: SubmissionStatus.approved, fullName: 'রহিম', mobile: '017', dueInstallments: 0),
          ]);
      sl.registerSingleton<SessionManager>(SessionManager()..set(const Session(accessToken: 't', role: 'admin', permissions: {})));
      addTearDown(sl.reset);
    });

    testWidgets('flag off: no search box on either list', (tester) async {
      await _pumpRouter(tester, SubmissionsListPage(repository: repo, searchEnabled: false));
      expect(find.byType(QueueSearchField), findsNothing);
      await _pumpRouter(tester, MembersListPage(repository: repo, searchEnabled: false));
      expect(find.byType(QueueSearchField), findsNothing);
    });

    testWidgets('submissions search sends the term after the debounce', (tester) async {
      await _pumpRouter(tester, SubmissionsListPage(repository: repo, searchEnabled: true));
      await tester.enterText(find.byType(TextField), 'রহিম');
      await tester.pump(const Duration(milliseconds: 400));
      await tester.pumpAndSettle();
      verify(() => repo.listSubmissions(status: SubmissionStatus.pending, search: 'রহিম')).called(1);
    });

    testWidgets('members search sends the term after the debounce', (tester) async {
      await _pumpRouter(tester, MembersListPage(repository: repo, searchEnabled: true));
      await tester.enterText(find.byType(TextField), '01712');
      await tester.pump(const Duration(milliseconds: 400));
      await tester.pumpAndSettle();
      verify(() => repo.listMembers(search: '01712')).called(1);
    });
  });

  group('PaymentVerificationsPage', () {
    late _MockPay repo;
    setUp(() {
      repo = _MockPay();
      when(() => repo.listForAdmin(status: any(named: 'status'))).thenAnswer(
          (_) async => [_pay(1, 500), _pay(2, 1000), _pay(3, 250)]);
    });

    Future<void> open(WidgetTester tester,
        {bool bulk = true, Future<List<String>> Function()? reasons}) =>
        _pumpRouter(tester,
            PaymentVerificationsPage(repository: repo, bulkEnabled: bulk, reasonSuggestions: reasons));

    testWidgets('flag off: no checkboxes and no bar', (tester) async {
      await open(tester, bulk: false);
      expect(find.byType(Checkbox), findsNothing);
      expect(find.text(bn.bulkApproveAction), findsNothing);
    });

    testWidgets('select, confirm with count and total, then approve', (tester) async {
      when(() => repo.bulkApprove(any(),
          expectedCount: any(named: 'expectedCount'),
          expectedTotal: any(named: 'expectedTotal'))).thenAnswer((_) async => const BulkApproveResult(
            batchId: 'b', approvedCount: 1, approvedTotal: '500.00',
            approved: [BulkApprovedItem(kind: 'installment', id: 1)],
            failed: [BulkFailedItem(kind: 'installment', id: 2, code: 'NO_LONGER_DUE')]));
      await open(tester);
      expect(find.byType(Checkbox), findsNWidgets(3));
      expect(find.text(bn.bulkApproveAction), findsNothing, reason: 'no bar until ticked');

      await tester.tap(find.byKey(const Key('bulkSelect_1')));
      await tester.tap(find.byKey(const Key('bulkSelect_2')));
      await tester.pumpAndSettle();
      expect(find.text(bn.bulkSelectedBar('২', '৳ ১,৫০০')), findsOneWidget);

      await tester.tap(find.text(bn.bulkApproveAction));
      await tester.pumpAndSettle();
      expect(find.text(bn.bulkConfirmTitle('২', '৳ ১,৫০০')), findsOneWidget);
      await tester.tap(find.text(bn.bulkConfirmYes));
      await tester.pumpAndSettle();

      verify(() => repo.bulkApprove(const [1, 2], expectedCount: 2, expectedTotal: '1500.00')).called(1);
      expect(find.textContaining(bn.bulkFailNoLongerDue), findsOneWidget);
      expect(find.textContaining('১টি অনুমোদিত'), findsOneWidget);
      // The failed row stays ticked.
      expect(tester.widget<Checkbox>(find.byKey(const Key('bulkSelect_2'))).value, isTrue);
    });

    testWidgets('cancelling the confirmation sends nothing', (tester) async {
      await open(tester);
      await tester.tap(find.byKey(const Key('bulkSelect_1')));
      await tester.pumpAndSettle();
      await tester.tap(find.text(bn.bulkApproveAction));
      await tester.pumpAndSettle();
      await tester.tap(find.descendant(of: find.byType(AlertDialog), matching: find.text(bn.commonCancel)));
      await tester.pumpAndSettle();
      verifyNever(() => repo.bulkApprove(any(),
          expectedCount: any(named: 'expectedCount'), expectedTotal: any(named: 'expectedTotal')));
    });

    testWidgets('a stale list is refreshed with a plain message', (tester) async {
      when(() => repo.bulkApprove(any(),
              expectedCount: any(named: 'expectedCount'), expectedTotal: any(named: 'expectedTotal')))
          .thenThrow(const ApiException(
              type: ApiExceptionType.server, statusCode: 409, errorCode: 'BULK_SELECTION_STALE'));
      await open(tester);
      await tester.tap(find.byKey(const Key('bulkSelect_1')));
      await tester.pumpAndSettle();
      await tester.tap(find.text(bn.bulkApproveAction));
      await tester.pumpAndSettle();
      await tester.tap(find.text(bn.bulkConfirmYes));
      await tester.pumpAndSettle();
      expect(find.text(bn.bulkStale), findsOneWidget);
      verify(() => repo.listForAdmin(status: 'pending')).called(2);
    });

    testWidgets('reject: reason chips fill the editable text', (tester) async {
      await open(tester, reasons: () async => ['TrxID মিলছে না', 'ডুপ্লিকেট পেমেন্ট']);
      await tester.tap(find.text(bn.adminPaymentVerificationsReject).first);
      await tester.pumpAndSettle();

      expect(find.text(bn.reasonPickerLabel), findsOneWidget);
      await tester.tap(find.text('ডুপ্লিকেট পেমেন্ট'));
      await tester.pumpAndSettle();
      final field = tester.widget<TextField>(find.byType(TextField).last);
      expect(field.controller!.text, 'ডুপ্লিকেট পেমেন্ট');
      await tester.enterText(find.byType(TextField).last, 'ডুপ্লিকেট পেমেন্ট — আবার');
      expect(field.controller!.text, 'ডুপ্লিকেট পেমেন্ট — আবার');
    });

    testWidgets('reject without the console flag has no chips', (tester) async {
      await open(tester);
      await tester.tap(find.text(bn.adminPaymentVerificationsReject).first);
      await tester.pumpAndSettle();
      expect(find.text(bn.reasonPickerLabel), findsNothing);
      expect(find.byType(ActionChip), findsNothing);
    });
  });
}
