import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:go_router/go_router.dart';

import '../../../l10n/app_localizations.dart';
import '../../../shared/widgets/widgets.dart';
import '../../member/presentation/widgets/member_ui.dart';
import '../data/governance_repository.dart';
import '../domain/governance_entities.dart';
import '../presentation/governance_cubits.dart';
import '../presentation/governance_errors.dart';
import '../presentation/list_form_cubit.dart';
import 'governance_widgets.dart';

/// Land-protection complaint (Annex 3): complainant, land, incident, evidence
/// and consent. Sent as JSON `form_data` plus an optional evidence file.
class LandComplaintPage extends StatelessWidget {
  const LandComplaintPage({super.key, this.repository, this.onDone});

  final GovernanceRepository? repository;

  /// Called after a successful submit; defaults to opening the complaints list.
  final VoidCallback? onDone;

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    return BlocProvider(
      create: (_) => ComplaintConstantsCubit(governanceRepo(repository))..load(),
      child: GovPage<ComplaintConstantsCubit, ComplaintConstants>(
        title: l10n.govLandTitle,
        subtitle: l10n.govLandSubtitle,
        icon: Icons.shield_outlined,
        builder: (context, constants, state) => [
          _LandForm(
            constants: constants,
            state: state,
            onDone: onDone ?? () => context.go('/complaints'),
          ),
        ],
      ),
    );
  }
}

class _LandForm extends StatefulWidget {
  const _LandForm({required this.constants, required this.state, required this.onDone});

  final ComplaintConstants constants;
  final ListFormState<ComplaintConstants> state;
  final VoidCallback onDone;

  @override
  State<_LandForm> createState() => _LandFormState();
}

class _LandFormState extends State<_LandForm> {
  final _form = GlobalKey<FormState>();
  final _c = {
    for (final k in [
      'name', 'contact', 'location', 'dag', 'khatian', 'accused', 'description', 'signature',
    ])
      k: TextEditingController(),
  };
  String _incidentDate = '';
  String _signatureDate = '';
  bool _dateMissing = false;
  bool _danger = false;
  bool _disclaimer = false;
  bool _consent = false;
  final _evidence = <String>{};
  String? _filePath;
  String? _fileName;

  @override
  void dispose() {
    for (final c in _c.values) {
      c.dispose();
    }
    super.dispose();
  }

  String _t(String key) => _c[key]!.text.trim();

  Future<void> _pickFile() async {
    final result = await FilePicker.platform.pickFiles(
      type: FileType.custom,
      allowedExtensions: ['jpg', 'jpeg', 'png', 'pdf'],
    );
    final file = result?.files.single;
    if (file?.path == null) return;
    setState(() {
      _filePath = file!.path;
      _fileName = file.name;
    });
  }

  Future<void> _submit() async {
    final valid = _form.currentState?.validate() ?? false;
    setState(() => _dateMissing = _incidentDate.isEmpty);
    if (!valid || _incidentDate.isEmpty) return;
    final ok = await context.read<ComplaintConstantsCubit>().submitLand(
      {
        'complainant_name': _t('name'),
        'complainant_contact': _t('contact'),
        'land_location': _t('location'),
        'dag_no': _t('dag'),
        'khatian_no': _t('khatian'),
        'accused_party': _t('accused'),
        'incident_date': _incidentDate,
        'incident_description': _t('description'),
        'signature_name': _t('signature'),
        'signature_date': _signatureDate,
        'disclaimer_acknowledged': _disclaimer,
        'consent': _consent,
        'emergency_danger': _danger,
        'evidence_checklist': _evidence.toList(),
      },
      evidencePath: _filePath,
      evidenceName: _fileName,
    );
    if (!ok || !mounted) return;
    showAppToast(context, AppLocalizations.of(context).govComplaintsSuccess);
    widget.onDone();
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final theme = Theme.of(context);
    return Form(
      key: _form,
      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        if (_danger && widget.constants.emergencyContacts.isNotEmpty)
          GovCard(
            title: l10n.govLandEmergencyTitle,
            icon: Icons.warning_amber_outlined,
            children: [
              for (final c in widget.constants.emergencyContacts)
                Text('${govNumber(context, c.number)} — ${c.label}', style: theme.textTheme.titleSmall),
            ],
          ),
        GovCard(title: l10n.govLandSectionComplainant, children: [
          GovField(key: const Key('landName'), controller: _c['name']!, label: l10n.govLandName),
          GovField(
              key: const Key('landContact'), controller: _c['contact']!, label: l10n.govLandContact, required: false),
        ]),
        GovCard(title: l10n.govLandSectionLand, children: [
          GovField(key: const Key('landLocation'), controller: _c['location']!, label: l10n.govLandLocation),
          GovField(key: const Key('landDag'), controller: _c['dag']!, label: l10n.govLandDagNo),
          GovField(key: const Key('landKhatian'), controller: _c['khatian']!, label: l10n.govLandKhatianNo),
        ]),
        GovCard(title: l10n.govLandSectionIncident, children: [
          GovField(key: const Key('landAccused'), controller: _c['accused']!, label: l10n.govLandAccused),
          DatePickerField(
            key: const Key('landIncidentDate'),
            label: l10n.govLandIncidentDate,
            value: _incidentDate,
            lastDate: DateTime.now(),
            onPicked: (v) => setState(() {
              _incidentDate = v;
              _dateMissing = false;
            }),
          ),
          if (_dateMissing)
            Padding(
              padding: const EdgeInsets.only(top: 6),
              child: Text(l10n.govFieldRequired, style: TextStyle(color: theme.colorScheme.error)),
            ),
          const SizedBox(height: 12),
          GovField(
              key: const Key('landDescription'),
              controller: _c['description']!,
              label: l10n.govLandIncidentDesc,
              lines: 4),
          AppCheckbox(
            key: const Key('landDanger'),
            label: l10n.govLandDanger,
            value: _danger,
            onChanged: (v) => setState(() => _danger = v),
          ),
        ]),
        GovCard(title: l10n.govLandSectionEvidence, children: [
          for (final item in widget.constants.landEvidenceChecklist)
            AppCheckbox(
              label: item,
              value: _evidence.contains(item),
              onChanged: (v) => setState(() => v ? _evidence.add(item) : _evidence.remove(item)),
            ),
          const SizedBox(height: 8),
          Text(l10n.govLandEvidenceFile, style: theme.textTheme.bodySmall),
          Align(
            alignment: Alignment.centerLeft,
            child: TextButton.icon(
              key: const Key('landPickFile'),
              onPressed: _pickFile,
              icon: const Icon(Icons.attach_file),
              label: Text(_fileName ?? l10n.govLandPickFile, overflow: TextOverflow.ellipsis),
            ),
          ),
        ]),
        GovCard(title: l10n.govLandSectionConsent, children: [
          GovField(key: const Key('landSignature'), controller: _c['signature']!, label: l10n.govLandSignatureName),
          DatePickerField(
            key: const Key('landSignatureDate'),
            label: l10n.govLandSignatureDate,
            value: _signatureDate,
            lastDate: DateTime.now(),
            onPicked: (v) => setState(() => _signatureDate = v),
          ),
          AppCheckbox(
            key: const Key('landDisclaimer'),
            label: l10n.govLandDisclaimer,
            value: _disclaimer,
            onChanged: (v) => setState(() => _disclaimer = v),
          ),
          AppCheckbox(
            key: const Key('landConsent'),
            label: l10n.govLandConsent,
            value: _consent,
            onChanged: (v) => setState(() => _consent = v),
          ),
          GovActionError(error: widget.state.actionError, action: GovAction.landComplaint),
          const SizedBox(height: 8),
          AppButton(
            key: const Key('landSubmit'),
            label: l10n.govLandSubmit,
            icon: Icons.send_outlined,
            expanded: true,
            loading: widget.state.busy,
            onPressed: _disclaimer && _consent ? _submit : null,
          ),
        ]),
      ]),
    );
  }
}
