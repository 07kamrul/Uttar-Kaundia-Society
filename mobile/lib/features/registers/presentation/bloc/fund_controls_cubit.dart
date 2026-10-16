import 'package:dio/dio.dart' show MultipartFile;

import '../../../governance/presentation/list_form_cubit.dart';
import '../../data/fund_controls_repository.dart';
import '../../domain/committee_registry_entities.dart';
import '../../domain/fund_controls_entities.dart';

/// Fund controls & audit (Angular fund-controls.component.ts). Each section
/// loads on its own and only when the user holds its permission
/// ([fundSectionPermissions]); a failed section shows its own retry while the
/// rest of the page stays usable.
class FundControlsCubit extends ListFormCubit<FundControlsData> {
  FundControlsCubit(this._repository, {required Set<String> permissions})
      : sections = visibleFundSections(permissions);

  final FundControlsRepository _repository;

  /// Tabs the user may see, in Angular order (income policy always first).
  final List<FundSection> sections;

  List<MemberOption>? _members;
  String _welfareStatus = '';

  /// '' means every status.
  String get welfareStatus => _welfareStatus;

  bool can(FundSection s) => sections.contains(s);

  @override
  Future<FundControlsData> fetch() async {
    final reminder = can(FundSection.audit) ? _soft(_repository.auditReminder) : Future<AuditReminder?>.value();
    final signatories = _section(FundSection.signatories, _repository.signatories);
    final reports = _section(FundSection.audit, _repository.auditReports);
    final welfare = _section(FundSection.welfare, _fetchWelfare);
    final settings = _section(FundSection.incomePolicy, _repository.settings);
    final cached = _members;
    final members = cached != null || !can(FundSection.signatories)
        ? Future.value(cached ?? const <MemberOption>[])
        : _soft(_repository.approvedMembers).then((m) => m ?? const <MemberOption>[]);
    final data = FundControlsData(
      settings: await settings,
      reminder: await reminder,
      signatories: await signatories,
      reports: await reports,
      welfare: await welfare,
      members: await members,
    );
    if (can(FundSection.signatories)) _members = data.members;
    return data;
  }

  Future<List<WelfareFundRequest>> _fetchWelfare() =>
      _repository.welfareRequests(status: _welfareStatus.isEmpty ? null : _welfareStatus);

  Future<SectionData<T>> _section<T>(FundSection s, Future<T> Function() fetch) async {
    if (!can(s)) return SectionData<T>.hidden();
    try {
      return SectionData<T>.loaded(await fetch());
    } on Exception {
      return SectionData<T>.failed();
    }
  }

  static Future<T?> _soft<T>(Future<T> Function() fetch) async {
    try {
      return await fetch();
    } on Exception {
      return null;
    }
  }

  /// Reloads only the welfare queue with the new status filter.
  Future<void> setWelfareStatus(String status) async {
    _welfareStatus = status;
    final welfare = await _section(FundSection.welfare, _fetchWelfare);
    final data = state.data;
    if (isClosed || data == null) return;
    emit(state.copyWith(
      data: FundControlsData(
        settings: data.settings,
        reminder: data.reminder,
        signatories: data.signatories,
        reports: data.reports,
        welfare: welfare,
        members: data.members,
      ),
    ));
  }

  // Threshold -----------------------------------------------------------------
  Future<bool> saveThreshold(num threshold) {
    if (threshold < 0) return Future.value(false);
    return run(() => _repository.updateThreshold(threshold));
  }

  // Signatories ---------------------------------------------------------------
  Future<bool> saveSignatory(SignatoryInput input, {BankSignatory? editing}) {
    if (editing == null && input.memberId == null) return Future.value(false);
    return run(() async {
      if (editing == null) {
        await _repository.createSignatory(input);
      } else {
        await _repository.updateSignatory(editing.id, input);
      }
    });
  }

  Future<bool> deactivateSignatory(BankSignatory row, String reason) {
    final trimmed = reason.trim();
    if (trimmed.isEmpty) return Future.value(false);
    return run(() => _repository.deactivateSignatory(row.id, trimmed));
  }

  Future<List<int>> bankLetter() => _repository.bankLetter();

  // Audit ---------------------------------------------------------------------
  Future<bool> uploadReport({
    required MultipartFile file,
    required String fiscalYear,
    required String reportDate,
    String? summary,
  }) {
    if (fiscalYear.trim().isEmpty || reportDate.isEmpty) return Future.value(false);
    return run(() => _repository.uploadAuditReport(
          file: file,
          fiscalYear: fiscalYear.trim(),
          reportDate: reportDate,
          summaryText: summary,
        ));
  }

  Future<bool> saveSummary(AuditReport report, String text) =>
      run(() => _repository.updateAuditSummary(report.id, text));

  Future<bool> publishReport(AuditReport report) => run(() => _repository.publishAuditReport(report.id));

  Future<List<int>> auditFile(AuditReport report) => _repository.auditFile(report.id);

  // Welfare -------------------------------------------------------------------
  Future<bool> startReview(WelfareFundRequest row) => run(() => _repository.startWelfareReview(row.id));

  /// [decision]: approved | rejected. A reason is always required and an
  /// approval needs a positive amount (Angular confirmDecide checks).
  Future<bool> decideWelfare(WelfareFundRequest row,
      {required String decision, required String reason, num? approvedAmount}) {
    final trimmed = reason.trim();
    if (trimmed.isEmpty) return Future.value(false);
    final approved = decision == 'approved';
    if (approved && (approvedAmount == null || approvedAmount <= 0)) return Future.value(false);
    return run(() => _repository.decideWelfare(
          row.id,
          decision: decision,
          committeeReason: trimmed,
          approvedAmount: approved ? approvedAmount : null,
        ));
  }

  Future<bool> disburse(WelfareFundRequest row) => run(() => _repository.disburseWelfare(row.id));
}
