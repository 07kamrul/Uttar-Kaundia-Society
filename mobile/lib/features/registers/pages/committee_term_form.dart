import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';

import '../../../shared/widgets/widgets.dart';
import '../../governance/pages/governance_widgets.dart' show GovField;
import '../../governance/presentation/list_form_cubit.dart';
import '../domain/committee_registry_entities.dart';
import '../presentation/bloc/committee_registry_cubit.dart';
import '../presentation/committee_strings.dart';
import 'register_widgets.dart';

/// Opens the create / edit term sheet for [post] (Angular startEditTerm): an
/// existing term is updated, otherwise a new one is created for the member.
Future<void> openTermForm(BuildContext context, RegistryPost post, List<MemberOption> members) {
  final cubit = context.read<CommitteeRegistryCubit>();
  return showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    builder: (_) => BlocProvider.value(value: cubit, child: TermForm(post: post, members: members)),
  );
}

class TermForm extends StatefulWidget {
  const TermForm({super.key, required this.post, required this.members});

  final RegistryPost post;
  final List<MemberOption> members;

  @override
  State<TermForm> createState() => _TermFormState();
}

class _TermFormState extends State<TermForm> {
  final _form = GlobalKey<FormState>();
  late final TermInfo? _term = widget.post.term;
  late int? _memberId = _term?.memberId;
  late String _start = _term?.termStart ?? '';
  late String _end = _term?.termEnd ?? '';
  late bool _caretaker = _term?.isCaretaker ?? false;
  late final _notes = TextEditingController(text: _term?.notes ?? '');
  bool _tried = false;

  bool get _editing => _term != null;

  @override
  void dispose() {
    _notes.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    if (!(_form.currentState?.validate() ?? false)) return;
    final memberId = _memberId;
    if (memberId == null) return;
    setState(() => _tried = true);
    final ok = await context.read<CommitteeRegistryCubit>().saveTerm(
          postKey: widget.post.key,
          memberId: memberId,
          editingTermId: _term?.id,
          input: TermInput(termStart: _start, termEnd: _end, isCaretaker: _caretaker, notes: _notes.text),
        );
    if (ok && mounted) Navigator.of(context).pop();
  }

  @override
  Widget build(BuildContext context) {
    final s = CommitteeStrings.of(context);
    final memberKnown = widget.members.any((m) => m.id == _memberId);
    return Padding(
      padding: EdgeInsets.fromLTRB(16, 16, 16, 16 + MediaQuery.viewInsetsOf(context).bottom),
      child: Form(
        key: _form,
        child: ListView(shrinkWrap: true, children: [
          Text(_editing ? s.editTerm : s.createTermTitle, style: Theme.of(context).textTheme.titleLarge),
          Text(widget.post.label(s.lang), style: Theme.of(context).textTheme.bodySmall),
          const SizedBox(height: 12),
          Padding(
            padding: const EdgeInsets.only(bottom: 12),
            child: DropdownButtonFormField<int>(
              key: const Key('termMember'),
              initialValue: memberKnown ? _memberId : null,
              isExpanded: true,
              decoration: InputDecoration(labelText: s.member),
              items: [for (final m in widget.members) DropdownMenuItem(value: m.id, child: Text(m.display))],
              // The holder of an existing term cannot be swapped (update keeps it).
              onChanged: _editing ? null : (v) => setState(() => _memberId = v),
              validator: (_) => _memberId == null ? s.memberRequired : null,
            ),
          ),
          RegDateField(label: s.termStart, value: _start, onChanged: (v) => setState(() => _start = v)),
          RegDateField(
            label: s.termEnd,
            value: _end,
            isRequired: false,
            onChanged: (v) => setState(() => _end = v),
          ),
          Text(s.termEndHint, style: Theme.of(context).textTheme.bodySmall),
          AppCheckbox(
            key: const Key('termCaretaker'),
            label: s.caretaker,
            value: _caretaker,
            onChanged: (v) => setState(() => _caretaker = v),
          ),
          const SizedBox(height: 8),
          GovField(controller: _notes, label: s.notes, required: false, lines: 2),
          BlocBuilder<CommitteeRegistryCubit, ListFormState<CommitteeData>>(
            builder: (context, state) => Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
              if (_tried) RegActionError(error: state.actionError),
              AppButton(
                key: const Key('termSave'),
                label: s.saveTerm,
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
