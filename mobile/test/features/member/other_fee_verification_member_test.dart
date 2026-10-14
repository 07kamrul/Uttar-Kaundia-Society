import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:kaundia_app/core/feature_flags/feature_flag.dart';
import 'package:kaundia_app/core/network/api_client.dart';
import 'package:kaundia_app/core/network/api_error_messages.dart';
import 'package:kaundia_app/core/network/api_exception.dart';
import 'package:kaundia_app/features/member/data/member_repository.dart';
import 'package:kaundia_app/features/member/data/payments_repository.dart';
import 'package:kaundia_app/features/member/domain/merged_payment_entities.dart';
import 'package:kaundia_app/features/member/domain/payment_entities.dart';
import 'package:kaundia_app/features/member/pages/payments_page.dart';
import 'package:kaundia_app/features/member/presentation/bloc/pay_flow_cubit.dart';
import 'package:kaundia_app/features/registration/domain/registration_form.dart' show PaymentMethod;
import 'package:kaundia_app/l10n/app_localizations_bn.dart';
import 'package:mocktail/mocktail.dart';

import '../../support/flags.dart';
import '../../support/payments_fixtures.dart';
import '../../support/pump_app.dart';

class _MockApi extends Mock implements ApiClient {}

void main() {
  final bn = AppLocalizationsBn();
  const proof = ProofFile(bytes: [1, 2, 3], fileName: 'p.png', mimeType: 'image/png');

  setUpAll(() {
    registerPaymentFallbacks();
    registerFallbackValue(FormData());
    registerFallbackValue(<String, dynamic>{});
    registerFallbackValue(const ProofFile(bytes: [], fileName: 'x', mimeType: 'image/png'));
  });

  test('flag key matches the server', () {
    expect(FeatureFlag.payVerifyOtherFees.key, 'pay_verify_other_fees');
  });

  group('repository', () {
    late _MockApi api;
    setUp(() => api = _MockApi());

    test('submitOtherFee returns the new payment id', () async {
      when(() => api.post('/member/other-fees/payments', any())).thenAnswer((_) async => {'id': 5});
      final id = await PaymentsRepository(apiClient: api).submitOtherFee(const OtherFeePaymentSubmission(
          feeType: 'picnic', paymentDate: '2026-03-01', paymentMethod: 'bkash', receiptNo: 'TX12345'));
      expect(id, 5);
    });

    test('uploadOtherFeeProof posts multipart "proof" to the payment', () async {
      when(() => api.postMultipart('/member/other-fees/payments/5/proof', any())).thenAnswer((_) async => {});
      await PaymentsRepository(apiClient: api).uploadOtherFeeProof(5, proof);
      final form = verify(() => api.postMultipart('/member/other-fees/payments/5/proof', captureAny()))
          .captured
          .single as FormData;
      expect(form.files.single.key, 'proof');
      expect(form.files.single.value.filename, 'p.png');
    });

    test('uploadPicnicProof posts to the picnic endpoint', () async {
      when(() => api.postMultipart('/member/picnic-payments/9/proof', any())).thenAnswer((_) async => {});
      await MemberRepository(apiClient: api).uploadPicnicProof(9, proof);
      verify(() => api.postMultipart('/member/picnic-payments/9/proof', any())).called(1);
    });
  });

  group('pay flow proof upload', () {
    late MockPaymentsRepository repo;
    setUp(() {
      repo = MockPaymentsRepository();
      when(() => repo.submitOtherFee(any())).thenAnswer((_) async => 5);
      when(() => repo.uploadOtherFeeProof(any(), any())).thenAnswer((_) async {});
    });

    PayFlowCubit ready({required bool verifyOn, bool withProof = true}) {
      final c = PayFlowCubit(
        summary: sampleSummary(dues: const []),
        repository: repo,
        now: () => DateTime(2026, 3, 5),
        verifyOtherFees: verifyOn,
      )..toggleFee('picnic');
      c.next();
      c.selectMethod(PaymentMethod.bkash);
      c.setReference('TX12345');
      if (withProof) c.setProof(proof);
      return c;
    }

    test('flag on: the screenshot goes to the new payment', () async {
      await ready(verifyOn: true).submit();
      verify(() => repo.uploadOtherFeeProof(5, proof)).called(1);
    });

    test('flag off: nothing is uploaded (unchanged)', () async {
      final c = ready(verifyOn: false);
      await c.submit();
      verifyNever(() => repo.uploadOtherFeeProof(any(), any()));
      expect(c.state.result!.allOk, isTrue);
    });

    test('a failed upload does not fail the saved payment', () async {
      when(() => repo.uploadOtherFeeProof(any(), any()))
          .thenThrow(const ApiException(type: ApiExceptionType.server));
      final c = ready(verifyOn: true);
      await c.submit();
      expect(c.state.result!.allOk, isTrue);
      expect(c.state.selectedFees, isEmpty);
    });

    test('no screenshot chosen means no upload', () async {
      await ready(verifyOn: true, withProof: false).submit();
      verifyNever(() => repo.uploadOtherFeeProof(any(), any()));
    });
  });

  test('REFERENCE_REQUIRED is mapped by code, never the server text', () {
    final msg = apiErrorMessage(
        bn,
        const ApiException(
            type: ApiExceptionType.validation,
            statusCode: 422,
            errorCode: 'REFERENCE_REQUIRED',
            message: 'raw server text'));
    expect(msg, bn.apiErrorReferenceRequired);
    expect(msg, isNot(contains('raw')));
  });

  group('history status chips', () {
    late MockPaymentsRepository repo;
    setUp(() {
      repo = MockPaymentsRepository();
      when(() => repo.summary()).thenAnswer((_) async => sampleSummary());
      when(() => repo.history(
            kind: any(named: 'kind'),
            status: any(named: 'status'),
            page: any(named: 'page'),
            pageSize: any(named: 'pageSize'),
          )).thenAnswer((_) async => PaymentHistoryPage(items: [
            historyItem(id: 1, kind: PaymentKind.otherFee, status: PaymentItemStatus.approved),
            historyItem(id: 2, kind: PaymentKind.otherFee, status: PaymentItemStatus.pending),
            historyItem(id: 3, kind: PaymentKind.otherFee, status: PaymentItemStatus.rejected, reason: 'ভুল আইডি'),
            historyItem(id: 4, kind: PaymentKind.installment, status: PaymentItemStatus.approved),
          ], total: 4, page: 1, pageSize: 20));
    });

    Finder chip(String key, String text) => find.descendant(of: find.byKey(Key(key)), matching: find.text(text));

    testWidgets('flag off: approved other fee reads recorded; installments stay approved', (tester) async {
      await useFlags({});
      await pumpBn(tester, PaymentsPage(repository: repo));
      expect(chip('historyRow_other_fee_1', bn.mpayStatusRecorded), findsOneWidget);
      expect(chip('historyRow_installment_4', bn.mpayStatusApproved), findsOneWidget);
    });

    testWidgets('flag on: real status of other fees', (tester) async {
      await useFlags({'pay_verify_other_fees': true});
      await pumpBn(tester, PaymentsPage(repository: repo));
      expect(chip('historyRow_other_fee_1', bn.mpayStatusApproved), findsOneWidget);
      expect(chip('historyRow_other_fee_2', bn.mpayStatusPending), findsOneWidget);
      expect(chip('historyRow_other_fee_3', bn.mpayStatusRejected('ভুল আইডি')), findsOneWidget);
    });
  });
}
