import '../../../core/network/api_client.dart';
import '../domain/committee_registry_entities.dart';
import 'registers_json.dart';

/// Committee/council registry. Mirrors Angular committee-registry.service.ts.
class CommitteeRegistryRepository {
  CommitteeRegistryRepository({required ApiClient apiClient}) : _api = apiClient;

  final ApiClient _api;
  static const _base = '/committee-registry';

  Future<RegistryOverview> overview() async {
    final m = jsonMap(await _api.getUri(_base));
    return RegistryOverview(
      posts: [for (final p in jsonList(m['posts'])) _post(jsonMap(p))],
      openVacancies: [for (final v in jsonList(m['open_vacancies'])) _vacancy(jsonMap(v))],
      today: jsonStr(m['today']),
    );
  }

  Future<PostHistory> postHistory(String postKey) async {
    final m = jsonMap(await _api.getUri('$_base/posts/${Uri.encodeComponent(postKey)}/history'));
    return PostHistory(
      postKey: jsonStr(m['post_key']),
      items: [for (final t in jsonList(m['items'])) _term(jsonMap(t))],
    );
  }

  Future<List<PostVacancy>> vacancies() async {
    final m = jsonMap(await _api.getUri('$_base/vacancies'));
    return [for (final v in jsonList(m['items'])) _vacancy(jsonMap(v))];
  }

  Future<TermInfo> createTerm({required String postKey, required int memberId, required TermInput input}) async {
    final data = await _api.post('$_base/terms', {
      'post_key': postKey,
      'member_id': memberId,
      ..._termBody(input),
    });
    return _term(jsonMap(data));
  }

  Future<TermInfo> updateTerm(int termId, TermInput input) async {
    final data = await _api.put('$_base/terms/$termId', _termBody(input));
    return _term(jsonMap(data));
  }

  Future<PostVacancy> recordResignation(String postKey, int memberId, {String? note}) async {
    final data = await _api.post(
      '$_base/posts/${Uri.encodeComponent(postKey)}/resignation',
      {'note': blankToNull(note), 'member_id': memberId},
    );
    return _vacancy(jsonMap(data));
  }

  Future<PostVacancy> acknowledge(int vacancyId) async =>
      _vacancy(jsonMap(await _api.post('$_base/vacancies/$vacancyId/acknowledge', <String, dynamic>{})));

  Future<PostVacancy> issueRemovalNotice(int vacancyId, String investigationNote) async => _vacancy(jsonMap(
      await _api.post('$_base/vacancies/$vacancyId/removal-notice', {'investigation_note': investigationNote})));

  /// [decision]: retained | removed (backend-validated).
  Future<PostVacancy> decide(int vacancyId, String decision, String note) async => _vacancy(
      jsonMap(await _api.post('$_base/vacancies/$vacancyId/decide', {'decision': decision, 'note': note})));

  Future<List<MemberOption>> approvedMembers() => fetchApprovedMembers(_api);

  static Map<String, dynamic> _termBody(TermInput i) => {
        'term_start': i.termStart,
        'term_end': blankToNull(i.termEnd),
        'is_caretaker': i.isCaretaker,
        'notes': blankToNull(i.notes),
      };

  static MemberBrief? _brief(dynamic raw) {
    if (raw is! Map) return null;
    return MemberBrief(
      id: jsonInt(raw['id']),
      fullName: jsonStr(raw['full_name']),
      memberId: jsonStrN(raw['member_id']),
    );
  }

  static TermInfo? _termN(dynamic raw) => raw is Map ? _term(raw) : null;

  static TermInfo _term(Map<dynamic, dynamic> m) => TermInfo(
        id: jsonInt(m['id']),
        postKey: jsonStr(m['post_key']),
        memberId: jsonIntN(m['member_id']),
        termStart: jsonStr(m['term_start']),
        termEnd: jsonStrN(m['term_end']),
        isCaretaker: m['is_caretaker'] == true,
        status: jsonStr(m['status']),
        notes: jsonStrN(m['notes']),
        holder: _brief(m['holder']),
      );

  static PostVacancy _vacancy(Map<dynamic, dynamic> m) {
    final sla = m['response_sla'];
    return PostVacancy(
      id: jsonInt(m['id']),
      postKey: jsonStr(m['post_key']),
      member: _brief(m['member']),
      memberId: jsonIntN(m['member_id']),
      vacancyType: jsonStr(m['vacancy_type']),
      status: jsonStr(m['status']),
      note: jsonStrN(m['note']),
      investigationNote: jsonStrN(m['investigation_note']),
      responseDeadline: jsonStrN(m['response_deadline']),
      memberResponse: jsonStrN(m['member_response']),
      decision: jsonStrN(m['decision']),
      decisionNote: jsonStrN(m['decision_note']),
      responseSla: sla is Map
          ? VacancySla(state: jsonStr(sla['state']), daysRemaining: jsonInt(sla['days_remaining']))
          : null,
    );
  }

  static RegistryPost _post(Map<dynamic, dynamic> m) => RegistryPost(
        key: jsonStr(m['key']),
        bn: jsonStr(m['bn']),
        en: jsonStr(m['en']),
        council: jsonStr(m['council']),
        holder: _brief(m['holder']),
        term: _termN(m['term']),
        status: jsonStr(m['status']),
        routineWorkOnly: m['routine_work_only'] == true,
        warning: jsonStrN(m['warning']),
        openVacancy: m['open_vacancy'] == true,
      );
}
