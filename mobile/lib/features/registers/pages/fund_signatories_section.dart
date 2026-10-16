import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';

import '../../../shared/widgets/widgets.dart';
import '../../governance/pages/governance_labels.dart' show GovTone;
import '../../governance/pages/governance_widgets.dart' show GovBadge, GovField;
import '../../governance/presentation/list_form_cubit.dart';
import '../domain/committee_registry_entities.dart';
import '../domain/fund_controls_entities.dart';
import '../presentation/bloc/fund_controls_cubit.dart';
import '../presentation/fund_strings.dart';
import '../presentation/registers_strings.dart';
import 'register_widgets.dart';

/// Bank signatories: list (inactive included), add / edit / deactivate and the
/// bank letter PDF. Only the last 4 account digits ever leave the form.
class SignatoriesSection extends StatelessWidget {
  const SignatoriesSection({super.key, required this.rows, required this.members, required this.openFile});

  final List<BankSignatory> rows;
  final List<MemberOption> members;
  final FileOpener openFile;

  @override
  Widget build(BuildContext context) {
    final s = FundStrings.of(context);
    final cubit = context.read<FundControlsCubit>();
    return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      SectionTitle(s.sgTitle),
      Padding(
        padding: const EdgeInsets.symmetric(horizontal: 16),
        child: Wrap(spacing: 8, runSpacing: 8, children: [
          AppButton(
            key: const Key('bankLetter'),
            label: s.sgBankLetter,
            icon: Icons.download_outlined,
            variant: AppButtonVariant.secondary,
            onPressed: () => downloadWith(context,
                fetch: cubit.bankLetter, fileName: 'bank-signatories-${isoDay(DateTime.now())}.pdf', open: openFile),
          ),
          AppButton(
            key: const Key('signatoryAdd'),
            label: s.sgAdd,
            icon: Icons.add,
            onPressed: () => _openForm(context, members),
          ),
        ]),
      ),
      if (rows.isEmpty)
        EmptyState(message: s.sgEmpty, icon: Icons.account_balance_outlined)
      else
        for (final r in rows) _SignatoryCard(row: r, members: members),
    ]);
  }
}

Future<void> _openForm(BuildContext context, List<MemberOption> members, [BankSignatory? row]) {
  final cubit = context.read<FundControlsCubit>();
  return showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    builder: (_) => BlocProvider.value(value: cubit, child: _SignatoryForm(members: members, editing: row)),
  );
}

class _SignatoryCard extends StatelessWidget {
  const _SignatoryCard({required this.row, required this.members});

  final BankSignatory row;
  final List<MemberOption> members;

  Future<void> _deactivate(BuildContext context) async {
    final cubit = context.read<FundControlsCubit>();
    final reason = await askReason(context, prompt: FundStrings.of(context).sgDeactivateReason);
    if (reason != null) await cubit.deactivateSignatory(row, reason);
  }

  @override
  Widget build(BuildContext context) {
    final s = FundStrings.of(context);
    final r = row;
    final validTo = r.validTo == null ? '' : ' – ${regDate(context, r.validTo)}';
    return AppCard(
      title: [r.memberName ?? '—', if ((r.memberDisplayId ?? '').isNotEmpty) '(${r.memberDisplayId})'].join(' '),
      trailing: r.isActive ? null : GovBadge(GovTone.warn, s.sgInactive),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        if ((r.committeePostBn ?? '').isNotEmpty) Text(r.committeePostBn!),
        DetailRow(label: s.sgBank, value: '${r.bankName}, ${r.branch}'),
        DetailRow(label: s.sgAccountName, value: '${r.accountName} · ${r.accountNumberMasked}'),
        if ((r.authorityScope ?? '').isNotEmpty) DetailRow(label: s.sgScope, value: r.authorityScope!),
        DetailRow(label: s.sgValidity, value: '${regDate(context, r.validFrom)}$validTo'),
        if (r.isActive) ...[
          const SizedBox(height: 8),
          Wrap(spacing: 8, children: [
            AppButton(
              key: Key('signatoryEdit_${r.id}'),
              label: s.edit,
              icon: Icons.edit_outlined,
              variant: AppButtonVariant.secondary,
              onPressed: () => _openForm(context, members, r),
            ),
            AppButton(
              key: Key('signatoryDeactivate_${r.id}'),
              label: s.delete,
              icon: Icons.block,
              variant: AppButtonVariant.danger,
              onPressed: () => _deactivate(context),
            ),
          ]),
        ],
      ]),
    );
  }
}

class _SignatoryForm extends StatefulWidget {
  const _SignatoryForm({required this.members, this.editing});

  final List<MemberOption> members;
  final BankSignatory? editing;

  @override
  State<_SignatoryForm> createState() => _SignatoryFormState();
}

class _SignatoryFormState extends State<_SignatoryForm> {
  final _form = GlobalKey<FormState>();
  late int? _memberId = widget.editing?.memberId;
  late final _bank = TextEditingController(text: widget.editing?.bankName ?? '');
  late final _branch = TextEditingController(text: widget.editing?.branch ?? '');
  late final _accountName = TextEditingController(text: widget.editing?.accountName ?? '');
  final _last4 = TextEditingController();
  late final _scope = TextEditingController(text: widget.editing?.authorityScope ?? '');
  late final _termId = TextEditingController(text: widget.editing?.committeeTermId?.toString() ?? '');
  late String _validFrom = widget.editing?.validFrom ?? isoDay(DateTime.now());
  late String _validTo = widget.editing?.validTo ?? '';
  bool _tried = false;

  bool get _editing => widget.editing != null;

  @override
  void dispose() {
    for (final c in [_bank, _branch, _accountName, _last4, _scope, _termId]) {
      c.dispose();
    }
    super.dispose();
  }

  /// Required on create; on edit empty keeps the stored digits.
  String? _validateLast4(String? v) {
    final text = (v ?? '').trim();
    if (text.isEmpty && _editing) return null;
    return RegExp(r'^\d{4}$').hasMatch(text) ? null : FundStrings.of(context).sgLast4Invalid;
  }

  Future<void> _save() async {
    if (!(_form.currentState?.validate() ?? false)) return;
    setState(() => _tried = true);
    final input = SignatoryInput(
      memberId: _memberId,
      bankName: _bank.text.trim(),
      branch: _branch.text.trim(),
      accountName: _accountName.text.trim(),
      accountNumberLast4: _last4.text.trim(),
      authorityScope: _scope.text,
      committeeTermId: int.tryParse(_termId.text.trim()),
      validFrom: _validFrom,
      validTo: _validTo,
    );
    final ok = await context.read<FundControlsCubit>().saveSignatory(input, editing: widget.editing);
    if (ok && mounted) Navigator.of(context).pop();
  }

  @override
  Widget build(BuildContext context) {
    final s = FundStrings.of(context);
    final known = widget.members.any((m) => m.id == _memberId);
    return Padding(
      padding: EdgeInsets.fromLTRB(16, 16, 16, 16 + MediaQuery.viewInsetsOf(context).bottom),
      child: Form(
        key: _form,
        child: ListView(shrinkWrap: true, children: [
          Text(_editing ? s.sgEditTitle : s.sgAddTitle, style: Theme.of(context).textTheme.titleLarge),
          const SizedBox(height: 12),
          if (!_editing)
            Padding(
              padding: const EdgeInsets.only(bottom: 12),
              child: DropdownButtonFormField<int>(
                key: const Key('signatoryMember'),
                initialValue: known ? _memberId : null,
                isExpanded: true,
                decoration: InputDecoration(labelText: s.sgMember),
                items: [for (final m in widget.members) DropdownMenuItem(value: m.id, child: Text(m.display))],
                onChanged: (v) => setState(() => _memberId = v),
                validator: (_) => _memberId == null ? s.sgMemberRequired : null,
              ),
            ),
          GovField(key: const Key('signatoryBank'), controller: _bank, label: s.sgBank),
          GovField(key: const Key('signatoryBranch'), controller: _branch, label: s.sgBranch),
          GovField(key: const Key('signatoryAccountName'), controller: _accountName, label: s.sgAccountName),
          GovField(
            key: const Key('signatoryLast4'),
            controller: _last4,
            label: s.sgLast4,
            keyboardType: TextInputType.number,
            maxLength: 4,
            validator: _validateLast4,
          ),
          Text(s.sgLast4Hint, style: Theme.of(context).textTheme.bodySmall),
          const SizedBox(height: 8),
          GovField(controller: _scope, label: s.sgScope, required: false),
          GovField(controller: _termId, label: s.sgTermId, required: false, keyboardType: TextInputType.number),
          RegDateField(label: s.sgValidFrom, value: _validFrom, onChanged: (v) => setState(() => _validFrom = v)),
          RegDateField(
            label: s.sgValidTo,
            value: _validTo,
            isRequired: false,
            onChanged: (v) => setState(() => _validTo = v),
          ),
          BlocBuilder<FundControlsCubit, ListFormState<FundControlsData>>(
            builder: (context, state) => Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
              if (_tried) RegActionError(error: state.actionError),
              AppButton(
                key: const Key('signatorySave'),
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
