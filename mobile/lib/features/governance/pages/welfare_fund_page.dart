import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';

import '../../../core/format/bn_format.dart';
import '../../../l10n/app_localizations.dart';
import '../../../shared/widgets/widgets.dart';
import '../data/governance_repository.dart';
import '../domain/governance_entities.dart';
import '../presentation/governance_cubits.dart';
import '../presentation/governance_errors.dart';
import '../presentation/list_form_cubit.dart';
import 'governance_labels.dart';
import 'governance_widgets.dart';

/// Welfare fund: apply for help and follow the committee's decision.
class WelfareFundPage extends StatelessWidget {
  const WelfareFundPage({super.key, this.repository});

  final GovernanceRepository? repository;

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    return BlocProvider(
      create: (_) => WelfareCubit(governanceRepo(repository))..load(),
      child: GovPage<WelfareCubit, List<WelfareRequest>>(
        title: l10n.govWelfareTitle,
        subtitle: l10n.govWelfareSubtitle,
        icon: Icons.volunteer_activism_outlined,
        builder: (context, requests, state) => [
          _ApplyForm(state: state),
          SectionTitle(l10n.govWelfareMine),
          if (requests.isEmpty)
            EmptyState(message: l10n.govWelfareEmpty, icon: Icons.volunteer_activism_outlined)
          else
            for (final r in requests) _RequestCard(request: r),
        ],
      ),
    );
  }
}

class _ApplyForm extends StatefulWidget {
  const _ApplyForm({required this.state});

  final ListFormState<List<WelfareRequest>> state;

  @override
  State<_ApplyForm> createState() => _ApplyFormState();
}

class _ApplyFormState extends State<_ApplyForm> {
  static const _types = ['medical', 'emergency', 'education', 'other'];

  final _form = GlobalKey<FormState>();
  final _amount = TextEditingController();
  final _reason = TextEditingController();
  String _type = 'medical';
  bool _mine = false;

  @override
  void dispose() {
    _amount.dispose();
    _reason.dispose();
    super.dispose();
  }

  /// Accepts Bangla or English digits.
  num? _parseAmount(String text) {
    const bnDigits = '০১২৩৪৫৬৭৮৯';
    final ascii = text.trim().split('').map((ch) {
      final i = bnDigits.indexOf(ch);
      return i >= 0 ? '$i' : ch;
    }).join().replaceAll(',', '');
    return num.tryParse(ascii);
  }

  String? _validateAmount(String? v) {
    final l10n = AppLocalizations.of(context);
    if ((v ?? '').trim().isEmpty) return l10n.govFieldRequired;
    final n = _parseAmount(v!);
    return n == null || n <= 0 ? l10n.govWelfareAmountInvalid : null;
  }

  Future<void> _submit() async {
    if (!(_form.currentState?.validate() ?? false)) return;
    setState(() => _mine = true);
    final ok = await context.read<WelfareCubit>().apply(
          requestType: _type,
          amount: _parseAmount(_amount.text)!,
          reason: _reason.text.trim(),
        );
    if (!ok || !mounted) return;
    _amount.clear();
    _reason.clear();
    showAppToast(context, AppLocalizations.of(context).govWelfareApplyDone);
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    return GovCard(
      title: l10n.govWelfareApplyTitle,
      hint: l10n.govWelfareApplyHint,
      icon: Icons.edit_note_outlined,
      children: [
        Form(
          key: _form,
          child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            Padding(
              padding: const EdgeInsets.only(bottom: 12),
              child: DropdownButtonFormField<String>(
                key: const Key('welfareType'),
                initialValue: _type,
                isExpanded: true,
                decoration: InputDecoration(labelText: l10n.govWelfareType),
                items: [for (final t in _types) DropdownMenuItem(value: t, child: Text(welfareTypeLabel(l10n, t)))],
                onChanged: (v) => setState(() => _type = v ?? _type),
              ),
            ),
            GovField(
              key: const Key('welfareAmount'),
              controller: _amount,
              label: l10n.govWelfareAmount,
              keyboardType: TextInputType.number,
              validator: _validateAmount,
            ),
            GovField(key: const Key('welfareReason'), controller: _reason, label: l10n.govWelfareReason, lines: 4),
            if (_mine) GovActionError(error: widget.state.actionError, action: GovAction.welfare),
            AppButton(
              key: const Key('welfareApply'),
              label: l10n.govWelfareApply,
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

class _RequestCard extends StatelessWidget {
  const _RequestCard({required this.request});

  final WelfareRequest request;

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final theme = Theme.of(context);
    final r = request;
    final lang = govLang(context);
    final tone = switch (r.status) {
      'approved' || 'disbursed' => GovTone.good,
      'rejected' => GovTone.bad,
      'under_review' => GovTone.warn,
      _ => GovTone.neutral,
    };
    return AppCard(
      title: welfareTypeLabel(l10n, r.requestType),
      trailing: GovBadge(tone, welfareStatusLabel(l10n, r.status)),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Text(r.requestNo, style: theme.textTheme.bodySmall),
        const SizedBox(height: 6),
        Text(l10n.govWelfareRequested(taka(r.amountRequested, locale: lang))),
        if (r.approvedAmount != null) Text(l10n.govWelfareApproved(taka(r.approvedAmount, locale: lang))),
        const SizedBox(height: 6),
        Text(r.reason),
        if (r.committeeReason != null && r.committeeReason!.isNotEmpty)
          DetailRow(label: l10n.govWelfareCommitteeReason, value: r.committeeReason!),
      ]),
    );
  }
}
