import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';

import '../../../l10n/app_localizations.dart';
import '../../../shared/widgets/plain_confirm.dart';
import '../../../shared/widgets/widgets.dart';
import '../../member/presentation/widgets/member_ui.dart';
import '../data/governance_repository.dart';
import '../domain/governance_entities.dart';
import '../presentation/governance_cubits.dart';
import '../presentation/governance_errors.dart';
import '../presentation/list_form_cubit.dart';
import 'governance_labels.dart';
import 'governance_widgets.dart';

/// Constitution amendments: propose one, follow or withdraw it, and read the
/// version history.
class AmendmentsPage extends StatelessWidget {
  const AmendmentsPage({super.key, this.repository});

  final GovernanceRepository? repository;

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    return BlocProvider(
      create: (_) => AmendmentsCubit(governanceRepo(repository))..load(),
      child: GovPage<AmendmentsCubit, AmendmentsData>(
        title: l10n.govAmendTitle,
        subtitle: l10n.govAmendSubtitle,
        icon: Icons.gavel_outlined,
        builder: (context, data, state) => [
          _ProposeForm(state: state),
          SectionTitle(l10n.govAmendMine),
          if (data.proposals.isEmpty)
            EmptyState(message: l10n.govAmendEmpty, icon: Icons.gavel_outlined)
          else
            for (final p in data.proposals) _ProposalCard(proposal: p, state: state),
          SectionTitle(l10n.govAmendVersionsTitle),
          Gutter(child: Text(l10n.govAmendVersionsHint, style: Theme.of(context).textTheme.bodySmall)),
          if (data.versions.isEmpty)
            EmptyState(message: l10n.govAmendNoVersions, icon: Icons.history_edu_outlined)
          else
            for (final v in data.versions) _VersionCard(version: v),
        ],
      ),
    );
  }
}

class _ProposeForm extends StatefulWidget {
  const _ProposeForm({required this.state});

  final ListFormState<AmendmentsData> state;

  @override
  State<_ProposeForm> createState() => _ProposeFormState();
}

class _ProposeFormState extends State<_ProposeForm> {
  final _form = GlobalKey<FormState>();
  final _title = TextEditingController();
  final _why = TextEditingController();
  final _text = TextEditingController();
  bool _dissolution = false;
  bool _mine = false;

  @override
  void dispose() {
    _title.dispose();
    _why.dispose();
    _text.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (!(_form.currentState?.validate() ?? false)) return;
    setState(() => _mine = true);
    final ok = await context.read<AmendmentsCubit>().propose(
          title: _title.text.trim(),
          rationale: _why.text.trim(),
          proposedText: _text.text,
          isDissolution: _dissolution,
        );
    if (!ok || !mounted) return;
    _title.clear();
    _why.clear();
    _text.clear();
    setState(() => _dissolution = false);
    showAppToast(context, AppLocalizations.of(context).govAmendSubmitDone);
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    return GovCard(
      title: l10n.govAmendProposeTitle,
      hint: l10n.govAmendProposeHint,
      icon: Icons.edit_note_outlined,
      children: [
        Form(
          key: _form,
          child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            GovField(key: const Key('amendTitle'), controller: _title, label: l10n.govAmendTitleField, maxLength: 255),
            GovField(key: const Key('amendRationale'), controller: _why, label: l10n.govAmendRationale, lines: 3),
            GovField(key: const Key('amendText'), controller: _text, label: l10n.govAmendText, lines: 5),
            AppCheckbox(
              key: const Key('amendDissolution'),
              label: l10n.govAmendDissolution,
              value: _dissolution,
              onChanged: (v) => setState(() => _dissolution = v),
            ),
            if (_dissolution) NoticeBanner(message: l10n.govAmendDissolutionNotice, margin: EdgeInsets.zero),
            if (_mine) GovActionError(error: widget.state.actionError, action: GovAction.other),
            const SizedBox(height: 8),
            AppButton(
              key: const Key('amendSubmit'),
              label: l10n.govAmendSubmit,
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

class _ProposalCard extends StatelessWidget {
  const _ProposalCard({required this.proposal, required this.state});

  final AmendmentProposal proposal;
  final ListFormState<AmendmentsData> state;

  Future<void> _withdraw(BuildContext context) async {
    final l10n = AppLocalizations.of(context);
    final yes = await showPlainConfirm(
      context,
      title: l10n.govAmendWithdraw,
      consequence: l10n.govAmendWithdrawConfirm,
      action: l10n.govAmendWithdraw,
      destructive: true,
    );
    if (!yes || !context.mounted) return;
    final cubit = context.read<AmendmentsCubit>();
    final ok = await cubit.withdraw(proposal.id);
    if (!context.mounted) return;
    if (ok) {
      showAppToast(context, l10n.govAmendWithdrawDone);
    } else {
      showAppToast(context, govErrorMessage(l10n, cubit.state.actionError ?? '', GovAction.withdraw), error: true);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final theme = Theme.of(context);
    final p = proposal;
    final tone = switch (p.status) {
      'adopted' => GovTone.good,
      'rejected' => GovTone.bad,
      'scheduled' || 'withdrawn' => GovTone.warn,
      _ => GovTone.neutral,
    };
    return AppCard(
      title: p.title,
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Text(p.proposalNo, style: theme.textTheme.bodySmall),
        const SizedBox(height: 8),
        Wrap(spacing: 8, runSpacing: 6, children: [
          GovBadge(tone, amendStatusLabel(l10n, p.status)),
          if (p.isDissolution) GovBadge(GovTone.bad, l10n.govAmendDissolutionTag),
          if (p.adoptedVersionNo != null)
            GovBadge(GovTone.good, l10n.govAmendAdoptedAs(govNumber(context, p.adoptedVersionNo!))),
        ]),
        const SizedBox(height: 8),
        Text(p.rationale),
        if (p.decisionNote != null && p.decisionNote!.isNotEmpty)
          DetailRow(label: l10n.govAmendDecisionNote, value: p.decisionNote!),
        if (p.canWithdraw)
          Align(
            alignment: Alignment.centerLeft,
            child: AppButton(
              key: Key('amendWithdraw_${p.id}'),
              label: l10n.govAmendWithdraw,
              variant: AppButtonVariant.ghost,
              loading: state.busy,
              onPressed: () => _withdraw(context),
            ),
          ),
      ]),
    );
  }
}

class _VersionCard extends StatefulWidget {
  const _VersionCard({required this.version});

  final ConstitutionVersion version;

  @override
  State<_VersionCard> createState() => _VersionCardState();
}

class _VersionCardState extends State<_VersionCard> {
  bool _open = false;

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final v = widget.version;
    return AppCard(
      title: l10n.govAmendVersionLabel(govNumber(context, v.versionNo)),
      trailing: v.isCurrent ? GovBadge(GovTone.good, l10n.govAmendCurrent) : null,
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        if (v.changesSummary != null && v.changesSummary!.isNotEmpty) Text(v.changesSummary!),
        Align(
          alignment: Alignment.centerLeft,
          child: TextButton(
            onPressed: () => setState(() => _open = !_open),
            child: Text(l10n.govAmendViewText),
          ),
        ),
        if (_open) Text(v.fullText),
      ]),
    );
  }
}
