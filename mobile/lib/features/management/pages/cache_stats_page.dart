import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';

import '../../../core/di/injector.dart';
import '../../../core/format/bn_format.dart';
import '../../../core/network/api_client.dart';
import '../../../l10n/app_localizations.dart';
import '../../../shared/widgets/widgets.dart';
import '../data/console_repository.dart';
import '../domain/console_entities.dart';
import '../presentation/bloc/console_cubits.dart';

/// Read-only cache table (manage_system_config). There is deliberately no
/// flush button; flushing stays an API-only action.
class CacheStatsPage extends StatelessWidget {
  const CacheStatsPage({super.key, this.repository});

  /// Test seam; the live repository by default.
  final CacheStatsRepository? repository;

  @override
  Widget build(BuildContext context) {
    return BlocProvider(
      create: (_) => CacheStatsCubit(repository: repository ?? CacheStatsRepository(apiClient: sl<ApiClient>()))..load(),
      child: const _View(),
    );
  }
}

class _View extends StatelessWidget {
  const _View();

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context);
    return BlocBuilder<CacheStatsCubit, ({CacheStats? stats, bool loading, bool failed})>(
      builder: (context, state) {
        final cubit = context.read<CacheStatsCubit>();
        final stats = state.stats;
        return PageBody(
          onRefresh: cubit.load,
          children: [
            PageHeader(icon: Icons.storage_outlined, title: l.cacheStatsTitle, subtitle: l.cacheStatsSubtitle),
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16),
              child: Align(
                alignment: AlignmentDirectional.centerStart,
                child: IconButton(
                  key: const Key('cacheRefresh'),
                  tooltip: l.cacheStatsRefresh,
                  icon: const Icon(Icons.refresh),
                  onPressed: state.loading ? null : cubit.load,
                ),
              ),
            ),
            if (state.loading && stats == null)
              const SkeletonLoader(lines: 3, height: 80)
            else if (state.failed)
              InlineError(message: l.cacheStatsLoadError, onRetry: cubit.load)
            else if (stats != null) ...[
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
                child: Text(stats.enabled ? l.cacheStatsOn : l.cacheStatsOff),
              ),
              for (final c in stats.caches) _CacheCard(stat: c),
            ],
          ],
        );
      },
    );
  }
}

class _CacheCard extends StatelessWidget {
  const _CacheCard({required this.stat});

  final CacheStat stat;

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context);
    final theme = Theme.of(context);
    String n(Object v) => bnNumber(v, locale: l.localeName);
    Widget row(String label, String value) => Padding(
          padding: const EdgeInsets.symmetric(vertical: 2),
          child: Row(
            children: [
              Expanded(child: Text(label, style: theme.textTheme.bodySmall)),
              Text(value, style: theme.textTheme.bodyMedium),
            ],
          ),
        );
    return Card(
      margin: const EdgeInsets.symmetric(horizontal: 16, vertical: 6),
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(stat.name, style: theme.textTheme.titleSmall),
            const SizedBox(height: 6),
            row(l.cacheStatsEntries, '${n(stat.size)} / ${n(stat.maxSize)}'),
            row(l.cacheStatsTtl, n(stat.ttlSeconds)),
            row(l.cacheStatsHitRatio, '${n((stat.hitRatio * 100).round())}%'),
            row(l.cacheStatsInvalidations, n(stat.invalidations)),
          ],
        ),
      ),
    );
  }
}
