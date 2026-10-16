import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:kaundia_app/core/network/api_client.dart';
import 'package:kaundia_app/core/network/api_exception.dart';
import 'package:kaundia_app/features/registers/data/committee_registry_repository.dart';
import 'package:kaundia_app/features/registers/data/fund_controls_repository.dart';
import 'package:kaundia_app/features/registers/data/registers_repository.dart';
import 'package:kaundia_app/features/registers/domain/committee_registry_entities.dart';
import 'package:kaundia_app/features/registers/domain/fund_controls_entities.dart';
import 'package:kaundia_app/features/registers/domain/registers_entities.dart';
import 'package:mocktail/mocktail.dart';

class _MockApiClient extends Mock implements ApiClient {}

class _MockDio extends Mock implements Dio {}

Map<String, dynamic> _term({int id = 4, String status = 'active'}) => {
      'id': id,
      'post_key': 'president',
      'member_id': 9,
      'term_start': '2025-01-01',
      'term_end': null,
      'is_caretaker': false,
      'status': status,
      'replaced_by_term_id': null,
      'notes': 'n',
      'created_at': null,
    };

Map<String, dynamic> _vacancy({String status = 'pending_acknowledgement'}) => {
      'id': 11,
      'post_key': 'president',
      'term_id': 4,
      'member': {'id': 9, 'full_name': 'রহিম', 'member_id': 'UK-9'},
      'member_id': 9,
      'vacancy_type': 'resignation',
      'status': status,
      'note': null,
      'investigation_note': null,
      'response_deadline': '2026-10-20',
      'member_response': null,
      'decision': null,
      'decision_note': null,
      'response_sla': {'state': 'due_soon', 'days_remaining': 2},
    };

Map<String, dynamic> _signatory() => {
      'id': 3,
      'member_id': 9,
      'member_name': 'রহিম',
      'member_display_id': 'UK-9',
      'committee_term_id': null,
      'committee_post_bn': 'কোষাধ্যক্ষ',
      'bank_name': 'সোনালী',
      'branch': 'মিরপুর',
      'account_name': 'সমিতি',
      'account_number_masked': '1234',
      'authority_scope': null,
      'valid_from': '2026-01-01',
      'valid_to': null,
      'is_active': true,
    };

Map<String, dynamic> _welfare() => {
      'id': 5,
      'request_no': 'WF-5',
      'member_id': 9,
      'member_name': 'রহিম',
      'request_type': 'medical',
      'amount_requested': '5000.00',
      'reason': 'চিকিৎসা',
      'status': 'submitted',
      'committee_reason': null,
      'approved_amount': null,
    };

void main() {
  late _MockApiClient api;

  setUpAll(() {
    registerFallbackValue(<String, dynamic>{});
    registerFallbackValue(FormData());
  });

  setUp(() => api = _MockApiClient());

  group('CommitteeRegistryRepository', () {
    late CommitteeRegistryRepository repo;
    setUp(() => repo = CommitteeRegistryRepository(apiClient: api));

    test('overview maps posts, holder, term and open vacancies', () async {
      when(() => api.getUri('/committee-registry')).thenAnswer((_) async => {
            'posts': [
              {
                'key': 'president',
                'bn': 'সভাপতি',
                'en': 'President',
                'council': 'executive',
                'holder': {'id': 9, 'full_name': 'রহিম', 'member_id': 'UK-9'},
                'term': _term(),
                'status': 'active',
                'routine_work_only': false,
                'warning': null,
                'open_vacancy': true,
              },
            ],
            'open_vacancies': [_vacancy()],
            'today': '2026-10-16',
          });
      final o = await repo.overview();
      expect(o.posts.single.label('bn'), 'সভাপতি');
      expect(o.posts.single.holder?.fullName, 'রহিম');
      expect(o.posts.single.term?.memberId, 9);
      expect(o.posts.single.openVacancy, isTrue);
      expect(o.openVacancies.single.responseSla?.state, 'due_soon');
      expect(o.today, '2026-10-16');
    });

    test('post history and vacancies hit the Angular paths', () async {
      when(() => api.getUri('/committee-registry/posts/president/history')).thenAnswer((_) async => {
            'post_key': 'president',
            'items': [
              {..._term(), 'holder': {'id': 9, 'full_name': 'রহিম', 'member_id': null}},
            ],
          });
      when(() => api.getUri('/committee-registry/vacancies'))
          .thenAnswer((_) async => {'total': 1, 'items': [_vacancy()], 'today': '2026-10-16'});
      final h = await repo.postHistory('president');
      expect(h.items.single.holder?.fullName, 'রহিম');
      final v = await repo.vacancies();
      expect(v.single.memberName, 'রহিম');
    });

    test('createTerm and updateTerm send snake_case bodies with nulls for blanks', () async {
      when(() => api.post(any(), any())).thenAnswer((_) async => _term());
      when(() => api.put(any(), any())).thenAnswer((_) async => _term());
      await repo.createTerm(
        postKey: 'president',
        memberId: 9,
        input: const TermInput(termStart: '2026-01-01', termEnd: '', notes: ''),
      );
      verify(() => api.post('/committee-registry/terms', {
            'post_key': 'president',
            'member_id': 9,
            'term_start': '2026-01-01',
            'term_end': null,
            'is_caretaker': false,
            'notes': null,
          })).called(1);
      await repo.updateTerm(4, const TermInput(termStart: '2026-01-01', termEnd: '2028-12-31', isCaretaker: true));
      verify(() => api.put('/committee-registry/terms/4', {
            'term_start': '2026-01-01',
            'term_end': '2028-12-31',
            'is_caretaker': true,
            'notes': null,
          })).called(1);
    });

    test('vacancy actions post to their endpoints', () async {
      when(() => api.post(any(), any())).thenAnswer((_) async => _vacancy());
      await repo.recordResignation('president', 9);
      await repo.acknowledge(11);
      await repo.issueRemovalNotice(11, 'তদন্ত');
      await repo.decide(11, 'retained', 'ঠিক আছে');
      verify(() => api.post('/committee-registry/posts/president/resignation', {'note': null, 'member_id': 9}))
          .called(1);
      verify(() => api.post('/committee-registry/vacancies/11/acknowledge', <String, dynamic>{})).called(1);
      verify(() => api.post('/committee-registry/vacancies/11/removal-notice', {'investigation_note': 'তদন্ত'}))
          .called(1);
      verify(() => api.post('/committee-registry/vacancies/11/decide', {'decision': 'retained', 'note': 'ঠিক আছে'}))
          .called(1);
    });

    test('approved members only, from /admin/members', () async {
      when(() => api.getUri('/admin/members')).thenAnswer((_) async => [
            {'id': 1, 'full_name': 'ক', 'member_id': 'UK-1', 'status': 'approved'},
            {'id': 2, 'full_name': 'খ', 'member_id': null, 'status': 'pending'},
          ]);
      final m = await repo.approvedMembers();
      expect(m.map((e) => e.id), [1]);
      expect(m.single.display, 'ক (UK-1)');
    });
  });

  group('FundControlsRepository', () {
    late FundControlsRepository repo;
    setUp(() => repo = FundControlsRepository(apiClient: api));

    test('settings parse the decimal threshold string', () async {
      when(() => api.getUri('/admin/fund-controls/settings')).thenAnswer((_) async => {
            'expense_two_person_threshold': '50000.00',
            'threshold_is_default': true,
            'income_sources': [
              {'key': 'other', 'bn': 'অন্যান্য', 'en': 'Other', 'requires_justification': true},
            ],
          });
      final s = await repo.settings();
      expect(s.expenseTwoPersonThreshold, 50000);
      expect(s.incomeSources.single.requiresJustification, isTrue);
    });

    test('updateThreshold PUTs the value', () async {
      when(() => api.put(any(), any())).thenAnswer((_) async =>
          {'expense_two_person_threshold': '1000', 'threshold_is_default': false, 'income_sources': []});
      final s = await repo.updateThreshold(1000);
      verify(() => api.put('/admin/fund-controls/settings', {'expense_two_person_threshold': 1000})).called(1);
      expect(s.thresholdIsDefault, isFalse);
    });

    test('signatories include inactive and map the masked digits', () async {
      when(() => api.getUri('/admin/fund-controls/signatories', query: {'include_inactive': 'true'}))
          .thenAnswer((_) async => [_signatory()]);
      final rows = await repo.signatories();
      expect(rows.single.accountNumberMasked, '1234');
      expect(rows.single.committeePostBn, 'কোষাধ্যক্ষ');
    });

    test('create signatory sends every field; update omits untouched last4', () async {
      when(() => api.post(any(), any())).thenAnswer((_) async => _signatory());
      when(() => api.patch(any(), any())).thenAnswer((_) async => _signatory());
      const input = SignatoryInput(
        memberId: 9,
        bankName: 'সোনালী',
        branch: 'মিরপুর',
        accountName: 'সমিতি',
        accountNumberLast4: '1234',
        validFrom: '2026-01-01',
      );
      await repo.createSignatory(input);
      verify(() => api.post('/admin/fund-controls/signatories', {
            'member_id': 9,
            'committee_term_id': null,
            'bank_name': 'সোনালী',
            'branch': 'মিরপুর',
            'account_name': 'সমিতি',
            'account_number_last4': '1234',
            'authority_scope': null,
            'valid_from': '2026-01-01',
            'valid_to': null,
          })).called(1);
      await repo.updateSignatory(
        3,
        const SignatoryInput(bankName: 'B', branch: 'Br', accountName: 'A', validFrom: '2026-01-01'),
      );
      final body = verify(() => api.patch('/admin/fund-controls/signatories/3', captureAny())).captured.single as Map;
      expect(body.containsKey('account_number_last4'), isFalse);
      expect(body['bank_name'], 'B');
    });

    test('deactivate sends DELETE with the reason body and maps dio errors', () async {
      final dio = _MockDio();
      when(() => api.dio).thenReturn(dio);
      when(() => dio.delete<dynamic>(any(), data: any(named: 'data'))).thenAnswer(
          (_) async => Response<dynamic>(requestOptions: RequestOptions(path: ''), statusCode: 204));
      await repo.deactivateSignatory(3, 'মেয়াদ শেষ');
      verify(() => dio.delete<dynamic>('/admin/fund-controls/signatories/3', data: {'reason': 'মেয়াদ শেষ'}))
          .called(1);

      when(() => dio.delete<dynamic>(any(), data: any(named: 'data'))).thenThrow(DioException(
        requestOptions: RequestOptions(path: ''),
        type: DioExceptionType.badResponse,
        response: Response(requestOptions: RequestOptions(path: ''), statusCode: 500),
      ));
      expect(() => repo.deactivateSignatory(3, 'x'), throwsA(isA<ApiException>()));
    });

    test('audit reports, reminder, summary, publish', () async {
      final report = {
        'id': 2,
        'fiscal_year': '2025-26',
        'report_date': '2026-07-10',
        'summary_text': null,
        'has_file': true,
        'original_name': 'a.pdf',
        'published_notice_id': null,
        'published_at': null,
        'created_at': '2026-07-10',
      };
      when(() => api.getUri('/admin/fund-controls/audit-reports')).thenAnswer((_) async => [report]);
      when(() => api.getUri('/admin/fund-controls/audit-reminder')).thenAnswer((_) async =>
          {'fiscal_year': '2025-26', 'current_fy_report_exists': false, 'reminder_window_active': true});
      when(() => api.patch(any(), any())).thenAnswer((_) async => report);
      when(() => api.post(any(), any())).thenAnswer((_) async => report);
      expect((await repo.auditReports()).single.isPublished, isFalse);
      expect((await repo.auditReminder()).reminderWindowActive, isTrue);
      await repo.updateAuditSummary(2, 'সারাংশ');
      await repo.publishAuditReport(2);
      verify(() => api.patch('/admin/fund-controls/audit-reports/2/summary', {'summary_text': 'সারাংশ'})).called(1);
      verify(() => api.post('/admin/fund-controls/audit-reports/2/publish', <String, dynamic>{})).called(1);
    });

    test('downloads go through downloadBytes', () async {
      when(() => api.downloadBytes(any())).thenAnswer((_) async => [1, 2]);
      expect(await repo.bankLetter(), [1, 2]);
      expect(await repo.auditFile(2), [1, 2]);
      verify(() => api.downloadBytes('/admin/fund-controls/signatories/bank-letter.pdf')).called(1);
      verify(() => api.downloadBytes('/admin/fund-controls/audit-reports/2/file')).called(1);
    });

    test('welfare queue filters by status and decides with the reason', () async {
      when(() => api.getUri('/admin/fund-controls/welfare-requests', query: any(named: 'query')))
          .thenAnswer((_) async => [_welfare()]);
      when(() => api.post(any(), any())).thenAnswer((_) async => _welfare());
      final rows = await repo.welfareRequests(status: 'submitted');
      expect(rows.single.amountRequested, 5000);
      verify(() => api.getUri('/admin/fund-controls/welfare-requests', query: {'status': 'submitted'})).called(1);
      await repo.startWelfareReview(5);
      await repo.decideWelfare(5, decision: 'approved', committeeReason: 'যৌক্তিক', approvedAmount: 4000);
      await repo.disburseWelfare(5);
      verify(() => api.post('/admin/fund-controls/welfare-requests/5/start-review', <String, dynamic>{})).called(1);
      verify(() => api.post('/admin/fund-controls/welfare-requests/5/decide',
          {'decision': 'approved', 'committee_reason': 'যৌক্তিক', 'approved_amount': 4000})).called(1);
      verify(() => api.post('/admin/fund-controls/welfare-requests/5/disburse', {'transaction_id': null})).called(1);
    });
  });

  group('RegistersRepository', () {
    late RegistersRepository repo;
    setUp(() => repo = RegistersRepository(apiClient: api));

    final asset = {
      'id': 1,
      'asset_code': 'A-001',
      'name': 'প্রজেক্টর',
      'description': null,
      'category': 'ইলেকট্রনিক্স',
      'acquisition_date': '2026-01-05',
      'value': '25000.50',
      'condition': 'good',
      'location': 'কমিউনিটি সেন্টার',
      'notes': null,
      'is_active': true,
      'created_at': '2026-01-05',
    };
    final activity = {
      'id': 7,
      'activity_date': '2026-09-01',
      'title': 'সেলাই প্রশিক্ষণ',
      'activity_type': 'training',
      'participants_count': 25,
      'participant_notes': null,
      'outcome': 'সফল',
      'organizer': 'কমিটি',
      'notes': null,
      'created_at': '2026-09-01',
    };

    test('assets pass search and include_inactive only when set', () async {
      when(() => api.getUri('/admin/assets', query: any(named: 'query'))).thenAnswer((_) async => [asset]);
      final rows = await repo.assets(const AssetFilter());
      expect(rows.single.value, 25000.5);
      verify(() => api.getUri('/admin/assets', query: <String, dynamic>{})).called(1);
      await repo.assets(const AssetFilter(search: ' প্র ', includeInactive: true));
      verify(() => api.getUri('/admin/assets', query: {'include_inactive': 'true', 'search': 'প্র'})).called(1);
    });

    test('create, update and deactivate an asset', () async {
      when(() => api.post(any(), any())).thenAnswer((_) async => asset);
      when(() => api.patch(any(), any())).thenAnswer((_) async => asset);
      final dio = _MockDio();
      when(() => api.dio).thenReturn(dio);
      when(() => dio.delete<dynamic>(any(), data: any(named: 'data'))).thenAnswer(
          (_) async => Response<dynamic>(requestOptions: RequestOptions(path: ''), statusCode: 204));
      const input = AssetInput(
        name: 'প্রজেক্টর',
        category: 'ইলেকট্রনিক্স',
        acquisitionDate: '2026-01-05',
        value: 25000,
        condition: 'good',
      );
      await repo.createAsset(input);
      await repo.updateAsset(1, input);
      await repo.deactivateAsset(1, 'নষ্ট');
      verify(() => api.post('/admin/assets', input.toJson())).called(1);
      verify(() => api.patch('/admin/assets/1', input.toJson())).called(1);
      verify(() => dio.delete<dynamic>('/admin/assets/1', data: {'reason': 'নষ্ট'})).called(1);
    });

    test('activities filter by type; CRUD and pdf paths', () async {
      when(() => api.getUri('/admin/welfare-activities', query: any(named: 'query')))
          .thenAnswer((_) async => [activity]);
      when(() => api.post(any(), any())).thenAnswer((_) async => activity);
      when(() => api.patch(any(), any())).thenAnswer((_) async => activity);
      when(() => api.delete(any())).thenAnswer((_) async => null);
      when(() => api.downloadBytes(any())).thenAnswer((_) async => [9]);
      final rows = await repo.activities(type: 'training');
      expect(rows.single.participantsCount, 25);
      verify(() => api.getUri('/admin/welfare-activities', query: {'activity_type': 'training'})).called(1);
      const input = ActivityInput(activityDate: '2026-09-01', title: 't', activityType: 'other', participantsCount: 3);
      await repo.createActivity(input);
      await repo.updateActivity(7, input);
      await repo.deleteActivity(7);
      await repo.activitiesPdf();
      await repo.assetRegisterPdf();
      verify(() => api.post('/admin/welfare-activities', input.toJson())).called(1);
      verify(() => api.patch('/admin/welfare-activities/7', input.toJson())).called(1);
      verify(() => api.delete('/admin/welfare-activities/7')).called(1);
      verify(() => api.downloadBytes('/admin/welfare-activities/list.pdf')).called(1);
      verify(() => api.downloadBytes('/admin/assets/register.pdf')).called(1);
    });
  });
}
