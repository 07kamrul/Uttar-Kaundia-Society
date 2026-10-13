import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:go_router/go_router.dart';

import '../../core/di/injector.dart';
import '../../core/feature_flags/feature_flag.dart';
import '../../core/feature_flags/feature_flag_builder.dart';
import '../../core/format/bn_format.dart';
import '../../core/layout/responsive.dart';
import '../../core/network/api_client.dart';
import '../../core/theme/app_theme.dart';
import '../../l10n/app_localizations.dart';
import '../../shared/widgets/widgets.dart';
import '../member/data/member_repository.dart';
import '../member/data/payments_repository.dart';
import '../member/domain/merged_payment_entities.dart';
import '../member/presentation/widgets/pay_flow_sheet.dart';
import '../public_content/data/content_repository.dart';
import '../public_content/domain/content_entities.dart';
import 'home_status_cubit.dart';

/// "আমার অবস্থা": the five-area home (nav_five_areas). A next-step card, dues,
/// latest notice, next event and six big buttons. No tables; every card
/// loads on its own with a skeleton and a retry.
class HomeStatusPage extends StatelessWidget {
  const HomeStatusPage({
    super.key,
    this.paymentsRepository,
    this.memberRepository,
    this.contentRepository,
    this.mergedPayments,
  });

  final PaymentsRepository? paymentsRepository;
  final MemberRepository? memberRepository;
  final ContentRepository? contentRepository;

  /// pay_merged_page; read from the flag service when null.
  final bool? mergedPayments;

  @override
  Widget build(BuildContext context) {
    final payments = paymentsRepository ?? PaymentsRepository(apiClient: sl<ApiClient>());
    final merged = mergedPayments ?? flagEnabled(FeatureFlag.payMergedPage);
    return BlocProvider(
      create: (_) => HomeStatusCubit(
        memberRepository: memberRepository ?? MemberRepository(apiClient: sl<ApiClient>()),
        paymentsRepository: payments,
        contentRepository: contentRepository ?? ContentRepository(apiClient: sl<ApiClient>()),
        mergedPayments: merged,
      )..load(),
      child: _HomeView(payments: payments, merged: merged),
    );
  }
}

class _HomeView extends StatelessWidget {
  const _HomeView({required this.payments, required this.merged});

  final PaymentsRepository payments;
  final bool merged;

  Future<void> _pay(BuildContext context, PaymentSummary summary) async {
    if (!merged) {
      context.go('/installments');
      return;
    }
    final cubit = context.read<HomeStatusCubit>();
    final l10n = AppLocalizations.of(context);
    final outcome = await showPayFlowSheet(context, summary: summary, repository: payments);
    if (!context.mounted) return;
    if (outcome.allSucceeded) showAppToast(context, l10n.mpaySubmitted);
    if (outcome.anySucceeded) await cubit.loadDues();
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final cubit = context.read<HomeStatusCubit>();
    return BlocBuilder<HomeStatusCubit, HomeState>(
      builder: (context, state) => PageBody(
        onRefresh: cubit.load,
        children: [
          PageHeader(title: l10n.homeMyStatus, icon: Icons.home_outlined),
          _StatusCard(state: state, onPay: (s) => _pay(context, s)),
          _DuesCard(state: state),
          _NoticeCard(card: state.notice),
          _EventCard(card: state.event),
          _BigButtons(merged: merged),
        ],
      ),
    );
  }
}

class _StatusCard extends StatelessWidget {
  const _StatusCard({required this.state, required this.onPay});

  final HomeState state;
  final void Function(PaymentSummary) onPay;

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final theme = Theme.of(context);
    final step = state.nextStep;
    final summary = state.dues.data;
    final text = switch (step) {
      HomeNextStep.loading => '',
      HomeNextStep.pending => l10n.homeStatusPending,
      HomeNextStep.needsDag => l10n.homeStatusNeedsDag,
      HomeNextStep.dues => l10n.homeStatusDues(taka(summary!.totalDue, locale: l10n.localeName)),
      HomeNextStep.allGood => l10n.homeStatusAllGood,
    };
    return AppCard(
      key: const Key('homeStatusCard'),
      title: l10n.homeNextStep,
      child: step == HomeNextStep.loading
          ? const SkeletonLoader(key: Key('homeStatusSkeleton'), lines: 1, height: 40)
          : Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Text(text, key: const Key('homeStatusText'), style: theme.textTheme.titleMedium),
                if (step == HomeNextStep.dues) ...[
                  const SizedBox(height: 12),
                  FilledButton.icon(
                    key: const Key('homePayButton'),
                    icon: const Icon(Icons.payments_outlined),
                    label: Text(l10n.mpayPayNow),
                    onPressed: () => onPay(summary!),
                  ),
                ],
              ],
            ),
    );
  }
}

class _CardError extends StatelessWidget {
  const _CardError({required this.name, required this.onRetry});

  final String name;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    return Row(
      children: [
        Expanded(child: Text(l10n.homeCardError)),
        TextButton.icon(
          key: Key('homeRetry_$name'),
          icon: const Icon(Icons.refresh, size: 18),
          label: Text(l10n.commonRetry),
          onPressed: onRetry,
        ),
      ],
    );
  }
}

class _DuesCard extends StatelessWidget {
  const _DuesCard({required this.state});

  final HomeState state;

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final theme = Theme.of(context);
    final cubit = context.read<HomeStatusCubit>();
    final card = state.dues;
    return AppCard(
      key: const Key('homeDuesCard'),
      title: l10n.mpayMyDue,
      child: switch (card.status) {
        CardStatus.loading => const SkeletonLoader(key: Key('homeDuesSkeleton'), lines: 1, height: 40),
        CardStatus.error => _CardError(name: 'dues', onRetry: cubit.loadDues),
        CardStatus.loaded => Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                taka(card.data!.totalDue, locale: l10n.localeName),
                style: theme.textTheme.headlineSmall?.copyWith(fontWeight: FontWeight.w700),
              ),
              if (card.data!.pendingCount > 0)
                Text('${l10n.mpayVerifying} ${taka(card.data!.pendingAmount, locale: l10n.localeName)}',
                    style: theme.textTheme.bodyMedium),
            ],
          ),
      },
    );
  }
}

class _NoticeCard extends StatelessWidget {
  const _NoticeCard({required this.card});

  final AsyncCard<Notice?> card;

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final cubit = context.read<HomeStatusCubit>();
    final notice = card.data;
    return AppCard(
      key: const Key('homeNoticeCard'),
      title: l10n.homeLatestNotice,
      onTap: notice == null ? null : () => context.go('/notices/${notice.id}'),
      child: switch (card.status) {
        CardStatus.loading => const SkeletonLoader(lines: 1, height: 40),
        CardStatus.error => _CardError(name: 'notice', onRetry: cubit.loadNotice),
        CardStatus.loaded => Text(notice == null ? l10n.homeNoNotice : notice.title),
      },
    );
  }
}

class _EventCard extends StatelessWidget {
  const _EventCard({required this.card});

  final AsyncCard<EventItem?> card;

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final cubit = context.read<HomeStatusCubit>();
    final event = card.data;
    final start = event == null ? null : DateTime.tryParse(event.startAt)?.toLocal();
    return AppCard(
      key: const Key('homeEventCard'),
      title: l10n.homeNextEvent,
      onTap: event == null ? null : () => context.go('/events/${event.id}'),
      child: switch (card.status) {
        CardStatus.loading => const SkeletonLoader(lines: 1, height: 40),
        CardStatus.error => _CardError(name: 'event', onRetry: cubit.loadEvent),
        CardStatus.loaded => event == null
            ? Text(l10n.homeNoEvent)
            : Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(event.title),
                  if (start != null) Text(bnDate(start, locale: l10n.localeName)),
                ],
              ),
      },
    );
  }
}

/// 2x3 grid of big icon buttons.
class _BigButtons extends StatelessWidget {
  const _BigButtons({required this.merged});

  final bool merged;

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final tiles = <(String, IconData, String, String)>[
      ('payments', Icons.payments_outlined, l10n.mpayPayNow, merged ? '/payments' : '/installments'),
      ('land', Icons.landscape_outlined, l10n.navAreaLand, '/my-land'),
      ('notices', Icons.campaign_outlined, l10n.navNotices, '/notices'),
      ('events', Icons.event_outlined, l10n.navEvents, '/events'),
      ('organisation', Icons.account_balance_outlined, l10n.navAreaOrganisation, '/organisation'),
      ('profile', Icons.person_outline, l10n.navAreaProfile, '/profile'),
    ];
    final theme = Theme.of(context);
    return Padding(
      key: const Key('homeGrid'),
      padding: EdgeInsets.symmetric(horizontal: context.pageGutter, vertical: 8),
      child: LayoutBuilder(
        builder: (context, constraints) {
          final width = (constraints.maxWidth - 12) / 2;
          return Wrap(
            spacing: 12,
            runSpacing: 12,
            children: [
              for (final (name, icon, label, route) in tiles)
                SizedBox(
                  width: width,
                  child: Material(
                    color: theme.colorScheme.primaryContainer,
                    borderRadius: BorderRadius.circular(AppRadius.md),
                    child: InkWell(
                      key: Key('homeTile_$name'),
                      borderRadius: BorderRadius.circular(AppRadius.md),
                      onTap: () => context.go(route),
                      child: Container(
                        constraints: const BoxConstraints(minHeight: 96),
                        padding: const EdgeInsets.all(12),
                        child: Column(
                          mainAxisAlignment: MainAxisAlignment.center,
                          children: [
                            Icon(icon, size: 36, color: theme.colorScheme.primary),
                            const SizedBox(height: 8),
                            Text(label, textAlign: TextAlign.center, style: theme.textTheme.titleSmall),
                          ],
                        ),
                      ),
                    ),
                  ),
                ),
            ],
          );
        },
      ),
    );
  }
}
