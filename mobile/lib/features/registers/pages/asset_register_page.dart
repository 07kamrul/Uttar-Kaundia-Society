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

/// `/asset-register` (asset_register.manage): the society asset register.
class AssetRegisterPage extends StatelessWidget {
  const AssetRegisterPage({super.key, this.repository, this.openFile = saveAndOpenFile});

  final RegistersRepository? repository;
  final FileOpener openFile;

  @override
  Widget build(BuildContext context) {
    final s = RegistersStrings.of(context);
    return BlocProvider(
      create: (_) => AssetRegisterCubit(repository ?? RegistersRepository(apiClient: sl<ApiClient>()))..load(),
      child: Builder(
        builder: (context) {
          final cubit = context.read<AssetRegisterCubit>();
          return RegisterPage<AssetRegisterCubit, List<SocietyAsset>>(
            title: s.assetTitle,
            subtitle: s.assetSubtitle,
            icon: Icons.inventory_2_outlined,
            loadError: s.assetLoadError,
            actions: [
              AppButton(
                key: const Key('assetPdf'),
                label: s.assetPdf,
                icon: Icons.download_outlined,
                variant: AppButtonVariant.secondary,
                onPressed: () => downloadWith(context,
                    fetch: cubit.registerPdf, fileName: 'asset-register-${isoDay(DateTime.now())}.pdf', open: openFile),
              ),
              AppButton(
                key: const Key('assetAdd'),
                label: s.assetAdd,
                icon: Icons.add,
                onPressed: () => _openForm(context),
              ),
            ],
            toolbar: [_Toolbar(cubit: cubit)],
            builder: (context, assets, state) => [
              RegActionError(error: state.actionError),
              if (assets.isEmpty)
                EmptyState(message: s.assetEmpty, icon: Icons.inventory_2_outlined)
              else
                for (final a in assets) _AssetCard(asset: a),
            ],
          );
        },
      ),
    );
  }
}

Future<void> _openForm(BuildContext context, [SocietyAsset? asset]) {
  final cubit = context.read<AssetRegisterCubit>();
  return showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    builder: (_) => BlocProvider.value(value: cubit, child: _AssetForm(editing: asset)),
  );
}

class _Toolbar extends StatefulWidget {
  const _Toolbar({required this.cubit});

  final AssetRegisterCubit cubit;

  @override
  State<_Toolbar> createState() => _ToolbarState();
}

class _ToolbarState extends State<_Toolbar> {
  final _search = TextEditingController();

  @override
  void dispose() {
    _search.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final s = RegistersStrings.of(context);
    final filter = widget.cubit.filter;
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 4),
      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        TextField(
          key: const Key('assetSearch'),
          controller: _search,
          textInputAction: TextInputAction.search,
          decoration: InputDecoration(hintText: s.assetSearch, prefixIcon: const Icon(Icons.search)),
          onSubmitted: (v) => widget.cubit.setFilter(search: v),
        ),
        AppCheckbox(
          key: const Key('assetIncludeInactive'),
          label: s.assetIncludeInactive,
          value: filter.includeInactive,
          onChanged: (v) => setState(() => widget.cubit.setFilter(includeInactive: v)),
        ),
      ]),
    );
  }
}

class _AssetCard extends StatelessWidget {
  const _AssetCard({required this.asset});

  final SocietyAsset asset;

  GovTone get _tone => switch (asset.condition) {
        'good' => GovTone.good,
        'fair' => GovTone.neutral,
        'poor' || 'lost' => GovTone.warn,
        _ => GovTone.neutral,
      };

  Future<void> _deactivate(BuildContext context) async {
    final cubit = context.read<AssetRegisterCubit>();
    final reason = await askReason(context, prompt: RegistersStrings.of(context).assetDeactivateReason);
    if (reason != null) await cubit.deactivate(asset, reason);
  }

  @override
  Widget build(BuildContext context) {
    final s = RegistersStrings.of(context);
    final theme = Theme.of(context);
    final a = asset;
    return AppCard(
      title: a.name,
      trailing: GovBadge(_tone, s.condition(a.condition)),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Wrap(spacing: 8, runSpacing: 4, children: [
          Text(a.assetCode, style: theme.textTheme.bodySmall),
          if (!a.isActive) GovBadge(GovTone.warn, s.assetInactive),
        ]),
        const SizedBox(height: 6),
        DetailRow(label: s.assetCategory, value: a.category),
        DetailRow(label: s.assetAcquired, value: regDate(context, a.acquisitionDate)),
        DetailRow(label: s.assetValue, value: regTaka(context, a.value)),
        if ((a.location ?? '').isNotEmpty) DetailRow(label: s.assetLocation, value: a.location!),
        const SizedBox(height: 8),
        Wrap(spacing: 8, children: [
          AppButton(
            key: Key('assetEdit_${a.id}'),
            label: s.edit,
            icon: Icons.edit_outlined,
            variant: AppButtonVariant.secondary,
            onPressed: () => _openForm(context, a),
          ),
          if (a.isActive)
            AppButton(
              key: Key('assetDelete_${a.id}'),
              label: s.delete,
              icon: Icons.delete_outline,
              variant: AppButtonVariant.danger,
              onPressed: () => _deactivate(context),
            ),
        ]),
      ]),
    );
  }
}

class _AssetForm extends StatefulWidget {
  const _AssetForm({this.editing});

  final SocietyAsset? editing;

  @override
  State<_AssetForm> createState() => _AssetFormState();
}

class _AssetFormState extends State<_AssetForm> {
  final _form = GlobalKey<FormState>();
  late final _name = TextEditingController(text: widget.editing?.name ?? '');
  late final _category = TextEditingController(text: widget.editing?.category ?? '');
  late final _value = TextEditingController(text: widget.editing?.value.toString() ?? '');
  late final _location = TextEditingController(text: widget.editing?.location ?? '');
  late final _description = TextEditingController(text: widget.editing?.description ?? '');
  late String _date = widget.editing?.acquisitionDate ?? isoDay(DateTime.now());
  late String _condition = widget.editing?.condition ?? 'good';
  bool _tried = false;

  @override
  void dispose() {
    for (final c in [_name, _category, _value, _location, _description]) {
      c.dispose();
    }
    super.dispose();
  }

  String? _validateValue(String? v) {
    final n = parseLocalNumber(v ?? '');
    return n == null || n < 0 ? RegistersStrings.of(context).assetValueInvalid : null;
  }

  Future<void> _save() async {
    if (!(_form.currentState?.validate() ?? false)) return;
    setState(() => _tried = true);
    final input = AssetInput(
      name: _name.text.trim(),
      category: _category.text.trim(),
      acquisitionDate: _date,
      value: parseLocalNumber(_value.text) ?? 0,
      condition: _condition,
      location: _location.text.trim().isEmpty ? null : _location.text.trim(),
      description: _description.text.trim().isEmpty ? null : _description.text.trim(),
    );
    final ok = await context.read<AssetRegisterCubit>().save(input, editing: widget.editing);
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
          Text(widget.editing == null ? s.assetAddTitle : s.assetEditTitle,
              style: Theme.of(context).textTheme.titleLarge),
          Text(s.assetFormSubtitle, style: Theme.of(context).textTheme.bodySmall),
          const SizedBox(height: 12),
          GovField(key: const Key('assetName'), controller: _name, label: '${s.assetName} *'),
          GovField(key: const Key('assetCategory'), controller: _category, label: '${s.assetCategory} *'),
          Padding(
            padding: const EdgeInsets.only(bottom: 12),
            child: Wrap(spacing: 8, children: [
              for (final c in assetConditions)
                ChoiceChip(
                  key: Key('assetCondition_$c'),
                  label: Text(s.condition(c)),
                  selected: _condition == c,
                  onSelected: (_) => setState(() => _condition = c),
                ),
            ]),
          ),
          RegDateField(label: s.assetAcquired, value: _date, onChanged: (v) => setState(() => _date = v)),
          GovField(
            key: const Key('assetValue'),
            controller: _value,
            label: '${s.assetValue} *',
            keyboardType: const TextInputType.numberWithOptions(decimal: true),
            validator: _validateValue,
          ),
          GovField(controller: _location, label: s.assetLocation, required: false),
          GovField(controller: _description, label: s.assetDescription, required: false, lines: 3),
          BlocBuilder<AssetRegisterCubit, ListFormState<List<SocietyAsset>>>(
            builder: (context, state) => Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
              if (_tried) RegActionError(error: state.actionError),
              AppButton(
                key: const Key('assetSave'),
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
