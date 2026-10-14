import 'package:flutter_test/flutter_test.dart';
import 'package:kaundia_app/core/network/api_exception.dart';
import 'package:kaundia_app/features/member/domain/merged_payment_entities.dart';
import 'package:kaundia_app/features/member/domain/payment_entities.dart';
import 'package:kaundia_app/features/member/presentation/bloc/pay_flow_cubit.dart';
import 'package:kaundia_app/features/registration/domain/registration_form.dart' show PaymentMethod;
import 'package:mocktail/mocktail.dart';

import '../../support/payments_fixtures.dart';

void main() {
  late MockPaymentsRepository repo;
  final today = DateTime(2026, 3, 5);

  setUpAll(registerPaymentFallbacks);

  setUp(() {
    repo = MockPaymentsRepository();
    when(() => repo.submitInstallments(any())).thenAnswer((_) async {});
    when(() => repo.submitOtherFee(any())).thenAnswer((_) async => null);
    when(() => repo.submitCostShare(any())).thenAnswer((_) async => historyItem());
  });

  PayFlowCubit make({PaymentSummary? summary, String? preselectFee}) => PayFlowCubit(
        summary: summary ?? sampleSummary(),
        repository: repo,
        now: () => today,
        preselectFee: preselectFee,
      );

  group('step 1: what are you paying for', () {
    test('dues are pre-ticked and the total is live', () {
      final c = make();
      expect(c.state.step, 1);
      expect(c.state.selectedDues, {'installment:41', 'installment:42', 'cost_share:7'});
      expect(c.state.total, 1500);
      expect(c.state.canGoNext, isTrue);
      expect(c.state.paidOn, today);
    });

    test('a due held by a pending payment is not selectable', () {
      const pending = PaymentDue(
          kind: PaymentKind.installment, refId: '9', title: 'x', amount: 500, dueDate: null, pending: true);
      final c = make(summary: sampleSummary(dues: const [pending]));
      expect(c.state.selectedDues, isEmpty);
      c.toggleDue(pending);
      expect(c.state.selectedDues, isEmpty);
      expect(c.state.canGoNext, isFalse);
    });

    test('toggling a due updates the total', () {
      final c = make();
      c.toggleDue(c.state.summary.dues.first);
      expect(c.state.total, 1000);
      c.toggleDue(c.state.summary.dues.first);
      expect(c.state.total, 1500);
    });

    test('picnic total is head fee plus extra heads', () {
      final c = make();
      c.toggleFee('picnic');
      expect(c.state.total, 1800);
      c.setExtraHeads('picnic', 2);
      expect(c.state.total, 2200);
      c.setExtraHeads('picnic', -3);
      expect(c.state.total, 1800, reason: 'heads never go below zero');
    });

    test('a variable fee needs a positive amount before Next is allowed', () {
      final c = make();
      c.toggleFee('donation');
      expect(c.state.canGoNext, isFalse);
      c.setFeeAmount('donation', 0);
      expect(c.state.canGoNext, isFalse);
      c.setFeeAmount('donation', 250);
      expect(c.state.canGoNext, isTrue);
      expect(c.state.total, 1750);
    });

    test('a fixed fee uses the configured amount', () {
      final c = make();
      c.toggleFee('id_card');
      expect(c.state.total, 1600);
    });

    test('preselectFee ticks that fee and clears the dues', () {
      final c = make(preselectFee: 'picnic');
      expect(c.state.selectedDues, isEmpty);
      expect(c.state.selectedFees.keys, ['picnic']);
      expect(c.state.total, 300);
    });

    test('next moves to step 2 only when something valid is selected', () {
      final c = make(summary: sampleSummary(dues: const []));
      c.next();
      expect(c.state.step, 1);
      c.toggleFee('id_card');
      c.next();
      expect(c.state.step, 2);
      c.back();
      expect(c.state.step, 1);
    });
  });

  group('step 2: how did you pay', () {
    PayFlowCubit atStep2() {
      final c = make()..next();
      return c;
    }

    test('submit needs a method and a valid TrxID', () {
      final c = atStep2();
      expect(c.state.canSubmit, isFalse);
      c.selectMethod(PaymentMethod.bkash);
      expect(c.state.canSubmit, isFalse);
      c.setReference('ab');
      expect(c.state.canSubmit, isFalse);
      c.setReference('TRX12345');
      expect(c.state.canSubmit, isTrue);
      c.setReference('bad*chars!');
      expect(c.state.canSubmit, isFalse);
    });

    test('reference label follows the method', () {
      final c = atStep2();
      c.selectMethod(PaymentMethod.cash);
      expect(c.state.referenceIsTrxId, isFalse);
      c.selectMethod(PaymentMethod.nagad);
      expect(c.state.referenceIsTrxId, isTrue);
    });
  });

  group('submit', () {
    PayFlowCubit ready({Set<String>? fees}) {
      final c = make();
      for (final f in fees ?? const <String>{}) {
        c.toggleFee(f);
      }
      c
        ..next()
        ..selectMethod(PaymentMethod.bkash)
        ..setReference('TRX12345');
      return c;
    }

    test('sends one request per kind: installments together, each share and fee alone', () async {
      final c = ready(fees: {'picnic'});
      c.setExtraHeads('picnic', 1);

      await c.submit();

      final inst = verify(() => repo.submitInstallments(captureAny())).captured.single as PaymentSubmission;
      expect(inst.installmentIds, ['41', '42']);
      expect(inst.method, 'bkash');
      expect(inst.transactionRef, 'TRX12345');
      expect(inst.paidOn, '2026-03-05');

      final share = verify(() => repo.submitCostShare(captureAny())).captured.single as CostSharePaymentSubmission;
      expect(share.shareId, '7');
      expect(share.amount, 500);
      expect(share.method, 'bkash');

      final fee = verify(() => repo.submitOtherFee(captureAny())).captured.single as OtherFeePaymentSubmission;
      expect(fee.feeType, 'picnic');
      expect(fee.additionalHeads, 1);
      expect(fee.receiptNo, 'TRX12345');
      expect(fee.amount, isNull, reason: 'picnic is computed server-side');

      expect(c.state.result!.allOk, isTrue);
      expect(c.state.result!.ok, 3);
      expect(c.state.result!.total, 3);
      expect(c.state.submitting, isFalse);
    });

    test('a variable fee sends the typed amount', () async {
      final c = make(summary: sampleSummary(dues: const []))
        ..toggleFee('donation')
        ..setFeeAmount('donation', 250)
        ..next()
        ..selectMethod(PaymentMethod.cash)
        ..setReference('RCPT-77');

      await c.submit();

      final fee = verify(() => repo.submitOtherFee(captureAny())).captured.single as OtherFeePaymentSubmission;
      expect(fee.amount, 250);
      expect(fee.paymentMethod, 'cash');
      verifyNever(() => repo.submitInstallments(any()));
    });

    test('partial failure keeps the failed item selected and reports counts', () async {
      when(() => repo.submitCostShare(any())).thenThrow(
        const ApiException(type: ApiExceptionType.server, statusCode: 409, errorCode: 'DUPLICATE_TRANSACTION_REF'),
      );
      final c = ready();

      await c.submit();

      final r = c.state.result!;
      expect(r.allOk, isFalse);
      expect(r.ok, 1);
      expect(r.total, 2);
      expect((r.failures.single.error as ApiException).errorCode, 'DUPLICATE_TRANSACTION_REF');
      expect(c.state.selectedDues, {'cost_share:7'}, reason: 'installments went through, the share stays');
      expect(c.state.step, 2);
    });

    test('retry after a partial failure only resends the failed item', () async {
      var calls = 0;
      when(() => repo.submitCostShare(any())).thenAnswer((_) async {
        if (calls++ == 0) throw const ApiException(type: ApiExceptionType.network);
        return historyItem();
      });
      final c = ready();
      await c.submit();
      clearInteractions(repo);

      await c.submit();

      verifyNever(() => repo.submitInstallments(any()));
      verify(() => repo.submitCostShare(any())).called(1);
      expect(c.state.result!.allOk, isTrue);
    });

    test('does nothing when the form is not valid', () async {
      final c = make()..next();
      await c.submit();
      verifyNever(() => repo.submitInstallments(any()));
      expect(c.state.result, isNull);
    });
  });
}
