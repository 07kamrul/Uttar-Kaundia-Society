import 'package:dio/dio.dart' show MultipartFile;
import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';

import '../../../shared/widgets/widgets.dart';
import '../../governance/pages/governance_labels.dart' show GovTone;
import '../../governance/pages/governance_widgets.dart' show GovBadge, GovCard, GovField;
import '../domain/fund_controls_entities.dart';
import '../presentation/bloc/fund_controls_cubit.dart';
import '../presentation/fund_strings.dart';
import 'register_widgets.dart';

/// A file chosen for the audit upload.
class PickedAuditFile {
  const PickedAuditFile({required this.file, required this.name});

  final MultipartFile file;
  final String name;
}

typedef AuditFilePicker = Future<PickedAuditFile?> Function();

/// PDF or image picker for the audit report (Angular `accept` list).
Future<PickedAuditFile?> pickAuditFile() async {
  final result = await FilePicker.platform.pickFiles(
    type: FileType.custom,
    allowedExtensions: const ['pdf', 'jpg', 'jpeg', 'png'],
    withData: true,
  );
  final picked = result?.files.singleOrNull;
  final bytes = picked?.bytes;
  if (picked == null || bytes == null) return null;
  return PickedAuditFile(file: MultipartFile.fromBytes(bytes, filename: picked.name), name: picked.name);
}

/// Annual audit: upload a report, edit its summary, publish it to members and
/// download the stored file.
class AuditSection extends StatelessWidget {
  const AuditSection({super.key, required this.reports, required this.openFile, required this.pickFile});

  final List<AuditReport> reports;
  final FileOpener openFile;
  final AuditFilePicker pickFile;

  @override
  Widget build(BuildContext context) {
    final s = FundStrings.of(context);
    return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      _UploadForm(pickFile: pickFile),
      SectionTitle(s.auListTitle),
      if (reports.isEmpty)
        EmptyState(message: s.auEmpty, icon: Icons.description_outlined)
      else
        for (final r in reports) _ReportCard(key: ValueKey('report_${r.id}'), report: r, openFile: openFile),
    ]);
  }
}

class _UploadForm extends StatefulWidget {
  const _UploadForm({required this.pickFile});

  final AuditFilePicker pickFile;

  @override
  State<_UploadForm> createState() => _UploadFormState();
}

class _UploadFormState extends State<_UploadForm> {
  final _form = GlobalKey<FormState>();
  final _fy = TextEditingController();
  final _summary = TextEditingController();
  String _date = '';
  PickedAuditFile? _file;

  @override
  void dispose() {
    _fy.dispose();
    _summary.dispose();
    super.dispose();
  }

  Future<void> _pick() async {
    final picked = await widget.pickFile();
    if (picked != null && mounted) setState(() => _file = picked);
  }

  Future<void> _upload() async {
    final file = _file;
    if (!(_form.currentState?.validate() ?? false) || file == null) return;
    final ok = await context.read<FundControlsCubit>().uploadReport(
          file: file.file,
          fiscalYear: _fy.text,
          reportDate: _date,
          summary: _summary.text,
        );
    if (!ok || !mounted) return;
    _summary.clear();
    setState(() => _file = null);
  }

  @override
  Widget build(BuildContext context) {
    final s = FundStrings.of(context);
    final busy = context.select<FundControlsCubit, bool>((c) => c.state.busy);
    return GovCard(title: s.auUploadTitle, icon: Icons.upload_file_outlined, children: [
      Form(
        key: _form,
        child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          GovField(key: const Key('auditFy'), controller: _fy, label: s.auFiscalYear),
          RegDateField(label: s.auReportDate, value: _date, onChanged: (v) => setState(() => _date = v)),
          Padding(
            padding: const EdgeInsets.only(bottom: 12),
            child: Row(children: [
              AppButton(
                key: const Key('auditPick'),
                label: s.auPickFile,
                icon: Icons.attach_file,
                variant: AppButtonVariant.secondary,
                onPressed: _pick,
              ),
              const SizedBox(width: 8),
              Expanded(child: Text(_file?.name ?? s.auFile, overflow: TextOverflow.ellipsis)),
            ]),
          ),
          GovField(controller: _summary, label: s.auSummary, required: false, lines: 3),
          AppButton(
            key: const Key('auditUpload'),
            label: s.auUpload,
            icon: Icons.cloud_upload_outlined,
            loading: busy,
            onPressed: _file == null ? null : _upload,
          ),
        ]),
      ),
    ]);
  }
}

class _ReportCard extends StatefulWidget {
  const _ReportCard({super.key, required this.report, required this.openFile});

  final AuditReport report;
  final FileOpener openFile;

  @override
  State<_ReportCard> createState() => _ReportCardState();
}

class _ReportCardState extends State<_ReportCard> {
  TextEditingController? _editing;

  @override
  void dispose() {
    _editing?.dispose();
    super.dispose();
  }

  void _startEdit() => setState(() => _editing = TextEditingController(text: widget.report.summaryText ?? ''));

  void _cancelEdit() {
    final controller = _editing;
    setState(() => _editing = null);
    controller?.dispose();
  }

  Future<void> _saveSummary() async {
    final controller = _editing;
    if (controller == null) return;
    final ok = await context.read<FundControlsCubit>().saveSummary(widget.report, controller.text);
    if (ok && mounted) {
      setState(() => _editing = null);
      controller.dispose();
    }
  }

  @override
  Widget build(BuildContext context) {
    final s = FundStrings.of(context);
    final cubit = context.read<FundControlsCubit>();
    final r = widget.report;
    final editing = _editing;
    return AppCard(
      title: s.auFyLabel(r.fiscalYear),
      trailing: GovBadge(r.isPublished ? GovTone.good : GovTone.neutral, r.isPublished ? s.auPublished : s.auUnpublished),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Text(regDate(context, r.reportDate), style: Theme.of(context).textTheme.bodySmall),
        const SizedBox(height: 6),
        if (editing == null)
          Text((r.summaryText ?? '').isEmpty ? s.auNoSummary : r.summaryText!)
        else ...[
          GovField(key: Key('summaryEdit_${r.id}'), controller: editing, label: s.auSummary, required: false, lines: 3),
          Wrap(spacing: 8, children: [
            AppButton(key: Key('summarySave_${r.id}'), label: s.save, onPressed: _saveSummary),
            AppButton(
              label: s.cancel,
              variant: AppButtonVariant.ghost,
              onPressed: _cancelEdit,
            ),
          ]),
        ],
        const SizedBox(height: 8),
        Wrap(spacing: 8, runSpacing: 8, children: [
          if (editing == null)
            AppButton(
              key: Key('summaryEditStart_${r.id}'),
              label: s.auEditSummary,
              icon: Icons.edit_outlined,
              variant: AppButtonVariant.secondary,
              onPressed: _startEdit,
            ),
          if (r.hasFile)
            AppButton(
              key: Key('auditDownload_${r.id}'),
              label: s.auDownload,
              icon: Icons.download_outlined,
              variant: AppButtonVariant.secondary,
              onPressed: () => downloadWith(context,
                  fetch: () => cubit.auditFile(r), fileName: 'audit-report-${r.fiscalYear}.pdf', open: widget.openFile),
            ),
          if (!r.isPublished)
            AppButton(
              key: Key('auditPublish_${r.id}'),
              label: s.auPublish,
              icon: Icons.campaign_outlined,
              onPressed: () => cubit.publishReport(r),
            ),
        ]),
      ]),
    );
  }
}
