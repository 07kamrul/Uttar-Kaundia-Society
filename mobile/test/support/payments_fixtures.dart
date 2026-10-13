import 'package:kaundia_app/features/member/data/payments_repository.dart';
import 'package:kaundia_app/features/member/domain/merged_payment_entities.dart';
import 'package:kaundia_app/features/member/domain/payment_entities.dart';
import 'package:mocktail/mocktail.dart';

class MockPaymentsRepository extends Mock implements PaymentsRepository {}

class FakeCostShareSubmission extends Fake implements CostSharePaymentSubmission {}

class FakeOtherFeeSubmission extends Fake implements OtherFeePaymentSubmission {}

class FakePaymentSubmission extends Fake implements PaymentSubmission {}

void registerPaymentFallbacks() {
  registerFallbackValue(FakeCostShareSubmission());
  registerFallbackValue(FakeOtherFeeSubmission());
  registerFallbackValue(FakePaymentSubmission());
}

PaymentSummary sampleSummary({
  List<PaymentDue>? dues,
  List<OtherFeeType>? fees,
  num totalDue = 1500,
  int pendingCount = 1,
  num pendingAmount = 500,
}) =>
    PaymentSummary(
      currency: 'BDT',
      totalDue: totalDue,
      totalPaid: 12000,
      pendingCount: pendingCount,
      pendingAmount: pendingAmount,
      dues: dues ??
          const [
            PaymentDue(
              kind: PaymentKind.installment,
              refId: '41',
              title: 'জানুয়ারি ২০২৬',
              amount: 500,
              dueDate: '2026-01-31',
              pending: false,
            ),
            PaymentDue(
              kind: PaymentKind.installment,
              refId: '42',
              title: 'ফেব্রুয়ারি ২০২৬',
              amount: 500,
              dueDate: '2026-02-28',
              pending: false,
            ),
            PaymentDue(
              kind: PaymentKind.costShare,
              refId: '7',
              title: 'মসজিদ মেরামত',
              amount: 500,
              dueDate: null,
              pending: false,
            ),
          ],
      payableFeeTypes: fees ??
          const [
            OtherFeeType(key: 'picnic', label: 'বনভোজন', calculation: 'picnic', headFee: 300, additionalHeadFee: 200),
            OtherFeeType(key: 'donation', label: 'অনুদান', calculation: 'variable'),
            OtherFeeType(key: 'id_card', label: 'আইডি কার্ড', calculation: 'fixed', amount: 100),
          ],
      accounts: const [
        PaymentAccount(method: 'bkash', details: '01711111111 (Personal)'),
        PaymentAccount(method: 'bank', details: 'Islami Bank 1071193760001'),
      ],
    );

PaymentHistoryItem historyItem({
  int id = 1,
  PaymentKind kind = PaymentKind.installment,
  PaymentItemStatus status = PaymentItemStatus.pending,
  String? reason,
}) =>
    PaymentHistoryItem(
      kind: kind,
      id: '$id',
      title: 'কিস্তি $id',
      amount: 500,
      method: 'bkash',
      reference: 'TRX$id$id$id$id',
      date: '2026-03-0${id % 9 + 1}',
      status: status,
      rejectionReason: reason,
      proofUrl: null,
    );
