import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:kaundia_app/core/network/api_client.dart';
import 'package:kaundia_app/features/member/data/payments_repository.dart';
import 'package:kaundia_app/features/member/domain/merged_payment_entities.dart';
import 'package:kaundia_app/features/member/domain/payment_entities.dart';
import 'package:mocktail/mocktail.dart';

class _MockApi extends Mock implements ApiClient {}

void main() {
  late _MockApi api;
  late PaymentsRepository repo;

  setUpAll(() {
    registerFallbackValue(FormData());
    registerFallbackValue(<String, dynamic>{});
  });

  setUp(() {
    api = _MockApi();
    repo = PaymentsRepository(apiClient: api);
  });

  test('summary maps the contract shape (decimals arrive as strings)', () async {
    when(() => api.getUri('/member/payments/summary')).thenAnswer((_) async => {
          'currency': 'BDT',
          'total_due': '1500.00',
          'total_paid': '12000.00',
          'pending_count': 1,
          'pending_amount': '500.00',
          'dues': [
            {
              'kind': 'installment',
              'ref_id': 41,
              'title': 'Jan',
              'amount': '500.00',
              'due_date': '2026-01-31',
              'pending': false,
            },
            {'kind': 'cost_share', 'ref_id': 7, 'title': 'Roof', 'amount': '1000.00', 'due_date': null, 'pending': true},
          ],
          'payable_fee_types': [
            {
              'key': 'picnic',
              'label': 'Picnic',
              'calculation': 'picnic',
              'amount': null,
              'unit': null,
              'pay_once': false,
              'already_paid': null,
              'head_fee': 300.0,
              'additional_head_fee': 200.0,
            },
          ],
          'accounts': [
            {'method': 'bkash', 'details': '01711111111'},
          ],
        });

    final s = await repo.summary();

    expect(s.totalDue, 1500);
    expect(s.totalPaid, 12000);
    expect(s.pendingCount, 1);
    expect(s.pendingAmount, 500);
    expect(s.dues.first.kind, PaymentKind.installment);
    expect(s.dues.first.refId, '41');
    expect(s.dues.first.dueDate, '2026-01-31');
    expect(s.dues.last.kind, PaymentKind.costShare);
    expect(s.dues.last.pending, isTrue);
    expect(s.payableFeeTypes.single.calculation, 'picnic');
    expect(s.payableFeeTypes.single.headFee, 300);
    expect(s.accounts.single, const PaymentAccount(method: 'bkash', details: '01711111111'));
  });

  test('installment titles from the server are localized; a pending zero-amount share stays pending', () async {
    when(() => api.getUri('/member/payments/summary')).thenAnswer((_) async => {
          'total_due': '0.00',
          'dues': [
            {'kind': 'installment', 'ref_id': 1, 'title': 'কিস্তি 03/2026', 'amount': '500.00', 'due_date': null, 'pending': false},
            {'kind': 'cost_share', 'ref_id': 2, 'title': 'Roof', 'amount': '0.00', 'due_date': null, 'pending': true},
          ],
        });
    final s = await repo.summary();
    expect(s.dues.first.title, 'মার্চ ২০২৬');
    expect(s.dues.last.title, 'Roof');
    expect(s.dues.last.pending, isTrue);
    expect(s.dues.last.amount, 0);
  });

  test('history sends kind, status and paging as query params and maps items', () async {
    when(() => api.getUri('/member/payments/history', query: any(named: 'query'))).thenAnswer((_) async => {
          'items': [
            {
              'kind': 'other_fee',
              'id': 3,
              'title': 'Picnic',
              'amount': '800.00',
              'method': 'bkash',
              'reference': 'TRX1',
              'date': '2026-03-01',
              'status': 'recorded',
              'rejection_reason': null,
              'proof_url': null,
            },
            {
              'kind': 'cost_share',
              'id': 9,
              'title': 'Roof',
              'amount': '500.00',
              'method': 'nagad',
              'reference': 'N9',
              'date': '2026-03-02',
              'status': 'rejected',
              'rejection_reason': 'Wrong ID',
              'proof_url': null,
            },
          ],
          'total': 25,
          'page': 2,
          'page_size': 10,
        });

    final page = await repo.history(
      kind: PaymentKind.costShare,
      status: PaymentItemStatus.pending,
      page: 2,
      pageSize: 10,
    );

    verify(() => api.getUri('/member/payments/history',
        query: {'kind': 'cost_share', 'status': 'pending', 'page': 2, 'page_size': 10})).called(1);
    expect(page.items.first.status, PaymentItemStatus.recorded);
    expect(page.items.first.kind, PaymentKind.otherFee);
    expect(page.items.last.status, PaymentItemStatus.rejected);
    expect(page.items.last.rejectionReason, 'Wrong ID');
    expect(page.total, 25);
    expect(page.hasMore, isTrue);
  });

  test('history omits unset filters', () async {
    when(() => api.getUri('/member/payments/history', query: any(named: 'query')))
        .thenAnswer((_) async => {'items': [], 'total': 0, 'page': 1, 'page_size': 20});

    final page = await repo.history();

    verify(() => api.getUri('/member/payments/history', query: {'page': 1, 'page_size': 20})).called(1);
    expect(page.items, isEmpty);
    expect(page.hasMore, isFalse);
  });

  test('submitCostShare posts multipart fields named as the contract', () async {
    when(() => api.postMultipart('/member/payments/cost-shares', any())).thenAnswer((_) async => {
          'kind': 'cost_share',
          'id': 5,
          'title': 'Roof',
          'amount': '500.00',
          'method': 'bkash',
          'reference': 'TRX99',
          'date': '2026-03-01',
          'status': 'pending',
        });

    final item = await repo.submitCostShare(const CostSharePaymentSubmission(
      shareId: '7',
      amount: 500,
      method: 'bkash',
      transactionRef: ' TRX99 ',
      paidOn: '2026-03-01',
      note: 'hi',
      proof: ProofFile(bytes: [1, 2, 3], fileName: 'p.jpg', mimeType: 'image/jpeg'),
    ));

    final form = verify(() => api.postMultipart('/member/payments/cost-shares', captureAny())).captured.single
        as FormData;
    final fields = {for (final e in form.fields) e.key: e.value};
    expect(fields, {
      'share_id': '7',
      'amount': '500',
      'method': 'bkash',
      'transaction_ref': 'TRX99',
      'paid_on': '2026-03-01',
      'note': 'hi',
    });
    expect(form.files.single.key, 'proof');
    expect(item.status, PaymentItemStatus.pending);
  });

  test('submitOtherFee posts JSON to the existing other-fees endpoint', () async {
    when(() => api.post('/member/other-fees/payments', any())).thenAnswer((_) async => {'id': 1});

    await repo.submitOtherFee(const OtherFeePaymentSubmission(
      feeType: 'picnic',
      paymentDate: '2026-03-01',
      paymentMethod: 'bkash',
      receiptNo: 'TRX1234',
      additionalHeads: 2,
    ));

    final body = verify(() => api.post('/member/other-fees/payments', captureAny())).captured.single
        as Map<String, dynamic>;
    expect(body, {
      'fee_type': 'picnic',
      'payment_date': '2026-03-01',
      'payment_method': 'bkash',
      'receipt_no': 'TRX1234',
      'note': null,
      'amount': null,
      'additional_heads': 2,
    });
  });

  test('legacySummary builds the same shape from the pre-Batch 2 payable endpoint', () async {
    when(() => api.getUri('/member/installment-payments/payable')).thenAnswer((_) async => {
          'due': [
            {'id': 5, 'year': 2026, 'month': 3, 'amount': 500},
            {'id': 6, 'year': 2026, 'month': 4, 'amount': 500},
          ],
          'pending_installment_ids': [6],
          'total_due': 1000,
          'accounts': [
            {'method': 'bkash', 'details': '017'},
          ],
          'payments': [],
        });

    final s = await repo.legacySummary();

    expect(s.totalDue, 1000);
    expect(s.dues.map((d) => d.refId), ['5', '6']);
    expect(s.dues.map((d) => d.pending), [false, true]);
    expect(s.dues.first.kind, PaymentKind.installment);
    expect(s.dues.first.title, 'মার্চ ২০২৬');
    expect(s.accounts.single.method, 'bkash');
    expect(s.payableFeeTypes, isEmpty);
  });
}
