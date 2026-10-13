import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';

import '../../../core/di/injector.dart';
import '../../../core/format/bn_format.dart';
import '../../../core/layout/responsive.dart';
import '../../../core/network/api_client.dart';
import '../../../core/network/api_error_messages.dart';
import '../../../l10n/app_localizations.dart';
import '../../../shared/widgets/widgets.dart';
import '../data/payments_repository.dart';
import '../domain/merged_payment_entities.dart';
import '../presentation/bloc/payments_cubit.dart';
import '../presentation/widgets/pay_flow_sheet.dart';

/// "পেমেন্ট": one page for installments, other fees and cost shares (Batch 2,
/// behind pay_merged_page). Summary, pay button, merged history with filters.
class PaymentsPage extends StatelessWidget {
  const PaymentsPage({
    super.key,
    this.repository,
    this.initialKind,
    this.initialStatus,
    this.initialFee,
    this.onFiltersChanged,
  });

  final PaymentsRepository? repository;
  final PaymentKind? initialKind;
  final PaymentItemStatus? initialStatus;

  /// `?fee=picnic`: open the pay sheet once, with that fee preselected.
  final String? initialFee;

  /// Lets the router keep the filters in the URL.
  final void Function(PaymentKind? kind, PaymentItemStatus? status)? onFiltersChanged;

  @override
  Widget build(BuildContext context) {
    final repo = repository ?? PaymentsRepository(apiClient: sl<ApiClient>());
    return BlocProvider(
      create: (_) => PaymentsCubit(repository: repo, initialKind: initialKind, initialStatus: initialStatus)..load(),
      child: _PaymentsView(repository: repo, initialFee: initialFee, onFiltersChanged: onFiltersChanged),
    );
  }
}

class _PaymentsView extends StatefulWidget {
  const _PaymentsView({required this.repository, required this.initialFee, required this.onFiltersChanged});

  final PaymentsRepository repository;
  final String? initialFee;
  final void Function(PaymentKind?, PaymentItemStatus?)? onFiltersChanged;

  @override
  State<_PaymentsView> createState() => _PaymentsViewState();
}

class _PaymentsViewState extends State<_PaymentsView> {
  bool _feeOpened = false;

  Future<void> _openSheet(PaymentSummary summary, {String? fee}) async {
    final cubit = context.read<PaymentsCubit>();
    final l10n = AppLocalizations.of(context);
    final outcome = await showPayFlowSheet(context, summary: summary, repository: widget.repository, preselectFee: fee);
    if (!mounted) return;
    if (outcome.anySucceeded) {
      if (outcome.allSucceeded) showAppToast(context, l10n.mpaySubmitted);
      await cubit.load();
    }
  }

  void _maybeOpenInitialFee(PaymentsState state) {
    final fee = widget.initialFee;
    final summary = state.summary;
    if (_feeOpened || fee == null || summary == null || state.status != PaymentsStatus.loaded) return;
    _feeOpened = true;
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) _openSheet(summary, fee: fee);
    });
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    return BlocConsumer<PaymentsCubit, PaymentsState>(
      listener: (context, state) => _maybeOpenInitialFee(state),
      builder: (context, state) {
        final cubit = context.read<PaymentsCubit>();
        return PageBody(
          onRefresh: cubit.load,
          children: [
            PageHeader(title: l10n.mpayTitle, icon: Icons.payments_outlined),
            switch (state.status) {
              PaymentsStatus.loading when state.summary == null => const SkeletonLoader(lines: 4, height: 76),
              PaymentsStatus.failure => InlineError(
                  message: apiErrorMessage(l10n, state.error ?? Object()),
                  onRetry: cubit.load,
                ),
              _ => _Loaded(state: state, onPay: _openSheet, onFiltersChanged: widget.onFiltersChanged),
            },
          ],
        );
      },
    );
  }
}

class _Loaded extends StatelessWidget {
  const _Loaded({required this.state, required this.onPay, required this.onFiltersChanged});

  final PaymentsState state;
  final Future<void> Function(PaymentSummary) onPay;
  final void Function(PaymentKind?, PaymentItemStatus?)? onFiltersChanged;

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final theme = Theme.of(context);
    final lang = l10n.localeName;
    final summary = state.summary!;
    final cubit = context.read<PaymentsCubit>();
    final noDues = summary.totalDue <= 0 && !summary.dues.any((d) => !d.pending);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Padding(
          padding: EdgeInsets.symmetric(horizontal: context.pageGutter, vertical: 6),
          child: Row(
            children: [
              Expanded(child: _SummaryCard(key: const Key('paymentsDueCard'), label: l10n.mpayMyDue, amount: taka(summary.totalDue, locale: lang), emphasize: true)),
              const SizedBox(width: 8),
              Expanded(child: _SummaryCard(key: const Key('paymentsPaidCard'), label: l10n.mpayPaid, amount: taka(summary.totalPaid, locale: lang))),
            ],
          ),
        ),
        if (summary.pendingCount > 0)
          Padding(
            padding: EdgeInsets.symmetric(horizontal: context.pageGutter),
            child: Align(
              alignment: AlignmentDirectional.centerStart,
              child: Chip(
                key: const Key('paymentsPendingChip'),
                avatar: const Icon(Icons.hourglass_top, size: 18),
                label: Text('${l10n.mpayVerifying} ${taka(summary.pendingAmount, locale: lang)}'),
              ),
            ),
          ),
        if (noDues)
          Padding(
            padding: EdgeInsets.symmetric(horizontal: context.pageGutter, vertical: 8),
            child: Text(l10n.mpayEmpty, style: theme.textTheme.titleMedium),
          ),
        Padding(
          padding: EdgeInsets.symmetric(horizontal: context.pageGutter, vertical: 8),
          child: FilledButton.icon(
            key: const Key('paymentsPayButton'),
            icon: const Icon(Icons.payments_outlined),
            label: Text(l10n.mpayPayNow),
            onPressed: summary.hasAnythingToPay ? () => onPay(summary) : null,
          ),
        ),
        Padding(
          padding: EdgeInsets.symmetric(horizontal: context.pageGutter, vertical: 4),
          child: Text(l10n.mpayHistoryTitle, style: theme.textTheme.titleMedium),
        ),
        _FilterChips(
          state: state,
          onKind: (k) {
            cubit.setKind(k);
            onFiltersChanged?.call(k, state.itemStatus);
          },
          onStatus: (s) {
            cubit.setStatus(s);
            onFiltersChanged?.call(state.kind, s);
          },
        ),
        if (state.historyError != null)
          InlineError(message: apiErrorMessage(l10n, state.historyError!), onRetry: cubit.loadMore)
        else if (state.items.isEmpty)
          Padding(
            padding: const EdgeInsets.all(24),
            child: Center(child: Text(l10n.mpayHistoryEmpty)),
          )
        else
          for (final item in state.items) _HistoryRow(item: item),
        if (state.hasMore)
          Padding(
            padding: const EdgeInsets.all(12),
            child: Center(
              child: OutlinedButton(
                key: const Key('paymentsLoadMore'),
                onPressed: state.loadingMore ? null : cubit.loadMore,
                child: Text(l10n.mpayLoadMore),
              ),
            ),
          ),
      ],
    );
  }
}

class _SummaryCard extends StatelessWidget {
  const _SummaryCard({super.key, required this.label, required this.amount, this.emphasize = false});

  final String label;
  final String amount;
  final bool emphasize;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Card(
      margin: EdgeInsets.zero,
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(label, style: theme.textTheme.bodyMedium),
            const SizedBox(height: 4),
            Text(
              amount,
              style: theme.textTheme.titleLarge?.copyWith(
                fontWeight: FontWeight.w700,
                color: emphasize ? theme.colorScheme.error : theme.colorScheme.primary,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _FilterChips extends StatelessWidget {
  const _FilterChips({required this.state, required this.onKind, required this.onStatus});

  final PaymentsState state;
  final ValueChanged<PaymentKind?> onKind;
  final ValueChanged<PaymentItemStatus?> onStatus;

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final kinds = <(String, PaymentKind?, String)>[
      ('all', null, l10n.mpayKindAll),
      ('installment', PaymentKind.installment, l10n.mpayKindInstallment),
      ('other_fee', PaymentKind.otherFee, l10n.mpayKindOtherFee),
      ('cost_share', PaymentKind.costShare, l10n.mpayKindCostShare),
    ];
    final statuses = <(String, PaymentItemStatus?, String)>[
      ('all', null, l10n.mpayKindAll),
      ('pending', PaymentItemStatus.pending, l10n.mpayStatusPending),
      ('approved', PaymentItemStatus.approved, l10n.mpayStatusApproved),
      ('rejected', PaymentItemStatus.rejected, l10n.mpayStatusRejectedShort),
      ('recorded', PaymentItemStatus.recorded, l10n.mpayStatusRecorded),
    ];
    return Padding(
      padding: EdgeInsets.symmetric(horizontal: context.pageGutter),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Wrap(spacing: 8, children: [
            for (final (key, kind, label) in kinds)
              ChoiceChip(
                key: Key('kindChip_$key'),
                label: Text(label),
                selected: state.kind == kind,
                onSelected: (_) => onKind(kind),
              ),
          ]),
          Wrap(spacing: 8, children: [
            for (final (key, status, label) in statuses)
              ChoiceChip(
                key: Key('statusChip_$key'),
                label: Text(label),
                selected: state.itemStatus == status,
                onSelected: (_) => onStatus(status),
              ),
          ]),
        ],
      ),
    );
  }
}

class _HistoryRow extends StatelessWidget {
  const _HistoryRow({required this.item});

  final PaymentHistoryItem item;

  String _kindLabel(AppLocalizations l10n) => switch (item.kind) {
        PaymentKind.installment => l10n.mpayKindInstallment,
        PaymentKind.otherFee => l10n.mpayKindOtherFee,
        PaymentKind.costShare => l10n.mpayKindCostShare,
      };

  String _statusLabel(AppLocalizations l10n) => switch (item.status) {
        PaymentItemStatus.pending => l10n.mpayStatusPending,
        PaymentItemStatus.approved => l10n.mpayStatusApproved,
        PaymentItemStatus.rejected => l10n.mpayStatusRejected(item.rejectionReason ?? '—'),
        PaymentItemStatus.recorded => l10n.mpayStatusRecorded,
        PaymentItemStatus.unknown => '',
      };

  Color _statusColor(ColorScheme scheme) => switch (item.status) {
        PaymentItemStatus.rejected => scheme.error,
        PaymentItemStatus.pending => scheme.tertiary,
        _ => scheme.primary,
      };

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final theme = Theme.of(context);
    final parsed = DateTime.tryParse(item.date);
    final date = parsed == null ? item.date : bnDate(parsed, locale: l10n.localeName, short: true);
    final color = _statusColor(theme.colorScheme);
    return ListTile(
      key: Key('historyRow_${item.kind.apiValue}_${item.id}'),
      contentPadding: EdgeInsets.symmetric(horizontal: context.pageGutter),
      title: Text(item.title),
      subtitle: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('${_kindLabel(l10n)} • $date'),
          const SizedBox(height: 4),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
            decoration: BoxDecoration(
              color: color.withValues(alpha: 0.12),
              borderRadius: BorderRadius.circular(12),
            ),
            child: Text(_statusLabel(l10n), style: theme.textTheme.labelMedium?.copyWith(color: color)),
          ),
        ],
      ),
      trailing: Text(taka(item.amount, locale: l10n.localeName), style: theme.textTheme.titleSmall),
    );
  }
}
