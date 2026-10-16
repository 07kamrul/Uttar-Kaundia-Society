import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:kaundia_app/core/network/api_client.dart';
import 'package:kaundia_app/core/network/api_exception.dart';
import 'package:kaundia_app/features/member/data/other_fees_repository.dart';
import 'package:kaundia_app/features/member/domain/merged_payment_entities.dart';
import 'package:kaundia_app/features/member/domain/other_fees_entities.dart';
import 'package:kaundia_app/features/member/pages/other_fees_page.dart';
import 'package:kaundia_app/features/member/presentation/bloc/other_fees_cubit.dart';
import 'package:kaundia_app/l10n/app_localizations_bn.dart';
import 'package:mocktail/mocktail.dart';

import '../../support/pump_app.dart';

class _MockApi extends Mock implements ApiClient {}

class _MockRepo extends Mock implements OtherFeesRepository {}

const _picnic = OtherFeeType(
  key: 'picnic',
  label: 'পিকনিক',
  calculation: 'picnic',
  headFee: 500,
  additionalHeadFee: 300,
);
const _maintenance = OtherFeeType(key: 'maintenance', label: 'রক্ষণাবেক্ষণ', calculation: 'fixed', amount: 200);
const _donation = OtherFeeType(key: 'donation', label: 'দান', calculation: 'variable');
const _admission =
    OtherFeeType(key: 'admission', label: 'ভর্তি', calculation: 'fixed', amount: 1000, payOnce: true, alreadyPaid: true);

const _emptyPage = OtherFeeHistoryPage(
  items: [],
  total: 0,
  page: 1,
  pageSize: 10,
  summary: OtherFeeHistorySummary(totalPaid: 0, byType: {}),
);

const _payment = OtherFeePayment(
  id: 4,
  source: 'picnic',
  feeType: 'picnic',
  amount: 800,
  paymentDate: '2026-10-01',
  additionalHeads: 1,
  receiptNo: 'R-1',
  paymentMethod: 'Cash',
  note: null,
  createdAt: '2026-10-01T10:00:00',
  status: 'approved',
  rejectionReason: null,
  proofUrl: null,
);

const _server = ApiException(type: ApiExceptionType.server, statusCode: 500, message: 'Traceback secret');

void main() {
  final bn = AppLocalizationsBn();

  setUpAll(() {
    registerFallbackValue(<String, dynamic>{});
    registerFallbackValue(const OtherFeeHistoryFilter());
    registerFallbackValue(const OtherFeeCreateInput(feeType: 'x', paymentDate: '2026-01-01', paymentMethod: 'Cash'));
  });

  group('OtherFeesRepository', () {
    late _MockApi api;
    late OtherFeesRepository repo;

    setUp(() {
      api = _MockApi();
      repo = OtherFeesRepository(apiClient: api);
    });

    test('getFeeTypes sends the payment date and maps the catalog', () async {
      when(() => api.getUri('/member/other-fees/types', query: any(named: 'query'))).thenAnswer((_) async => [
            {
              'key': 'picnic',
              'label': 'পিকনিক',
              'calculation': 'picnic',
              'amount': null,
              'unit': null,
              'pay_once': false,
              'already_paid': null,
              'head_fee': '500.00',
              'additional_head_fee': 300,
            },
          ]);

      final types = await repo.getFeeTypes(paymentDate: '2026-10-16');

      expect(types.single.key, 'picnic');
      expect(types.single.isPicnic, isTrue);
      expect(types.single.headFee, 500);
      expect(types.single.additionalHeadFee, 300);
      verify(() => api.getUri('/member/other-fees/types', query: {'payment_date': '2026-10-16'})).called(1);
    });

    test('getPayments maps the page, summary and filters', () async {
      when(() => api.getUri('/member/other-fees/payments', query: any(named: 'query'))).thenAnswer((_) async => {
            'items': [
              {
                'id': 4,
                'source': 'picnic',
                'fee_type': 'picnic',
                'amount': '800.00',
                'payment_date': '2026-10-01',
                'additional_heads': 1,
                'receipt_no': 'R-1',
                'payment_method': 'Cash',
                'note': null,
                'created_at': '2026-10-01T10:00:00',
              },
            ],
            'total': 1,
            'page': 1,
            'page_size': 10,
            'summary': {
              'total_paid': '800.00',
              'by_type': {'picnic': 800},
            },
          });

      final page = await repo.getPayments(
        const OtherFeeHistoryFilter(feeType: 'picnic', dateFrom: '2026-01-01'),
        page: 1,
        pageSize: 10,
      );

      expect(page.items.single.amount, 800);
      expect(page.items.single.status, 'approved');
      expect(page.summary.totalPaid, 800);
      expect(page.summary.byType, {'picnic': 800});
      verify(() => api.getUri('/member/other-fees/payments', query: {
            'fee_type': 'picnic',
            'date_from': '2026-01-01',
            'page': '1',
            'page_size': '10',
          })).called(1);
    });

    test('createPayment posts the picnic people and drops blank optionals', () async {
      when(() => api.post('/member/other-fees/payments', any())).thenAnswer((_) async => {
            'id': 9,
            'source': 'picnic',
            'fee_type': 'picnic',
            'amount': 800,
            'payment_date': '2026-10-16',
            'created_at': '2026-10-16T09:00:00',
            'status': 'pending',
          });

      final saved = await repo.createPayment(const OtherFeeCreateInput(
        feeType: 'picnic',
        paymentDate: '2026-10-16',
        paymentMethod: 'Cash',
        receiptNo: '  ',
        additionalHeads: 1,
        additionalPeople: [FeeHeadLabel(name: 'Rina', relation: FeeHeadRelation.spouse)],
      ));

      expect(saved.id, 9);
      expect(saved.status, 'pending');
      final body = verify(() => api.post('/member/other-fees/payments', captureAny())).captured.single as Map;
      expect(body['fee_type'], 'picnic');
      expect(body['receipt_no'], isNull);
      expect(body['amount'], isNull);
      expect(body['additional_heads'], 1);
      expect(body['additional_people'], [
        {'name': 'Rina', 'relation': 'spouse'},
      ]);
    });
  });

  group('otherFeeBreakdown', () {
    test('picnic adds the additional heads', () {
      final b = otherFeeBreakdown(_picnic, 2)!;
      expect(b.additionalAmount, 600);
      expect(b.total, 1100);
    });

    test('fixed uses the configured amount and variable has none', () {
      expect(otherFeeBreakdown(_maintenance, 0)!.total, 200);
      expect(otherFeeBreakdown(_donation, 0), isNull);
      expect(otherFeeBreakdown(null, 0), isNull);
    });
  });

  group('OtherFeesCubit', () {
    late _MockRepo repo;

    setUp(() {
      repo = _MockRepo();
      when(() => repo.getFeeTypes(paymentDate: any(named: 'paymentDate')))
          .thenAnswer((_) async => [_maintenance, _picnic, _donation, _admission]);
      when(() => repo.getPayments(any(), page: any(named: 'page'), pageSize: any(named: 'pageSize')))
          .thenAnswer((_) async => _emptyPage);
    });

    test('preselects the initial type when it is offered', () async {
      final c = OtherFeesCubit(repo, initialType: 'picnic', today: '2026-10-16');
      await c.start();
      expect(c.state.selectedKey, 'picnic');
      expect(c.state.paymentDate, '2026-10-16');
      await c.close();
    });

    test('falls back to the first type when the initial type is unknown', () async {
      final c = OtherFeesCubit(repo, initialType: 'nope', today: '2026-10-16');
      await c.start();
      expect(c.state.selectedKey, 'maintenance');
      await c.close();
    });

    test('classifies a 404 catalog failure as not configured and 403 as access', () async {
      when(() => repo.getFeeTypes(paymentDate: any(named: 'paymentDate')))
          .thenThrow(const ApiException(type: ApiExceptionType.business, statusCode: 404));
      final c = OtherFeesCubit(repo, today: '2026-10-16');
      await c.start();
      expect(c.state.typesError, OtherFeesTypesError.notConfigured);

      when(() => repo.getFeeTypes(paymentDate: any(named: 'paymentDate')))
          .thenThrow(const ApiException(type: ApiExceptionType.business, statusCode: 403));
      await c.loadFeeTypes();
      expect(c.state.typesError, OtherFeesTypesError.access);

      when(() => repo.getFeeTypes(paymentDate: any(named: 'paymentDate'))).thenThrow(_server);
      await c.loadFeeTypes();
      expect(c.state.typesError, OtherFeesTypesError.generic);
      await c.close();
    });

    test('heads are clamped and picnic names gate submit', () async {
      final c = OtherFeesCubit(repo, initialType: 'picnic', today: '2026-10-16');
      await c.start();
      c.setHeads(-3);
      expect(c.state.additionalHeads, 0);
      c.setHeads(99);
      expect(c.state.additionalHeads, maxOtherFeeHeads);
      c.setHeads(1);
      expect(c.state.labels.length, 1);
      expect(c.state.canSubmit, isFalse);
      c.setLabelName(0, 'Rina');
      expect(c.state.canSubmit, isTrue);
      await c.close();
    });

    test('variable types need a positive amount; pay-once paid types are blocked', () async {
      final c = OtherFeesCubit(repo, initialType: 'donation', today: '2026-10-16');
      await c.start();
      expect(c.state.canSubmit, isFalse);
      c.setAmount('abc');
      expect(c.state.canSubmit, isFalse);
      c.setAmount('150');
      expect(c.state.canSubmit, isTrue);

      c.selectType('admission');
      expect(c.state.isPayOncePaid, isTrue);
      expect(c.state.canSubmit, isFalse);
      await c.close();
    });

    test('submit sends the variable amount, resets the form and reloads history', () async {
      when(() => repo.createPayment(any())).thenAnswer((_) async => _payment);
      final c = OtherFeesCubit(repo, initialType: 'donation', today: '2026-10-16');
      await c.start();
      c.setAmount('150');
      c.setReceiptNo(' R-9 ');

      final ok = await c.submit();

      expect(ok, isTrue);
      final input = verify(() => repo.createPayment(captureAny())).captured.single as OtherFeeCreateInput;
      expect(input.amount, 150);
      expect(input.receiptNo, 'R-9');
      expect(input.additionalHeads, isNull);
      expect(c.state.doneCount, 1);
      expect(c.state.lastSavedTotal, 800);
      expect(c.state.amountText, '');
      expect(c.state.receiptNo, '');
      verify(() => repo.getPayments(any(), page: 1, pageSize: any(named: 'pageSize'))).called(2);
      await c.close();
    });

    test('a failed submit keeps the error and the form', () async {
      when(() => repo.createPayment(any())).thenThrow(_server);
      final c = OtherFeesCubit(repo, initialType: 'maintenance', today: '2026-10-16');
      await c.start();
      c.setReceiptNo('R-1');
      expect(await c.submit(), isFalse);
      expect(c.state.saveError, isA<ApiException>());
      expect(c.state.receiptNo, 'R-1');
      expect(c.state.saving, isFalse);
      await c.close();
    });

    test('history filters reset to page 1 and a failure is flagged', () async {
      final c = OtherFeesCubit(repo, today: '2026-10-16');
      await c.start();
      c.setFilter(c.state.filter.copyWith(feeType: () => 'picnic'));
      await c.applyFilters();
      verify(() => repo.getPayments(const OtherFeeHistoryFilter(feeType: 'picnic'),
          page: 1, pageSize: any(named: 'pageSize'))).called(1);

      when(() => repo.getPayments(any(), page: any(named: 'page'), pageSize: any(named: 'pageSize')))
          .thenThrow(_server);
      await c.resetFilters();
      expect(c.state.filter, const OtherFeeHistoryFilter());
      expect(c.state.historyError, isTrue);
      await c.close();
    });
  });

  group('OtherFeesPage', () {
    late _MockRepo repo;

    setUp(() {
      repo = _MockRepo();
      when(() => repo.getFeeTypes(paymentDate: any(named: 'paymentDate')))
          .thenAnswer((_) async => [_maintenance, _picnic]);
      when(() => repo.getPayments(any(), page: any(named: 'page'), pageSize: any(named: 'pageSize')))
          .thenAnswer((_) async => const OtherFeeHistoryPage(
                items: [_payment],
                total: 1,
                page: 1,
                pageSize: 10,
                summary: OtherFeeHistorySummary(totalPaid: 800, byType: {'picnic': 800}),
              ));
    });

    testWidgets('opens on the initial picnic type with the head stepper and history', (tester) async {
      await pumpBn(tester, OtherFeesPage(initialType: 'picnic', repository: repo));

      expect(find.text(bn.memberPicnicMemberHead), findsOneWidget);
      expect(find.text(bn.memberPicnicAdditionalHeadsLabel), findsWidgets);
      expect(find.byKey(const Key('otherFeesHistory_4')), findsOneWidget);
    });

    testWidgets('switching to a fixed type hides the head stepper', (tester) async {
      await pumpBn(tester, OtherFeesPage(initialType: 'picnic', repository: repo));

      await tester.tap(find.byKey(const Key('otherFeesType_maintenance')));
      await tester.pumpAndSettle();

      expect(find.text(bn.memberPicnicMemberHead), findsNothing);
      expect(find.byKey(const Key('otherFeesHeadsCard')), findsNothing);
    });

    testWidgets('a catalog failure shows the retry banner, never server text', (tester) async {
      when(() => repo.getFeeTypes(paymentDate: any(named: 'paymentDate'))).thenThrow(_server);
      await pumpBn(tester, OtherFeesPage(repository: repo));

      expect(find.text(bn.memberPicnicFeeLoadFailed), findsOneWidget);
      expect(find.textContaining('secret'), findsNothing);
    });

    testWidgets('submitting a fixed fee shows the success toast', (tester) async {
      when(() => repo.createPayment(any())).thenAnswer((_) async => _payment);
      await pumpBn(tester, OtherFeesPage(initialType: 'maintenance', repository: repo));

      await tester.ensureVisible(find.byKey(const Key('otherFeesSubmit')));
      await tester.tap(find.byKey(const Key('otherFeesSubmit')));
      await tester.pumpAndSettle();

      final input = verify(() => repo.createPayment(captureAny())).captured.single as OtherFeeCreateInput;
      expect(input.feeType, 'maintenance');
      expect(input.amount, isNull);
      expect(find.byKey(const Key('otherFeesSuccess')), findsOneWidget);
    });
  });
}
