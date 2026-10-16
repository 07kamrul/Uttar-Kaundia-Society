import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:kaundia_app/features/registers/domain/committee_registry_entities.dart';
import 'package:kaundia_app/features/registers/domain/fund_controls_entities.dart';
import 'package:kaundia_app/features/registers/domain/registers_entities.dart';
import 'package:kaundia_app/features/registers/pages/asset_register_page.dart';
import 'package:kaundia_app/features/registers/pages/committee_registry_page.dart';
import 'package:kaundia_app/features/registers/pages/fund_controls_page.dart';
import 'package:kaundia_app/features/registers/pages/welfare_activities_page.dart';
import 'package:kaundia_app/features/registers/presentation/committee_strings.dart';
import 'package:kaundia_app/features/registers/presentation/fund_strings.dart';
import 'package:kaundia_app/features/registers/presentation/registers_strings.dart';
import 'package:mocktail/mocktail.dart';

import '../../support/pump_app.dart';
import 'registers_fixtures.dart';

const _rs = RegistersStrings(true);
const _cs = CommitteeStrings(true);
const _fs = FundStrings(true);

Future<void> _noOpen(List<int> bytes, String name) async {}

/// Tabs scroll horizontally, so bring the tab on screen before tapping it.
Future<void> _openTab(WidgetTester tester, FundSection section) async {
  final tab = find.text(_fs.tab(section));
  await tester.ensureVisible(tab);
  await tester.pumpAndSettle();
  await tester.tap(tab);
}

void main() {
  setUpAll(registerRegisterFallbacks);

  group('CommitteeRegistryPage', () {
    late MockCommitteeRepo repo;
    setUp(() {
      repo = MockCommitteeRepo();
      stubCommittee(repo);
    });

    testWidgets('shows posts, the expired warning and the vacancy cases', (tester) async {
      await pumpBn(tester, CommitteeRegistryPage(repository: repo));
      expect(find.text(_cs.title), findsOneWidget);
      expect(find.text(_cs.expiredWarning), findsOneWidget);
      expect(find.text('সভাপতি'), findsWidgets);
      expect(find.text(_cs.openVacancy), findsOneWidget);
      expect(find.byKey(const ValueKey('case_21')), findsOneWidget);
      expect(find.byKey(const ValueKey('case_22')), findsOneWidget);
      // The secretary already has an open case, so no resignation button.
      expect(find.byKey(const Key('resign_president')), findsOneWidget);
      expect(find.byKey(const Key('resign_secretary')), findsNothing);
    });

    testWidgets('filter chips narrow the case list', (tester) async {
      await pumpBn(tester, CommitteeRegistryPage(repository: repo));
      await tester.tap(find.byKey(const Key('caseFilter_pending')));
      await tester.pumpAndSettle();
      expect(find.byKey(const ValueKey('case_21')), findsOneWidget);
      expect(find.byKey(const ValueKey('case_22')), findsNothing);
      await tester.tap(find.byKey(const Key('caseFilter_decided')));
      await tester.pumpAndSettle();
      expect(find.text(_cs.filterNoMatch), findsOneWidget);
    });

    testWidgets('acknowledge calls the repository', (tester) async {
      when(() => repo.acknowledge(any())).thenAnswer((_) async => pendingCase);
      await pumpBn(tester, CommitteeRegistryPage(repository: repo));
      await tester.tap(find.byKey(const Key('acknowledge_21')));
      await tester.pumpAndSettle();
      verify(() => repo.acknowledge(21)).called(1);
    });

    testWidgets('removal notice needs a note before it can be sent', (tester) async {
      when(() => repo.issueRemovalNotice(any(), any())).thenAnswer((_) async => pendingCase);
      await pumpBn(tester, CommitteeRegistryPage(repository: repo));
      await tester.tap(find.byKey(const Key('removalNotice_21')));
      await tester.pumpAndSettle();
      final button = find.byKey(const Key('issueRemoval'));
      await tester.tap(button);
      verifyNever(() => repo.issueRemovalNotice(any(), any()));
      await tester.enterText(find.descendant(of: find.byKey(const Key('investigationNote')), matching: find.byType(TextFormField)), 'তদন্ত');
      await tester.pumpAndSettle();
      await tester.tap(button);
      await tester.pumpAndSettle();
      verify(() => repo.issueRemovalNotice(21, 'তদন্ত')).called(1);
    });

    testWidgets('a decision is confirmed before it is sent', (tester) async {
      when(() => repo.decide(any(), any(), any())).thenAnswer((_) async => investigationCase);
      await pumpBn(tester, CommitteeRegistryPage(repository: repo));
      await tester.tap(find.byKey(const Key('decide_22')));
      await tester.pumpAndSettle();
      await tester.enterText(find.descendant(of: find.byKey(const Key('decisionNote')), matching: find.byType(TextFormField)), 'প্রমাণিত');
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const Key('decideRemoved')));
      await tester.pumpAndSettle();
      expect(find.text(_cs.decideRemovedConfirm('রহিম উদ্দিন')), findsOneWidget);
      await tester.tap(find.byKey(const Key('confirmYes')));
      await tester.pumpAndSettle();
      verify(() => repo.decide(22, 'removed', 'প্রমাণিত')).called(1);
    });

    testWidgets('history toggles open with the term list', (tester) async {
      when(() => repo.postHistory('president'))
          .thenAnswer((_) async => const PostHistory(postKey: 'president', items: []));
      await pumpBn(tester, CommitteeRegistryPage(repository: repo));
      await tester.tap(find.byKey(const Key('history_president')));
      await tester.pumpAndSettle();
      expect(find.text(_cs.emptyHistory), findsOneWidget);
    });

    testWidgets('a failed load shows the retry, never the server text', (tester) async {
      when(repo.overview).thenThrow(serverError);
      await pumpBn(tester, CommitteeRegistryPage(repository: repo));
      expect(find.text(_cs.loadError), findsOneWidget);
      expect(find.textContaining('Traceback'), findsNothing);
    });
  });

  group('FundControlsPage', () {
    late MockFundRepo repo;
    setUp(() {
      repo = MockFundRepo();
      stubFund(repo);
    });

    testWidgets('only shows the tabs the user holds a permission for', (tester) async {
      await pumpBn(tester, FundControlsPage(repository: repo, permissions: const {'signatory.manage'}));
      expect(find.text(_fs.tab(FundSection.incomePolicy)), findsOneWidget);
      expect(find.text(_fs.tab(FundSection.signatories)), findsOneWidget);
      expect(find.text(_fs.tab(FundSection.threshold)), findsNothing);
      expect(find.text(_fs.tab(FundSection.audit)), findsNothing);
      expect(find.text(_fs.tab(FundSection.welfare)), findsNothing);
      expect(find.text('সদস্য ফি'), findsOneWidget);
    });

    testWidgets('shows the audit reminder and switches tabs', (tester) async {
      await pumpBn(tester, FundControlsPage(repository: repo, permissions: allFundPermissions, openFile: _noOpen));
      expect(find.textContaining(_fs.reminderTitle('2025-26')), findsOneWidget);
      await _openTab(tester, FundSection.signatories);
      await tester.pumpAndSettle();
      expect(find.text('রহিম উদ্দিন'), findsOneWidget);
      expect(find.textContaining('****1234'), findsOneWidget);
    });

    testWidgets('threshold save sends the parsed Bangla digits', (tester) async {
      when(() => repo.updateThreshold(any())).thenAnswer((_) async => settings);
      await pumpBn(tester, FundControlsPage(repository: repo, permissions: const {'fund.manage'}));
      await _openTab(tester, FundSection.threshold);
      await tester.pumpAndSettle();
      await tester.enterText(find.descendant(of: find.byKey(const Key('thresholdValue')), matching: find.byType(TextFormField)), '৭৫০০০');
      await tester.tap(find.byKey(const Key('thresholdSave')));
      await tester.pumpAndSettle();
      verify(() => repo.updateThreshold(75000)).called(1);
    });

    testWidgets('a failed section shows its own retry', (tester) async {
      when(() => repo.welfareRequests(status: any(named: 'status'))).thenThrow(serverError);
      await pumpBn(tester, FundControlsPage(repository: repo, permissions: const {'welfare_fund.review'}));
      await _openTab(tester, FundSection.welfare);
      await tester.pumpAndSettle();
      expect(find.text(_rs.loadFailed), findsOneWidget);
    });

    testWidgets('welfare start review calls the repository', (tester) async {
      when(() => repo.startWelfareReview(any())).thenAnswer((_) async => welfareRequest);
      await pumpBn(tester, FundControlsPage(repository: repo, permissions: const {'welfare_fund.review'}));
      await _openTab(tester, FundSection.welfare);
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const Key('welfareReview_8')));
      await tester.pumpAndSettle();
      verify(() => repo.startWelfareReview(8)).called(1);
    });
  });

  group('AssetRegisterPage', () {
    late MockRegistersRepo repo;
    setUp(() {
      repo = MockRegistersRepo();
      when(() => repo.assets(any())).thenAnswer((_) async => const [asset]);
    });

    testWidgets('lists assets with condition and value', (tester) async {
      await pumpBn(tester, AssetRegisterPage(repository: repo, openFile: _noOpen));
      expect(find.text('প্রজেক্টর'), findsOneWidget);
      expect(find.text(_rs.condition('good')), findsOneWidget);
      expect(find.text('AS-001'), findsOneWidget);
    });

    testWidgets('add form validates then creates the asset', (tester) async {
      when(() => repo.createAsset(any())).thenAnswer((_) async => asset);
      await pumpBn(tester, AssetRegisterPage(repository: repo, openFile: _noOpen));
      await tester.tap(find.byKey(const Key('assetAdd')));
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const Key('assetSave')));
      await tester.pumpAndSettle();
      verifyNever(() => repo.createAsset(any()));

      Finder field(String key) => find.descendant(of: find.byKey(Key(key)), matching: find.byType(TextFormField));
      await tester.enterText(field('assetName'), 'চেয়ার');
      await tester.enterText(field('assetCategory'), 'আসবাব');
      await tester.enterText(field('assetValue'), '১২০০');
      await tester.tap(find.byKey(const Key('assetCondition_fair')));
      await tester.tap(find.byKey(const Key('assetSave')));
      await tester.pumpAndSettle();
      final input = verify(() => repo.createAsset(captureAny())).captured.single as AssetInput;
      expect(input.name, 'চেয়ার');
      expect(input.value, 1200);
      expect(input.condition, 'fair');
    });

    testWidgets('delete asks for a reason', (tester) async {
      when(() => repo.deactivateAsset(any(), any())).thenAnswer((_) async {});
      await pumpBn(tester, AssetRegisterPage(repository: repo, openFile: _noOpen));
      await tester.tap(find.byKey(const Key('assetDelete_1')));
      await tester.pumpAndSettle();
      await tester.enterText(find.byKey(const Key('reasonField')), 'হারিয়েছে');
      await tester.tap(find.byKey(const Key('reasonConfirm')));
      await tester.pumpAndSettle();
      verify(() => repo.deactivateAsset(1, 'হারিয়েছে')).called(1);
    });

    testWidgets('the PDF button hands the bytes to the opener', (tester) async {
      when(repo.assetRegisterPdf).thenAnswer((_) async => const [1, 2, 3]);
      final opened = <String>[];
      await pumpBn(tester, AssetRegisterPage(repository: repo, openFile: (b, name) async => opened.add(name)));
      await tester.tap(find.byKey(const Key('assetPdf')));
      await tester.pumpAndSettle();
      expect(opened.single, startsWith('asset-register-'));
    });
  });

  group('WelfareActivitiesPage', () {
    late MockRegistersRepo repo;
    setUp(() {
      repo = MockRegistersRepo();
      when(() => repo.activities(type: any(named: 'type'))).thenAnswer((_) async => const [activity]);
    });

    testWidgets('lists activities with participants and organiser', (tester) async {
      await pumpBn(tester, WelfareActivitiesPage(repository: repo, openFile: _noOpen));
      expect(find.text('সেলাই প্রশিক্ষণ'), findsOneWidget);
      expect(find.text('${_rs.actParticipants('১২')} · মহিলা কমিটি'), findsOneWidget);
    });

    testWidgets('delete is confirmed first', (tester) async {
      when(() => repo.deleteActivity(any())).thenAnswer((_) async {});
      await pumpBn(tester, WelfareActivitiesPage(repository: repo, openFile: _noOpen));
      await tester.tap(find.byKey(const Key('activityDelete_2')));
      await tester.pumpAndSettle();
      expect(find.text(_rs.actDeleteConfirm), findsOneWidget);
      await tester.tap(find.byKey(const Key('confirmYes')));
      await tester.pumpAndSettle();
      verify(() => repo.deleteActivity(2)).called(1);
    });

    testWidgets('empty list shows the empty state', (tester) async {
      when(() => repo.activities(type: any(named: 'type'))).thenAnswer((_) async => const []);
      await pumpBn(tester, WelfareActivitiesPage(repository: repo, openFile: _noOpen));
      expect(find.text(_rs.actEmpty), findsOneWidget);
    });
  });
}
