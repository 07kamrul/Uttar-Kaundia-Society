import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';

import '../../../core/di/injector.dart';
import '../../../core/network/api_client.dart';
import '../../../shared/widgets/widgets.dart';
import '../../governance/pages/governance_labels.dart' show GovTone;
import '../../governance/pages/governance_widgets.dart' show GovBadge;
import '../../member/presentation/widgets/member_ui.dart' show NoticeBanner, NoticeTone;
import '../data/committee_registry_repository.dart';
import '../domain/committee_registry_entities.dart';
import '../presentation/bloc/committee_registry_cubit.dart';
import '../presentation/committee_strings.dart';
import 'committee_case_card.dart';
import 'committee_term_form.dart';
import 'register_widgets.dart';

/// `/committee-registry` (committee_registry.manage): the 11 council posts with
/// holders and terms, plus the resignation / removal cases.
class CommitteeRegistryPage extends StatelessWidget {
  const CommitteeRegistryPage({super.key, this.repository});

  final CommitteeRegistryRepository? repository;

  @override
  Widget build(BuildContext context) {
    final s = CommitteeStrings.of(context);
    return BlocProvider(
      create: (_) =>
          CommitteeRegistryCubit(repository ?? CommitteeRegistryRepository(apiClient: sl<ApiClient>()))..load(),
      child: RegisterPage<CommitteeRegistryCubit, CommitteeData>(
        title: s.title,
        subtitle: s.subtitle,
        icon: Icons.badge_outlined,
        loadError: s.loadError,
        builder: (context, data, state) => [
          RegActionError(error: state.actionError),
          if (data.anyExpired) NoticeBanner(tone: NoticeTone.warning, message: s.expiredWarning),
          for (final p in data.posts) _PostCard(post: p, data: data),
          CaseSection(data: data, filter: context.read<CommitteeRegistryCubit>().caseFilter),
        ],
      ),
    );
  }
}

GovTone termTone(String status) => switch (status) {
      'active' => GovTone.good,
      'caretaker' => GovTone.warn,
      'expired' || 'vacant' => GovTone.bad,
      _ => GovTone.neutral,
    };

class _PostCard extends StatelessWidget {
  const _PostCard({required this.post, required this.data});

  final RegistryPost post;
  final CommitteeData data;

  Future<void> _resign(BuildContext context) async {
    final s = CommitteeStrings.of(context);
    final cubit = context.read<CommitteeRegistryCubit>();
    final ok = await askConfirm(context, s.resignConfirm(post.label(s.lang)));
    if (ok) await cubit.recordResignation(post);
  }

  @override
  Widget build(BuildContext context) {
    final s = CommitteeStrings.of(context);
    final theme = Theme.of(context);
    final term = post.term;
    final history = data.histories[post.key];
    final canResign = post.holder != null && post.status != 'vacant' && !data.hasOpenVacancyFor(post.key);
    return AppCard(
      title: post.label(s.lang),
      trailing: GovBadge(termTone(post.status), s.termStatus(post.status)),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        if (post.openVacancy) GovBadge(GovTone.warn, s.openVacancy),
        DetailRow(label: s.holder, value: post.holder?.fullName ?? s.vacant),
        if (term != null) ...[
          DetailRow(label: s.termStart, value: regDate(context, term.termStart)),
          DetailRow(label: s.termEnd, value: term.termEnd == null ? s.ongoing : regDate(context, term.termEnd)),
        ],
        if ((post.warning ?? '').isNotEmpty)
          Padding(
            padding: const EdgeInsets.only(top: 4),
            child: Text(post.warning!, style: TextStyle(color: theme.colorScheme.error)),
          ),
        const SizedBox(height: 8),
        Wrap(spacing: 8, runSpacing: 8, children: [
          AppButton(
            key: Key('history_${post.key}'),
            label: s.history,
            icon: Icons.history,
            variant: AppButtonVariant.secondary,
            onPressed: () => context.read<CommitteeRegistryCubit>().toggleHistory(post.key),
          ),
          AppButton(
            key: Key('editTerm_${post.key}'),
            label: s.editTerm,
            icon: Icons.edit_outlined,
            variant: AppButtonVariant.secondary,
            onPressed: () => openTermForm(context, post, data.members),
          ),
          if (canResign)
            AppButton(
              key: Key('resign_${post.key}'),
              label: s.recordResignation,
              icon: Icons.logout,
              variant: AppButtonVariant.secondary,
              onPressed: () => _resign(context),
            ),
        ]),
        if (history != null) _History(history: history),
      ]),
    );
  }
}

class _History extends StatelessWidget {
  const _History({required this.history});

  final PostHistory history;

  @override
  Widget build(BuildContext context) {
    final s = CommitteeStrings.of(context);
    final theme = Theme.of(context);
    if (history.items.isEmpty) {
      return Padding(padding: const EdgeInsets.only(top: 8), child: Text(s.emptyHistory));
    }
    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      for (final item in history.items)
        Padding(
          padding: const EdgeInsets.only(top: 8),
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(item.holder?.fullName ?? '—', style: theme.textTheme.titleSmall),
            Text(
              '${regDate(context, item.termStart)} – ${item.termEnd == null ? s.ongoing : regDate(context, item.termEnd)}'
              ' · ${s.termStatus(item.status)}',
              style: theme.textTheme.bodySmall,
            ),
            if ((item.notes ?? '').isNotEmpty) Text(item.notes!, style: theme.textTheme.bodySmall),
          ]),
        ),
    ]);
  }
}
