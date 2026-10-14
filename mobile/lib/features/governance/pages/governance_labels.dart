import '../../../l10n/app_localizations.dart';

/// Plain-Bangla labels for the status codes the governance endpoints return.
/// An unknown code gets a neutral label, never the raw code.

String complaintStatusLabel(AppLocalizations l, String s) => switch (s) {
      'submitted' => l.govComplaintStatus_submitted,
      'acknowledged' => l.govComplaintStatus_acknowledged,
      'investigating' => l.govComplaintStatus_investigating,
      'resolved' => l.govComplaintStatus_resolved,
      'rejected' => l.govComplaintStatus_rejected,
      'closed' => l.govComplaintStatus_closed,
      _ => l.govComplaintStatusOther,
    };

String complaintEventLabel(AppLocalizations l, String e) => switch (e) {
      'complaint.submitted' || 'submitted' => l.govComplaintEvent_submitted,
      'complaint.acknowledged' || 'acknowledged' => l.govComplaintEvent_acknowledged,
      'complaint.assigned' => l.govComplaintEvent_assigned,
      'complaint.updated' || 'first_update' => l.govComplaintEvent_updated,
      'complaint.resolved' || 'resolved' => l.govComplaintEvent_resolved,
      'complaint.closed' || 'closed' => l.govComplaintEvent_closed,
      'complaint.rejected' => l.govComplaintEvent_rejected,
      _ => l.govComplaintEventOther,
    };

String slaLabel(AppLocalizations l, String s) => switch (s) {
      'met' => l.govSla_met,
      'on_track' => l.govSla_on_track,
      'due_soon' => l.govSla_due_soon,
      'overdue' => l.govSla_overdue,
      _ => l.govComplaintStatusOther,
    };

String electionStatusLabel(AppLocalizations l, String s) => switch (s) {
      'nominations_open' => l.govElectionStatus_nominations_open,
      'nominations_closed' => l.govElectionStatus_nominations_closed,
      'voting' => l.govElectionStatus_voting,
      'tabulated' => l.govElectionStatus_tabulated,
      'confirmed' => l.govElectionStatus_confirmed,
      _ => l.govElectionStatusOther,
    };

String nominationLabel(AppLocalizations l, String s) => switch (s) {
      'pending' => l.govNomination_pending,
      'approved' => l.govNomination_approved,
      'rejected' => l.govNomination_rejected,
      _ => l.govElectionStatusOther,
    };

String petitionStatusLabel(AppLocalizations l, String s) => switch (s) {
      'submitted' => l.govPetitionStatus_submitted,
      'under_review' => l.govPetitionStatus_under_review,
      'responded' => l.govPetitionStatus_responded,
      'scheduled' => l.govPetitionStatus_scheduled,
      'rejected' => l.govPetitionStatus_rejected,
      _ => l.govPetitionStatusOther,
    };

String welfareTypeLabel(AppLocalizations l, String s) => switch (s) {
      'medical' => l.govWelfareType_medical,
      'emergency' => l.govWelfareType_emergency,
      'education' => l.govWelfareType_education,
      'other' => l.govWelfareType_other,
      _ => l.govWelfareType_other,
    };

String welfareStatusLabel(AppLocalizations l, String s) => switch (s) {
      'submitted' => l.govWelfareStatus_submitted,
      'under_review' => l.govWelfareStatus_under_review,
      'approved' => l.govWelfareStatus_approved,
      'rejected' => l.govWelfareStatus_rejected,
      'disbursed' => l.govWelfareStatus_disbursed,
      _ => l.govWelfareStatusOther,
    };

String amendStatusLabel(AppLocalizations l, String s) => switch (s) {
      'draft' => l.govAmendStatus_draft,
      'submitted' => l.govAmendStatus_submitted,
      'scheduled' => l.govAmendStatus_scheduled,
      'adopted' => l.govAmendStatus_adopted,
      'rejected' => l.govAmendStatus_rejected,
      'withdrawn' => l.govAmendStatus_withdrawn,
      _ => l.govAmendStatusOther,
    };

/// Tone of a status badge, shared by all pages.
enum GovTone { good, warn, bad, neutral }

GovTone complaintTone(String s) => switch (s) {
      'resolved' || 'closed' => GovTone.good,
      'rejected' => GovTone.bad,
      'acknowledged' || 'investigating' => GovTone.warn,
      _ => GovTone.neutral,
    };

GovTone slaTone(String s) => switch (s) {
      'met' => GovTone.good,
      'overdue' => GovTone.bad,
      'due_soon' => GovTone.warn,
      _ => GovTone.neutral,
    };
