import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';

import '../../../core/di/injector.dart';
import '../../../core/network/api_client.dart';
import '../../../shared/widgets/widgets.dart';
import '../../governance/pages/governance_labels.dart' show GovTone;
import '../../governance/pages/governance_widgets.dart' show GovBadge, GovCard, GovField;
import '../../governance/presentation/list_form_cubit.dart';
import '../../member/presentation/widgets/member_ui.dart' show NoticeBanner, NoticeTone;
import '../data/fund_controls_repository.dart';
import '../domain/fund_controls_entities.dart';
import '../presentation/bloc/fund_controls_cubit.dart';
import '../presentation/fund_strings.dart';
import '../presentation/registers_strings.dart';
import 'fund_audit_section.dart';
import 'fund_signatories_section.dart';
import 'fund_welfare_section.dart';
import 'register_widgets.dart';

/// `/fund-controls` (any of fund.manage, signatory.manage, audit_report.manage,
/// welfare_fund.review). One tab per section; a tab only shows when the user
/// holds its permission ([fundSectionPermissions]).
class FundControlsPage extends StatelessWidget {
  const FundControlsPage({
    super.key,
    this.repository,
    this.permissions,
    this.openFile = saveAndOpenFile,
    this.pickFile = pickAuditFile,
  });

  final FundControlsRepository? repository;

  /// Defaults to the signed-in session's permissions.
  final Set<String>? permissions;
  final FileOpener openFile;
  final AuditFilePicker pickFile;

  @override
  Widget build(BuildContext context) {
    return BlocProvider(
      create: (_) => FundControlsCubit(
        repository ?? FundControlsRepository(apiClient: sl<ApiClient>()),
        permissions: permissions ?? sessionPermissions(),
      )..load(),
      child: _FundTabs(openFile: openFile, pickFile: pickFile),
    );
  }
}

class _FundTabs extends StatefulWidget {
  const _FundTabs({required this.openFile, required this.pickFile});

  final FileOpener openFile;
  final AuditFilePicker pickFile;

  @override
  State<_FundTabs> createState() => _FundTabsState();
}

class _FundTabsState extends State<_FundTabs> {
  int _index = 0;

  @override
  Widget build(BuildContext context) {
    final s = FundStrings.of(context);
    final cubit = context.read<FundControlsCubit>();
    final sections = cubit.sections;
    return DefaultTabController(
      length: sections.length,
      child: RegisterPage<FundControlsCubit, FundControlsData>(
        title: s.title,
        subtitle: s.subtitle,
        icon: Icons.shield_outlined,
        loadError: s.loadFailed,
        toolbar: [
          AppTabs(
            labels: [for (final sec in sections) s.tab(sec)],
            selectedIndex: _index,
            onChanged: (i) => setState(() => _index = i),
          ),
        ],
        builder: (context, data, state) => [
          if (data.reminder case final r? when r.reminderWindowActive && !r.currentFyReportExists)
            NoticeBanner(tone: NoticeTone.warning, message: '${s.reminderTitle(r.fiscalYear)}\n${s.reminderBody}'),
          RegActionError(error: state.actionError),
          ..._section(sections[_index.clamp(0, sections.length - 1)], data, state),
        ],
      ),
    );
  }

  List<Widget> _section(FundSection section, FundControlsData data, ListFormState<FundControlsData> state) {
    return switch (section) {
      FundSection.incomePolicy => [_sectionOr(data.settings, (v) => _IncomePolicy(settings: v))],
      FundSection.threshold => [_sectionOr(data.settings, (v) => _Threshold(settings: v, busy: state.busy))],
      FundSection.signatories => [
          _sectionOr(data.signatories,
              (v) => SignatoriesSection(rows: v, members: data.members, openFile: widget.openFile)),
        ],
      FundSection.audit => [
          _sectionOr(data.reports,
              (v) => AuditSection(reports: v, openFile: widget.openFile, pickFile: widget.pickFile)),
        ],
      FundSection.welfare => [_sectionOr(data.welfare, (v) => WelfareQueueSection(rows: v))],
    };
  }

  Widget _sectionOr<T>(SectionData<T> section, Widget Function(T value) build) {
    final value = section.value;
    if (value != null) return build(value);
    if (!section.failed) return const SizedBox.shrink();
    return InlineError(
      message: RegistersStrings.of(context).loadFailed,
      onRetry: context.read<FundControlsCubit>().load,
    );
  }
}

class _IncomePolicy extends StatelessWidget {
  const _IncomePolicy({required this.settings});

  final FundSettings settings;

  @override
  Widget build(BuildContext context) {
    final s = FundStrings.of(context);
    return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      GovCard(title: s.incomeTitle, hint: s.incomeHint, icon: Icons.account_balance_outlined, children: [
        for (final src in settings.incomeSources)
          Padding(
            padding: const EdgeInsets.only(bottom: 6),
            child: Row(children: [
              Expanded(child: Text(s.isBn ? src.bn : src.en)),
              if (src.requiresJustification) GovBadge(GovTone.warn, s.needsJustification),
            ]),
          ),
      ]),
      NoticeBanner(tone: NoticeTone.warning, message: '${s.foreignTitle}: ${s.foreignBody}'),
    ]);
  }
}

class _Threshold extends StatefulWidget {
  const _Threshold({required this.settings, required this.busy});

  final FundSettings settings;
  final bool busy;

  @override
  State<_Threshold> createState() => _ThresholdState();
}

class _ThresholdState extends State<_Threshold> {
  final _form = GlobalKey<FormState>();
  late final _value = TextEditingController(text: '${widget.settings.expenseTwoPersonThreshold}');

  @override
  void dispose() {
    _value.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    if (!(_form.currentState?.validate() ?? false)) return;
    final s = FundStrings.of(context);
    final ok = await context.read<FundControlsCubit>().saveThreshold(parseLocalNumber(_value.text) ?? 0);
    if (ok && mounted) showAppToast(context, s.saved);
  }

  @override
  Widget build(BuildContext context) {
    final s = FundStrings.of(context);
    final settings = widget.settings;
    return GovCard(title: s.thresholdTitle, hint: s.thresholdHint, icon: Icons.rule_outlined, children: [
      Row(children: [
        Expanded(
          child: Text(regTaka(context, settings.expenseTwoPersonThreshold),
              style: Theme.of(context).textTheme.headlineSmall),
        ),
        if (settings.thresholdIsDefault) GovBadge(GovTone.neutral, s.defaultTag),
      ]),
      const SizedBox(height: 12),
      Form(
        key: _form,
        child: GovField(
          key: const Key('thresholdValue'),
          controller: _value,
          label: s.newThreshold,
          keyboardType: const TextInputType.numberWithOptions(decimal: true),
          validator: (v) {
            final n = parseLocalNumber(v ?? '');
            return n == null || n < 0 ? s.amountInvalid : null;
          },
        ),
      ),
      AppButton(
        key: const Key('thresholdSave'),
        label: s.thresholdSave,
        icon: Icons.check,
        loading: widget.busy,
        onPressed: _save,
      ),
    ]);
  }
}
