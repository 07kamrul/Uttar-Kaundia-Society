/// Member-side governance entities: complaints, service standard, elections,
/// petitions, welfare fund and constitution amendments. Plain immutable data;
/// parsing lives in the repository.
library;

class SlaInfo {
  const SlaInfo({required this.state, required this.daysRemaining});

  /// `met`, `on_track`, `due_soon` or `overdue`.
  final String state;
  final int daysRemaining;
}

class TimelineEvent {
  const TimelineEvent({required this.event, required this.at});

  final String event;
  final String at;
}

class Complaint {
  const Complaint({
    required this.id,
    required this.complaintNo,
    required this.category,
    required this.subject,
    required this.details,
    required this.isLandProtection,
    required this.status,
    required this.slaAck,
    required this.slaUpdate,
    required this.resolutionNote,
    required this.timeline,
  });

  final int id;
  final String complaintNo;
  final String category;
  final String subject;
  final String details;
  final bool isLandProtection;
  final String status;
  final SlaInfo slaAck;
  final SlaInfo slaUpdate;
  final String? resolutionNote;
  final List<TimelineEvent> timeline;
}

class EmergencyContact {
  const EmergencyContact({required this.key, required this.number, required this.label});

  final String key;
  final String number;
  final String label;
}

class ComplaintCategory {
  const ComplaintCategory({required this.key, required this.label});

  final String key;
  final String label;
}

class ComplaintConstants {
  const ComplaintConstants({
    required this.antiRetaliationNotice,
    required this.landEvidenceChecklist,
    required this.emergencyContacts,
    required this.categories,
  });

  final String antiRetaliationNotice;
  final List<String> landEvidenceChecklist;
  final List<EmergencyContact> emergencyContacts;
  final List<ComplaintCategory> categories;
}

/// Complaints page data: the member's complaints plus the form constants.
class ComplaintsData {
  const ComplaintsData({required this.complaints, required this.constants});

  final List<Complaint> complaints;
  final ComplaintConstants? constants;
}

class LiveStandard {
  const LiveStandard({required this.total, required this.met, this.metPct, this.avgWorkingDays});

  final int total;
  final int met;
  final num? metPct;
  final num? avgWorkingDays;

  /// Share met in percent: the server figure, else computed.
  int get percent => metPct != null ? metPct!.round() : (total > 0 ? (met * 100 / total).round() : 0);
}

class ServiceStandard {
  const ServiceStandard({required this.key, required this.label, required this.target, required this.live});

  final String key;
  final String label;
  final String target;
  final LiveStandard? live;
}

class ServiceStandardData {
  const ServiceStandardData({required this.notice, required this.standards});

  final String notice;
  final List<ServiceStandard> standards;
}

class CouncilPost {
  const CouncilPost({required this.key, required this.bn, required this.en});

  final String key;
  final String bn;
  final String en;
}

class GovernanceConstants {
  const GovernanceConstants({required this.councilPosts, required this.petitionResponseDays});

  final List<CouncilPost> councilPosts;
  final int? petitionResponseDays;
}

class Election {
  const Election({
    required this.id,
    required this.title,
    required this.nominationStart,
    required this.nominationEnd,
    required this.votingStart,
    required this.votingEnd,
    required this.status,
  });

  final int id;
  final String title;
  final String nominationStart;
  final String nominationEnd;
  final String votingStart;
  final String votingEnd;

  /// `nominations_open`, `nominations_closed`, `voting`, `tabulated`, `confirmed`, ...
  final String status;
}

class MyNomination {
  const MyNomination({required this.id, required this.postKey, required this.status});

  final int id;
  final String postKey;
  final String status;
}

class RosterCandidate {
  const RosterCandidate({required this.nominationId, required this.memberId, required this.name});

  final int nominationId;
  final int memberId;
  final String? name;
}

class PostRoster {
  const PostRoster({required this.postKey, required this.candidates});

  final String postKey;
  final List<RosterCandidate> candidates;
}

class CountCandidate {
  const CountCandidate({required this.nominationId, required this.memberId, required this.votes, required this.name});

  final int nominationId;
  final int memberId;
  final int votes;
  final String? name;
}

class PostCounts {
  const PostCounts({required this.postKey, required this.candidates, required this.votesTotal});

  final String postKey;
  final List<CountCandidate> candidates;
  final int votesTotal;

  int get topVotes => candidates.fold(0, (m, c) => c.votes > m ? c.votes : m);
}

/// The signed-in member's view of one election (GET /elections/{id}/me).
class MyElection {
  const MyElection({
    required this.election,
    required this.today,
    required this.eligible,
    required this.fromSnapshot,
    required this.myNominations,
    required this.votedPosts,
    required this.roster,
    required this.results,
  });

  final Election election;
  final String today;
  final bool eligible;
  final bool fromSnapshot;
  final List<MyNomination> myNominations;
  final List<String> votedPosts;
  final List<PostRoster>? roster;
  final List<PostCounts>? results;

  static String _day(String s) => s.length >= 10 ? s.substring(0, 10) : s;

  static bool _within(String start, String end, String today) {
    if (start.isEmpty || end.isEmpty || today.isEmpty) return false;
    return _day(start).compareTo(_day(today)) <= 0 && _day(today).compareTo(_day(end)) <= 0;
  }

  bool get nominationsOpen =>
      election.status == 'nominations_open' &&
      eligible &&
      _within(election.nominationStart, election.nominationEnd, today);

  bool get votingOpen =>
      election.status == 'voting' && eligible && _within(election.votingStart, election.votingEnd, today);

  bool hasVoted(String postKey) => votedPosts.contains(postKey);
  bool hasNominated(String postKey) => myNominations.any((n) => n.postKey == postKey);
}

/// Elections page data: visible elections, the selected one and the posts.
class ElectionsData {
  const ElectionsData({required this.elections, required this.selected, required this.posts});

  final List<Election> elections;
  final MyElection? selected;
  final List<CouncilPost> posts;
}

class Petition {
  const Petition({
    required this.id,
    required this.petitionNo,
    required this.title,
    required this.justification,
    required this.signatureCount,
    required this.requiredCount,
    required this.status,
    required this.responseDue,
    required this.sla,
    required this.committeeResponse,
  });

  final int id;
  final String petitionNo;
  final String title;
  final String justification;
  final int signatureCount;
  final int requiredCount;
  final String status;
  final String? responseDue;
  final SlaInfo? sla;
  final String? committeeResponse;

  int get progressPercent {
    if (requiredCount <= 0) return signatureCount > 0 ? 100 : 0;
    final p = (signatureCount * 100 / requiredCount).round();
    return p > 100 ? 100 : p;
  }
}

/// Petitions page data. [signed] are petitions signed by id in this session.
class PetitionsData {
  const PetitionsData({required this.mine, required this.signed, required this.responseDays});

  final List<Petition> mine;
  final List<Petition> signed;
  final int? responseDays;

  PetitionsData withSigned(Petition p) =>
      PetitionsData(mine: mine, signed: [p, ...signed.where((s) => s.id != p.id)], responseDays: responseDays);
}

class WelfareRequest {
  const WelfareRequest({
    required this.id,
    required this.requestNo,
    required this.requestType,
    required this.amountRequested,
    required this.reason,
    required this.status,
    required this.approvedAmount,
    required this.committeeReason,
  });

  final int id;
  final String requestNo;
  final String requestType;
  final num amountRequested;
  final String reason;
  final String status;
  final num? approvedAmount;
  final String? committeeReason;
}

class ConstitutionVersion {
  const ConstitutionVersion({
    required this.id,
    required this.versionNo,
    required this.fullText,
    required this.changesSummary,
    required this.isCurrent,
  });

  final int id;
  final int versionNo;
  final String fullText;
  final String? changesSummary;
  final bool isCurrent;
}

class AmendmentProposal {
  const AmendmentProposal({
    required this.id,
    required this.proposalNo,
    required this.title,
    required this.rationale,
    required this.proposedText,
    required this.status,
    required this.isDissolution,
    required this.adoptedVersionNo,
    required this.decisionNote,
  });

  final int id;
  final String proposalNo;
  final String title;
  final String rationale;
  final String proposedText;
  final String status;
  final bool isDissolution;
  final int? adoptedVersionNo;
  final String? decisionNote;

  bool get canWithdraw => status == 'submitted' || status == 'scheduled';
}

class AmendmentsData {
  const AmendmentsData({required this.proposals, required this.versions});

  final List<AmendmentProposal> proposals;
  final List<ConstitutionVersion> versions;

  int get currentVersionNo => versions.where((v) => v.isCurrent).map((v) => v.versionNo).firstOrNull ?? 1;
}
