/// Module 2 - committee/council registry (backend: committee_registry.py).
/// Mirrors Angular committee-registry.service.ts.
library;

class MemberBrief {
  const MemberBrief({required this.id, required this.fullName, this.memberId});

  final int id;
  final String fullName;
  final String? memberId;
}

/// Response-deadline SLA: on_track | due_soon | overdue | met.
class VacancySla {
  const VacancySla({required this.state, required this.daysRemaining});

  final String state;
  final int daysRemaining;
}

/// One committee term. [status]: active | expired | caretaker | vacant.
class TermInfo {
  const TermInfo({
    required this.id,
    required this.postKey,
    required this.termStart,
    required this.isCaretaker,
    required this.status,
    this.memberId,
    this.termEnd,
    this.notes,
    this.holder,
  });

  final int id;
  final String postKey;
  final int? memberId;
  final String termStart;
  final String? termEnd;
  final bool isCaretaker;
  final String status;
  final String? notes;

  /// Only present on post-history items.
  final MemberBrief? holder;
}

/// [vacancyType]: resignation | removal.
/// [status]: pending_acknowledgement | investigation | acknowledged | decided.
class PostVacancy {
  const PostVacancy({
    required this.id,
    required this.postKey,
    required this.vacancyType,
    required this.status,
    this.member,
    this.memberId,
    this.note,
    this.investigationNote,
    this.responseDeadline,
    this.memberResponse,
    this.decision,
    this.decisionNote,
    this.responseSla,
  });

  final int id;
  final String postKey;
  final MemberBrief? member;
  final int? memberId;
  final String vacancyType;
  final String status;
  final String? note;
  final String? investigationNote;
  final String? responseDeadline;
  final String? memberResponse;
  final String? decision;
  final String? decisionNote;
  final VacancySla? responseSla;

  bool get isOpen => status == 'pending_acknowledgement' || status == 'investigation';

  /// The name shown on the case card (falls back to the numeric id).
  String get memberName => member?.fullName ?? (memberId?.toString() ?? '');
}

class RegistryPost {
  const RegistryPost({
    required this.key,
    required this.bn,
    required this.en,
    required this.council,
    required this.status,
    required this.routineWorkOnly,
    required this.openVacancy,
    this.holder,
    this.term,
    this.warning,
  });

  final String key;
  final String bn;
  final String en;
  final String council;
  final MemberBrief? holder;
  final TermInfo? term;
  final String status;
  final bool routineWorkOnly;
  final String? warning;
  final bool openVacancy;

  String label(String lang) => lang == 'bn' ? bn : en;
}

class RegistryOverview {
  const RegistryOverview({required this.posts, required this.openVacancies, required this.today});

  final List<RegistryPost> posts;
  final List<PostVacancy> openVacancies;
  final String today;
}

class PostHistory {
  const PostHistory({required this.postKey, required this.items});

  final String postKey;
  final List<TermInfo> items;
}

class TermInput {
  const TermInput({
    required this.termStart,
    this.termEnd,
    this.isCaretaker = false,
    this.notes,
  });

  final String termStart;
  final String? termEnd;
  final bool isCaretaker;
  final String? notes;
}

/// A member option for the member pickers (approved members only).
class MemberOption {
  const MemberOption({required this.id, required this.fullName, this.memberId});

  final int id;
  final String fullName;
  final String? memberId;

  String get display => memberId == null || memberId!.isEmpty ? fullName : '$fullName ($memberId)';
}

/// Vacancy case filter tabs on the registry page.
enum CaseFilter { all, pending, progress, decided }

bool caseMatches(PostVacancy v, CaseFilter f) => switch (f) {
      CaseFilter.all => true,
      CaseFilter.pending => v.status == 'pending_acknowledgement',
      CaseFilter.decided => v.status == 'decided',
      CaseFilter.progress => v.status == 'investigation' || v.status == 'acknowledged',
    };

/// Whole days from [today] until [deadline]; negative once overdue; null when
/// there is no deadline, it cannot be parsed, or the case is decided.
int? slaDays(PostVacancy v, DateTime today) {
  final raw = v.responseDeadline;
  if (raw == null || raw.isEmpty || v.status == 'decided') return null;
  final deadline = DateTime.tryParse(raw);
  if (deadline == null) return null;
  final d = DateTime(deadline.year, deadline.month, deadline.day);
  final t = DateTime(today.year, today.month, today.day);
  return d.difference(t).inDays;
}

/// Loaded registry page: posts, every vacancy case, approved members for the
/// term form, and the post histories the user expanded.
class CommitteeData {
  const CommitteeData({
    required this.posts,
    required this.vacancies,
    required this.members,
    this.histories = const {},
  });

  final List<RegistryPost> posts;
  final List<PostVacancy> vacancies;
  final List<MemberOption> members;
  final Map<String, PostHistory> histories;

  bool get anyExpired => posts.any((p) => p.status == 'expired');

  int count(CaseFilter f) => vacancies.where((v) => caseMatches(v, f)).length;

  bool hasOpenVacancyFor(String postKey) => vacancies.any((v) => v.postKey == postKey && v.isOpen);

  String postName(String postKey, String lang) {
    for (final p in posts) {
      if (p.key == postKey) return p.label(lang);
    }
    return postKey;
  }

  CommitteeData withHistories(Map<String, PostHistory> next) =>
      CommitteeData(posts: posts, vacancies: vacancies, members: members, histories: next);
}
