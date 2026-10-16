import 'package:dio/dio.dart';

import '../../../core/network/api_client.dart';
import '../domain/committee_registry_entities.dart';
import '../domain/fund_controls_entities.dart';
import 'registers_json.dart';

/// Fund controls & audit (admin). Mirrors Angular fund-controls.service.ts.
class FundControlsRepository {
  FundControlsRepository({required ApiClient apiClient}) : _api = apiClient;

  final ApiClient _api;
  static const _base = '/admin/fund-controls';

  // Settings ---------------------------------------------------------------
  Future<FundSettings> settings() async => _settings(jsonMap(await _api.getUri('$_base/settings')));

  Future<FundSettings> updateThreshold(num threshold) async => _settings(
      jsonMap(await _api.put('$_base/settings', {'expense_two_person_threshold': threshold})));

  // Signatories ------------------------------------------------------------
  Future<List<BankSignatory>> signatories() async {
    final data = await _api.getUri('$_base/signatories', query: {'include_inactive': 'true'});
    return [for (final r in jsonList(data)) _signatory(jsonMap(r))];
  }

  Future<BankSignatory> createSignatory(SignatoryInput input) async {
    final data = await _api.post('$_base/signatories', {
      'member_id': input.memberId,
      'committee_term_id': input.committeeTermId,
      ..._signatoryCommon(input),
      'account_number_last4': input.accountNumberLast4,
    });
    return _signatory(jsonMap(data));
  }

  /// Omits `account_number_last4` unless new digits were typed.
  Future<BankSignatory> updateSignatory(int id, SignatoryInput input) async {
    final last4 = blankToNull(input.accountNumberLast4);
    final data = await _api.patch('$_base/signatories/$id', {
      if (input.memberId != null) 'member_id': input.memberId,
      'committee_term_id': input.committeeTermId,
      ..._signatoryCommon(input),
      if (last4 != null) 'account_number_last4': last4,
    });
    return _signatory(jsonMap(data));
  }

  Future<void> deactivateSignatory(int id, String reason) =>
      deleteWithReason(_api, '$_base/signatories/$id', reason);

  Future<List<int>> bankLetter() => _api.downloadBytes('$_base/signatories/bank-letter.pdf');

  // Audit ------------------------------------------------------------------
  Future<List<AuditReport>> auditReports() async =>
      [for (final r in jsonList(await _api.getUri('$_base/audit-reports'))) _report(jsonMap(r))];

  Future<AuditReminder> auditReminder() async {
    final m = jsonMap(await _api.getUri('$_base/audit-reminder'));
    return AuditReminder(
      fiscalYear: jsonStr(m['fiscal_year']),
      currentFyReportExists: m['current_fy_report_exists'] == true,
      reminderWindowActive: m['reminder_window_active'] == true,
    );
  }

  Future<AuditReport> uploadAuditReport({
    required MultipartFile file,
    required String fiscalYear,
    required String reportDate,
    String? summaryText,
  }) async {
    final summary = blankToNull(summaryText);
    final form = FormData.fromMap({
      'file': file,
      'fiscal_year': fiscalYear,
      'report_date': reportDate,
      if (summary != null) 'summary_text': summary,
    });
    return _report(jsonMap(await _api.postMultipart('$_base/audit-reports', form)));
  }

  Future<AuditReport> updateAuditSummary(int id, String summaryText) async => _report(jsonMap(
      await _api.patch('$_base/audit-reports/$id/summary', {'summary_text': summaryText})));

  Future<AuditReport> publishAuditReport(int id) async =>
      _report(jsonMap(await _api.post('$_base/audit-reports/$id/publish', <String, dynamic>{})));

  Future<List<int>> auditFile(int id) => _api.downloadBytes('$_base/audit-reports/$id/file');

  // Welfare fund -----------------------------------------------------------
  Future<List<WelfareFundRequest>> welfareRequests({String? status}) async {
    final data = await _api.getUri('$_base/welfare-requests', query: {if (status != null) 'status': status});
    return [for (final r in jsonList(data)) _welfare(jsonMap(r))];
  }

  Future<WelfareFundRequest> startWelfareReview(int id) async =>
      _welfare(jsonMap(await _api.post('$_base/welfare-requests/$id/start-review', <String, dynamic>{})));

  Future<WelfareFundRequest> decideWelfare(
    int id, {
    required String decision,
    required String committeeReason,
    num? approvedAmount,
  }) async =>
      _welfare(jsonMap(await _api.post('$_base/welfare-requests/$id/decide', {
        'decision': decision,
        'committee_reason': committeeReason,
        'approved_amount': approvedAmount,
      })));

  Future<WelfareFundRequest> disburseWelfare(int id, {int? transactionId}) async => _welfare(
      jsonMap(await _api.post('$_base/welfare-requests/$id/disburse', {'transaction_id': transactionId})));

  Future<List<MemberOption>> approvedMembers() => fetchApprovedMembers(_api);

  // Mapping ----------------------------------------------------------------
  static Map<String, dynamic> _signatoryCommon(SignatoryInput i) => {
        'bank_name': i.bankName,
        'branch': i.branch,
        'account_name': i.accountName,
        'authority_scope': blankToNull(i.authorityScope),
        'valid_from': i.validFrom,
        'valid_to': blankToNull(i.validTo),
      };

  static FundSettings _settings(Map<dynamic, dynamic> m) => FundSettings(
        expenseTwoPersonThreshold: jsonNum(m['expense_two_person_threshold']),
        thresholdIsDefault: m['threshold_is_default'] == true,
        incomeSources: [
          for (final raw in jsonList(m['income_sources']))
            IncomeSource(
              key: jsonStr(jsonMap(raw)['key']),
              bn: jsonStr(jsonMap(raw)['bn']),
              en: jsonStr(jsonMap(raw)['en']),
              requiresJustification: jsonMap(raw)['requires_justification'] == true,
            ),
        ],
      );

  static BankSignatory _signatory(Map<dynamic, dynamic> m) => BankSignatory(
        id: jsonInt(m['id']),
        memberId: jsonInt(m['member_id']),
        memberName: jsonStrN(m['member_name']),
        memberDisplayId: jsonStrN(m['member_display_id']),
        committeeTermId: jsonIntN(m['committee_term_id']),
        committeePostBn: jsonStrN(m['committee_post_bn']),
        bankName: jsonStr(m['bank_name']),
        branch: jsonStr(m['branch']),
        accountName: jsonStr(m['account_name']),
        accountNumberMasked: jsonStr(m['account_number_masked']),
        authorityScope: jsonStrN(m['authority_scope']),
        validFrom: jsonStr(m['valid_from']),
        validTo: jsonStrN(m['valid_to']),
        isActive: m['is_active'] == true,
      );

  static AuditReport _report(Map<dynamic, dynamic> m) => AuditReport(
        id: jsonInt(m['id']),
        fiscalYear: jsonStr(m['fiscal_year']),
        reportDate: jsonStr(m['report_date']),
        summaryText: jsonStrN(m['summary_text']),
        hasFile: m['has_file'] == true,
        originalName: jsonStrN(m['original_name']),
        publishedNoticeId: jsonIntN(m['published_notice_id']),
        publishedAt: jsonStrN(m['published_at']),
      );

  static WelfareFundRequest _welfare(Map<dynamic, dynamic> m) => WelfareFundRequest(
        id: jsonInt(m['id']),
        requestNo: jsonStr(m['request_no']),
        memberId: jsonInt(m['member_id']),
        memberName: jsonStrN(m['member_name']),
        requestType: jsonStr(m['request_type']),
        amountRequested: jsonNum(m['amount_requested']),
        reason: jsonStr(m['reason']),
        status: jsonStr(m['status']),
        committeeReason: jsonStrN(m['committee_reason']),
        approvedAmount: jsonNumN(m['approved_amount']),
      );
}
