/// Fund controls & audit (admin side). Mirrors Angular fund-controls.service.ts.
library;

import 'committee_registry_entities.dart' show MemberOption;

/// Fund-controls sections, in the Angular tab order. Each tab beyond the
/// income policy needs its own permission.
enum FundSection { incomePolicy, threshold, signatories, audit, welfare }

const fundSectionPermissions = <FundSection, String>{
  FundSection.threshold: 'fund.manage',
  FundSection.signatories: 'signatory.manage',
  FundSection.audit: 'audit_report.manage',
  FundSection.welfare: 'welfare_fund.review',
};

/// The tabs a user with [permissions] can see (income policy is always shown).
List<FundSection> visibleFundSections(Set<String> permissions) => [
      for (final s in FundSection.values)
        if (fundSectionPermissions[s] == null || permissions.contains(fundSectionPermissions[s])) s,
    ];

class IncomeSource {
  const IncomeSource({required this.key, required this.bn, required this.en, required this.requiresJustification});

  final String key;
  final String bn;
  final String en;
  final bool requiresJustification;
}

class FundSettings {
  const FundSettings({
    required this.expenseTwoPersonThreshold,
    required this.thresholdIsDefault,
    required this.incomeSources,
  });

  final num expenseTwoPersonThreshold;
  final bool thresholdIsDefault;
  final List<IncomeSource> incomeSources;
}

class BankSignatory {
  const BankSignatory({
    required this.id,
    required this.memberId,
    required this.bankName,
    required this.branch,
    required this.accountName,
    required this.accountNumberMasked,
    required this.validFrom,
    required this.isActive,
    this.memberName,
    this.memberDisplayId,
    this.committeeTermId,
    this.committeePostBn,
    this.authorityScope,
    this.validTo,
  });

  final int id;
  final int memberId;
  final String? memberName;
  final String? memberDisplayId;
  final int? committeeTermId;
  final String? committeePostBn;
  final String bankName;
  final String branch;
  final String accountName;

  /// Only the last 4 digits exist anywhere in the system.
  final String accountNumberMasked;
  final String? authorityScope;
  final String validFrom;
  final String? validTo;
  final bool isActive;
}

/// Create/update body for a signatory. On update a null [accountNumberLast4]
/// keeps the stored digits (the Angular form only sends typed digits).
class SignatoryInput {
  const SignatoryInput({
    required this.bankName,
    required this.branch,
    required this.accountName,
    required this.validFrom,
    this.memberId,
    this.accountNumberLast4,
    this.authorityScope,
    this.committeeTermId,
    this.validTo,
  });

  final int? memberId;
  final String bankName;
  final String branch;
  final String accountName;
  final String? accountNumberLast4;
  final String? authorityScope;
  final int? committeeTermId;
  final String validFrom;
  final String? validTo;
}

class AuditReport {
  const AuditReport({
    required this.id,
    required this.fiscalYear,
    required this.reportDate,
    required this.hasFile,
    this.summaryText,
    this.originalName,
    this.publishedNoticeId,
    this.publishedAt,
  });

  final int id;
  final String fiscalYear;
  final String reportDate;
  final String? summaryText;
  final bool hasFile;
  final String? originalName;
  final int? publishedNoticeId;
  final String? publishedAt;

  bool get isPublished => publishedNoticeId != null;
}

class AuditReminder {
  const AuditReminder({
    required this.fiscalYear,
    required this.currentFyReportExists,
    required this.reminderWindowActive,
  });

  final String fiscalYear;
  final bool currentFyReportExists;
  final bool reminderWindowActive;
}

/// [status]: submitted | under_review | approved | rejected | disbursed.
class WelfareFundRequest {
  const WelfareFundRequest({
    required this.id,
    required this.requestNo,
    required this.memberId,
    required this.requestType,
    required this.amountRequested,
    required this.reason,
    required this.status,
    this.memberName,
    this.committeeReason,
    this.approvedAmount,
  });

  final int id;
  final String requestNo;
  final int memberId;
  final String? memberName;
  final String requestType;
  final num amountRequested;
  final String reason;
  final String status;
  final String? committeeReason;
  final num? approvedAmount;
}

const welfareRequestStatuses = ['submitted', 'under_review', 'approved', 'rejected', 'disbursed'];

/// Sentinel for a section the user may not see or that failed to load.
class SectionData<T> {
  const SectionData.loaded(T this.value) : failed = false;
  const SectionData.failed()
      : value = null,
        failed = true;
  const SectionData.hidden()
      : value = null,
        failed = false;

  final T? value;
  final bool failed;
}

/// Everything the fund-controls page shows; each section loads on its own so
/// one failure keeps the rest visible (Angular per-section retry).
class FundControlsData {
  const FundControlsData({
    required this.settings,
    required this.reminder,
    required this.signatories,
    required this.reports,
    required this.welfare,
    required this.members,
  });

  final SectionData<FundSettings> settings;
  final AuditReminder? reminder;
  final SectionData<List<BankSignatory>> signatories;
  final SectionData<List<AuditReport>> reports;
  final SectionData<List<WelfareFundRequest>> welfare;
  final List<MemberOption> members;
}
