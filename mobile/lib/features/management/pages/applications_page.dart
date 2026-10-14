import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';

import '../../../core/di/injector.dart';
import '../../../core/feature_flags/feature_flag.dart';
import '../../../core/feature_flags/feature_flag_builder.dart' show flagEnabled;
import '../../../core/format/bn_format.dart';
import '../../../core/network/api_client.dart';
import '../../../core/network/api_error_messages.dart';
import '../../../l10n/app_localizations.dart';
import '../../../shared/widgets/widgets.dart';
import '../../registration/data/config_list_repository.dart';
import '../data/console_repository.dart';
import '../domain/console_entities.dart';
import '../presentation/bloc/console_cubits.dart';
import '../presentation/widgets/management_widgets.dart';
import '../presentation/widgets/queue_search_field.dart';
import 'submissions_list_page.dart';

const _registrationsPermission = 'membership.review';
const _membershipPermission = 'membership_application.manage';

/// "আবেদন": the two intake queues in one place (admin_console). A tab is
/// hidden without its permission; the old routes stay.
class ApplicationsPage extends StatefulWidget {
  const ApplicationsPage({
    super.key,
    this.initialTab,
    this.can,
    this.registrationsBuilder,
    this.membershipBuilder,
    this.onTabChanged,
  });

  /// `registrations` or `membership` (the `?tab=` value).
  final String? initialTab;

  /// Permission check; the session's by default.
  final bool Function(String)? can;
  final WidgetBuilder? registrationsBuilder;
  final WidgetBuilder? membershipBuilder;

  /// Lets the router keep the tab in the URL.
  final ValueChanged<String>? onTabChanged;

  @override
  State<ApplicationsPage> createState() => _ApplicationsPageState();
}

class _ApplicationsPageState extends State<ApplicationsPage> {
  String? _tab;

  bool _can(String p) => (widget.can ?? sl<SessionManager>().session?.can ?? (_) => false)(p);

  List<String> get _tabs => [
        if (_can(_registrationsPermission)) 'registrations',
        if (_can(_membershipPermission)) 'membership',
      ];

  String? get _active {
    final tabs = _tabs;
    final wanted = _tab ?? widget.initialTab;
    return tabs.contains(wanted) ? wanted : (tabs.isEmpty ? null : tabs.first);
  }

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context);
    final tabs = _tabs;
    final active = _active;
    return Column(
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 8, 16, 0),
          child: Wrap(
            spacing: 8,
            children: [
              for (final t in tabs)
                ChoiceChip(
                  key: Key('applicationsTab_$t'),
                  label: Text(t == 'registrations' ? l.adminApplicationsTabRegistrations : l.adminApplicationsTabMembership),
                  selected: active == t,
                  onSelected: (_) {
                    setState(() => _tab = t);
                    widget.onTabChanged?.call(t);
                  },
                ),
            ],
          ),
        ),
        Expanded(
          child: switch (active) {
            'registrations' => (widget.registrationsBuilder ?? (_) => const SubmissionsListPage())(context),
            'membership' => (widget.membershipBuilder ?? (_) => const MembershipApplicationsView())(context),
            _ => EmptyState(message: l.maEmpty),
          },
        ),
      ],
    );
  }
}

/// Config-list category with the admin-editable application reject reasons.
const kApplicationRejectReasonCategory = 'reject_reason_application';

/// Used when the config list is empty or cannot be loaded.
const kApplicationRejectReasonFallback = [
  'কাগজপত্র অস্পষ্ট',
  'খতিয়ান/দাগ মিলছে না',
  'ছবি স্পষ্ট নয়',
  'ডুপ্লিকেট আবেদন',
];

/// "সদস্যপদের আবেদন" queue: status filter, search (admin_console), and the
/// review actions of Angular membership-review (start review / approve / reject).
class MembershipApplicationsView extends StatelessWidget {
  const MembershipApplicationsView({super.key, this.repository, this.searchEnabled, this.reasonSuggestions});

  final MembershipApplicationRepository? repository;

  /// Search box (admin_console); the flag when null.
  final bool? searchEnabled;
  final Future<List<String>> Function()? reasonSuggestions;

  @override
  Widget build(BuildContext context) {
    return BlocProvider(
      create: (_) => MembershipApplicationsCubit(
          repository: repository ?? MembershipApplicationRepository(apiClient: sl<ApiClient>()))
        ..load(),
      child: _AppsBody(
        searchEnabled: searchEnabled ?? flagEnabled(FeatureFlag.adminConsole),
        reasonSuggestions: reasonSuggestions ??
            () => ConfigListRepository(apiClient: sl<ApiClient>())
                .getValues(kApplicationRejectReasonCategory, kApplicationRejectReasonFallback),
      ),
    );
  }
}

class _AppsBody extends StatelessWidget {
  const _AppsBody({required this.searchEnabled, required this.reasonSuggestions});

  final bool searchEnabled;
  final Future<List<String>> Function() reasonSuggestions;

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context);
    return BlocConsumer<MembershipApplicationsCubit, LoadState<MembershipApplication>>(
      listenWhen: (a, b) => a.actionError != b.actionError && b.actionError != null,
      listener: (context, state) => showAppToast(context, apiErrorMessage(l, state.actionError!), error: true),
      builder: (context, state) {
        final cubit = context.read<MembershipApplicationsCubit>();
        final filters = <(String?, String)>[
          ('received', l.maFilterReceived),
          ('under_review', l.maFilterUnderReview),
          ('approved', l.maFilterApproved),
          ('rejected', l.maFilterRejected),
          (null, l.maFilterAll),
        ];
        return PageBody(
          onRefresh: cubit.load,
          children: [
            PageHeader(icon: Icons.badge_outlined, title: l.adminApplicationsTabMembership),
            if (searchEnabled) QueueSearchField(onChanged: cubit.setSearch),
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16),
              child: Wrap(
                spacing: 8,
                children: [
                  for (final (value, label) in filters)
                    ChoiceChip(
                      key: Key('maFilter_${value ?? 'all'}'),
                      label: Text(label),
                      selected: cubit.status == value,
                      onSelected: (_) => cubit.setStatus(value),
                    ),
                ],
              ),
            ),
            const SizedBox(height: 8),
            if (state.loading && state.items.isEmpty)
              const SkeletonLoader(lines: 3, height: 110)
            else if (state.loadFailed)
              InlineError(message: l.maLoadError, onRetry: cubit.load)
            else if (state.items.isEmpty)
              EmptyState(message: l.maEmpty, icon: Icons.inbox_outlined)
            else
              for (final a in state.items)
                _ApplicationCard(app: a, busy: state.busyId == a.id, reasonSuggestions: reasonSuggestions),
          ],
        );
      },
    );
  }
}

String _statusLabel(AppLocalizations l, String status) => switch (status) {
      'received' => l.maFilterReceived,
      'under_review' => l.maFilterUnderReview,
      'approved' => l.maFilterApproved,
      _ => l.maFilterRejected,
    };

class _ApplicationCard extends StatelessWidget {
  const _ApplicationCard({required this.app, required this.busy, required this.reasonSuggestions});

  final MembershipApplication app;
  final bool busy;
  final Future<List<String>> Function() reasonSuggestions;

  Future<void> _reject(BuildContext context) async {
    final l = AppLocalizations.of(context);
    final cubit = context.read<MembershipApplicationsCubit>();
    final suggestions = await reasonSuggestions();
    if (!context.mounted) return;
    final reason = await showReasonDialog(
      context,
      suggestions: suggestions,
      title: l.maRejectTitle,
      summary: '${app.applicationNo} · ${app.fullName}',
      label: l.adminPaymentVerificationsReason,
      hint: l.adminPaymentVerificationsReasonPlaceholder,
      cancelLabel: l.adminPaymentVerificationsCancel,
      confirmLabel: l.maReject,
      validator: (text) => text.length < 3 ? l.adminPaymentVerificationsReason : null,
    );
    if (reason == null || reason.length < 3) return;
    await cubit.reject(app, reason);
  }

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context);
    final theme = Theme.of(context);
    final cubit = context.read<MembershipApplicationsCubit>();
    return Card(
      key: Key('maCard_${app.id}'),
      margin: const EdgeInsets.symmetric(horizontal: 16, vertical: 6),
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Expanded(child: Text(app.fullName, style: theme.textTheme.titleSmall)),
                Chip(label: Text(_statusLabel(l, app.status))),
              ],
            ),
            Text('${l.maNumber}: ${bnNumber(app.applicationNo, locale: l.localeName)} · ${bnNumber(app.mobile, locale: l.localeName)}',
                style: theme.textTheme.bodySmall),
            if (app.rejectionReason != null && app.rejectionReason!.isNotEmpty)
              Padding(
                padding: const EdgeInsets.only(top: 6),
                child: Text(app.rejectionReason!, style: TextStyle(color: theme.colorScheme.error)),
              ),
            if (app.isOpen) ...[
              const SizedBox(height: 8),
              Wrap(
                spacing: 8,
                runSpacing: 8,
                children: [
                  if (app.status == 'received')
                    AppButton(
                      key: Key('maStart_${app.id}'),
                      label: l.maStartReview,
                      variant: AppButtonVariant.secondary,
                      onPressed: busy ? null : () => cubit.startReview(app),
                    ),
                  if (app.status == 'under_review')
                    AppButton(
                      key: Key('maApprove_${app.id}'),
                      label: l.maApprove,
                      icon: Icons.check,
                      onPressed: busy ? null : () => cubit.approve(app),
                    ),
                  AppButton(
                    key: Key('maReject_${app.id}'),
                    label: l.maReject,
                    variant: AppButtonVariant.danger,
                    icon: Icons.close,
                    onPressed: busy ? null : () => _reject(context),
                  ),
                ],
              ),
            ],
          ],
        ),
      ),
    );
  }
}
