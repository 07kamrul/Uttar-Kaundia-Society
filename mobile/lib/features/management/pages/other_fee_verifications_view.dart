import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';

import '../../../core/format/bn_format.dart';
import '../../../core/network/api_error_messages.dart';
import '../../../l10n/app_localizations.dart';
import '../../../shared/widgets/widgets.dart';
import '../data/other_fee_verification_repository.dart';
import '../domain/bulk_entities.dart';
import '../domain/other_fee_verification_entities.dart';
import '../presentation/bloc/other_fee_verification_cubit.dart';
import '../presentation/widgets/management_widgets.dart';

/// "অন্যান্য ফি" tab of payment verifications (pay_verify_other_fees):
/// approve / reject (reason chips) / bulk approve for other-fee and picnic payments.
class OtherFeeVerificationsView extends StatelessWidget {
  const OtherFeeVerificationsView({
    super.key,
    required this.repository,
    this.bulkEnabled = false,
    this.reasonSuggestions,
  });

  final OtherFeeVerificationRepository repository;
  final bool bulkEnabled;
  final Future<List<String>> Function()? reasonSuggestions;

  @override
  Widget build(BuildContext context) {
    return BlocProvider(
      create: (_) => OtherFeeVerificationCubit(repository: repository)..load(),
      child: _View(bulkEnabled: bulkEnabled, reasonSuggestions: reasonSuggestions),
    );
  }
}

String _statusText(AppLocalizations loc, String status) => switch (status) {
      'pending' => loc.commonStatusPending,
      'approved' => loc.commonStatusApproved,
      _ => loc.commonStatusRejected,
    };

class _View extends StatelessWidget {
  const _View({required this.bulkEnabled, this.reasonSuggestions});

  final bool bulkEnabled;
  final Future<List<String>> Function()? reasonSuggestions;

  @override
  Widget build(BuildContext context) {
    final loc = AppLocalizations.of(context);
    return BlocConsumer<OtherFeeVerificationCubit, OtherFeeVerificationState>(
      listenWhen: (a, b) => a.error != b.error || (!a.stale && b.stale),
      listener: (context, state) {
        if (state.error != null && state.rows.isNotEmpty) {
          showAppToast(context, apiErrorMessage(loc, state.error!), error: true);
        }
        if (state.stale) showAppToast(context, loc.bulkStale, error: true);
      },
      builder: (context, state) {
        final cubit = context.read<OtherFeeVerificationCubit>();
        final body = PageBody(
          onRefresh: cubit.load,
          children: [
            ManagementFilterChips<String>(
              selected: state.statusFilter,
              options: [for (final s in const ['pending', 'approved', 'rejected']) (s, _statusText(loc, s))],
              onSelected: cubit.setStatus,
            ),
            const SizedBox(height: 8),
            if (bulkEnabled && state.bulkResult != null)
              Padding(
                padding: const EdgeInsets.fromLTRB(16, 0, 16, 8),
                child: ManagementCallout(
                  message: _bulkSummary(loc, state.bulkResult!),
                  icon: state.bulkResult!.failed.isEmpty ? Icons.check_circle_outline : Icons.info_outline,
                  error: state.bulkResult!.failed.isNotEmpty,
                ),
              ),
            ..._content(loc, cubit, state),
          ],
        );
        if (!bulkEnabled || state.selected.isEmpty) return body;
        return Column(children: [Expanded(child: body), _BulkBar(state: state)]);
      },
    );
  }

  String _bulkSummary(AppLocalizations loc, BulkApproveResult r) {
    final ok = bnNumber(r.approvedCount, locale: loc.localeName);
    if (r.failed.isEmpty) return loc.bulkResultAllOk(ok);
    final reasons = {for (final f in r.failed) _failReason(loc, f.code)}.join('، ');
    return loc.bulkResultPartial(ok, bnNumber(r.failed.length, locale: loc.localeName), reasons);
  }

  String _failReason(AppLocalizations loc, String code) => switch (code) {
        'NO_LONGER_DUE' => loc.bulkFailNoLongerDue,
        'ALREADY_REVIEWED' => loc.bulkFailAlreadyReviewed,
        'NOT_FOUND' => loc.bulkFailNotFound,
        _ => loc.bulkFailOther,
      };

  List<Widget> _content(AppLocalizations loc, OtherFeeVerificationCubit cubit, OtherFeeVerificationState state) {
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
            _Card(
              row: r,
              busy: state.busyKey == r.key || state.bulkBusy,
              selectable: bulkEnabled && r.isPending,
              selected: state.selected.contains(r.key),
              reasonSuggestions: reasonSuggestions,
            ),
        ],
      ),
    ];
  }
}

class _BulkBar extends StatelessWidget {
  const _BulkBar({required this.state});

  final OtherFeeVerificationState state;

  Future<void> _approve(BuildContext context, String count, String total) async {
    final loc = AppLocalizations.of(context);
    final cubit = context.read<OtherFeeVerificationCubit>();
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text(loc.bulkConfirmTitle(count, total)),
        actions: [
          TextButton(onPressed: () => Navigator.of(ctx).pop(false), child: Text(loc.commonCancel)),
          FilledButton(onPressed: () => Navigator.of(ctx).pop(true), child: Text(loc.bulkConfirmYes)),
        ],
      ),
    );
    if (ok == true) await cubit.bulkApprove();
  }

  @override
  Widget build(BuildContext context) {
    final loc = AppLocalizations.of(context);
    final count = bnNumber(state.selected.length, locale: loc.localeName);
    final total = taka(state.selectedTotal, locale: loc.localeName);
    return Material(
      elevation: 8,
      color: Theme.of(context).colorScheme.surface,
      child: SafeArea(
        top: false,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(16, 8, 16, 8),
          child: Row(
            children: [
              Expanded(
                child: Text(
                  loc.bulkSelectedBar(count, total),
                  style: Theme.of(context).textTheme.titleSmall?.copyWith(fontWeight: FontWeight.w700),
                ),
              ),
              const SizedBox(width: 8),
              AppButton(
                key: const Key('otherFeeBulkApprove'),
                label: loc.bulkApproveAction,
                icon: Icons.done_all,
                loading: state.bulkBusy,
                onPressed: state.bulkBusy ? null : () => _approve(context, count, total),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _Card extends StatefulWidget {
  const _Card({
    required this.row,
    required this.busy,
    required this.selectable,
    required this.selected,
    this.reasonSuggestions,
  });

  final AdminOtherFeePayment row;
  final bool busy;
  final bool selectable;
  final bool selected;
  final Future<List<String>> Function()? reasonSuggestions;

  @override
  State<_Card> createState() => _CardState();
}

class _CardState extends State<_Card> {
  bool _rejecting = false;

  Future<void> _reject(AppLocalizations loc) async {
    final cubit = context.read<OtherFeeVerificationCubit>();
    final r = widget.row;
    final suggestions = await widget.reasonSuggestions?.call() ?? const <String>[];
    if (!mounted) return;
    final reason = await showReasonDialog(
      context,
      suggestions: suggestions,
      title: loc.adminPaymentVerificationsRejectTitle,
      summary: '${r.memberName ?? '—'} · ${formatTaka(r.amount)} · ${r.feeLabel}',
      label: loc.adminPaymentVerificationsReason,
      hint: loc.adminPaymentVerificationsReasonPlaceholder,
      cancelLabel: loc.adminPaymentVerificationsCancel,
      confirmLabel: loc.adminPaymentVerificationsReject,
      validator: (text) => text.length < 3 ? loc.adminPaymentVerificationsReason : null,
    );
    if (reason == null || reason.length < 3 || !mounted) return;
    setState(() => _rejecting = true);
    await cubit.reject(r, reason);
  }

  @override
  Widget build(BuildContext context) {
    final loc = AppLocalizations.of(context);
    final theme = Theme.of(context);
    final r = widget.row;
    final cubit = context.read<OtherFeeVerificationCubit>();
    final rejection = r.rejectionReason;
    return ManagementRecordCard(
      key: Key('otherFeeCard_${r.key}'),
      leading: ManagementAvatar(name: r.memberName ?? '?'),
      title: '${r.memberName ?? '—'} ${r.memberDisplayId ?? ''}'.trim(),
      subtitle: r.feeLabel,
      badge: Text(
        formatTaka(r.amount),
        style: theme.textTheme.titleMedium?.copyWith(color: theme.colorScheme.primary, fontWeight: FontWeight.w700),
      ),
      actions: [
        if (r.proofUrl != null)
          AppButton(
            label: loc.adminPaymentVerificationsViewProof,
            variant: AppButtonVariant.ghost,
            icon: Icons.visibility_outlined,
            onPressed: () => showImagePreview(context, r.proofUrl!, r.receiptNo ?? r.feeLabel),
          ),
        if (r.isPending) ...[
          AppButton(
            key: Key('otherFeeReject_${r.key}'),
            label: loc.adminPaymentVerificationsReject,
            variant: AppButtonVariant.danger,
            icon: Icons.close,
            loading: widget.busy && _rejecting,
            onPressed: widget.busy ? null : () => _reject(loc),
          ),
          AppButton(
            key: Key('otherFeeApprove_${r.key}'),
            label: loc.adminPaymentVerificationsApprove,
            icon: Icons.check,
            loading: widget.busy && !_rejecting,
            onPressed: widget.busy
                ? null
                : () {
                    setState(() => _rejecting = false);
                    cubit.approve(r);
                  },
          ),
        ],
      ],
      children: [
        if (widget.selectable)
          Row(
            children: [
              Checkbox(
                key: Key('otherFeeSelect_${r.key}'),
                value: widget.selected,
                onChanged: widget.busy ? null : (_) => cubit.toggle(r.key),
              ),
              Text(loc.bulkSelectRow),
            ],
          ),
        InfoRow(label: loc.adminPaymentVerificationsMethod, value: r.method ?? '—'),
        InfoRow(label: loc.adminPaymentVerificationsReference, value: r.receiptNo ?? '—'),
        InfoRow(label: loc.adminPaymentVerificationsPaidOn, value: r.paymentDate),
        if (rejection != null && rejection.isNotEmpty)
          Padding(
            padding: const EdgeInsets.only(top: 8),
            child: ManagementCallout(message: rejection, icon: Icons.block_outlined, error: true),
          ),
      ],
    );
  }
}
