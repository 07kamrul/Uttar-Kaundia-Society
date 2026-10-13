import 'dart:io';

import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:image_picker/image_picker.dart';

import '../../../../l10n/app_localizations.dart';
import '../../../../core/enums/enums.dart';
import '../../domain/registration_validators.dart';
import '../bloc/registration_bloc.dart';
import 'dag_help_sheet.dart';
import 'registration_inputs.dart';
import 'registration_l10n.dart';

/// Step 2: property count + N serially-numbered property blocks
/// (property-list/property-item components).
class PropertyStep extends StatelessWidget {
  const PropertyStep({super.key});

  @override
  Widget build(BuildContext context) {
    final state = context.watch<RegistrationBloc>().state;
    final bloc = context.read<RegistrationBloc>();
    final l10n = AppLocalizations.of(context);
    final f = state.form;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        RegSectionTitle(text: l10n.registrationStepTitlesProperty),
        if (!state.flags.addPropertyButton)
        RegSectionCard(
          child: RegDropdown(
            label: l10n.registrationPropertyCountLabel,
            required: true,
            value: f.propertyCount?.toString() ?? '',
            items: [for (var i = 1; i <= 9; i++) '$i'],
            error: findError(state.stepErrors, RegErrorKind.propertyCountRequired) != null
                ? l10n.registrationValidationPropertyCountRequired
                : null,
            onChanged: (v) => bloc.add(PropertyCountChanged(int.tryParse(v ?? '') ?? 0)),
          ),
        ),
        for (var i = 0; i < f.properties.length; i++) _PropertyCard(index: i),
        if (state.flags.addPropertyButton)
          Padding(
            padding: const EdgeInsets.only(top: 8),
            child: OutlinedButton.icon(
              key: const Key('addPropertyButton'),
              style: OutlinedButton.styleFrom(minimumSize: const Size(48, 52)),
              icon: const Icon(Icons.add),
              onPressed: f.properties.length >= maxProperties ? null : () => bloc.add(const PropertyAdded()),
              label: Text(l10n.regAddProperty),
            ),
          ),
        if (state.fileError != null && state.fileError!.propertyIndex != null)
          Padding(
            padding: const EdgeInsets.only(top: 8),
            child: _fileErrorText(context, state.fileError!),
          ),
      ],
    );
  }
}

Widget _fileErrorText(BuildContext context, FilePickError error) {
  final l10n = AppLocalizations.of(context);
  final theme = Theme.of(context);
  return Text(
    error.kind == FileErrorKind.type
        ? l10n.registrationPropertyDocFileTypeError
        : l10n.registrationPropertyDocFileSizeError(5),
    style: theme.textTheme.bodySmall?.copyWith(color: theme.colorScheme.error),
  );
}

/// Lays checkbox options out in two columns when there is room.
class _OptionGrid extends StatelessWidget {
  const _OptionGrid({required this.children});

  final List<Widget> children;

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(
      builder: (context, constraints) {
        final twoColumns = constraints.maxWidth >= 440;
        final width = twoColumns ? (constraints.maxWidth - 8) / 2 : constraints.maxWidth;
        return Wrap(
          spacing: 8,
          children: [for (final c in children) SizedBox(width: width, child: c)],
        );
      },
    );
  }
}

class _PropertyCard extends StatelessWidget {
  const _PropertyCard({required this.index});

  final int index;

  @override
  Widget build(BuildContext context) {
    final state = context.watch<RegistrationBloc>().state;
    final bloc = context.read<RegistrationBloc>();
    final l10n = AppLocalizations.of(context);
    final p = state.form.properties[index];
    final errs = state.stepErrors;
    final flags = state.flags;
    final numeric = flags.simplifiedUi;
    final dagUnknown = flags.dagUnknown && p.dagUnknown;

    String? propErr(RegErrorKind kind) {
      final e = findError(errs, kind, propertyIndex: index);
      return e == null ? null : regErrorMessage(l10n, e);
    }

    void change(PropertyField field, String v) => bloc.add(PropertyFieldChanged(index, field, v));

    return RegSectionCard(
      title: '${l10n.registrationPropertyItemTitle} #${index + 1}',
      icon: Icons.home_work_outlined,
      trailing: flags.addPropertyButton && state.form.properties.length > 1
          ? IconButton(
              key: Key('removeProperty_$index'),
              tooltip: l10n.regRemoveProperty,
              constraints: const BoxConstraints(minWidth: 48, minHeight: 48),
              icon: const Icon(Icons.delete_outline),
              onPressed: () => bloc.add(PropertyRemoved(index)),
            )
          : null,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          RegLabel(
            required: true,
            text: l10n.registrationPropertyTypeLabel,
            error: propErr(RegErrorKind.propertyTypeRequired),
          ),
          _OptionGrid(
            children: [
              for (final t in state.propertyTypes)
                RegCheckboxRow(
                  value: p.propertyType.contains(t),
                  label: t,
                  onChanged: (_) => bloc.add(PropertyTypeToggled(index, t)),
                ),
            ],
          ),
          if (p.propertyType.contains('অন্যান্য'))
            Padding(
              padding: const EdgeInsets.only(top: 4),
              child: RegTextField(
                label: l10n.registrationPropertyTypeOtherPlaceholder,
                value: p.propertyTypeOther,
                onChanged: (v) => change(PropertyField.propertyTypeOther, v),
              ),
            ),
          const SizedBox(height: 12),
          RegFieldPair(
            first: RegTextField(
              label: l10n.registrationPropertyKhatianNoLabel,
              required: true,
              value: p.khatianNo,
              prefixIcon: Icons.tag,
              hint: numeric ? l10n.regDagExample : null,
              keyboardType: numeric ? TextInputType.text : null,
              inputFormatters: numeric ? const [AsciiDigitsFormatter()] : null,
              error: propErr(RegErrorKind.khatianRequired),
              onChanged: (v) => change(PropertyField.khatianNo, v),
            ),
            second: RegTextField(
              label: l10n.registrationPropertyHoldingNumberLabel,
              value: p.holdingNumber,
              prefixIcon: Icons.numbers,
              inputFormatters: numeric ? const [AsciiDigitsFormatter()] : null,
              onChanged: (v) => change(PropertyField.holdingNumber, v),
            ),
          ),
          const SizedBox(height: 12),
          RegLabel(required: !dagUnknown, text: l10n.registrationPropertyDagNoLabel),
          const SizedBox(height: 6),
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(
                child: RegTextField(
                  label: 'CS',
                  value: p.dagNoCs,
                  keyboardType: numeric ? TextInputType.text : null,
                  inputFormatters: numeric ? const [AsciiDigitsFormatter()] : null,
                  error: _dagError(context, 'cs'),
                  onChanged: (v) => change(PropertyField.dagNoCs, v),
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: RegTextField(
                  label: 'RS',
                  value: p.dagNoRs,
                  keyboardType: numeric ? TextInputType.text : null,
                  inputFormatters: numeric ? const [AsciiDigitsFormatter()] : null,
                  error: _dagError(context, 'rs'),
                  onChanged: (v) => change(PropertyField.dagNoRs, v),
                ),
              ),
            ],
          ),
          if (flags.dagUnknown) ...[
            RegCheckboxRow(
              key: Key('dagUnknownCheckbox_$index'),
              value: p.dagUnknown,
              label: l10n.regDagUnknownCheckbox,
              onChanged: (v) => bloc.add(DagUnknownToggled(index, v)),
            ),
            Align(
              alignment: AlignmentDirectional.centerStart,
              child: TextButton.icon(
                key: Key('dagHelpLink_$index'),
                icon: const Icon(Icons.help_outline, size: 20),
                onPressed: () => showDagHelpSheet(context),
                label: Text(l10n.regDagHelpLink),
              ),
            ),
          ],
          const SizedBox(height: 12),
          RegFieldPair(
            first: RegTextField(
              label: l10n.registrationPropertyLandQuantityLabel,
              required: true,
              value: p.landQuantity,
              keyboardType: const TextInputType.numberWithOptions(decimal: true),
              inputFormatters: numeric ? const [AsciiDigitsFormatter()] : null,
              hint: l10n.registrationPropertyLandQuantityPlaceholder,
              error: propErr(RegErrorKind.landQuantityRequired) ??
                  propErr(RegErrorKind.landQuantityInvalid),
              onChanged: (v) => change(PropertyField.landQuantity, v),
            ),
            second: RegTextField(
              label: l10n.registrationPropertyMyShareQuantityLabel,
              required: true,
              value: p.myShareQuantity,
              keyboardType: const TextInputType.numberWithOptions(decimal: true),
              inputFormatters: numeric ? const [AsciiDigitsFormatter()] : null,
              hint: l10n.registrationPropertyMyShareQuantityPlaceholder,
              error: propErr(RegErrorKind.shareQuantityRequired) ??
                  propErr(RegErrorKind.shareQuantityInvalid) ??
                  propErr(RegErrorKind.shareQuantityExceedsTotal),
              onChanged: (v) => change(PropertyField.myShareQuantity, v),
            ),
          ),
          const SizedBox(height: 12),
          _OwnershipField(index: index, error: propErr(RegErrorKind.ownershipRequired)),
          if (p.isJoint)
            Padding(
              padding: const EdgeInsets.only(top: 4),
              child: RegTextField(
                label: l10n.registrationPropertyJointOwnerCountLabel,
                required: true,
                value: p.jointOwnerCount?.toString() ?? '',
                prefixIcon: Icons.groups_outlined,
                keyboardType: TextInputType.number,
                error: propErr(RegErrorKind.jointOwnerCountRequired),
                onChanged: (v) => bloc.add(JointOwnerCountChanged(index, int.tryParse(v))),
              ),
            ),
          const SizedBox(height: 16),
          if (flags.minOneProof)
            _ProofSection(index: index, error: propErr(RegErrorKind.proofRequired))
          else ...[
            RegLabel(
              required: true,
              text: l10n.registrationPropertyApplicableDocsLabel,
              error: propErr(RegErrorKind.applicableDocsRequired),
            ),
            for (final docType in state.documentOptions) _DocSection(index: index, docType: docType),
          ],
        ],
      ),
    );
  }

  String? _dagError(BuildContext context, String which) {
    final state = context.watch<RegistrationBloc>().state;
    final l10n = AppLocalizations.of(context);
    final kind = which == 'cs' ? RegErrorKind.dagCsRequired : RegErrorKind.dagRsRequired;
    final e = findError(state.stepErrors, kind, propertyIndex: index);
    return e == null ? null : regErrorMessage(l10n, e).split(': ').last;
  }
}

class _OwnershipField extends StatelessWidget {
  const _OwnershipField({required this.index, required this.error});

  final int index;
  final String? error;

  @override
  Widget build(BuildContext context) {
    final state = context.watch<RegistrationBloc>().state;
    final bloc = context.read<RegistrationBloc>();
    final l10n = AppLocalizations.of(context);
    final p = state.form.properties[index];
    final group = p.ownership == OwnershipType.unknown ? null : p.ownership;
    return RegLabel(
      required: true,
      text: l10n.registrationPropertyOwnershipLabel,
      error: error,
      child: Row(
        children: [
          Expanded(
            child: RegRadioRow<OwnershipType>(
              value: OwnershipType.single,
              groupValue: group,
              label: 'একক',
              onChanged: (o) => bloc.add(OwnershipSelected(index, o)),
            ),
          ),
          Expanded(
            child: RegRadioRow<OwnershipType>(
              value: OwnershipType.joint,
              groupValue: group,
              label: 'যৌথ',
              onChanged: (o) => bloc.add(OwnershipSelected(index, o)),
            ),
          ),
        ],
      ),
    );
  }
}

/// One checkbox + per-doc attachment picker (JPG/PNG/PDF ≤5MB).
class _DocSection extends StatelessWidget {
  const _DocSection({required this.index, required this.docType});

  final int index;
  final String docType;

  Future<void> _pickFile(BuildContext context) async {
    final bloc = context.read<RegistrationBloc>();
    final result = await FilePicker.platform.pickFiles(
      type: FileType.custom,
      allowedExtensions: ['jpg', 'jpeg', 'png', 'pdf'],
    );
    final file = result?.files.singleOrNull;
    if (file == null || file.path == null) return;
    bloc.add(DocFileAttached(index, docType, file.path!, file.name));
  }

  @override
  Widget build(BuildContext context) {
    final state = context.watch<RegistrationBloc>().state;
    final bloc = context.read<RegistrationBloc>();
    final l10n = AppLocalizations.of(context);
    final theme = Theme.of(context);
    final p = state.form.properties[index];
    final doc = p.applicableDocs.where((d) => d.type == docType).firstOrNull;
    final missing = findError(
          state.stepErrors,
          RegErrorKind.docFileRequired,
          propertyIndex: index,
          docType: docType,
        ) !=
        null;
    final errorStyle = theme.textTheme.bodySmall?.copyWith(color: theme.colorScheme.error);

    return Padding(
      padding: const EdgeInsets.only(top: 4),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          RegCheckboxRow(
            value: doc != null,
            label: docType,
            onChanged: (_) => bloc.add(DocToggled(index, docType)),
          ),
          if (doc != null)
            Padding(
              padding: const EdgeInsetsDirectional.only(start: 38, bottom: 8),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  if (doc.hasFile)
                    RegFileChip(
                      fileName: doc.fileName,
                      removeLabel: l10n.registrationPropertyRemoveFileButton,
                      onRemove: () => bloc.add(DocFileRemoved(index, docType)),
                    )
                  else
                    OutlinedButton.icon(
                      icon: const Icon(Icons.attach_file, size: 18),
                      label: Text(l10n.registrationPropertyAttachFileButton),
                      onPressed: () => _pickFile(context),
                    ),
                  const SizedBox(height: 4),
                  Text(
                    l10n.registrationPropertyMaxFileSizeNote(5),
                    style: theme.textTheme.bodySmall?.copyWith(fontSize: 11),
                  ),
                  if (missing && !doc.hasFile)
                    Text(l10n.registrationPropertyDocFileMissing, style: errorStyle),
                  if (doc.hasFile && !File(doc.path!).existsSync())
                    Text(l10n.registrationDraftReattachFilesNotice, style: errorStyle),
                ],
              ),
            ),
        ],
      ),
    );
  }
}

/// Camera / gallery-or-file picker used for proofs; returns (path, name) or null.
Future<(String, String)?> _pickProof(BuildContext context) async {
  final l10n = AppLocalizations.of(context);
  final source = await showModalBottomSheet<String>(
    context: context,
    useSafeArea: true,
    builder: (sheet) => Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        ListTile(
          leading: const Icon(Icons.photo_camera_outlined),
          title: Text(l10n.regPickCamera),
          onTap: () => Navigator.of(sheet).pop('camera'),
        ),
        ListTile(
          leading: const Icon(Icons.photo_library_outlined),
          title: Text(l10n.regPickFile),
          onTap: () => Navigator.of(sheet).pop('file'),
        ),
      ],
    ),
  );
  if (source == null) return null;
  if (source == 'camera') {
    final shot = await ImagePicker().pickImage(source: ImageSource.camera);
    return shot == null ? null : (shot.path, shot.name);
  }
  final result = await FilePicker.platform.pickFiles(
    type: FileType.custom,
    allowedExtensions: ['jpg', 'jpeg', 'png', 'pdf'],
  );
  final file = result?.files.singleOrNull;
  return file?.path == null ? null : (file!.path!, file.name);
}

/// regMinOneProof: any one of the proof papers is enough. Attaching a file
/// ticks its document type; there are no per-document checkboxes.
class _ProofSection extends StatelessWidget {
  const _ProofSection({required this.index, required this.error});

  final int index;
  final String? error;

  @override
  Widget build(BuildContext context) {
    final state = context.watch<RegistrationBloc>().state;
    final bloc = context.read<RegistrationBloc>();
    final l10n = AppLocalizations.of(context);
    final theme = Theme.of(context);
    final p = state.form.properties[index];
    return Column(
      key: Key('proofSection_$index'),
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        RegLabel(required: true, text: l10n.regProofTitle, error: error),
        const SizedBox(height: 2),
        Text(l10n.regProofHelp, style: theme.textTheme.bodySmall),
        for (final docType in state.documentOptions)
          Builder(builder: (context) {
            final doc = p.applicableDocs.where((d) => d.type == docType).firstOrNull;
            final attached = doc?.hasFile ?? false;
            return Padding(
              padding: const EdgeInsets.only(top: 8),
              child: attached
                  ? RegFileChip(
                      fileName: '$docType - ${doc!.fileName}',
                      removeLabel: l10n.registrationPropertyRemoveFileButton,
                      onRemove: () => bloc.add(DocToggled(index, docType)),
                    )
                  : OutlinedButton.icon(
                      style: OutlinedButton.styleFrom(
                        alignment: AlignmentDirectional.centerStart,
                        minimumSize: const Size(48, 48),
                      ),
                      icon: const Icon(Icons.attach_file, size: 20),
                      label: Text('$docType - ${l10n.regProofAttach}', overflow: TextOverflow.ellipsis),
                      onPressed: () async {
                        final picked = await _pickProof(context);
                        if (picked != null) bloc.add(DocFileAttached(index, docType, picked.$1, picked.$2));
                      },
                    ),
            );
          }),
        if (state.fileError != null && state.fileError!.propertyIndex == index)
          Padding(
            padding: const EdgeInsets.only(top: 6),
            child: _fileErrorText(context, state.fileError!),
          ),
      ],
    );
  }
}

extension _SingleOrNull<T> on Iterable<T> {
  T? get singleOrNull => isEmpty ? null : (length == 1 ? first : null);
}
