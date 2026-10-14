import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';

import '../../../core/di/injector.dart';
import '../../../core/feature_flags/feature_flag.dart';
import '../../../core/feature_flags/feature_flag_builder.dart' show flagEnabled;
import '../../../core/network/api_client.dart';
import '../../../core/enums/enums.dart';
import '../../../l10n/app_localizations.dart';
import '../../../shared/widgets/widgets.dart';
import '../data/admin_repository.dart';
import '../domain/admin_entities.dart';
import '../presentation/bloc/submissions_bloc.dart';
import '../presentation/widgets/management_widgets.dart';
import '../presentation/widgets/queue_search_field.dart';
import '../presentation/widgets/submission_detail_widgets.dart' show NeedsDagBadge;

/// Review queue: submissions filtered by status (Angular submissions-list).
class SubmissionsListPage extends StatelessWidget {
  final String? id;
  final String? propertyId;
  final String? returnUrl;

  const SubmissionsListPage(
      {super.key,
      this.id,
      this.propertyId,
      this.returnUrl,
      this.repository,
      this.searchEnabled});

  /// Test seam; the live repository by default.
  final AdminRepository? repository;

  /// Search box (admin_console); read from the feature flag when null.
  final bool? searchEnabled;

  @override
  Widget build(BuildContext context) {
    return BlocProvider(
      create: (_) => SubmissionsBloc(
          repository: repository ?? AdminRepository(apiClient: sl<ApiClient>()))
        ..add(const SubmissionsLoadRequested()),
      child: _SubmissionsView(
          searchEnabled: searchEnabled ?? flagEnabled(FeatureFlag.adminConsole)),
    );
  }
}

class _SubmissionsView extends StatelessWidget {
  const _SubmissionsView({this.searchEnabled = false});

  final bool searchEnabled;

  @override
  Widget build(BuildContext context) {
    final loc = AppLocalizations.of(context);
    return BlocBuilder<SubmissionsBloc, SubmissionsState>(
      builder: (context, state) {
        final bloc = context.read<SubmissionsBloc>();
        return PageBody(
          onRefresh: () => reloadAndWait(
              bloc, const SubmissionsLoadRequested(), (s) => s.loading),
          children: [
            PageHeader(
              icon: Icons.assignment_outlined,
              title: loc.adminSubmissionsListTitle,
              subtitle: loc.adminSubmissionsListSubtitle,
            ),
            if (searchEnabled)
              QueueSearchField(
                  onChanged: (q) => bloc.add(SubmissionsSearchChanged(q))),
            ManagementFilterChips<SubmissionStatus?>(
              label: loc.adminSubmissionsListFilterLabel,
              selected: state.filter,
              options: [
                (null, loc.adminSubmissionsListAllOption),
                for (final s in const [
                  SubmissionStatus.pending,
                  SubmissionStatus.approved,
                  SubmissionStatus.rejected,
                ])
                  (s, statusLabel(loc, s)),
              ],
              onSelected: (filter) =>
                  bloc.add(SubmissionsFilterChanged(filter)),
            ),
            const SizedBox(height: 8),
            ..._content(context, loc, bloc, state),
          ],
        );
      },
    );
  }

  List<Widget> _content(BuildContext context, AppLocalizations loc,
      SubmissionsBloc bloc, SubmissionsState state) {
    if (state.loading) return const [SkeletonLoader(lines: 5, height: 96)];
    if (state.error != null) {
      return [
        InlineError(
          message: loc.adminSubmissionsListErrorsLoadFailed,
          onRetry: () => bloc.add(const SubmissionsLoadRequested()),
        ),
      ];
    }
    if (state.items.isEmpty) {
      return [
        EmptyState(
          message: loc.adminSubmissionsListNoSubmissions,
          icon: Icons.assignment_turned_in_outlined,
        ),
      ];
    }
    return [
      SectionTitle(
        state.filter == null
            ? loc.adminSubmissionsListAllOption
            : statusLabel(loc, state.filter!),
        trailing: StatusBadge(
          kind: submissionStatusKind(state.filter),
          label: '${state.items.length}',
        ),
      ),
      ManagementRecordGrid(
        children: [
          for (final s in state.items) SubmissionListCard(submission: s),
        ],
      ),
    ];
  }
}

/// Queue card for one application; shows the "দাগ দরকার" badge when a
/// property still needs its dag filled in by the office.
class SubmissionListCard extends StatelessWidget {
  const SubmissionListCard({super.key, required this.submission});

  final SubmissionSummary submission;

  @override
  Widget build(BuildContext context) {
    final loc = AppLocalizations.of(context);
    final s = submission;
    final date = DateTime.tryParse(s.createdAt);
    final year = date?.year ?? DateTime.now().year;
    final reference = 'REF-$year-${s.id.padLeft(4, '0')}';
    void open() => context.go('/submissions/${s.id}');
    return ManagementRecordCard(
      leading: ManagementAvatar(name: s.fullName),
      title: s.fullName,
      subtitle: reference,
      badge: StatusBadge(
        kind: submissionStatusKind(s.status),
        label: statusLabel(loc, s.status),
      ),
      onTap: open,
      actions: [
        AppButton(
          label: loc.adminSubmissionsListDetailsLink,
          icon: Icons.arrow_forward,
          variant: s.status == SubmissionStatus.pending
              ? AppButtonVariant.primary
              : AppButtonVariant.secondary,
          onPressed: open,
        ),
      ],
      children: [
        if (s.needsDag)
          Align(
            alignment: AlignmentDirectional.centerStart,
            child: NeedsDagBadge(),
          ),
        InfoRow.phone(
            label: loc.adminSubmissionsListTableHeadersMobile,
            phone: s.mobile,
            compact: true),
        InfoRow(
          label: loc.adminSubmissionsListTableHeadersDate,
          value:
              date == null ? s.createdAt : DateFormat('yyyy-MM-dd').format(date),
        ),
      ],
    );
  }
}

String statusLabel(AppLocalizations loc, SubmissionStatus status) =>
    switch (status) {
      SubmissionStatus.pending => loc.adminStatusLabelsPending,
      SubmissionStatus.approved => loc.adminStatusLabelsApproved,
      SubmissionStatus.rejected => loc.adminStatusLabelsRejected,
      _ => loc.adminStatusLabelsAll,
    };

/// Badge colour for an application / member status.
StatusKind submissionStatusKind(SubmissionStatus? status) => switch (status) {
      SubmissionStatus.pending => StatusKind.pending,
      SubmissionStatus.approved => StatusKind.approved,
      SubmissionStatus.rejected => StatusKind.rejected,
      _ => StatusKind.neutral,
    };
