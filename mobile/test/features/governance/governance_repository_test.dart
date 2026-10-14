import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:kaundia_app/core/network/api_client.dart';
import 'package:kaundia_app/features/governance/data/governance_repository.dart';
import 'package:mocktail/mocktail.dart';

class _MockApiClient extends Mock implements ApiClient {}

Map<String, dynamic> _complaint({bool land = false}) => {
      'id': 7,
      'complaint_no': 'C-2026-007',
      'category': 'service',
      'subject': 'দেরি',
      'details': 'বিস্তারিত',
      'is_land_protection': land,
      'status': 'acknowledged',
      'sla_ack': {'state': 'met', 'days_remaining': 0},
      'sla_update': {'state': 'due_soon', 'days_remaining': 2},
      'resolution_note': null,
      'timeline': [
        {'event': 'complaint.submitted', 'at': '2026-10-01T10:00:00'},
      ],
    };

Map<String, dynamic> _electionBody({
  String status = 'voting',
  bool eligible = true,
  String today = '2026-10-14',
}) =>
    {
      'id': 3,
      'title': 'কমিটি',
      'nomination_start': '2026-10-01',
      'nomination_end': '2026-10-05',
      'voting_start': '2026-10-10',
      'voting_end': '2026-10-20',
      'status': status,
      'today': today,
      'eligible': eligible,
      'eligibility_source': 'snapshot',
      'my_nominations': [
        {'id': 1, 'post_key': 'president', 'status': 'approved'},
      ],
      'voted_posts': ['president'],
      'candidates': [
        {
          'post_key': 'president',
          'candidates': [
            {'nomination_id': 5, 'member_id': 9, 'name': 'রহিম'},
          ],
        },
      ],
      'results': {
        'president': {
          'candidates': [
            {'nomination_id': 5, 'member_id': 9, 'votes': 4, 'name': 'রহিম'},
          ],
          'votes_total': 4,
        },
      },
    };

void main() {
  late _MockApiClient api;
  late GovernanceRepository repo;

  setUpAll(() {
    registerFallbackValue(<String, dynamic>{});
    registerFallbackValue(FormData());
  });

  setUp(() {
    api = _MockApiClient();
    repo = GovernanceRepository(apiClient: api);
  });

  group('complaints', () {
    test('constants maps notice, checklist, contacts and categories', () async {
      when(() => api.getUri('/complaints/constants')).thenAnswer((_) async => {
            'anti_retaliation_notice': 'ভয় নেই',
            'land_evidence_checklist': ['দাগ'],
            'emergency_contacts': [
              {'key': 'police', 'number': '999', 'bn': 'পুলিশ'},
            ],
            'categories': [
              {'key': 'service', 'bn': 'সেবা'},
            ],
          });
      final c = await repo.complaintConstants();
      expect(c.antiRetaliationNotice, 'ভয় নেই');
      expect(c.landEvidenceChecklist, ['দাগ']);
      expect(c.emergencyContacts.single.number, '999');
      expect(c.categories.single.label, 'সেবা');
    });

    test('myComplaints maps SLA and timeline', () async {
      when(() => api.getUri('/member/complaints')).thenAnswer((_) async => [_complaint()]);
      final list = await repo.myComplaints();
      expect(list.single.complaintNo, 'C-2026-007');
      expect(list.single.slaUpdate.state, 'due_soon');
      expect(list.single.slaUpdate.daysRemaining, 2);
      expect(list.single.timeline.single.event, 'complaint.submitted');
    });

    test('createComplaint posts category, subject and details', () async {
      when(() => api.post('/member/complaints', any())).thenAnswer((_) async => _complaint());
      await repo.createComplaint(category: 'service', subject: 'ক', details: 'খ');
      verify(() => api.post('/member/complaints', {'category': 'service', 'subject': 'ক', 'details': 'খ'}))
          .called(1);
    });

    test('submitLandComplaint sends form_data JSON as multipart', () async {
      when(() => api.postMultipart('/member/complaints/land-protection', any()))
          .thenAnswer((_) async => _complaint(land: true));
      await repo.submitLandComplaint({'dag_no': '12', 'consent': true});
      final form = verify(() => api.postMultipart('/member/complaints/land-protection', captureAny()))
          .captured
          .single as FormData;
      final field = form.fields.firstWhere((f) => f.key == 'form_data');
      expect(field.value, contains('"dag_no":"12"'));
      expect(form.files, isEmpty);
    });

    test('serviceStandard maps live figures and null live', () async {
      when(() => api.getUri('/governance/service-standard')).thenAnswer((_) async => {
            'anti_retaliation_notice': 'n',
            'standards': [
              {
                'key': 'ack',
                'bn': 'স্বীকৃতি',
                'target': '৩ দিন',
                'live': {'total': 10, 'met': 9, 'met_pct': 90, 'avg_working_days': 1.5},
              },
              {'key': 'x', 'bn': 'অন্য', 'target': '১৫ দিন', 'live': null},
            ],
          });
      final data = await repo.serviceStandard();
      expect(data.standards.first.live!.metPct, 90);
      expect(data.standards.first.live!.percent, 90);
      expect(data.standards.last.live, isNull);
    });
  });

  group('elections', () {
    test('listElections hides drafts and cancelled', () async {
      when(() => api.getUri('/elections')).thenAnswer((_) async => {
            'today': '2026-10-14',
            'items': [
              for (final s in ['draft', 'voting', 'cancelled', 'confirmed'])
                {
                  'id': s.length,
                  'title': s,
                  'nomination_start': '2026-10-01',
                  'nomination_end': '2026-10-05',
                  'voting_start': '2026-10-10',
                  'voting_end': '2026-10-20',
                  'status': s,
                },
            ],
          });
      final page = await repo.listElections();
      expect(page.map((e) => e.status), ['voting', 'confirmed']);
    });

    test('myElection maps eligibility, roster and results', () async {
      when(() => api.getUri('/elections/3/me')).thenAnswer((_) async => _electionBody());
      final e = await repo.myElection(3);
      expect(e.eligible, isTrue);
      expect(e.fromSnapshot, isTrue);
      expect(e.votedPosts, ['president']);
      expect(e.myNominations.single.status, 'approved');
      expect(e.roster!.single.candidates.single.nominationId, 5);
      expect(e.results!.single.votesTotal, 4);
      expect(e.votingOpen, isTrue);
      expect(e.nominationsOpen, isFalse);
    });

    test('nominationsOpen needs status, eligibility and a window that includes today', () async {
      when(() => api.getUri('/elections/3/me'))
          .thenAnswer((_) async => _electionBody(status: 'nominations_open', today: '2026-10-03'));
      expect((await repo.myElection(3)).nominationsOpen, isTrue);
      when(() => api.getUri('/elections/3/me')).thenAnswer(
          (_) async => _electionBody(status: 'nominations_open', eligible: false, today: '2026-10-03'));
      expect((await repo.myElection(3)).nominationsOpen, isFalse);
      when(() => api.getUri('/elections/3/me'))
          .thenAnswer((_) async => _electionBody(status: 'nominations_open', today: '2026-10-06'));
      expect((await repo.myElection(3)).nominationsOpen, isFalse);
    });

    test('nominateSelf and castVote post the Angular bodies', () async {
      when(() => api.post('/elections/3/nominations', any())).thenAnswer((_) async => {'id': 1});
      when(() => api.post('/elections/3/vote', any())).thenAnswer((_) async => {'voted': true});
      await repo.nominateSelf(3, 'president', '');
      await repo.castVote(3, 'president', 5);
      verify(() => api.post('/elections/3/nominations', {'post_key': 'president', 'statement': null}))
          .called(1);
      verify(() => api.post('/elections/3/vote', {'post_key': 'president', 'nomination_id': 5})).called(1);
    });

    test('governanceConstants reads council posts and petition days', () async {
      when(() => api.getUri('/governance/constants')).thenAnswer((_) async => {
            'council_posts': [
              {'key': 'president', 'bn': 'সভাপতি', 'en': 'President'},
            ],
            'notice_periods': {'petition_response_days': 30},
          });
      final c = await repo.governanceConstants();
      expect(c.councilPosts.single.bn, 'সভাপতি');
      expect(c.petitionResponseDays, 30);
    });
  });

  group('petitions, welfare, amendments', () {
    test('petitions: list mine, create, sign', () async {
      final petition = {
        'id': 4,
        'petition_no': 'P-4',
        'title': 'সভা চাই',
        'justification': 'কারণ',
        'signature_count': 3,
        'required_count': 12,
        'status': 'submitted',
        'response_due': '2026-11-01',
        'sla': {'state': 'on_track', 'days_remaining': 10},
        'committee_response': null,
      };
      when(() => api.getUri('/petitions/mine'))
          .thenAnswer((_) async => {'today': '2026-10-14', 'items': [petition]});
      when(() => api.post('/petitions', any())).thenAnswer((_) async => petition);
      when(() => api.post('/petitions/4/sign', any())).thenAnswer((_) async => petition);

      final mine = await repo.myPetitions();
      expect(mine.single.progressPercent, 25);
      expect(mine.single.sla!.daysRemaining, 10);
      await repo.createPetition(title: 'ক', justification: 'খ');
      verify(() => api.post('/petitions', {'title': 'ক', 'justification': 'খ'})).called(1);
      final signed = await repo.signPetition(4);
      expect(signed.signatureCount, 3);
    });

    test('welfare: list parses amounts, apply posts numeric amount', () async {
      when(() => api.getUri('/member/welfare-fund/requests')).thenAnswer((_) async => [
            {
              'id': 1,
              'request_no': 'W-1',
              'request_type': 'medical',
              'amount_requested': '5000.00',
              'reason': 'চিকিৎসা',
              'status': 'approved',
              'approved_amount': '4000.00',
              'committee_reason': null,
            },
          ]);
      when(() => api.post('/member/welfare-fund/requests', any())).thenAnswer((_) async => {
            'id': 2,
            'request_no': 'W-2',
            'request_type': 'other',
            'amount_requested': '100',
            'reason': 'r',
            'status': 'submitted',
          });
      final list = await repo.myWelfareRequests();
      expect(list.single.amountRequested, 5000);
      expect(list.single.approvedAmount, 4000);
      await repo.applyWelfare(requestType: 'other', amount: 100, reason: 'r');
      verify(() => api.post(
          '/member/welfare-fund/requests', {'request_type': 'other', 'amount_requested': 100, 'reason': 'r'})).called(1);
    });

    test('amendments: versions, proposals, propose, withdraw', () async {
      when(() => api.getUri('/amendments/versions')).thenAnswer((_) async => [
            {'id': 1, 'version_no': 2, 'full_text': 'পাঠ', 'is_current': true, 'changes_summary': null},
          ]);
      final proposal = {
        'id': 8,
        'proposal_no': 'A-8',
        'title': 'ধারা ৫',
        'rationale': 'কারণ',
        'proposed_text': 'পাঠ',
        'status': 'submitted',
        'is_dissolution': false,
        'adopted_version_no': null,
        'decision_note': null,
      };
      when(() => api.getUri('/member/amendments/proposals')).thenAnswer((_) async => [proposal]);
      when(() => api.post('/member/amendments/proposals', any())).thenAnswer((_) async => proposal);
      when(() => api.post('/member/amendments/proposals/8/withdraw', any())).thenAnswer((_) async => proposal);

      expect((await repo.amendmentVersions()).single.isCurrent, isTrue);
      expect((await repo.myProposals()).single.canWithdraw, isTrue);
      await repo.createProposal(title: 'ক', rationale: 'খ', proposedText: 'গ', isDissolution: true);
      verify(() => api.post('/member/amendments/proposals',
          {'title': 'ক', 'rationale': 'খ', 'proposed_text': 'গ', 'is_dissolution': true})).called(1);
      await repo.withdrawProposal(8);
      verify(() => api.post('/member/amendments/proposals/8/withdraw', {})).called(1);
    });
  });
}
