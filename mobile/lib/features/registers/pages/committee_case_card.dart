import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';

import '../../../shared/widgets/widgets.dart';
import '../../governance/pages/governance_labels.dart' show GovTone;
import '../../governance/pages/governance_widgets.dart' show GovBadge, GovField;
import '../domain/committee_registry_entities.dart';
import '../presentation/bloc/committee_registry_cubit.dart';
import '../presentation/committee_strings.dart';
import 'register_widgets.dart';

/// Vacancy / resignation / removal cases with the filter chips
/// (Angular "শূন্যপদ, পদত্যাগ ও অপসারণ" section).
class CaseSection extends StatelessWidget {
  const CaseSection({super.key, required this.data, required this.filter});

  final CommitteeData data;
  final CaseFilter filter;

  @override
  Widget build(BuildContext context) {
    final s = CommitteeStrings.of(context);
    final cubit = context.read<CommitteeRegistryCubit>();
    final cases = [for (final v in data.vacancies) if (caseMatches(v, filter)) v];
    return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      SectionTitle(s.vacanciesTitle),
      Padding(
        padding: const EdgeInsets.symmetric(horizontal: 16),
        child: Text(s.vacanciesSubtitle, style: Theme.of(context).textTheme.bodySmall),
      ),
      if (data.vacancies.isEmpty)
        EmptyState(message: s.emptyVacancies, icon: Icons.inbox_outlined)
      else ...[
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 8, 16, 4),
          child: Wrap(spacing: 8, runSpacing: 8, children: [
            for (final f in CaseFilter.values)
              ChoiceChip(
                key: Key('caseFilter_${f.name}'),
                label: Text('${s.filter(f)} (${regNumber(context, data.count(f))})'),
                selected: filter == f,
                onSelected: (_) => cubit.setCaseFilter(f),
              ),
          ]),
        ),
        if (cases.isEmpty)
          Padding(padding: const EdgeInsets.all(16), child: Text(s.filterNoMatch))
        else
          for (final v in cases) CaseCard(key: ValueKey('case_${v.id}'), vacancy: v, data: data),
      ],
    ]);
  }
}

GovTone _statusTone(String status) => switch (status) {
      'decided' => GovTone.good,
      'pending_acknowledgement' => GovTone.warn,
      'investigation' => GovTone.bad,
      _ => GovTone.neutral,
    };

GovTone _slaTone(String state) => switch (state) {
      'met' => GovTone.good,
      'due_soon' => GovTone.warn,
      'overdue' => GovTone.bad,
      _ => GovTone.neutral,
    };

/// Which inline note form is open on a case card.
enum _Panel { none, removal, decision }

class CaseCard extends StatefulWidget {
  const CaseCard({super.key, required this.vacancy, required this.data});

  final PostVacancy vacancy;
  final CommitteeData data;

  @override
  State<CaseCard> createState() => _CaseCardState();
}

class _CaseCardState extends State<CaseCard> {
  final _note = TextEditingController();
  _Panel _panel = _Panel.none;

  @override
  void dispose() {
    _note.dispose();
    super.dispose();
  }

  void _toggle(_Panel panel) => setState(() {
        _note.clear();
        _panel = _panel == panel ? _Panel.none : panel;
      });

  Future<void> _issueRemoval() async {
    final ok = await context.read<CommitteeRegistryCubit>().issueRemoval(widget.vacancy, _note.text);
    if (ok && mounted) setState(() => _panel = _Panel.none);
  }

  Future<void> _decide(String decision) async {
    final s = CommitteeStrings.of(context);
    final cubit = context.read<CommitteeRegistryCubit>();
    final name = widget.vacancy.memberName;
    final message = decision == 'removed' ? s.decideRemovedConfirm(name) : s.decideRetainedConfirm(name);
    if (!await askConfirm(context, message, destructive: decision == 'removed')) return;
    final ok = await cubit.decide(widget.vacancy, decision, _note.text);
    if (ok && mounted) setState(() => _panel = _Panel.none);
  }

  @override
  Widget build(BuildContext context) {
    final s = CommitteeStrings.of(context);
    final theme = Theme.of(context);
    final v = widget.vacancy;
    final days = slaDays(v, DateTime.now());
    final sla = v.responseSla;
    final decision = v.decision;
    return AppCard(
      title: widget.data.postName(v.postKey, s.lang),
      trailing: GovBadge(_statusTone(v.status), s.vacancyStatus(v.status)),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Text('${v.memberName} · ${s.vacancyType(v.vacancyType)}', style: theme.textTheme.bodyMedium),
        if (decision == 'removed' || decision == 'retained')
          Padding(
            padding: const EdgeInsets.only(top: 4),
            child: GovBadge(decision == 'removed' ? GovTone.bad : GovTone.good, s.decision(decision!)),
          ),
        if (v.responseDeadline != null) DetailRow(label: s.responseDeadline, value: regDate(context, v.responseDeadline)),
        Wrap(spacing: 8, runSpacing: 4, children: [
          if (days != null)
            Text(
              days >= 0 ? s.daysLeft(regNumber(context, days)) : s.daysOverdue(regNumber(context, days.abs())),
              style: theme.textTheme.bodySmall,
            ),
          if (sla != null) GovBadge(_slaTone(sla.state), s.sla(sla.state)),
        ]),
        if ((v.memberResponse ?? '').isNotEmpty) DetailRow(label: s.memberResponse, value: v.memberResponse!),
        if ((v.investigationNote ?? '').isNotEmpty) DetailRow(label: s.investigationNote, value: v.investigationNote!),
        if ((v.decisionNote ?? '').isNotEmpty) DetailRow(label: s.decisionNote, value: v.decisionNote!),
        if (_panel == _Panel.removal) _removalPanel(s),
        if (_panel == _Panel.decision) _decisionPanel(s),
        const SizedBox(height: 8),
        _actions(s),
      ]),
    );
  }

  Widget _removalPanel(CommitteeStrings s) => Padding(
        padding: const EdgeInsets.only(top: 8),
        child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          Text(s.removalWindowHint, style: Theme.of(context).textTheme.bodySmall),
          const SizedBox(height: 8),
          GovField(key: const Key('investigationNote'), controller: _note, label: s.investigationNote, lines: 2),
          ValueListenableBuilder(
            valueListenable: _note,
            builder: (_, value, __) => AppButton(
              key: const Key('issueRemoval'),
              label: s.issueRemoval,
              variant: AppButtonVariant.danger,
              onPressed: value.text.trim().isEmpty ? null : _issueRemoval,
            ),
          ),
        ]),
      );

  Widget _decisionPanel(CommitteeStrings s) => Padding(
        padding: const EdgeInsets.only(top: 8),
        child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          Text(s.decideTitle, style: Theme.of(context).textTheme.titleSmall),
          const SizedBox(height: 8),
          GovField(key: const Key('decisionNote'), controller: _note, label: s.decisionNote, lines: 2),
          ValueListenableBuilder(
            valueListenable: _note,
            builder: (_, value, __) {
              final empty = value.text.trim().isEmpty;
              return Wrap(spacing: 8, runSpacing: 8, children: [
                AppButton(
                  key: const Key('decideRemoved'),
                  label: s.decideRemoved,
                  variant: AppButtonVariant.danger,
                  onPressed: empty ? null : () => _decide('removed'),
                ),
                AppButton(
                  key: const Key('decideRetained'),
                  label: s.decideRetained,
                  onPressed: empty ? null : () => _decide('retained'),
                ),
              ]);
            },
          ),
        ]),
      );

  Widget _actions(CommitteeStrings s) {
    final v = widget.vacancy;
    final cubit = context.read<CommitteeRegistryCubit>();
    if (v.status == 'pending_acknowledgement') {
      return Wrap(spacing: 8, runSpacing: 8, children: [
        AppButton(
          key: Key('acknowledge_${v.id}'),
          label: s.acknowledge,
          onPressed: () => cubit.acknowledge(v),
        ),
        AppButton(
          key: Key('removalNotice_${v.id}'),
          label: s.removalNotice,
          variant: AppButtonVariant.danger,
          onPressed: () => _toggle(_Panel.removal),
        ),
      ]);
    }
    if (v.status == 'investigation' || v.status == 'acknowledged') {
      return AppButton(
        key: Key('decide_${v.id}'),
        label: s.decideTitle,
        variant: AppButtonVariant.secondary,
        onPressed: () => _toggle(_Panel.decision),
      );
    }
    return const SizedBox.shrink();
  }
}
