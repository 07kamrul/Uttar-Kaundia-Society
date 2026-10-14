import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_bloc/flutter_bloc.dart';

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

/// Special-meeting petitions: file one, sign one by its ID, follow progress.
class PetitionsPage extends StatelessWidget {
  const PetitionsPage({super.key, this.repository});

  final GovernanceRepository? repository;

  /// Share of eligible members whose signatures a petition needs (Angular constant).
  static const thresholdPercent = 20;

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    return BlocProvider(
      create: (_) => PetitionsCubit(governanceRepo(repository))..load(),
      child: GovPage<PetitionsCubit, PetitionsData>(
        title: l10n.govPetitionsTitle,
        subtitle: l10n.govPetitionsSubtitle,
        icon: Icons.edit_document,
        builder: (context, data, state) => [
          Gutter(
            vertical: 6,
            child: Wrap(spacing: 8, runSpacing: 8, children: [
              GovBadge(GovTone.neutral, l10n.govPetitionsThreshold(govNumber(context, thresholdPercent))),
              if (data.responseDays != null && data.responseDays! > 0)
                GovBadge(GovTone.neutral, l10n.govPetitionsResponseDays(govNumber(context, data.responseDays!))),
            ]),
          ),
          _CreateForm(state: state),
          _SignForm(state: state),
          if (data.signed.isNotEmpty) ...[
            SectionTitle(l10n.govPetitionsSigned),
            for (final p in data.signed) _PetitionCard(petition: p),
          ],
          SectionTitle(l10n.govPetitionsMine),
          if (data.mine.isEmpty)
            EmptyState(message: l10n.govPetitionsEmpty, icon: Icons.edit_document)
          else
            for (final p in data.mine) _PetitionCard(petition: p),
        ],
      ),
    );
  }
}

class _CreateForm extends StatefulWidget {
  const _CreateForm({required this.state});

  final ListFormState<PetitionsData> state;

  @override
  State<_CreateForm> createState() => _CreateFormState();
}

class _CreateFormState extends State<_CreateForm> {
  final _form = GlobalKey<FormState>();
  final _title = TextEditingController();
  final _why = TextEditingController();
  bool _mine = false;

  @override
  void dispose() {
    _title.dispose();
    _why.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (!(_form.currentState?.validate() ?? false)) return;
    setState(() => _mine = true);
    final ok = await context
        .read<PetitionsCubit>()
        .create(title: _title.text.trim(), justification: _why.text.trim());
    if (!ok || !mounted) return;
    _title.clear();
    _why.clear();
    showAppToast(context, AppLocalizations.of(context).govPetitionsCreateDone);
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    return GovCard(
      title: l10n.govPetitionsCreateTitle,
      icon: Icons.add_circle_outline,
      children: [
        Form(
          key: _form,
          child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            GovField(key: const Key('petitionTitle'), controller: _title, label: l10n.govPetitionsTitleField, maxLength: 255),
            GovField(
                key: const Key('petitionJustification'),
                controller: _why,
                label: l10n.govPetitionsJustification,
                lines: 4,
                maxLength: 5000),
            if (_mine) GovActionError(error: widget.state.actionError, action: GovAction.createPetition),
            AppButton(
              key: const Key('petitionCreate'),
              label: l10n.govPetitionsCreate,
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

class _SignForm extends StatefulWidget {
  const _SignForm({required this.state});

  final ListFormState<PetitionsData> state;

  @override
  State<_SignForm> createState() => _SignFormState();
}

class _SignFormState extends State<_SignForm> {
  final _id = TextEditingController();
  bool _mine = false;

  @override
  void dispose() {
    _id.dispose();
    super.dispose();
  }

  Future<void> _sign() async {
    final id = int.tryParse(_id.text.trim());
    if (id == null || id <= 0) return;
    setState(() => _mine = true);
    final ok = await context.read<PetitionsCubit>().sign(id);
    if (!ok || !mounted) return;
    _id.clear();
    showAppToast(context, AppLocalizations.of(context).govPetitionsSignDone);
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    return GovCard(
      title: l10n.govPetitionsSignTitle,
      hint: l10n.govPetitionsSignHint,
      icon: Icons.draw_outlined,
      children: [
        TextFormField(
          key: const Key('petitionId'),
          controller: _id,
          keyboardType: TextInputType.number,
          inputFormatters: [FilteringTextInputFormatter.digitsOnly],
          decoration: InputDecoration(labelText: l10n.govPetitionsId),
        ),
        const SizedBox(height: 12),
        if (_mine) GovActionError(error: widget.state.actionError, action: GovAction.sign),
        AppButton(
          key: const Key('petitionSign'),
          label: l10n.govPetitionsSign,
          icon: Icons.check_outlined,
          expanded: true,
          loading: widget.state.busy,
          onPressed: _sign,
        ),
      ],
    );
  }
}

class _PetitionCard extends StatelessWidget {
  const _PetitionCard({required this.petition});

  final Petition petition;

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final theme = Theme.of(context);
    final p = petition;
    return AppCard(
      title: p.title,
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Text(p.petitionNo, style: theme.textTheme.bodySmall),
        const SizedBox(height: 8),
        Wrap(spacing: 8, runSpacing: 6, children: [
          GovBadge(p.status == 'rejected' ? GovTone.bad : GovTone.neutral, petitionStatusLabel(l10n, p.status)),
          if (p.sla != null) GovBadge(slaTone(p.sla!.state), slaLabel(l10n, p.sla!.state)),
        ]),
        const SizedBox(height: 8),
        Text(l10n.govPetitionsSignatures(govNumber(context, p.signatureCount), govNumber(context, p.requiredCount))),
        const SizedBox(height: 4),
        LinearProgressIndicator(value: p.progressPercent / 100, minHeight: 8),
        if (p.responseDue != null)
          Padding(
            padding: const EdgeInsets.only(top: 8),
            child: Text(l10n.govPetitionsResponseDue(govDate(context, p.responseDue)), style: theme.textTheme.bodySmall),
          ),
        if (p.committeeResponse != null && p.committeeResponse!.isNotEmpty)
          DetailRow(label: l10n.govPetitionsCommitteeResponse, value: p.committeeResponse!),
      ]),
    );
  }
}
