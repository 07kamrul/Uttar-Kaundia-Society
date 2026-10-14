import 'package:flutter/material.dart';

import '../../../l10n/app_localizations.dart';
import '../../../shared/widgets/widgets.dart';
import '../../member/presentation/widgets/member_ui.dart';
import '../data/governance_repository.dart';
import '../domain/governance_entities.dart';
import '../presentation/governance_cubits.dart';
import 'governance_labels.dart';
import 'governance_widgets.dart';
import 'package:flutter_bloc/flutter_bloc.dart';

/// Service standard: the committee's promised times and how they are met.
class ServiceStandardPage extends StatelessWidget {
  const ServiceStandardPage({super.key, this.repository});

  final GovernanceRepository? repository;

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    return BlocProvider(
      create: (_) => ServiceStandardCubit(governanceRepo(repository))..load(),
      child: GovPage<ServiceStandardCubit, ServiceStandardData>(
        title: l10n.govStandardTitle,
        subtitle: l10n.govStandardSubtitle,
        icon: Icons.task_alt_outlined,
        builder: (context, data, state) => [
          if (data.notice.isNotEmpty) NoticeBanner(message: data.notice, icon: Icons.shield_outlined),
          for (final s in data.standards) _StandardCard(standard: s),
        ],
      ),
    );
  }
}

class _StandardCard extends StatelessWidget {
  const _StandardCard({required this.standard});

  final ServiceStandard standard;

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final theme = Theme.of(context);
    final live = standard.live;
    return AppCard(
      title: standard.label,
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Text(l10n.govStandardTarget(standard.target)),
        const SizedBox(height: 8),
        if (live == null)
          Text(l10n.govStandardNoLive, style: theme.textTheme.bodySmall)
        else ...[
          Row(children: [
            Text('${govNumber(context, live.met)}/${govNumber(context, live.total)}',
                style: theme.textTheme.titleLarge),
            const SizedBox(width: 12),
            GovBadge(live.percent >= 90 ? GovTone.good : GovTone.warn,
                '${l10n.govStandardMet} (${govNumber(context, live.percent)}%)'),
          ]),
          const SizedBox(height: 8),
          LinearProgressIndicator(value: live.percent / 100, minHeight: 8),
          if (live.avgWorkingDays != null)
            Padding(
              padding: const EdgeInsets.only(top: 8),
              child: Text(l10n.govStandardAvgDays(govNumber(context, live.avgWorkingDays!)),
                  style: theme.textTheme.bodySmall),
            ),
        ],
      ]),
    );
  }
}
