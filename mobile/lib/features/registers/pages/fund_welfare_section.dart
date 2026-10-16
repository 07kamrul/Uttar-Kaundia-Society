import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';

import '../../../shared/widgets/widgets.dart';
import '../../governance/pages/governance_labels.dart' show GovTone;
import '../../governance/pages/governance_widgets.dart' show GovBadge, GovField;
import '../../governance/presentation/list_form_cubit.dart';
import '../../member/presentation/widgets/member_ui.dart' show NoticeBanner, NoticeTone;
import '../domain/fund_controls_entities.dart';
import '../presentation/bloc/fund_controls_cubit.dart';
import '../presentation/fund_strings.dart';
import '../presentation/registers_strings.dart';
import 'register_widgets.dart';

GovTone _tone(String status) => switch (status) {
      'approved' || 'disbursed' => GovTone.good,
      'rejected' => GovTone.bad,
      'under_review' => GovTone.warn,
      _ => GovTone.neutral,
    };

/// Welfare-fund review queue: status filter, start review, decide (reason
/// always required) and mark disbursed. No request is ever auto-approved.
class WelfareQueueSection extends StatelessWidget {
  const WelfareQueueSection({super.key, required this.rows});

  final List<WelfareFundRequest> rows;

  @override
  Widget build(BuildContext context) {
    final s = FundStrings.of(context);
    final cubit = context.read<FundControlsCubit>();
    return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      SectionTitle(s.wfAdminTitle),
      NoticeBanner(tone: NoticeTone.info, message: s.wfNoAutoApproval),
      Padding(
        padding: const EdgeInsets.fromLTRB(16, 8, 16, 4),
        child: DropdownButtonFormField<String>(
          key: const Key('welfareStatusFilter'),
          initialValue: cubit.welfareStatus,
          isExpanded: true,
          decoration: InputDecoration(labelText: s.wfStatusLabel),
          items: [
            DropdownMenuItem(value: '', child: Text(s.wfAllStatuses)),
            for (final st in welfareRequestStatuses) DropdownMenuItem(value: st, child: Text(s.wfStatus(st))),
          ],
          onChanged: (v) => cubit.setWelfareStatus(v ?? ''),
        ),
      ),
      if (rows.isEmpty)
        EmptyState(message: s.wfEmpty, icon: Icons.volunteer_activism_outlined)
      else
        for (final r in rows) _RequestCard(row: r),
    ]);
  }
}

class _RequestCard extends StatelessWidget {
  const _RequestCard({required this.row});

  final WelfareFundRequest row;

  @override
  Widget build(BuildContext context) {
    final s = FundStrings.of(context);
    final cubit = context.read<FundControlsCubit>();
    final r = row;
    return AppCard(
      title: '${r.requestNo} · ${s.wfType(r.requestType)}',
      trailing: GovBadge(_tone(r.status), s.wfStatus(r.status)),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Text(r.memberName ?? '—'),
        Text(s.wfRequested(regTaka(context, r.amountRequested))),
        if (r.approvedAmount != null) Text(s.wfApproved(regTaka(context, r.approvedAmount!))),
        DetailRow(label: s.wfRequestedReason, value: r.reason),
        if ((r.committeeReason ?? '').isNotEmpty) DetailRow(label: s.wfCommitteeReason, value: r.committeeReason!),
        const SizedBox(height: 8),
        Wrap(spacing: 8, runSpacing: 8, children: [
          if (r.status == 'submitted')
            AppButton(
              key: Key('welfareReview_${r.id}'),
              label: s.wfStartReview,
              variant: AppButtonVariant.secondary,
              onPressed: () => cubit.startReview(r),
            ),
          if (r.status == 'submitted' || r.status == 'under_review')
            AppButton(
              key: Key('welfareDecide_${r.id}'),
              label: s.wfDecide,
              onPressed: () => showModalBottomSheet<void>(
                context: context,
                isScrollControlled: true,
                builder: (_) => BlocProvider.value(value: cubit, child: _DecideForm(row: r)),
              ),
            ),
          if (r.status == 'approved')
            AppButton(
              key: Key('welfareDisburse_${r.id}'),
              label: s.wfDisburse,
              icon: Icons.payments_outlined,
              onPressed: () => cubit.disburse(r),
            ),
        ]),
      ]),
    );
  }
}

class _DecideForm extends StatefulWidget {
  const _DecideForm({required this.row});

  final WelfareFundRequest row;

  @override
  State<_DecideForm> createState() => _DecideFormState();
}

class _DecideFormState extends State<_DecideForm> {
  final _form = GlobalKey<FormState>();
  late final _amount = TextEditingController(text: '${widget.row.amountRequested}');
  final _reason = TextEditingController();
  String _decision = 'approved';
  bool _tried = false;

  @override
  void dispose() {
    _amount.dispose();
    _reason.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    if (!(_form.currentState?.validate() ?? false)) return;
    setState(() => _tried = true);
    final ok = await context.read<FundControlsCubit>().decideWelfare(
          widget.row,
          decision: _decision,
          reason: _reason.text,
          approvedAmount: parseLocalNumber(_amount.text),
        );
    if (ok && mounted) Navigator.of(context).pop();
  }

  @override
  Widget build(BuildContext context) {
    final s = FundStrings.of(context);
    final approving = _decision == 'approved';
    return Padding(
      padding: EdgeInsets.fromLTRB(16, 16, 16, 16 + MediaQuery.viewInsetsOf(context).bottom),
      child: Form(
        key: _form,
        child: ListView(shrinkWrap: true, children: [
          Text(s.wfDecideTitle(widget.row.requestNo), style: Theme.of(context).textTheme.titleLarge),
          Text(s.wfRequested(regTaka(context, widget.row.amountRequested))),
          const SizedBox(height: 12),
          Wrap(spacing: 8, children: [
            for (final d in const ['approved', 'rejected'])
              ChoiceChip(
                key: Key('welfareDecision_$d'),
                label: Text(s.wfStatus(d)),
                selected: _decision == d,
                onSelected: (_) => setState(() => _decision = d),
              ),
          ]),
          const SizedBox(height: 12),
          if (approving)
            GovField(
              key: const Key('welfareApprovedAmount'),
              controller: _amount,
              label: s.wfApprovedAmount,
              keyboardType: const TextInputType.numberWithOptions(decimal: true),
              validator: (v) {
                final n = parseLocalNumber(v ?? '');
                return n == null || n <= 0 ? s.wfAmountRequired : null;
              },
            ),
          GovField(
            key: const Key('welfareCommitteeReason'),
            controller: _reason,
            label: s.wfCommitteeReason,
            lines: 3,
            validator: (v) => (v ?? '').trim().isEmpty ? s.wfReasonRequired : null,
          ),
          BlocBuilder<FundControlsCubit, ListFormState<FundControlsData>>(
            builder: (context, state) => Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
              if (_tried) RegActionError(error: state.actionError),
              AppButton(
                key: const Key('welfareDecideSave'),
                label: RegistersStrings.of(context).save,
                icon: Icons.check,
                expanded: true,
                loading: state.busy,
                onPressed: _save,
              ),
            ]),
          ),
        ]),
      ),
    );
  }
}
