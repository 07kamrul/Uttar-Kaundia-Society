import 'dart:convert';

import 'package:dio/dio.dart';

import '../../../core/network/api_client.dart';
import '../domain/governance_entities.dart';

String _s(dynamic v) => v?.toString() ?? '';
String? _sn(dynamic v) => v?.toString();
int _i(dynamic v) => v is num ? v.toInt() : int.tryParse(_s(v)) ?? 0;
num _n(dynamic v) => v is num ? v : num.tryParse(_s(v)) ?? 0;
Map<dynamic, dynamic> _m(dynamic v) => v is Map ? v : const {};
List<dynamic> _l(dynamic v) => v is List ? v : const [];

SlaInfo _sla(dynamic v) => SlaInfo(state: _s(_m(v)['state']), daysRemaining: _i(_m(v)['days_remaining']));

Complaint _complaint(dynamic raw) {
  final a = _m(raw);
  return Complaint(
    id: _i(a['id']),
    complaintNo: _s(a['complaint_no']),
    category: _s(a['category']),
    subject: _s(a['subject']),
    details: _s(a['details']),
    isLandProtection: a['is_land_protection'] == true,
    status: _s(a['status']),
    slaAck: _sla(a['sla_ack']),
    slaUpdate: _sla(a['sla_update']),
    resolutionNote: _sn(a['resolution_note']),
    timeline: [
      for (final t in _l(a['timeline'])) TimelineEvent(event: _s(_m(t)['event']), at: _s(_m(t)['at'])),
    ],
  );
}

Election _election(Map<dynamic, dynamic> a) => Election(
      id: _i(a['id']),
      title: _s(a['title']),
      nominationStart: _s(a['nomination_start']),
      nominationEnd: _s(a['nomination_end']),
      votingStart: _s(a['voting_start']),
      votingEnd: _s(a['voting_end']),
      status: _s(a['status']),
    );

Petition _petition(dynamic raw) {
  final a = _m(raw);
  return Petition(
    id: _i(a['id']),
    petitionNo: _s(a['petition_no']),
    title: _s(a['title']),
    justification: _s(a['justification']),
    signatureCount: _i(a['signature_count']),
    requiredCount: _i(a['required_count']),
    status: _s(a['status']),
    responseDue: _sn(a['response_due']),
    sla: a['sla'] == null ? null : _sla(a['sla']),
    committeeResponse: _sn(a['committee_response']),
  );
}

WelfareRequest _welfare(dynamic raw) {
  final a = _m(raw);
  return WelfareRequest(
    id: _i(a['id']),
    requestNo: _s(a['request_no']),
    requestType: _s(a['request_type']),
    amountRequested: _n(a['amount_requested']),
    reason: _s(a['reason']),
    status: _s(a['status']),
    approvedAmount: a['approved_amount'] == null ? null : _n(a['approved_amount']),
    committeeReason: _sn(a['committee_reason']),
  );
}

AmendmentProposal _proposal(dynamic raw) {
  final a = _m(raw);
  return AmendmentProposal(
    id: _i(a['id']),
    proposalNo: _s(a['proposal_no']),
    title: _s(a['title']),
    rationale: _s(a['rationale']),
    proposedText: _s(a['proposed_text']),
    status: _s(a['status']),
    isDissolution: a['is_dissolution'] == true,
    adoptedVersionNo: a['adopted_version_no'] == null ? null : _i(a['adopted_version_no']),
    decisionNote: _sn(a['decision_note']),
  );
}

/// Every member-side governance endpoint the Angular services call
/// (governance, elections, petitions, fund-controls, amendments).
class GovernanceRepository {
  GovernanceRepository({required ApiClient apiClient}) : _api = apiClient;

  final ApiClient _api;

  // ---- complaints and service standard -----------------------------------

  Future<ComplaintConstants> complaintConstants() async {
    final a = _m(await _api.getUri('/complaints/constants'));
    return ComplaintConstants(
      antiRetaliationNotice: _s(a['anti_retaliation_notice']),
      landEvidenceChecklist: [for (final e in _l(a['land_evidence_checklist'])) _s(e)],
      emergencyContacts: [
        for (final c in _l(a['emergency_contacts']))
          EmergencyContact(key: _s(_m(c)['key']), number: _s(_m(c)['number']), label: _s(_m(c)['bn'])),
      ],
      categories: [
        for (final c in _l(a['categories'])) ComplaintCategory(key: _s(_m(c)['key']), label: _s(_m(c)['bn'])),
      ],
    );
  }

  Future<List<Complaint>> myComplaints() async {
    final data = await _api.getUri('/member/complaints');
    return [for (final c in _l(data)) _complaint(c)];
  }

  Future<Complaint> createComplaint({
    required String category,
    required String subject,
    required String details,
  }) async =>
      _complaint(await _api.post('/member/complaints', {
        'category': category,
        'subject': subject,
        'details': details,
      }));

  /// Land-protection form (Annex 3): JSON `form_data` plus an optional
  /// evidence file, exactly like the Angular multipart request.
  Future<Complaint> submitLandComplaint(
    Map<String, dynamic> formData, {
    String? evidencePath,
    String? evidenceName,
  }) async {
    final form = FormData.fromMap({'form_data': jsonEncode(formData)});
    if (evidencePath != null) {
      form.files.add(MapEntry('evidence', await MultipartFile.fromFile(evidencePath, filename: evidenceName)));
    }
    return _complaint(await _api.postMultipart('/member/complaints/land-protection', form));
  }

  Future<ServiceStandardData> serviceStandard() async {
    final a = _m(await _api.getUri('/governance/service-standard'));
    return ServiceStandardData(
      notice: _s(a['anti_retaliation_notice']),
      standards: [
        for (final raw in _l(a['standards']))
          ServiceStandard(
            key: _s(_m(raw)['key']),
            label: _s(_m(raw)['bn']),
            target: _s(_m(raw)['target']),
            live: _m(raw)['live'] == null
                ? null
                : LiveStandard(
                    total: _i(_m(_m(raw)['live'])['total']),
                    met: _i(_m(_m(raw)['live'])['met']),
                    metPct: _m(_m(raw)['live'])['met_pct'] as num?,
                    avgWorkingDays: _m(_m(raw)['live'])['avg_working_days'] as num?,
                  ),
          ),
      ],
    );
  }

  Future<GovernanceConstants> governanceConstants() async {
    final a = _m(await _api.getUri('/governance/constants'));
    final days = _m(a['notice_periods'])['petition_response_days'];
    return GovernanceConstants(
      councilPosts: [
        for (final p in _l(a['council_posts']))
          CouncilPost(key: _s(_m(p)['key']), bn: _s(_m(p)['bn']), en: _s(_m(p)['en'])),
      ],
      petitionResponseDays: days == null ? null : _i(days),
    );
  }

  // ---- elections -----------------------------------------------------------

  /// Elections members can see: drafts and cancelled ones are hidden.
  Future<List<Election>> listElections() async {
    final a = _m(await _api.getUri('/elections'));
    return [
      for (final e in _l(a['items']))
        if (_s(_m(e)['status']) != 'draft' && _s(_m(e)['status']) != 'cancelled') _election(_m(e)),
    ];
  }

  Future<MyElection> myElection(int id) async {
    final a = _m(await _api.getUri('/elections/$id/me'));
    final results = a['results'];
    return MyElection(
      election: _election(a),
      today: _s(a['today']),
      eligible: a['eligible'] == true,
      fromSnapshot: a['eligibility_source'] == 'snapshot',
      myNominations: [
        for (final n in _l(a['my_nominations']))
          MyNomination(id: _i(_m(n)['id']), postKey: _s(_m(n)['post_key']), status: _s(_m(n)['status'])),
      ],
      votedPosts: [for (final p in _l(a['voted_posts'])) _s(p)],
      roster: a['candidates'] == null
          ? null
          : [
              for (final b in _l(a['candidates']))
                PostRoster(postKey: _s(_m(b)['post_key']), candidates: [
                  for (final c in _l(_m(b)['candidates']))
                    RosterCandidate(
                      nominationId: _i(_m(c)['nomination_id']),
                      memberId: _i(_m(c)['member_id']),
                      name: _sn(_m(c)['name']),
                    ),
                ]),
            ],
      results: results is Map
          ? [
              for (final e in results.entries)
                PostCounts(
                  postKey: _s(e.key),
                  votesTotal: _i(_m(e.value)['votes_total']),
                  candidates: [
                    for (final c in _l(_m(e.value)['candidates']))
                      CountCandidate(
                        nominationId: _i(_m(c)['nomination_id']),
                        memberId: _i(_m(c)['member_id']),
                        votes: _i(_m(c)['votes']),
                        name: _sn(_m(c)['name']),
                      ),
                  ],
                ),
            ]
          : null,
    );
  }

  Future<void> nominateSelf(int electionId, String postKey, String statement) =>
      _api.post('/elections/$electionId/nominations', {
        'post_key': postKey,
        'statement': statement.isEmpty ? null : statement,
      });

  Future<void> castVote(int electionId, String postKey, int nominationId) =>
      _api.post('/elections/$electionId/vote', {'post_key': postKey, 'nomination_id': nominationId});

  // ---- petitions -----------------------------------------------------------

  Future<List<Petition>> myPetitions() async {
    final a = _m(await _api.getUri('/petitions/mine'));
    return [for (final p in _l(a['items'])) _petition(p)];
  }

  Future<Petition> createPetition({required String title, required String justification}) async =>
      _petition(await _api.post('/petitions', {'title': title, 'justification': justification}));

  Future<Petition> signPetition(int id) async => _petition(await _api.post('/petitions/$id/sign', {}));

  // ---- welfare fund --------------------------------------------------------

  Future<List<WelfareRequest>> myWelfareRequests() async {
    final data = await _api.getUri('/member/welfare-fund/requests');
    return [for (final r in _l(data)) _welfare(r)];
  }

  Future<WelfareRequest> applyWelfare({
    required String requestType,
    required num amount,
    required String reason,
  }) async =>
      _welfare(await _api.post('/member/welfare-fund/requests', {
        'request_type': requestType,
        'amount_requested': amount,
        'reason': reason,
      }));

  // ---- constitution amendments ---------------------------------------------

  Future<List<ConstitutionVersion>> amendmentVersions() async {
    final data = await _api.getUri('/amendments/versions');
    return [
      for (final v in _l(data))
        ConstitutionVersion(
          id: _i(_m(v)['id']),
          versionNo: _i(_m(v)['version_no']),
          fullText: _s(_m(v)['full_text']),
          changesSummary: _sn(_m(v)['changes_summary']),
          isCurrent: _m(v)['is_current'] == true,
        ),
    ];
  }

  Future<List<AmendmentProposal>> myProposals() async {
    final data = await _api.getUri('/member/amendments/proposals');
    return [for (final p in _l(data)) _proposal(p)];
  }

  Future<AmendmentProposal> createProposal({
    required String title,
    required String rationale,
    required String proposedText,
    required bool isDissolution,
  }) async =>
      _proposal(await _api.post('/member/amendments/proposals', {
        'title': title,
        'rationale': rationale,
        'proposed_text': proposedText,
        'is_dissolution': isDissolution,
      }));

  Future<AmendmentProposal> withdrawProposal(int id) async =>
      _proposal(await _api.post('/member/amendments/proposals/$id/withdraw', {}));
}
