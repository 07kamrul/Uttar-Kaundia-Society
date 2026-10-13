import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:kaundia_app/core/enums/enums.dart';
import 'package:kaundia_app/core/format/bn_format.dart';
import 'package:kaundia_app/core/network/api_exception.dart';
import 'package:kaundia_app/features/home/home_status_page.dart';
import 'package:kaundia_app/features/member/data/member_repository.dart';
import 'package:kaundia_app/features/member/domain/member_entities.dart';
import 'package:kaundia_app/features/public_content/data/content_repository.dart';
import 'package:kaundia_app/features/public_content/domain/content_entities.dart';
import 'package:kaundia_app/l10n/app_localizations_bn.dart';
import 'package:mocktail/mocktail.dart';

import '../../support/payments_fixtures.dart';
import '../../support/pump_app.dart';

class _MockMember extends Mock implements MemberRepository {}

class _MockContent extends Mock implements ContentRepository {}

MemberProfile _profile({
  MemberStatus status = MemberStatus.approved,
  List<MemberProperty> properties = const [],
}) =>
    MemberProfile(
      memberId: '1',
      status: status.name,
      fullName: 'রহিম',
      fatherOrHusband: 'করিম',
      mother: 'আমিনা',
      dob: '1990-01-01',
      mobile: '+8801700000000',
      memberPhotoUrl: '',
      receiptPhotoUrl: '',
      properties: properties,
      nominees: const [],
    );

MemberProperty _property({String? cs, String? rs}) => MemberProperty(
      id: 'p1',
      propertyType: const ['land'],
      dagNoCs: cs,
      dagNoRs: rs,
      coOwners: const [],
      applicableDocs: const [],
    );

Notice _notice(String id, String title, String at) => Notice(
      id: id,
      title: title,
      body: '',
      categoryId: null,
      isPublished: true,
      isMembersOnly: false,
      publishAt: at,
      createdAt: at,
      updatedAt: at,
    );

EventItem _event(String id, String title, String start) => EventItem(
      id: id,
      title: title,
      description: null,
      location: null,
      categoryId: null,
      startAt: start,
      endAt: null,
      isPublished: true,
      isMembersOnly: false,
      createdAt: start,
      updatedAt: start,
    );

void main() {
  final bn = AppLocalizationsBn();
  late MockPaymentsRepository payments;
  late _MockMember member;
  late _MockContent content;

  setUpAll(registerPaymentFallbacks);

  setUp(() {
    payments = MockPaymentsRepository();
    member = _MockMember();
    content = _MockContent();
    when(() => payments.summary()).thenAnswer((_) async => sampleSummary());
    when(() => payments.legacySummary()).thenAnswer((_) async => sampleSummary(totalDue: 800));
    when(() => payments.submitInstallments(any())).thenAnswer((_) async {});
    when(() => member.getProfile()).thenAnswer((_) async => _profile(properties: [_property(cs: '12')]));
    when(() => content.listNotices()).thenAnswer((_) async => [
          _notice('1', 'পুরনো নোটিশ', '2026-01-01T10:00:00Z'),
          _notice('2', 'নতুন নোটিশ', '2026-09-01T10:00:00Z'),
        ]);
    when(() => content.listEvents()).thenAnswer((_) async => [
          _event('1', 'অতীতের সভা', '2020-01-01T10:00:00Z'),
          _event('2', 'দূরের অনুষ্ঠান', '2099-12-01T10:00:00Z'),
          _event('3', 'আগামী অনুষ্ঠান', '2099-02-01T10:00:00Z'),
        ]);
  });

  Future<void> open(WidgetTester tester, {bool merged = true}) => pumpBn(
        tester,
        HomeStatusPage(
          paymentsRepository: payments,
          memberRepository: member,
          contentRepository: content,
          mergedPayments: merged,
        ),
      );

  String statusText(WidgetTester tester) => tester.widget<Text>(find.byKey(const Key('homeStatusText'))).data!;

  group('next step', () {
    testWidgets('pending application: the office is verifying', (tester) async {
      when(() => member.getProfile()).thenAnswer((_) async => _profile(status: MemberStatus.pending));
      await open(tester);
      expect(statusText(tester), bn.homeStatusPending);
    });

    testWidgets('a property without any dag number: give the dag number at the office', (tester) async {
      when(() => member.getProfile()).thenAnswer((_) async => _profile(properties: [_property()]));
      await open(tester);
      expect(statusText(tester), bn.homeStatusNeedsDag);
    });

    testWidgets('dues are shown with the amount and a pay button', (tester) async {
      await open(tester);
      expect(statusText(tester), bn.homeStatusDues(taka(1500)));
      expect(find.byKey(const Key('homePayButton')), findsOneWidget);
    });

    testWidgets('all in order when there is nothing to do', (tester) async {
      when(() => payments.summary())
          .thenAnswer((_) async => sampleSummary(dues: const [], fees: const [], totalDue: 0, pendingCount: 0));
      await open(tester);
      expect(statusText(tester), bn.homeStatusAllGood);
      expect(find.byKey(const Key('homePayButton')), findsNothing);
    });

    testWidgets('pending beats needs-dag and dues (priority order)', (tester) async {
      when(() => member.getProfile())
          .thenAnswer((_) async => _profile(status: MemberStatus.pending, properties: [_property()]));
      await open(tester);
      expect(statusText(tester), bn.homeStatusPending);
    });

    testWidgets('with Batch 2 off the dues come from the installments endpoint', (tester) async {
      await open(tester, merged: false);
      expect(statusText(tester), bn.homeStatusDues(taka(800)));
      verifyNever(() => payments.summary());
    });
  });

  group('cards load on their own', () {
    testWidgets('latest notice and next upcoming event', (tester) async {
      await open(tester);
      expect(find.text(bn.homeLatestNotice), findsOneWidget);
      expect(find.text('নতুন নোটিশ'), findsOneWidget);
      expect(find.text('পুরনো নোটিশ'), findsNothing);
      expect(find.text(bn.homeNextEvent), findsOneWidget);
      expect(find.text('আগামী অনুষ্ঠান'), findsOneWidget);
    });

    testWidgets('one failing card shows its own retry and leaves the rest intact', (tester) async {
      var calls = 0;
      when(() => content.listNotices()).thenAnswer((_) async {
        if (calls++ == 0) throw const ApiException(type: ApiExceptionType.network);
        return [_notice('2', 'নতুন নোটিশ', '2026-09-01T10:00:00Z')];
      });
      await open(tester);

      expect(find.text('আগামী অনুষ্ঠান'), findsOneWidget);
      expect(statusText(tester), bn.homeStatusDues(taka(1500)));
      final retry = find.byKey(const Key('homeRetry_notice'));
      expect(retry, findsOneWidget);

      await tester.tap(retry);
      await tester.pumpAndSettle();

      expect(find.text('নতুন নোটিশ'), findsOneWidget);
    });

    testWidgets('shows skeletons while loading', (tester) async {
      when(() => payments.summary()).thenAnswer((_) => Future.delayed(const Duration(seconds: 5), sampleSummary));
      useTallViewport(tester);
      await tester.pumpWidget(appWith(HomeStatusPage(
        paymentsRepository: payments,
        memberRepository: member,
        contentRepository: content,
        mergedPayments: true,
      )));
      await tester.pump();
      expect(find.byKey(const Key('homeDuesSkeleton')), findsOneWidget);
      await tester.pump(const Duration(seconds: 6));
    });
  });

  group('grid and pay path', () {
    testWidgets('two-by-three grid of big icon buttons, no tables', (tester) async {
      await open(tester);
      final tiles = find.byWidgetPredicate((w) => w.key is ValueKey && (w.key as ValueKey).value.toString().startsWith('homeTile_'));
      expect(tiles, findsNWidgets(6));
      expect(find.byType(Table), findsNothing);
      expect(find.byType(DataTable), findsNothing);
    });

    testWidgets('Home to submitted payment takes at most 4 taps', (tester) async {
      await open(tester);
      var taps = 0;
      Future<void> tap(Finder f) async {
        taps++;
        await tester.ensureVisible(f);
        await tester.tap(f);
        await tester.pumpAndSettle();
      }

      await tap(find.byKey(const Key('homePayButton'))); // 1: pay
      await tap(find.byKey(const Key('payNext'))); // 2: next (dues pre-ticked)
      await tester.enterText(find.byKey(const Key('payReferenceField')), 'TRX12345'); // typing, not a tap
      await tap(find.byKey(const Key('payMethod_bkash'))); // 3: method
      await tap(find.byKey(const Key('paySubmit'))); // 4: submit

      expect(taps, lessThanOrEqualTo(4));
      final sent = verify(() => payments.submitInstallments(captureAny())).captured.single;
      expect((sent as dynamic).installmentIds, ['41', '42']);
      expect((sent as dynamic).method, 'bkash');
      expect((sent as dynamic).transactionRef, 'TRX12345');
    });
  });
}
