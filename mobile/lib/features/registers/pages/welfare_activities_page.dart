import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';

import '../../../core/di/injector.dart';
import '../../../core/network/api_client.dart';
import '../../../shared/widgets/widgets.dart';
import '../../governance/pages/governance_labels.dart' show GovTone;
import '../../governance/pages/governance_widgets.dart' show GovBadge, GovField;
import '../../governance/presentation/list_form_cubit.dart';
import '../data/registers_repository.dart';
import '../domain/registers_entities.dart';
import '../presentation/bloc/registers_cubits.dart';
import '../presentation/registers_strings.dart';
import 'register_widgets.dart';

/// `/welfare-activities` (welfare_activity.manage): training / welfare /
/// other activities the committee ran.
class WelfareActivitiesPage extends StatelessWidget {
  const WelfareActivitiesPage({super.key, this.repository, this.openFile = saveAndOpenFile});

  final RegistersRepository? repository;
  final FileOpener openFile;

  @override
  Widget build(BuildContext context) {
    final s = RegistersStrings.of(context);
    return BlocProvider(
      create: (_) => WelfareActivitiesCubit(repository ?? RegistersRepository(apiClient: sl<ApiClient>()))..load(),
      child: Builder(builder: (context) {
        final cubit = context.read<WelfareActivitiesCubit>();
        return RegisterPage<WelfareActivitiesCubit, List<WelfareActivity>>(
          title: s.actTitle,
          subtitle: s.actSubtitle,
          icon: Icons.groups_2_outlined,
          loadError: s.actLoadError,
          actions: [
            AppButton(
              key: const Key('activityPdf'),
              label: s.actPdf,
              icon: Icons.download_outlined,
              variant: AppButtonVariant.secondary,
              onPressed: () => downloadWith(context,
                  fetch: cubit.listPdf, fileName: 'welfare-activities-${isoDay(DateTime.now())}.pdf', open: openFile),
            ),
            AppButton(
              key: const Key('activityAdd'),
              label: s.actAdd,
              icon: Icons.add,
              onPressed: () => _openForm(context),
            ),
          ],
          toolbar: [_TypeFilter(cubit: cubit)],
          builder: (context, activities, state) => [
            RegActionError(error: state.actionError),
            if (activities.isEmpty)
              EmptyState(message: s.actEmpty, icon: Icons.groups_2_outlined)
            else
              for (final a in activities) _ActivityCard(activity: a),
          ],
        );
      }),
    );
  }
}

Future<void> _openForm(BuildContext context, [WelfareActivity? activity]) {
  final cubit = context.read<WelfareActivitiesCubit>();
  return showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    builder: (_) => BlocProvider.value(value: cubit, child: _ActivityForm(editing: activity)),
  );
}

class _TypeFilter extends StatelessWidget {
  const _TypeFilter({required this.cubit});

  final WelfareActivitiesCubit cubit;

  @override
  Widget build(BuildContext context) {
    final s = RegistersStrings.of(context);
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 4),
      child: DropdownButtonFormField<String>(
        key: const Key('activityTypeFilter'),
        initialValue: cubit.typeFilter,
        isExpanded: true,
        decoration: InputDecoration(labelText: s.actType),
        items: [
          DropdownMenuItem(value: '', child: Text(s.actAllTypes)),
          for (final t in welfareActivityTypes) DropdownMenuItem(value: t, child: Text(s.activityType(t))),
        ],
        onChanged: (v) => cubit.setType(v ?? ''),
      ),
    );
  }
}

class _ActivityCard extends StatelessWidget {
  const _ActivityCard({required this.activity});

  final WelfareActivity activity;

  Future<void> _delete(BuildContext context) async {
    final cubit = context.read<WelfareActivitiesCubit>();
    final ok = await askConfirm(context, RegistersStrings.of(context).actDeleteConfirm, destructive: true);
    if (ok) await cubit.delete(activity);
  }

  @override
  Widget build(BuildContext context) {
    final s = RegistersStrings.of(context);
    final a = activity;
    final meta = [
      s.actParticipants(regNumber(context, a.participantsCount)),
      if ((a.organizer ?? '').isNotEmpty) a.organizer!,
    ].join(' · ');
    return AppCard(
      title: a.title,
      trailing: GovBadge(GovTone.neutral, s.activityType(a.activityType)),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Text(regDate(context, a.activityDate), style: Theme.of(context).textTheme.bodySmall),
        const SizedBox(height: 4),
        Text(meta),
        if ((a.outcome ?? '').isNotEmpty) ...[const SizedBox(height: 4), Text(a.outcome!)],
        const SizedBox(height: 8),
        Wrap(spacing: 8, children: [
          AppButton(
            key: Key('activityEdit_${a.id}'),
            label: s.edit,
            icon: Icons.edit_outlined,
            variant: AppButtonVariant.secondary,
            onPressed: () => _openForm(context, a),
          ),
          AppButton(
            key: Key('activityDelete_${a.id}'),
            label: s.delete,
            icon: Icons.delete_outline,
            variant: AppButtonVariant.danger,
            onPressed: () => _delete(context),
          ),
        ]),
      ]),
    );
  }
}

class _ActivityForm extends StatefulWidget {
  const _ActivityForm({this.editing});

  final WelfareActivity? editing;

  @override
  State<_ActivityForm> createState() => _ActivityFormState();
}

class _ActivityFormState extends State<_ActivityForm> {
  final _form = GlobalKey<FormState>();
  late final _title = TextEditingController(text: widget.editing?.title ?? '');
  late final _count = TextEditingController(text: '${widget.editing?.participantsCount ?? 0}');
  late final _organizer = TextEditingController(text: widget.editing?.organizer ?? '');
  late final _outcome = TextEditingController(text: widget.editing?.outcome ?? '');
  late String _date = widget.editing?.activityDate ?? isoDay(DateTime.now());
  late String _type = widget.editing?.activityType ?? 'welfare';
  bool _tried = false;

  @override
  void dispose() {
    for (final c in [_title, _count, _organizer, _outcome]) {
      c.dispose();
    }
    super.dispose();
  }

  String? _validateCount(String? v) {
    final n = parseLocalNumber(v ?? '');
    return n == null || n < 0 || n != n.truncate() ? RegistersStrings.of(context).actCountInvalid : null;
  }

  Future<void> _save() async {
    if (!(_form.currentState?.validate() ?? false)) return;
    setState(() => _tried = true);
    final organizer = _organizer.text.trim();
    final outcome = _outcome.text.trim();
    final input = ActivityInput(
      activityDate: _date,
      title: _title.text.trim(),
      activityType: _type,
      participantsCount: (parseLocalNumber(_count.text) ?? 0).toInt(),
      organizer: organizer.isEmpty ? null : organizer,
      outcome: outcome.isEmpty ? null : outcome,
    );
    final ok = await context.read<WelfareActivitiesCubit>().save(input, editing: widget.editing);
    if (ok && mounted) Navigator.of(context).pop();
  }

  @override
  Widget build(BuildContext context) {
    final s = RegistersStrings.of(context);
    return Padding(
      padding: EdgeInsets.fromLTRB(16, 16, 16, 16 + MediaQuery.viewInsetsOf(context).bottom),
      child: Form(
        key: _form,
        child: ListView(shrinkWrap: true, children: [
          Text(widget.editing == null ? s.actAddTitle : s.actEditTitle,
              style: Theme.of(context).textTheme.titleLarge),
          Text(s.actFormHint, style: Theme.of(context).textTheme.bodySmall),
          const SizedBox(height: 12),
          GovField(key: const Key('activityTitle'), controller: _title, label: '${s.actTitleLabel} *'),
          RegDateField(label: s.actDate, value: _date, onChanged: (v) => setState(() => _date = v)),
          Padding(
            padding: const EdgeInsets.only(bottom: 12),
            child: DropdownButtonFormField<String>(
              key: const Key('activityType'),
              initialValue: _type,
              isExpanded: true,
              decoration: InputDecoration(labelText: s.actType),
              items: [
                for (final t in welfareActivityTypes) DropdownMenuItem(value: t, child: Text(s.activityType(t))),
              ],
              onChanged: (v) => setState(() => _type = v ?? _type),
            ),
          ),
          GovField(
            key: const Key('activityCount'),
            controller: _count,
            label: s.actParticipantsLabel,
            keyboardType: TextInputType.number,
            validator: _validateCount,
          ),
          GovField(controller: _organizer, label: s.actOrganizer, required: false),
          GovField(controller: _outcome, label: s.actOutcome, required: false, lines: 3),
          BlocBuilder<WelfareActivitiesCubit, ListFormState<List<WelfareActivity>>>(
            builder: (context, state) => Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
              if (_tried) RegActionError(error: state.actionError),
              AppButton(
                key: const Key('activitySave'),
                label: s.save,
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
