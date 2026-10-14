import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';

import '../../../l10n/app_localizations.dart';
import '../../../shared/widgets/plain_confirm.dart';
import '../../../shared/widgets/widgets.dart';
import '../../member/presentation/widgets/member_ui.dart';
import '../data/governance_repository.dart';
import '../domain/governance_entities.dart';
import '../presentation/governance_cubits.dart';
import '../presentation/governance_errors.dart';
import '../presentation/list_form_cubit.dart';
import 'governance_labels.dart';
import 'governance_widgets.dart';

/// Elections: pick an election, see eligibility, stand as a candidate, cast a
/// secret vote per post and read the results once they are out.
class ElectionsPage extends StatelessWidget {
  const ElectionsPage({super.key, this.repository});

  final GovernanceRepository? repository;

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    return BlocProvider(
      create: (_) => ElectionsCubit(governanceRepo(repository))..load(),
      child: GovPage<ElectionsCubit, ElectionsData>(
        title: l10n.govElectionsTitle,
        subtitle: l10n.govElectionsSubtitle,
        icon: Icons.how_to_vote_outlined,
        builder: (context, data, state) {
          final my = data.selected;
          if (my == null) {
            return [EmptyState(message: l10n.govElectionsEmpty, icon: Icons.how_to_vote_outlined)];
          }
          return [
            if (data.elections.length > 1)
              Gutter(
                vertical: 6,
                child: Wrap(spacing: 8, runSpacing: 8, children: [
                  for (final e in data.elections)
                    ChoiceChip(
                      label: Text(e.title),
                      selected: e.id == my.election.id,
                      onSelected: state.loading ? null : (_) => context.read<ElectionsCubit>().select(e.id),
                    ),
                ]),
              ),
            _ElectionView(key: ValueKey(my.election.id), my: my, posts: data.posts, state: state),
          ];
        },
      ),
    );
  }
}

class _ElectionView extends StatefulWidget {
  const _ElectionView({super.key, required this.my, required this.posts, required this.state});

  final MyElection my;
  final List<CouncilPost> posts;
  final ListFormState<ElectionsData> state;

  @override
  State<_ElectionView> createState() => _ElectionViewState();
}

class _ElectionViewState extends State<_ElectionView> {
  final _statement = TextEditingController();
  final _picks = <String, int>{};
  String? _nominatePost;
  GovAction _lastAction = GovAction.other;

  MyElection get _my => widget.my;

  @override
  void dispose() {
    _statement.dispose();
    super.dispose();
  }

  String _postLabel(String key) {
    final post = widget.posts.where((p) => p.key == key).firstOrNull;
    if (post == null) return key;
    return govLang(context) == 'bn' ? post.bn : post.en;
  }

  Future<void> _nominate() async {
    final post = _nominatePost;
    if (post == null) return;
    setState(() => _lastAction = GovAction.nominate);
    final ok = await context.read<ElectionsCubit>().nominate(post, _statement.text);
    if (!ok || !mounted) return;
    setState(() {
      _nominatePost = null;
      _statement.clear();
    });
    showAppToast(context, AppLocalizations.of(context).govElectionsNominateDone);
  }

  Future<void> _vote(String postKey) async {
    final nominationId = _picks[postKey];
    if (nominationId == null) return;
    final l10n = AppLocalizations.of(context);
    final yes = await showPlainConfirm(
      context,
      title: l10n.govElectionsCastVote,
      consequence: l10n.govElectionsVoteConfirm,
      action: l10n.govElectionsCastVote,
    );
    if (!yes || !mounted) return;
    setState(() => _lastAction = GovAction.vote);
    final ok = await context.read<ElectionsCubit>().vote(postKey, nominationId);
    if (!mounted) return;
    if (ok) {
      setState(() => _picks.remove(postKey));
      showAppToast(context, l10n.govElectionsVoteDone);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final my = _my;
    final e = my.election;
    final eligibleText = my.eligible
        ? l10n.govElectionsEligibleYes
        : (my.fromSnapshot ? l10n.govElectionsEligibleNoSnapshot : l10n.govElectionsEligibleNo);
    return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      NoticeBanner(
        tone: my.eligible ? NoticeTone.success : NoticeTone.warning,
        message: eligibleText,
      ),
      Gutter(
        vertical: 6,
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          GovBadge(GovTone.neutral, electionStatusLabel(l10n, e.status)),
          const SizedBox(height: 6),
          Text(l10n.govElectionsNominationWindow(govDate(context, e.nominationStart), govDate(context, e.nominationEnd))),
          Text(l10n.govElectionsVotingWindow(govDate(context, e.votingStart), govDate(context, e.votingEnd))),
        ]),
      ),
      GovActionError(error: widget.state.actionError, action: _lastAction),
      if (my.nominationsOpen) _nominateCard(l10n),
      if (my.votingOpen) _voteCard(l10n),
      if (my.results != null && my.results!.isNotEmpty) _resultsCard(l10n, my.results!),
    ]);
  }

  Widget _nominateCard(AppLocalizations l10n) {
    return GovCard(
      title: l10n.govElectionsNominateTitle,
      hint: l10n.govElectionsNominateHint,
      icon: Icons.person_add_alt_outlined,
      children: [
        Padding(
          padding: const EdgeInsets.only(bottom: 12),
          child: DropdownButtonFormField<String>(
            key: const Key('nominatePost'),
            initialValue: _nominatePost,
            isExpanded: true,
            decoration: InputDecoration(labelText: l10n.govElectionsPost),
            items: [
              for (final p in widget.posts)
                DropdownMenuItem(
                  value: p.key,
                  enabled: !_my.hasNominated(p.key),
                  child: Text(govLang(context) == 'bn' ? p.bn : p.en),
                ),
            ],
            onChanged: (v) => setState(() => _nominatePost = v),
          ),
        ),
        GovField(
          key: const Key('nominateStatement'),
          controller: _statement,
          label: l10n.govElectionsStatement,
          required: false,
          lines: 3,
          maxLength: 2000,
        ),
        AppButton(
          key: const Key('nominateSubmit'),
          label: l10n.govElectionsNominateSubmit,
          icon: Icons.send_outlined,
          expanded: true,
          loading: widget.state.busy,
          onPressed: _nominatePost == null ? null : _nominate,
        ),
        if (_my.myNominations.isNotEmpty) ...[
          const SizedBox(height: 12),
          Text(l10n.govElectionsMyNominations, style: Theme.of(context).textTheme.titleSmall),
          const SizedBox(height: 6),
          Wrap(spacing: 8, runSpacing: 6, children: [
            for (final n in _my.myNominations)
              GovBadge(
                n.status == 'approved' ? GovTone.good : (n.status == 'rejected' ? GovTone.bad : GovTone.warn),
                '${_postLabel(n.postKey)} · ${nominationLabel(l10n, n.status)}',
              ),
          ]),
        ],
      ],
    );
  }

  Widget _voteCard(AppLocalizations l10n) {
    final roster = _my.roster ?? const <PostRoster>[];
    return GovCard(
      title: l10n.govElectionsVoteTitle,
      hint: l10n.govElectionsVoteHint,
      icon: Icons.how_to_vote_outlined,
      children: [
        if (roster.isEmpty) Text(l10n.govElectionsNoCandidates),
        for (final bucket in roster) _postBlock(l10n, bucket),
      ],
    );
  }

  Widget _postBlock(AppLocalizations l10n, PostRoster bucket) {
    final theme = Theme.of(context);
    final voted = _my.hasVoted(bucket.postKey);
    return Padding(
      padding: const EdgeInsets.only(bottom: 16),
      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        Row(children: [
          Expanded(child: Text(_postLabel(bucket.postKey), style: theme.textTheme.titleSmall)),
          if (voted) GovBadge(GovTone.good, l10n.govElectionsVoted),
        ]),
        const SizedBox(height: 8),
        if (voted)
          Text(l10n.govElectionsAlreadyVoted, style: theme.textTheme.bodySmall)
        else ...[
          for (final c in bucket.candidates) _candidateTile(bucket.postKey, c),
          const SizedBox(height: 4),
          AppButton(
            key: Key('castVote_${bucket.postKey}'),
            label: l10n.govElectionsCastVote,
            icon: Icons.how_to_vote_outlined,
            expanded: true,
            loading: widget.state.busy,
            onPressed: _picks[bucket.postKey] == null ? null : () => _vote(bucket.postKey),
          ),
        ],
      ]),
    );
  }

  Widget _candidateTile(String postKey, RosterCandidate c) {
    final theme = Theme.of(context);
    final picked = _picks[postKey] == c.nominationId;
    final name = c.name ?? govNumber(context, c.memberId);
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: Material(
        color: picked ? theme.colorScheme.primaryContainer : theme.colorScheme.surfaceContainerHighest,
        borderRadius: BorderRadius.circular(12),
        child: InkWell(
          key: Key('candidate_${c.nominationId}'),
          borderRadius: BorderRadius.circular(12),
          onTap: () => setState(() => picked ? _picks.remove(postKey) : _picks[postKey] = c.nominationId),
          child: Container(
            constraints: const BoxConstraints(minHeight: 56),
            padding: const EdgeInsets.symmetric(horizontal: 12),
            child: Row(children: [
              CircleAvatar(child: Text(name.characters.first)),
              const SizedBox(width: 12),
              Expanded(child: Text(name, style: theme.textTheme.bodyLarge)),
              if (picked) Icon(Icons.check_circle, color: theme.colorScheme.primary),
            ]),
          ),
        ),
      ),
    );
  }

  Widget _resultsCard(AppLocalizations l10n, List<PostCounts> results) {
    final theme = Theme.of(context);
    return GovCard(
      title: l10n.govElectionsResults,
      icon: Icons.bar_chart_outlined,
      children: [
        for (final bucket in results)
          Padding(
            padding: const EdgeInsets.only(bottom: 16),
            child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
              Text(_postLabel(bucket.postKey), style: theme.textTheme.titleSmall),
              const SizedBox(height: 6),
              for (final c in bucket.candidates)
                Padding(
                  padding: const EdgeInsets.symmetric(vertical: 4),
                  child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    Row(children: [
                      Expanded(
                        child: Text(
                          c.name ?? govNumber(context, c.memberId),
                          style: c.votes == bucket.topVotes && c.votes > 0
                              ? theme.textTheme.bodyLarge?.copyWith(fontWeight: FontWeight.bold)
                              : theme.textTheme.bodyLarge,
                        ),
                      ),
                      Text(l10n.govElectionsVotes(govNumber(context, c.votes))),
                    ]),
                    const SizedBox(height: 4),
                    LinearProgressIndicator(
                      value: bucket.topVotes == 0 ? 0 : c.votes / bucket.topVotes,
                      minHeight: 6,
                    ),
                  ]),
                ),
              Text(l10n.govElectionsVotesTotal(govNumber(context, bucket.votesTotal)),
                  style: theme.textTheme.bodySmall),
            ]),
          ),
      ],
    );
  }
}
