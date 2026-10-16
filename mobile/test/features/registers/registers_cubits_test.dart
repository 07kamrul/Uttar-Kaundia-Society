import 'package:dio/dio.dart' show MultipartFile;
import 'package:flutter_test/flutter_test.dart';
import 'package:kaundia_app/features/registers/domain/committee_registry_entities.dart';
import 'package:kaundia_app/features/registers/domain/fund_controls_entities.dart';
import 'package:kaundia_app/features/registers/domain/registers_entities.dart';
import 'package:kaundia_app/features/registers/presentation/bloc/committee_registry_cubit.dart';
import 'package:kaundia_app/features/registers/presentation/bloc/fund_controls_cubit.dart';
import 'package:kaundia_app/features/registers/presentation/bloc/registers_cubits.dart';
import 'package:mocktail/mocktail.dart';

import 'registers_fixtures.dart';

void main() {
  setUpAll(registerRegisterFallbacks);

  group('CommitteeRegistryCubit', () {
    late MockCommitteeRepo repo;
    setUp(() {
      repo = MockCommitteeRepo();
      stubCommittee(repo);
    });

    test('loads posts, every vacancy case and the approved members', () async {
      final cubit = CommitteeRegistryCubit(repo);
      await cubit.load();
      final data = cubit.state.data!;
      expect(data.posts, hasLength(2));
      expect(data.vacancies, hasLength(2));
      expect(data.members, members);
      expect(data.anyExpired, isTrue);
      expect(data.count(CaseFilter.pending), 1);
      expect(data.count(CaseFilter.progress), 1);
    });

    test('vacancy and member failures fall back to empty lists', () async {
      when(repo.vacancies).thenThrow(serverError);
      when(repo.approvedMembers).thenThrow(serverError);
      final cubit = CommitteeRegistryCubit(repo);
      await cubit.load();
      expect(cubit.state.data!.vacancies, isEmpty);
      expect(cubit.state.data!.members, isEmpty);
      expect(cubit.state.loadError, isNull);
    });

    test('an overview failure is a load error', () async {
      when(repo.overview).thenThrow(serverError);
      final cubit = CommitteeRegistryCubit(repo);
      await cubit.load();
      expect(cubit.state.data, isNull);
      expect(cubit.state.loadError, serverError);
    });

    test('members are fetched once across reloads', () async {
      final cubit = CommitteeRegistryCubit(repo);
      await cubit.load();
      await cubit.load();
      verify(repo.approvedMembers).called(1);
    });

    test('toggleHistory fetches then hides the post history', () async {
      when(() => repo.postHistory('president'))
          .thenAnswer((_) async => const PostHistory(postKey: 'president', items: []));
      final cubit = CommitteeRegistryCubit(repo);
      await cubit.load();
      await cubit.toggleHistory('president');
      expect(cubit.state.data!.histories.keys, ['president']);
      await cubit.toggleHistory('president');
      expect(cubit.state.data!.histories, isEmpty);
      verify(() => repo.postHistory('president')).called(1);
    });

    test('saveTerm updates an existing term and creates otherwise', () async {
      when(() => repo.updateTerm(any(), any())).thenAnswer((_) async => president.term!);
      when(() => repo.createTerm(postKey: any(named: 'postKey'), memberId: any(named: 'memberId'), input: any(named: 'input')))
          .thenAnswer((_) async => president.term!);
      final cubit = CommitteeRegistryCubit(repo);
      await cubit.load();
      const input = TermInput(termStart: '2026-01-01');

      expect(await cubit.saveTerm(postKey: 'president', memberId: 9, input: input, editingTermId: 4), isTrue);
      verify(() => repo.updateTerm(4, input)).called(1);

      expect(await cubit.saveTerm(postKey: 'secretary', memberId: 10, input: input), isTrue);
      verify(() => repo.createTerm(postKey: 'secretary', memberId: 10, input: input)).called(1);
      expect(cubit.state.doneCount, 2);
    });

    test('recordResignation sends the holder id', () async {
      when(() => repo.recordResignation(any(), any())).thenAnswer((_) async => pendingCase);
      final cubit = CommitteeRegistryCubit(repo);
      await cubit.load();
      expect(await cubit.recordResignation(president), isTrue);
      verify(() => repo.recordResignation('president', 9)).called(1);
    });

    test('removal and decision need a note; failures land in actionError', () async {
      when(() => repo.issueRemovalNotice(any(), any())).thenThrow(serverError);
      when(() => repo.decide(any(), any(), any())).thenAnswer((_) async => investigationCase);
      final cubit = CommitteeRegistryCubit(repo);
      await cubit.load();

      expect(await cubit.issueRemoval(pendingCase, '   '), isFalse);
      verifyNever(() => repo.issueRemovalNotice(any(), any()));
      expect(await cubit.issueRemoval(pendingCase, ' কারণ '), isFalse);
      verify(() => repo.issueRemovalNotice(21, 'কারণ')).called(1);
      expect(cubit.state.actionError, serverError);

      expect(await cubit.decide(investigationCase, 'retained', ''), isFalse);
      expect(await cubit.decide(investigationCase, 'retained', 'ঠিক আছে'), isTrue);
      verify(() => repo.decide(22, 'retained', 'ঠিক আছে')).called(1);
      expect(cubit.state.actionError, isNull);
    });

    test('setCaseFilter changes the filter', () async {
      final cubit = CommitteeRegistryCubit(repo);
      await cubit.load();
      cubit.setCaseFilter(CaseFilter.decided);
      expect(cubit.caseFilter, CaseFilter.decided);
    });
  });

  group('FundControlsCubit', () {
    late MockFundRepo repo;
    setUp(() {
      repo = MockFundRepo();
      stubFund(repo);
    });

    test('only loads the sections the user may see', () async {
      final cubit = FundControlsCubit(repo, permissions: {'fund.manage'});
      expect(cubit.sections, [FundSection.incomePolicy, FundSection.threshold]);
      await cubit.load();
      final data = cubit.state.data!;
      expect(data.settings.value, settings);
      expect(data.signatories.value, isNull);
      expect(data.signatories.failed, isFalse);
      expect(data.reminder, isNull);
      verifyNever(repo.signatories);
      verifyNever(repo.auditReports);
      verifyNever(repo.auditReminder);
      verifyNever(() => repo.welfareRequests(status: any(named: 'status')));
      verifyNever(repo.approvedMembers);
    });

    test('a failed section keeps the rest loaded', () async {
      when(repo.auditReports).thenThrow(serverError);
      final cubit = FundControlsCubit(repo, permissions: allFundPermissions);
      await cubit.load();
      final data = cubit.state.data!;
      expect(data.reports.failed, isTrue);
      expect(data.signatories.value, [signatory]);
      expect(data.welfare.value, [welfareRequest]);
      expect(data.reminder, reminder);
      expect(data.members, members);
    });

    test('setWelfareStatus reloads only the welfare queue with the filter', () async {
      final cubit = FundControlsCubit(repo, permissions: allFundPermissions);
      await cubit.load();
      await cubit.setWelfareStatus('approved');
      verify(() => repo.welfareRequests(status: 'approved')).called(1);
      verify(repo.signatories).called(1);
    });

    test('saveSignatory requires a member when creating', () async {
      when(() => repo.createSignatory(any())).thenAnswer((_) async => signatory);
      final cubit = FundControlsCubit(repo, permissions: allFundPermissions);
      await cubit.load();
      const noMember = SignatoryInput(bankName: 'b', branch: 'c', accountName: 'd', validFrom: '2026-01-01');
      expect(await cubit.saveSignatory(noMember), isFalse);
      verifyNever(() => repo.createSignatory(any()));
      const input = SignatoryInput(memberId: 9, bankName: 'b', branch: 'c', accountName: 'd', validFrom: '2026-01-01');
      expect(await cubit.saveSignatory(input), isTrue);
      verify(() => repo.createSignatory(input)).called(1);
    });

    test('decideWelfare needs a reason and a positive approved amount', () async {
      when(() => repo.decideWelfare(any(),
              decision: any(named: 'decision'),
              committeeReason: any(named: 'committeeReason'),
              approvedAmount: any(named: 'approvedAmount')))
          .thenAnswer((_) async => welfareRequest);
      final cubit = FundControlsCubit(repo, permissions: allFundPermissions);
      await cubit.load();

      expect(await cubit.decideWelfare(welfareRequest, decision: 'approved', reason: ' ', approvedAmount: 10), isFalse);
      expect(await cubit.decideWelfare(welfareRequest, decision: 'approved', reason: 'ok', approvedAmount: 0), isFalse);
      expect(await cubit.decideWelfare(welfareRequest, decision: 'rejected', reason: 'না', approvedAmount: 99), isTrue);
      verify(() => repo.decideWelfare(8, decision: 'rejected', committeeReason: 'না', approvedAmount: null)).called(1);
    });

    test('uploadReport needs a fiscal year and a date', () async {
      when(() => repo.uploadAuditReport(
            file: any(named: 'file'),
            fiscalYear: any(named: 'fiscalYear'),
            reportDate: any(named: 'reportDate'),
            summaryText: any(named: 'summaryText'),
          )).thenAnswer((_) async => report);
      final cubit = FundControlsCubit(repo, permissions: allFundPermissions);
      await cubit.load();
      final file = MultipartFile.fromBytes(const [1, 2], filename: 'a.pdf');
      expect(await cubit.uploadReport(file: file, fiscalYear: '', reportDate: '2026-07-01'), isFalse);
      expect(await cubit.uploadReport(file: file, fiscalYear: ' 2025-26 ', reportDate: '2026-07-01'), isTrue);
      verify(() => repo.uploadAuditReport(file: file, fiscalYear: '2025-26', reportDate: '2026-07-01')).called(1);
    });

    test('saveThreshold rejects negatives and saves otherwise', () async {
      when(() => repo.updateThreshold(any())).thenAnswer((_) async => settings);
      final cubit = FundControlsCubit(repo, permissions: allFundPermissions);
      await cubit.load();
      expect(await cubit.saveThreshold(-1), isFalse);
      expect(await cubit.saveThreshold(75000), isTrue);
      verify(() => repo.updateThreshold(75000)).called(1);
    });
  });

  group('AssetRegisterCubit', () {
    late MockRegistersRepo repo;
    setUp(() {
      repo = MockRegistersRepo();
      when(() => repo.assets(any())).thenAnswer((_) async => const [asset]);
    });

    test('setFilter reloads with the search and inactive flag', () async {
      final cubit = AssetRegisterCubit(repo);
      await cubit.load();
      await cubit.setFilter(search: 'প্রজে');
      await cubit.setFilter(includeInactive: true);
      final filter = verify(() => repo.assets(captureAny())).captured.last as AssetFilter;
      expect(filter.search, 'প্রজে');
      expect(filter.includeInactive, isTrue);
    });

    test('save creates or updates; deactivate needs a reason', () async {
      when(() => repo.createAsset(any())).thenAnswer((_) async => asset);
      when(() => repo.updateAsset(any(), any())).thenAnswer((_) async => asset);
      when(() => repo.deactivateAsset(any(), any())).thenAnswer((_) async {});
      final cubit = AssetRegisterCubit(repo);
      await cubit.load();
      const input = AssetInput(name: 'n', category: 'c', acquisitionDate: '2026-01-01', value: 1, condition: 'fair');
      expect(await cubit.save(input), isTrue);
      expect(await cubit.save(input, editing: asset), isTrue);
      verify(() => repo.createAsset(input)).called(1);
      verify(() => repo.updateAsset(1, input)).called(1);
      expect(await cubit.deactivate(asset, '  '), isFalse);
      expect(await cubit.deactivate(asset, ' হারিয়েছে '), isTrue);
      verify(() => repo.deactivateAsset(1, 'হারিয়েছে')).called(1);
    });

    test('a failed save keeps the list and reports the error', () async {
      when(() => repo.createAsset(any())).thenThrow(serverError);
      final cubit = AssetRegisterCubit(repo);
      await cubit.load();
      const input = AssetInput(name: 'n', category: 'c', acquisitionDate: '2026-01-01', value: 1, condition: 'good');
      expect(await cubit.save(input), isFalse);
      expect(cubit.state.actionError, serverError);
      expect(cubit.state.data, [asset]);
    });
  });

  group('WelfareActivitiesCubit', () {
    late MockRegistersRepo repo;
    setUp(() {
      repo = MockRegistersRepo();
      when(() => repo.activities(type: any(named: 'type'))).thenAnswer((_) async => const [activity]);
    });

    test('setType filters by type; empty means all', () async {
      final cubit = WelfareActivitiesCubit(repo);
      await cubit.load();
      await cubit.setType('training');
      await cubit.setType('');
      verify(() => repo.activities(type: null)).called(2);
      verify(() => repo.activities(type: 'training')).called(1);
    });

    test('delete calls the repository and reloads', () async {
      when(() => repo.deleteActivity(any())).thenAnswer((_) async {});
      final cubit = WelfareActivitiesCubit(repo);
      await cubit.load();
      expect(await cubit.delete(activity), isTrue);
      verify(() => repo.deleteActivity(2)).called(1);
      verify(() => repo.activities(type: null)).called(2);
    });
  });
}
