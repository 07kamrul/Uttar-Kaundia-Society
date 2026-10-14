/// GET /admin/today: counts of work waiting, one section per permission. A
/// section is null when the caller lacks its permission (the card is hidden).
class TodaySummary {
  const TodaySummary({
    this.asOf,
    this.applications,
    this.needsDag,
    this.paymentVerifications,
    this.complaints,
    this.propertyRequests,
    this.boundaries,
    this.committeeTerms,
    this.phoneFixes,
  });

  factory TodaySummary.fromJson(Map<dynamic, dynamic> json) => TodaySummary(
        asOf: DateTime.tryParse('${json['as_of'] ?? ''}'),
        applications: _section(json['applications'], TodayApplications.fromJson),
        needsDag: _int(json['needs_dag']),
        paymentVerifications:
            _section(json['payment_verifications'], TodayPayments.fromJson),
        complaints: _section(json['complaints'], TodayComplaints.fromJson),
        propertyRequests: _nested(json['property_requests'], 'pending'),
        boundaries: _nested(json['boundaries'], 'pending'),
        committeeTerms:
            _section(json['committee_terms'], TodayCommitteeTerms.fromJson),
        phoneFixes: _nested(json['phone_fixes'], 'open'),
      );

  final DateTime? asOf;
  final TodayApplications? applications;
  final int? needsDag;
  final TodayPayments? paymentVerifications;
  final TodayComplaints? complaints;
  final int? propertyRequests;
  final int? boundaries;
  final TodayCommitteeTerms? committeeTerms;
  final int? phoneFixes;

  /// Nothing waiting in any section the caller can see.
  bool get isEmpty =>
      (applications?.total ?? 0) == 0 &&
      (needsDag ?? 0) == 0 &&
      (paymentVerifications?.total ?? 0) == 0 &&
      (complaints?.open ?? 0) == 0 &&
      (propertyRequests ?? 0) == 0 &&
      (boundaries ?? 0) == 0 &&
      (committeeTerms?.expiringSoon ?? 0) == 0 &&
      (committeeTerms?.expired ?? 0) == 0 &&
      (phoneFixes ?? 0) == 0;
}

class TodayApplications {
  const TodayApplications(
      {this.registrationsPending, this.membershipApplicationsOpen, this.total = 0});

  factory TodayApplications.fromJson(Map<dynamic, dynamic> j) =>
      TodayApplications(
        registrationsPending: _int(j['registrations_pending']),
        membershipApplicationsOpen: _int(j['membership_applications_open']),
        total: _int(j['total']) ?? 0,
      );

  final int? registrationsPending;
  final int? membershipApplicationsOpen;
  final int total;
}

class TodayPayments {
  const TodayPayments({this.installment = 0, this.costShare = 0, this.total = 0});

  factory TodayPayments.fromJson(Map<dynamic, dynamic> j) => TodayPayments(
        installment: _int(j['installment']) ?? 0,
        costShare: _int(j['cost_share']) ?? 0,
        total: _int(j['total']) ?? 0,
      );

  final int installment;
  final int costShare;
  final int total;
}

class TodayComplaints {
  const TodayComplaints({this.open = 0, this.dueSoon = 0, this.overdue = 0});

  factory TodayComplaints.fromJson(Map<dynamic, dynamic> j) => TodayComplaints(
        open: _int(j['open']) ?? 0,
        dueSoon: _int(j['due_soon']) ?? 0,
        overdue: _int(j['overdue']) ?? 0,
      );

  final int open;
  final int dueSoon;
  final int overdue;
}

class TodayCommitteeTerms {
  const TodayCommitteeTerms(
      {this.expiringSoon = 0, this.expired = 0, this.windowDays = 60});

  factory TodayCommitteeTerms.fromJson(Map<dynamic, dynamic> j) =>
      TodayCommitteeTerms(
        expiringSoon: _int(j['expiring_soon']) ?? 0,
        expired: _int(j['expired']) ?? 0,
        windowDays: _int(j['window_days']) ?? 60,
      );

  final int expiringSoon;
  final int expired;
  final int windowDays;
}

int? _int(Object? v) => v is num ? v.toInt() : int.tryParse('${v ?? ''}');

T? _section<T>(Object? raw, T Function(Map<dynamic, dynamic>) parse) =>
    raw is Map ? parse(raw) : null;

int? _nested(Object? raw, String key) => raw is Map ? _int(raw[key]) ?? 0 : null;
