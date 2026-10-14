import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:go_router/go_router.dart';

import '../../../core/di/injector.dart';
import '../../../core/format/bn_format.dart';
import '../../../core/layout/responsive.dart';
import '../../../core/network/api_client.dart';
import '../../../core/theme/app_theme.dart';
import '../../../l10n/app_localizations.dart';
import '../../../shared/widgets/widgets.dart';
import '../data/admin_repository.dart';
import '../domain/today_entities.dart';
import '../presentation/bloc/today_cubit.dart';

/// "আজকের কাজ": the admin landing with admin_console. One count card per
/// section the account may see (the server nulls the rest); cards whose page
/// exists in the app open it. Overdue counts are red and say "দেরি হয়েছে".
class TodayPage extends StatelessWidget {
  const TodayPage({super.key, this.repository});

  final AdminRepository? repository;

  @override
  Widget build(BuildContext context) {
    return BlocProvider(
      create: (_) => TodayCubit(
        repository: repository ?? AdminRepository(apiClient: sl<ApiClient>()),
      )..load(),
      child: const _TodayView(),
    );
  }
}

class _TodayView extends StatelessWidget {
  const _TodayView();

  @override
  Widget build(BuildContext context) {
    final loc = AppLocalizations.of(context);
    final cubit = context.read<TodayCubit>();
    return BlocBuilder<TodayCubit, TodayState>(
      builder: (context, state) => PageBody(
        onRefresh: cubit.load,
        children: [
          PageHeader(title: loc.todayTitle, icon: Icons.checklist_rtl_outlined),
          switch (state.status) {
            TodayStatus.loading => const SkeletonLoader(lines: 4, height: 76),
            TodayStatus.error => InlineError(message: loc.todayLoadError, onRetry: cubit.load),
            TodayStatus.loaded => _Cards(summary: state.summary!),
          },
        ],
      ),
    );
  }
}

class _Spec {
  const _Spec({
    required this.name,
    required this.label,
    required this.count,
    required this.icon,
    this.route,
    this.overdue = 0,
    this.dueSoon = 0,
  });

  final String name;
  final String label;
  final int count;
  final IconData icon;
  final String? route;
  final int overdue;
  final int dueSoon;
}

class _Cards extends StatelessWidget {
  const _Cards({required this.summary});

  final TodaySummary summary;

  List<_Spec> _specs(AppLocalizations l) {
    final a = summary.applications;
    final c = summary.complaints;
    final t = summary.committeeTerms;
    return [
      if ((a?.registrationsPending ?? 0) > 0)
        _Spec(name: 'registrations', label: l.todayRegistrations, count: a!.registrationsPending!,
            icon: Icons.assignment_ind_outlined, route: '/submissions'),
      if ((a?.membershipApplicationsOpen ?? 0) > 0)
        _Spec(name: 'membershipApplications', label: l.todayMembershipApplications,
            count: a!.membershipApplicationsOpen!, icon: Icons.card_membership_outlined),
      if ((summary.needsDag ?? 0) > 0)
        _Spec(name: 'needsDag', label: l.todayNeedsDag, count: summary.needsDag!,
            icon: Icons.pin_drop_outlined, route: '/submissions'),
      if ((summary.paymentVerifications?.total ?? 0) > 0)
        _Spec(name: 'payments', label: l.todayPaymentVerifications,
            count: summary.paymentVerifications!.total, icon: Icons.fact_check_outlined,
            route: '/payment-verifications'),
      if ((c?.open ?? 0) > 0)
        _Spec(name: 'complaints', label: l.todayComplaints, count: c!.open,
            icon: Icons.report_problem_outlined, overdue: c.overdue, dueSoon: c.dueSoon),
      if ((summary.propertyRequests ?? 0) > 0)
        _Spec(name: 'propertyRequests', label: l.todayPropertyRequests,
            count: summary.propertyRequests!, icon: Icons.home_work_outlined,
            route: '/property-requests'),
      if ((summary.boundaries ?? 0) > 0)
        _Spec(name: 'boundaries', label: l.todayBoundaries, count: summary.boundaries!,
            icon: Icons.map_outlined),
      if (((t?.expiringSoon ?? 0) + (t?.expired ?? 0)) > 0)
        _Spec(name: 'committee', label: l.todayCommitteeTerms,
            count: t!.expiringSoon + t.expired, icon: Icons.groups_outlined, overdue: t.expired),
      if ((summary.phoneFixes ?? 0) > 0)
        _Spec(name: 'phoneFixes', label: l.todayPhoneFixes, count: summary.phoneFixes!,
            icon: Icons.phone_android_outlined),
    ];
  }

  @override
  Widget build(BuildContext context) {
    final loc = AppLocalizations.of(context);
    final specs = _specs(loc);
    if (specs.isEmpty) {
      return EmptyState(message: loc.todayEmpty, icon: Icons.check_circle_outline);
    }
    return Padding(
      padding: EdgeInsets.symmetric(horizontal: context.pageGutter),
      child: LayoutBuilder(
        builder: (context, constraints) {
          final columns = constraints.maxWidth >= 640 ? 2 : 1;
          final width = (constraints.maxWidth - (columns - 1) * 12) / columns;
          return Wrap(
            spacing: 12,
            runSpacing: 12,
            children: [for (final s in specs) SizedBox(width: width, child: _TodayCard(spec: s))],
          );
        },
      ),
    );
  }
}

class _TodayCard extends StatelessWidget {
  const _TodayCard({required this.spec});

  final _Spec spec;

  @override
  Widget build(BuildContext context) {
    final loc = AppLocalizations.of(context);
    final theme = Theme.of(context);
    final digits = loc.localeName;
    final route = spec.route;
    final danger = theme.colorScheme.error;
    return Material(
      key: Key('today_${spec.name}'),
      color: theme.colorScheme.surface,
      borderRadius: BorderRadius.circular(AppRadius.md),
      child: InkWell(
        borderRadius: BorderRadius.circular(AppRadius.md),
        onTap: route == null ? null : () => context.go(route),
        child: Container(
          constraints: const BoxConstraints(minHeight: 72),
          padding: const EdgeInsets.all(12),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(AppRadius.md),
            border: Border.all(color: spec.overdue > 0 ? danger : theme.colorScheme.outlineVariant),
          ),
          child: Row(
            children: [
              Icon(spec.icon, size: 32, color: theme.colorScheme.primary),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(spec.label, style: theme.textTheme.titleSmall),
                    if (spec.overdue > 0)
                      Text('${bnNumber(spec.overdue, locale: digits)} ${loc.todayOverdue}',
                          style: TextStyle(color: danger, fontWeight: FontWeight.w700)),
                    if (spec.dueSoon > 0)
                      Text('${bnNumber(spec.dueSoon, locale: digits)} ${loc.todayDueSoon}',
                          style: theme.textTheme.bodySmall),
                  ],
                ),
              ),
              const SizedBox(width: 8),
              Text(
                bnNumber(spec.count, locale: digits),
                style: theme.textTheme.headlineSmall?.copyWith(
                  fontWeight: FontWeight.w800,
                  color: spec.overdue > 0 ? danger : theme.colorScheme.primary,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
