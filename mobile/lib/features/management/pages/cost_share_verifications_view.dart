import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';

import '../../../core/format/bn_format.dart';
import '../../../core/network/api_error_messages.dart';
import '../../../l10n/app_localizations.dart';
import '../../../shared/widgets/widgets.dart';
import '../data/cost_share_payment_repository.dart';
import '../domain/cost_share_verification_entities.dart';
import '../presentation/bloc/cost_share_verification_cubit.dart';
import '../presentation/widgets/management_widgets.dart';

/// Minimum reject reason length (Angular MIN_REASON_LENGTH).
const _minReasonLength = 3;

/// "খরচ ভাগ" tab of payment verifications: approve / reject member
/// cost-share payments (Angular payment-verifications, kind cost_share).
class CostShareVerificationsView extends StatelessWidget {
  const CostShareVerificationsView({
    super.key,
    required this.repository,
    this.reasonSuggestions,
    this.onReviewed,
  });

  final CostSharePaymentRepository repository;
  final Future<List<String>> Function()? reasonSuggestions;
  final void Function()? onReviewed;

  @override
  Widget build(BuildContext context) {
    return BlocProvider(
      create: (_) => CostShareVerificationCubit(repository: repository, onReviewed: onReviewed)..load(),
      child: _View(reasonSuggestions: reasonSuggestions),
    );
  }
}

String _statusText(AppLocalizations loc, String status) => switch (status) {
      'pending' => loc.commonStatusPending,
      'approved' => loc.commonStatusApproved,
      _ => loc.commonStatusRejected,
    };

class _View extends StatelessWidget {
  const _View({this.reasonSuggestions});

  final Future<List<String>> Function()? reasonSuggestions;

  @override
  Widget build(BuildContext context) {
    final loc = AppLocalizations.of(context);
    return BlocConsumer<CostShareVerificationCubit, CostShareVerificationState>(
      listenWhen: (a, b) => a.error != b.error,
      listener: (context, state) {
        if (state.error != null && state.rows.isNotEmpty) {
          showAppToast(context, apiErrorMessage(loc, state.error!), error: true);
        }
      },
      builder: (context, state) {
        final cubit = context.read<CostShareVerificationCubit>();
        return PageBody(
          onRefresh: cubit.load,
          children: [
            ManagementFilterChips<String>(
              selected: state.statusFilter,
              options: [for (final s in const ['pending', 'approved', 'rejected']) (s, _statusText(loc, s))],
              onSelected: cubit.setStatus,
            ),
            const SizedBox(height: 8),
            ..._content(loc, cubit, state),
          ],
        );
      },
    );
  }

  List<Widget> _content(AppLocalizations loc, CostShareVerificationCubit cubit, CostShareVerificationState state) {
    if (state.loading) return const [SkeletonLoader(lines: 4, height: 120)];
    if (state.rows.isEmpty && state.error != null) {
      return [InlineError(message: loc.adminPaymentVerificationsLoadError, onRetry: cubit.load)];
    }
    if (state.rows.isEmpty) {
      return [EmptyState(message: loc.adminPaymentVerificationsEmpty, icon: Icons.check_circle_outline)];
    }
    return [
      ManagementRecordGrid(
        children: [
          for (final r in state.rows)
            _Card(row: r, busy: state.busyId == r.id, reasonSuggestions: reasonSuggestions),
        ],
      ),
    ];
  }
}

class _Card extends StatefulWidget {
  const _Card({required this.row, required this.busy, this.reasonSuggestions});

  final AdminCostSharePayment row;
  final bool busy;
  final Future<List<String>> Function()? reasonSuggestions;

  @override
  State<_Card> createState() => _CardState();
}

class _CardState extends State<_Card> {
  bool _rejecting = false;

  Future<void> _reject(AppLocalizations loc) async {
    final cubit = context.read<CostShareVerificationCubit>();
    final r = widget.row;
    final suggestions = await widget.reasonSuggestions?.call() ?? const <String>[];
    if (!mounted) return;
    final reason = await showReasonDialog(
      context,
      suggestions: suggestions,
      title: loc.adminPaymentVerificationsRejectTitle,
      summary: '${r.memberName ?? '—'} · ${taka(r.amount, locale: loc.localeName)} · ${r.transactionRef}',
      label: loc.adminPaymentVerificationsReason,
      hint: loc.adminPaymentVerificationsReasonPlaceholder,
      cancelLabel: loc.adminPaymentVerificationsCancel,
      confirmLabel: loc.adminPaymentVerificationsReject,
      validator: (text) => text.length < _minReasonLength ? loc.adminPaymentVerificationsReason : null,
    );
    if (reason == null || reason.length < _minReasonLength || !mounted) return;
    setState(() => _rejecting = true);
    await cubit.reject(r, reason);
  }

  void _approve() {
    setState(() => _rejecting = false);
    context.read<CostShareVerificationCubit>().approve(widget.row);
  }

  @override
  Widget build(BuildContext context) {
    final loc = AppLocalizations.of(context);
    final theme = Theme.of(context);
    final r = widget.row;
    final note = r.note;
    final rejection = r.rejectionReason;
    final sender = r.senderAccount;
    return ManagementRecordCard(
      key: Key('costShareCard_${r.id}'),
      leading: ManagementAvatar(name: r.memberName ?? '?'),
      title: '${r.memberName ?? '—'} ${r.memberDisplayId ?? ''}'.trim(),
      subtitle: r.costTitle ?? loc.adminFinanceManagementSourceCostShare,
      badge: Text(
        taka(r.amount, locale: loc.localeName),
        style: theme.textTheme.titleMedium?.copyWith(color: theme.colorScheme.primary, fontWeight: FontWeight.w700),
      ),
      actions: _actions(loc),
      children: [
        InfoRow(label: loc.adminPaymentVerificationsMethod, value: r.method),
        InfoRow(label: loc.adminPaymentVerificationsReference, value: r.transactionRef),
        InfoRow(label: loc.adminPaymentVerificationsPaidOn, value: r.paidOn),
        InfoRow(label: 'বাকি', value: taka(r.remaining, locale: loc.localeName)),
        if (sender != null && sender.isNotEmpty) InfoRow(label: loc.adminPaymentVerificationsSender, value: sender),
        if (note != null && note.isNotEmpty)
          Padding(
            padding: const EdgeInsets.only(top: 6),
            child: Text('"$note"', style: theme.textTheme.bodyMedium?.copyWith(fontStyle: FontStyle.italic)),
          ),
        if (rejection != null && rejection.isNotEmpty)
          Padding(
            padding: const EdgeInsets.only(top: 8),
            child: ManagementCallout(message: rejection, icon: Icons.block_outlined, error: true),
          ),
      ],
    );
  }

  List<Widget> _actions(AppLocalizations loc) {
    final r = widget.row;
    final busy = widget.busy;
    return [
      if (r.proofUrl case final proof?)
        AppButton(
          label: loc.adminPaymentVerificationsViewProof,
          variant: AppButtonVariant.ghost,
          icon: Icons.visibility_outlined,
          onPressed: () => showImagePreview(context, proof, r.transactionRef),
        ),
      if (r.isPending) ...[
        AppButton(
          key: Key('costShareReject_${r.id}'),
          label: loc.adminPaymentVerificationsReject,
          variant: AppButtonVariant.danger,
          icon: Icons.close,
          loading: busy && _rejecting,
          onPressed: busy ? null : () => _reject(loc),
        ),
        AppButton(
          key: Key('costShareApprove_${r.id}'),
          label: loc.adminPaymentVerificationsApprove,
          icon: Icons.check,
          loading: busy && !_rejecting,
          onPressed: busy ? null : _approve,
        ),
      ],
    ];
  }
}
