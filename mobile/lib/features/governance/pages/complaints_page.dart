import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:go_router/go_router.dart';

import '../../../core/di/injector.dart';
import '../../../l10n/app_localizations.dart';
import '../../../shared/widgets/widgets.dart';
import '../../member/presentation/widgets/member_ui.dart';
import '../data/governance_repository.dart';
import '../domain/governance_entities.dart';
import '../presentation/governance_cubits.dart';
import '../presentation/governance_errors.dart';
import '../presentation/list_form_cubit.dart';
import 'governance_labels.dart';
import 'governance_widgets.dart';

/// Complaints: the member's complaints (expandable, with timeline and SLA),
/// a new-complaint form, and links to the land-protection form and help desk.
class ComplaintsPage extends StatelessWidget {
  const ComplaintsPage({super.key, this.repository, this.can});

  final GovernanceRepository? repository;

  /// Defaults to the signed-in session; overridable for tests.
  final bool Function(String)? can;

  bool _allowed(String permission) {
    final check = can ?? (sl.isRegistered<SessionManager>() ? sl<SessionManager>().session?.can : null);
    return check?.call(permission) ?? false;
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    return BlocProvider(
      create: (_) => ComplaintsCubit(governanceRepo(repository))..load(),
      child: GovPage<ComplaintsCubit, ComplaintsData>(
        title: l10n.govComplaintsTitle,
        subtitle: l10n.govComplaintsSubtitle,
        icon: Icons.inbox_outlined,
        builder: (context, data, state) => [
          if (data.constants != null)
            NoticeBanner(message: data.constants!.antiRetaliationNotice, icon: Icons.shield_outlined),
          _Links(showLand: _allowed('land_complaint.create')),
          _NewComplaintForm(categories: data.constants?.categories ?? const [], state: state),
          SectionTitle(l10n.govComplaintsMine),
          if (data.complaints.isEmpty)
            EmptyState(message: l10n.govComplaintsEmpty, icon: Icons.inbox_outlined)
          else
            for (final c in data.complaints) _ComplaintCard(complaint: c),
        ],
      ),
    );
  }
}

class _Links extends StatelessWidget {
  const _Links({required this.showLand});

  final bool showLand;

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    return Gutter(
      vertical: 6,
      child: Wrap(spacing: 12, runSpacing: 8, children: [
        if (showLand)
          AppButton(
            key: const Key('complaintsLandLink'),
            label: l10n.govComplaintsLandLink,
            icon: Icons.shield_outlined,
            variant: AppButtonVariant.secondary,
            onPressed: () => context.go('/complaints/land-protection'),
          ),
        AppButton(
          key: const Key('complaintsEmergencyLink'),
          label: l10n.govComplaintsEmergencyLink,
          icon: Icons.warning_amber_outlined,
          variant: AppButtonVariant.secondary,
          onPressed: () => context.go('/emergency-help'),
        ),
      ]),
    );
  }
}

class _NewComplaintForm extends StatefulWidget {
  const _NewComplaintForm({required this.categories, required this.state});

  final List<ComplaintCategory> categories;
  final ListFormState<ComplaintsData> state;

  @override
  State<_NewComplaintForm> createState() => _NewComplaintFormState();
}

class _NewComplaintFormState extends State<_NewComplaintForm> {
  final _form = GlobalKey<FormState>();
  final _subject = TextEditingController();
  final _details = TextEditingController();
  String? _category;

  @override
  void dispose() {
    _subject.dispose();
    _details.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (!(_form.currentState?.validate() ?? false)) return;
    final category = _category ?? (widget.categories.isEmpty ? 'service' : widget.categories.first.key);
    final ok = await context
        .read<ComplaintsCubit>()
        .create(category: category, subject: _subject.text.trim(), details: _details.text.trim());
    if (!ok || !mounted) return;
    _subject.clear();
    _details.clear();
    showAppToast(context, AppLocalizations.of(context).govComplaintsSuccess);
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final selected = _category ?? (widget.categories.isEmpty ? null : widget.categories.first.key);
    return GovCard(
      title: l10n.govComplaintsNewTitle,
      icon: Icons.edit_note_outlined,
      children: [
        Form(
          key: _form,
          child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            if (widget.categories.isNotEmpty)
              Padding(
                padding: const EdgeInsets.only(bottom: 12),
                child: DropdownButtonFormField<String>(
                  key: const Key('complaintCategory'),
                  initialValue: selected,
                  isExpanded: true,
                  decoration: InputDecoration(labelText: l10n.govComplaintsCategory),
                  items: [
                    for (final c in widget.categories) DropdownMenuItem(value: c.key, child: Text(c.label)),
                  ],
                  onChanged: (v) => setState(() => _category = v),
                ),
              ),
            GovField(
                key: const Key('complaintSubject'), controller: _subject, label: l10n.govComplaintsSubject, maxLength: 255),
            GovField(
                key: const Key('complaintDetails'),
                controller: _details,
                label: l10n.govComplaintsDetails,
                lines: 4,
                maxLength: 5000),
            GovActionError(error: widget.state.actionError, action: GovAction.other),
            AppButton(
              key: const Key('complaintSubmit'),
              label: l10n.govComplaintsSubmit,
              icon: Icons.send_outlined,
              expanded: true,
              loading: widget.state.busy,
              onPressed: _submit,
            ),
          ]),
        ),
      ],
    );
  }
}

class _ComplaintCard extends StatefulWidget {
  const _ComplaintCard({required this.complaint});

  final Complaint complaint;

  @override
  State<_ComplaintCard> createState() => _ComplaintCardState();
}

class _ComplaintCardState extends State<_ComplaintCard> {
  bool _open = false;

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final theme = Theme.of(context);
    final c = widget.complaint;
    String sla(SlaInfo s) =>
        l10n.govSlaDays(slaLabel(l10n, s.state), govNumber(context, s.daysRemaining));
    return AppCard(
      onTap: () => setState(() => _open = !_open),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Row(children: [
          Expanded(child: Text(c.subject, style: theme.textTheme.titleSmall)),
          Icon(_open ? Icons.expand_less : Icons.expand_more),
        ]),
        const SizedBox(height: 4),
        Text(c.complaintNo, style: theme.textTheme.bodySmall),
        const SizedBox(height: 8),
        Wrap(spacing: 8, runSpacing: 6, children: [
          GovBadge(complaintTone(c.status), complaintStatusLabel(l10n, c.status)),
        ]),
        DetailRow(label: l10n.govComplaintsSlaAck, value: sla(c.slaAck)),
        DetailRow(label: l10n.govComplaintsSlaUpdate, value: sla(c.slaUpdate)),
        if (_open) ...[
          const Divider(),
          Text(c.details),
          if (c.resolutionNote != null && c.resolutionNote!.isNotEmpty)
            DetailRow(label: l10n.govComplaintsResolution, value: c.resolutionNote!),
          const SizedBox(height: 8),
          for (final e in c.timeline)
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 2),
              child: Text('• ${complaintEventLabel(l10n, e.event)} — ${govDate(context, e.at)}'),
            ),
        ],
      ]),
    );
  }
}
