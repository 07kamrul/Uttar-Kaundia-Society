import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:kaundia_app/core/format/bn_format.dart';
import 'package:kaundia_app/core/network/api_exception.dart';
import 'package:kaundia_app/features/member/domain/merged_payment_entities.dart';
import 'package:kaundia_app/features/member/pages/payments_page.dart';
import 'package:kaundia_app/l10n/app_localizations_bn.dart';
import 'package:mocktail/mocktail.dart';

import '../../support/payments_fixtures.dart';
import '../../support/pump_app.dart';

void main() {
  final bn = AppLocalizationsBn();
  late MockPaymentsRepository repo;

  setUpAll(registerPaymentFallbacks);

  PaymentHistoryPage page(List<PaymentHistoryItem> items, {int total = -1, int pageNo = 1}) =>
      PaymentHistoryPage(items: items, total: total < 0 ? items.length : total, page: pageNo, pageSize: 20);

  setUp(() {
    repo = MockPaymentsRepository();
    when(() => repo.summary()).thenAnswer((_) async => sampleSummary());
    when(() => repo.history(
          kind: any(named: 'kind'),
          status: any(named: 'status'),
          page: any(named: 'page'),
          pageSize: any(named: 'pageSize'),
        )).thenAnswer((_) async => page([
          historyItem(id: 1, status: PaymentItemStatus.pending),
          historyItem(id: 2, status: PaymentItemStatus.approved),
          historyItem(id: 3, status: PaymentItemStatus.rejected, reason: 'Wrong ID'),
          historyItem(id: 4, kind: PaymentKind.otherFee, status: PaymentItemStatus.recorded),
        ]));
    when(() => repo.submitInstallments(any())).thenAnswer((_) async {});
    when(() => repo.submitOtherFee(any())).thenAnswer((_) async => null);
    when(() => repo.submitCostShare(any())).thenAnswer((_) async => historyItem());
  });

  Future<void> open(WidgetTester tester, {PaymentKind? kind, void Function(PaymentKind?, PaymentItemStatus?)? onChanged}) =>
      pumpBn(tester, PaymentsPage(repository: repo, initialKind: kind, onFiltersChanged: onChanged));

  group('summary and history', () {
    testWidgets('shows dues, paid and a verifying chip in taka with Bangla digits', (tester) async {
      await open(tester);

      expect(find.text(bn.mpayMyDue), findsOneWidget);
      expect(find.text(taka(1500)), findsOneWidget);
      expect(find.text(bn.mpayPaid), findsOneWidget);
      expect(find.text(taka(12000)), findsOneWidget);
      expect(find.byKey(const Key('paymentsPendingChip')), findsOneWidget);
      expect(find.textContaining(taka(500)), findsWidgets);
      expect(find.text(bn.mpayPayNow), findsOneWidget);
    });

    testWidgets('hides the verifying chip when nothing is pending', (tester) async {
      when(() => repo.summary()).thenAnswer((_) async => sampleSummary(pendingCount: 0, pendingAmount: 0));
      await open(tester);
      expect(find.byKey(const Key('paymentsPendingChip')), findsNothing);
    });

    testWidgets('status chips use the agreed Bangla copy', (tester) async {
      await open(tester);

      expect(find.descendant(of: find.byKey(const Key('historyRow_installment_1')), matching: find.text(bn.mpayStatusPending)),
          findsOneWidget);
      expect(find.descendant(of: find.byKey(const Key('historyRow_installment_2')), matching: find.text(bn.mpayStatusApproved)),
          findsOneWidget);
      expect(
          find.descendant(
              of: find.byKey(const Key('historyRow_installment_3')),
              matching: find.text(bn.mpayStatusRejected('Wrong ID'))),
          findsOneWidget);
      expect(find.descendant(of: find.byKey(const Key('historyRow_other_fee_4')), matching: find.text(bn.mpayStatusRecorded)),
          findsOneWidget);
    });

    testWidgets('empty state when there is nothing due', (tester) async {
      when(() => repo.summary()).thenAnswer(
          (_) async => sampleSummary(dues: const [], fees: const [], totalDue: 0, pendingCount: 0, pendingAmount: 0));
      await open(tester);
      expect(find.text(bn.mpayEmpty), findsOneWidget);
    });

    testWidgets('a load failure shows a retry that reloads', (tester) async {
      var calls = 0;
      when(() => repo.summary()).thenAnswer((_) async {
        if (calls++ == 0) throw const ApiException(type: ApiExceptionType.network);
        return sampleSummary();
      });
      await open(tester);
      expect(find.text(bn.commonRetry), findsOneWidget);

      await tester.tap(find.text(bn.commonRetry));
      await tester.pumpAndSettle();

      expect(find.text(taka(1500)), findsOneWidget);
    });
  });

  group('filters', () {
    testWidgets('kind chip reloads history with that kind and reports the change', (tester) async {
      PaymentKind? seenKind;
      await open(tester, onChanged: (k, s) => seenKind = k);

      await tester.tap(find.byKey(const Key('kindChip_cost_share')));
      await tester.pumpAndSettle();

      verify(() => repo.history(
          kind: PaymentKind.costShare, status: null, page: 1, pageSize: any(named: 'pageSize'))).called(1);
      expect(seenKind, PaymentKind.costShare);
    });

    testWidgets('status chip filters too', (tester) async {
      await open(tester);
      await tester.tap(find.byKey(const Key('statusChip_pending')));
      await tester.pumpAndSettle();
      verify(() => repo.history(
          kind: null, status: PaymentItemStatus.pending, page: 1, pageSize: any(named: 'pageSize'))).called(1);
    });

    testWidgets('the initial kind from the route is applied', (tester) async {
      await open(tester, kind: PaymentKind.installment);
      verify(() => repo.history(
          kind: PaymentKind.installment, status: null, page: 1, pageSize: any(named: 'pageSize'))).called(1);
    });

    testWidgets('show more appends the next page', (tester) async {
      when(() => repo.history(
            kind: any(named: 'kind'),
            status: any(named: 'status'),
            page: 1,
            pageSize: any(named: 'pageSize'),
          )).thenAnswer((_) async => page([historyItem(id: 1)], total: 2));
      when(() => repo.history(
            kind: any(named: 'kind'),
            status: any(named: 'status'),
            page: 2,
            pageSize: any(named: 'pageSize'),
          )).thenAnswer((_) async => page([historyItem(id: 2)], total: 2, pageNo: 2));
      await open(tester);

      await tester.tap(find.byKey(const Key('paymentsLoadMore')));
      await tester.pumpAndSettle();

      expect(find.byKey(const Key('historyRow_installment_1')), findsOneWidget);
      expect(find.byKey(const Key('historyRow_installment_2')), findsOneWidget);
      expect(find.byKey(const Key('paymentsLoadMore')), findsNothing);
    });
  });

  group('pay flow sheet', () {
    Future<void> openSheet(WidgetTester tester) async {
      await open(tester);
      await tester.tap(find.byKey(const Key('paymentsPayButton')));
      await tester.pumpAndSettle();
    }

    testWidgets('step 1 lists pre-ticked dues, fee types and a live total', (tester) async {
      await openSheet(tester);

      expect(find.text(bn.mpayForWhat), findsOneWidget);
      for (final k in ['installment:41', 'installment:42', 'cost_share:7']) {
        final box = tester.widget<CheckboxListTile>(find.byKey(Key('payDue_$k')));
        expect(box.value, isTrue, reason: k);
      }
      expect(find.byKey(const Key('payFee_picnic')), findsOneWidget);
      expect(find.byKey(const Key('payFee_donation')), findsOneWidget);
      expect(find.descendant(of: find.byKey(const Key('payTotal')), matching: find.text(taka(1500))), findsOneWidget);

      await tester.tap(find.byKey(const Key('payDue_installment:41')));
      await tester.pump();
      expect(find.descendant(of: find.byKey(const Key('payTotal')), matching: find.text(taka(1000))), findsOneWidget);
    });

    testWidgets('picnic stepper changes the total', (tester) async {
      await openSheet(tester);
      await tester.tap(find.byKey(const Key('payFee_picnic')));
      await tester.pump();
      await tester.tap(find.byKey(const Key('payExtraPlus_picnic')));
      await tester.pump();
      expect(find.descendant(of: find.byKey(const Key('payTotal')), matching: find.text(taka(2000))), findsOneWidget);
    });

    testWidgets('step 2 shows the account and a TrxID label for MFS, receipt number for cash', (tester) async {
      await openSheet(tester);
      await tester.tap(find.byKey(const Key('payNext')));
      await tester.pumpAndSettle();

      expect(find.text(bn.mpayHow), findsOneWidget);
      expect(find.byKey(const Key('abroadPaymentNote')), findsOneWidget);

      await tester.tap(find.byKey(const Key('payMethod_bkash')));
      await tester.pumpAndSettle();
      expect(find.byKey(const Key('paymentAccounts')), findsOneWidget);
      expect(find.textContaining('01711111111'), findsWidgets);
      expect(find.text(bn.regPayRefTrx), findsOneWidget);

      await tester.tap(find.byKey(const Key('payMethod_cash')));
      await tester.pumpAndSettle();
      expect(find.text(bn.regPayRefReceipt), findsOneWidget);
      expect(find.byKey(const Key('paymentAccounts')), findsNothing);
    });

    testWidgets('submit stays disabled until method and reference are valid', (tester) async {
      await openSheet(tester);
      await tester.tap(find.byKey(const Key('payNext')));
      await tester.pumpAndSettle();

      bool enabled() => tester.widget<FilledButton>(find.byKey(const Key('paySubmit'))).onPressed != null;
      expect(enabled(), isFalse);
      await tester.tap(find.byKey(const Key('payMethod_nagad')));
      await tester.pump();
      expect(enabled(), isFalse);
      await tester.enterText(find.byKey(const Key('payReferenceField')), 'TRX12345');
      await tester.pump();
      expect(enabled(), isTrue);
    });

    testWidgets('partial failure reports counts and offers a retry for the rest', (tester) async {
      when(() => repo.submitCostShare(any())).thenThrow(
        const ApiException(type: ApiExceptionType.server, statusCode: 409, errorCode: 'DUPLICATE_TRANSACTION_REF'),
      );
      await openSheet(tester);
      await tester.tap(find.byKey(const Key('payNext')));
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const Key('payMethod_bkash')));
      await tester.enterText(find.byKey(const Key('payReferenceField')), 'TRX12345');
      await tester.pump();
      await tester.tap(find.byKey(const Key('paySubmit')));
      await tester.pumpAndSettle();

      expect(find.text(bn.mpayPartial(bnNumber(1), bnNumber(2))), findsOneWidget);
      expect(find.text(bn.apiErrorDuplicateTransactionRef), findsOneWidget);
      expect(find.text(bn.mpayRetryRest), findsOneWidget);
    });

    testWidgets('full success closes the sheet and reloads the page', (tester) async {
      await openSheet(tester);
      await tester.tap(find.byKey(const Key('payNext')));
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const Key('payMethod_bkash')));
      await tester.enterText(find.byKey(const Key('payReferenceField')), 'TRX12345');
      await tester.pump();
      await tester.tap(find.byKey(const Key('paySubmit')));
      await tester.pumpAndSettle();

      expect(find.byKey(const Key('payNext')), findsNothing);
      expect(find.text(bn.mpaySubmitted), findsOneWidget);
      verify(() => repo.summary()).called(2);
    });

    testWidgets('?fee=picnic opens the sheet with picnic preselected', (tester) async {
      await pumpBn(tester, PaymentsPage(repository: repo, initialKind: PaymentKind.otherFee, initialFee: 'picnic'));
      final box = tester.widget<CheckboxListTile>(find.byKey(const Key('payFee_picnic')));
      expect(box.value, isTrue);
      final due = tester.widget<CheckboxListTile>(find.byKey(const Key('payDue_installment:41')));
      expect(due.value, isFalse, reason: 'dues are not pre-ticked');
    });
  });
}
