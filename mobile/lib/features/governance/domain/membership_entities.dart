/// Membership governance entities (modules 1 & 5): applications, appeals, fee
/// waivers, suspension/termination actions, data corrections and arrears.
/// Plain immutable data; parsing lives in the repository.
library;

import 'governance_entities.dart';

class MembershipEvent {
  const MembershipEvent({required this.event, required this.at, this.actor, this.note});

  final String event;
  final String at;
  final String? actor;
  final String? note;
}

class MembershipApplication {
  const MembershipApplication({
    required this.id,
    required this.applicationNo,
    required this.fullName,
    required this.fatherName,
    required this.motherName,
    required this.mobile,
    required this.email,
    required this.ownershipType,
    required this.address,
    required this.status,
    required this.rejectionReason,
    required this.submittedAt,
    required this.sla,
    required this.timeline,
  });

  final int id;
  final String applicationNo;
  final String fullName;
  final String fatherName;
  final String motherName;
  final String mobile;
  final String email;
  final String ownershipType;

  /// House, post office, upazila, district and division joined with spaces.
  final String address;

  /// `received`, `under_review`, `approved` or `rejected`.
  final String status;
  final String? rejectionReason;
  final String submittedAt;
  final SlaInfo sla;
  final List<MembershipEvent> timeline;

  bool get isOpen => status == 'received' || status == 'under_review';
}

class MembershipAppeal {
  const MembershipAppeal({
    required this.id,
    required this.applicationId,
    required this.actionId,
    required this.grounds,
    required this.filedAt,
    required this.windowExpiresAt,
    required this.reviewerName,
    required this.status,
    required this.decision,
  });

  final int id;
  final int? applicationId;
  final int? actionId;
  final String grounds;
  final String filedAt;
  final String windowExpiresAt;
  final String? reviewerName;

  /// `submitted`, `under_review`, `upheld` or `overturned`.
  final String status;
  final String? decision;

  bool get isOpen => status == 'submitted' || status == 'under_review';
}

class FeeWaiver {
  const FeeWaiver({
    required this.id,
    required this.memberId,
    required this.memberName,
    required this.type,
    required this.reason,
    required this.months,
    required this.status,
    required this.decisionNote,
    required this.decidedAt,
  });

  final int id;
  final int memberId;
  final String? memberName;

  /// `waiver` or `installment`.
  final String type;
  final String reason;
  final int? months;

  /// `pending`, `approved` or `rejected`.
  final String status;
  final String? decisionNote;
  final String? decidedAt;
}

class MembershipAction {
  const MembershipAction({
    required this.id,
    required this.memberId,
    required this.memberName,
    required this.type,
    required this.reason,
    required this.responseDeadline,
    required this.status,
    required this.decision,
  });

  final int id;
  final int memberId;
  final String? memberName;

  /// `suspend`/`suspension` or `terminate`/`termination`.
  final String type;
  final String reason;
  final String? responseDeadline;

  /// `draft`, `noticed`, `awaiting_response`, `decided` or `cancelled`.
  final String status;
  final String? decision;

  bool get awaitsResponse => status == 'noticed' || status == 'awaiting_response';
}

class DataCorrection {
  const DataCorrection({
    required this.id,
    required this.memberId,
    required this.memberName,
    required this.field,
    required this.requestedValue,
    required this.reason,
    required this.status,
    required this.handledAt,
  });

  final int id;
  final int memberId;
  final String? memberName;
  final String field;
  final String requestedValue;
  final String reason;

  /// `pending`, `applied` or `rejected`.
  final String status;
  final String? handledAt;
}

class ArrearItem {
  const ArrearItem({
    required this.memberId,
    required this.fullName,
    required this.monthsExpected,
    required this.expectedAmount,
    required this.paidAmount,
    required this.arrearsAmount,
    required this.inArrears,
  });

  final int memberId;
  final String fullName;
  final int monthsExpected;
  final num expectedAmount;
  final num paidAmount;
  final num arrearsAmount;
  final bool inArrears;
}

/// Member `/membership` page data. The applications list is required; the
/// other lists fall back to empty when their request fails (as in Angular).
class MembershipData {
  const MembershipData({
    required this.applications,
    required this.appeals,
    required this.waivers,
    required this.actions,
  });

  final List<MembershipApplication> applications;
  final List<MembershipAppeal> appeals;
  final List<FeeWaiver> waivers;
  final List<MembershipAction> actions;

  /// Decisions a member can appeal: rejected applications and decided actions.
  List<MembershipApplication> get appealableApplications =>
      applications.where((a) => a.status == 'rejected').toList(growable: false);
  List<MembershipAction> get appealableActions =>
      actions.where((a) => a.status == 'decided').toList(growable: false);
}

/// Management `/membership-governance` page data. Each list is null when its
/// request failed, so only that tab shows the retry box.
class MembershipGovernanceData {
  const MembershipGovernanceData({
    required this.waivers,
    required this.actions,
    required this.appeals,
    required this.corrections,
    required this.arrears,
  });

  final List<FeeWaiver>? waivers;
  final List<MembershipAction>? actions;
  final List<MembershipAppeal>? appeals;
  final List<DataCorrection>? corrections;
  final List<ArrearItem>? arrears;
}

/// Input for a new membership application (keys match the Angular payload).
class MembershipApplicationInput {
  const MembershipApplicationInput({
    required this.fullName,
    required this.fatherName,
    required this.motherName,
    required this.mobile,
    required this.email,
    required this.ownershipType,
    required this.addressHouse,
    required this.consent,
  });

  final String fullName;
  final String fatherName;
  final String motherName;
  final String mobile;
  final String email;
  final String ownershipType;
  final String addressHouse;
  final bool consent;

  Map<String, dynamic> toJson() => {
        'fullName': fullName,
        'fatherName': fatherName,
        'motherName': motherName,
        'mobile': mobile,
        'email': email,
        'ownershipType': ownershipType,
        'addressHouse': addressHouse,
        'consent': consent,
      };
}
