import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';

import '../../../core/di/injector.dart';
import '../../../core/feature_flags/feature_flag.dart';
import '../../../core/feature_flags/feature_flag_builder.dart' show flagEnabled;
import '../../../core/format/bn_format.dart';
import '../../../core/network/api_client.dart';
import '../../../l10n/app_localizations.dart';
import '../../../shared/widgets/widgets.dart';
import '../../registration/data/config_list_repository.dart';
import '../presentation/bloc/payment_verifications_bloc.dart';

import '../data/admin_repository.dart';
import '../domain/bulk_entities.dart';
import '../domain/finance_entities.dart';
import '../presentation/widgets/management_widgets.dart';
import 'installments_management_page.dart' show monthLabelOf;

/// Committee queue for member-reported installment payments (Angular
/// payment-verifications): status filter tabs, approve / reject with reason.
class PaymentVerificationsPage extends StatelessWidget {
  final String? id;
  final String? propertyId;
  final String? returnUrl;

  const PaymentVerificationsPage({
    super.key,
    this.id,
    this.propertyId,
    this.returnUrl,
    this.repository,
    this.bulkEnabled,
    this.reasonSuggestions,
  });

  /// Test seam; the live repository by default.
  final InstallmentPaymentRepository? repository;

  /// Multi-select + bulk approve (admin_bulk_verify); the flag when null.
  final bool? bulkEnabled;

  /// Canned reject reasons (admin_console). Null reads the flag: on loads the
  /// admin-editable list with the built-in fallback, off shows no chips.
  final Future<List<String>> Function()? reasonSuggestions;

  @override
  Widget build(BuildContext context) {
    final suggestions = reasonSuggestions ??
        (flagEnabled(FeatureFlag.adminConsole)
            ? () => ConfigListRepository(apiClient: sl<ApiClient>())
                .getValues(kPaymentRejectReasonCategory, kPaymentRejectReasonFallback)
            : null);
    return BlocProvider(
      create: (_) => PaymentVerificationsBloc(
        repository: repository ?? InstallmentPaymentRepository(apiClient: sl<ApiClient>()),
      )..add(const PaymentVerificationsLoadRequested()),
      child: _PaymentVerificationsView(
        bulkEnabled: bulkEnabled ?? flagEnabled(FeatureFlag.adminBulkVerify),
        reasonSuggestions: suggestions,
      ),
    );
  }
}

/// Config-list category with the admin-editable payment reject reasons.
const kPaymentRejectReasonCategory = 'reject_reason_payment';

/// Used when the config list is empty or cannot be loaded.
const kPaymentRejectReasonFallback = [
  'TrxID মিলছে না',
  'টাকার পরিমাণ মিলছে না',
  'স্ক্রিনশট অস্পষ্ট',
  'ডুপ্লিকেট পেমেন্ট',
];

String _statusText(AppLocalizations loc, String status) => switch (status) {
      'pending' => loc.commonStatusPending,
      'approved' => loc.commonStatusApproved,
      _ => loc.commonStatusRejected,
    };

StatusKind _statusKind(String status) => switch (status) {
      'pending' => StatusKind.pending,
      'approved' => StatusKind.approved,
      'rejected' => StatusKind.rejected,
      _ => StatusKind.neutral,
    };

class _PaymentVerificationsView extends StatelessWidget {
  const _PaymentVerificationsView({
    this.bulkEnabled = false,
    this.reasonSuggestions,
  });

  final bool bulkEnabled;
  final Future<List<String>> Function()? reasonSuggestions;

  @override
  Widget build(BuildContext context) {
    final loc = AppLocalizations.of(context);
    return BlocConsumer<PaymentVerificationsBloc, PaymentVerificationsState>(
      listener: (context, state) {
        // Load failures render inline; toast action failures.
        if (state.error != null && state.payments.isNotEmpty) {
          showAppToast(context, describeApiError(context, state.error),
              error: true);
        }
        if (state.stale) showAppToast(context, loc.bulkStale, error: true);
      },
      listenWhen: (a, b) => a.error != b.error || (!a.stale && b.stale),
      builder: (context, state) {
        final bloc = context.read<PaymentVerificationsBloc>();
        final body = PageBody(
          onRefresh: () => reloadAndWait(bloc,
              const PaymentVerificationsLoadRequested(), (s) => s.loading),
          children: [
            PageHeader(
              icon: Icons.fact_check_outlined,
              title: loc.adminPaymentVerificationsTitle,
              subtitle: loc.adminPaymentVerificationsSubtitle,
            ),
            ManagementFilterChips<String>(
              selected: state.statusFilter,
              options: [
                for (final s in const ['pending', 'approved', 'rejected'])
                  (s, _statusText(loc, s)),
              ],
              onSelected: (status) => bloc.add(
                  PaymentVerificationsStatusFilterChanged(status: status)),
            ),
            const SizedBox(height: 8),
            if (bulkEnabled && state.bulkResult != null)
              Padding(
                padding: const EdgeInsets.fromLTRB(16, 0, 16, 8),
                child: ManagementCallout(
                  message: _bulkSummary(context, state.bulkResult!),
                  icon: state.bulkResult!.failed.isEmpty
                      ? Icons.check_circle_outline
                      : Icons.info_outline,
                  error: state.bulkResult!.failed.isNotEmpty,
                ),
              ),
            ..._content(loc, bloc, state),
          ],
        );
        if (!bulkEnabled || state.selected.isEmpty) return body;
        return Column(
          children: [
            Expanded(child: body),
            _BulkBar(state: state),
          ],
        );
      },
    );
  }

  /// "২টি অনুমোদিত, ১টি হয়নি — কারণ: …"
  String _bulkSummary(BuildContext context, BulkApproveResult r) {
    final loc = AppLocalizations.of(context);
    final ok = bnNumber(r.approvedCount, locale: loc.localeName);
    if (r.failed.isEmpty) return loc.bulkResultAllOk(ok);
    final reasons = {
      for (final f in r.failed) _failReason(loc, f.code),
    }.join('، ');
    return loc.bulkResultPartial(
        ok, bnNumber(r.failed.length, locale: loc.localeName), reasons);
  }

  String _failReason(AppLocalizations loc, String code) => switch (code) {
        'NO_LONGER_DUE' => loc.bulkFailNoLongerDue,
        'ALREADY_REVIEWED' => loc.bulkFailAlreadyReviewed,
        'AMOUNT_EXCEEDS_REMAINING' => loc.apiErrorAmountExceedsRemaining,
        'NOT_FOUND' => loc.bulkFailNotFound,
        _ => loc.bulkFailOther,
      };

  List<Widget> _content(AppLocalizations loc, PaymentVerificationsBloc bloc,
      PaymentVerificationsState state) {
    if (state.loading) return const [SkeletonLoader(lines: 4, height: 120)];
    if (state.payments.isEmpty && state.error != null) {
      return [
        InlineError(
          message: loc.adminPaymentVerificationsLoadError,
          onRetry: () => bloc.add(const PaymentVerificationsLoadRequested()),
        ),
      ];
    }
    if (state.payments.isEmpty) {
      return [
        EmptyState(
          message: loc.adminPaymentVerificationsEmpty,
          icon: Icons.check_circle_outline,
        ),
      ];
    }
    return [
      SectionTitle(
        _statusText(loc, state.statusFilter),
        trailing: StatusBadge(
          kind: _statusKind(state.statusFilter),
          label: '${state.payments.length}',
        ),
      ),
      ManagementRecordGrid(
        children: [
          for (final p in state.payments)
            _PaymentCard(
              payment: p,
              busy: state.busyId == p.id || state.bulkBusy,
              selectable: bulkEnabled && p.status == 'pending',
              selected: state.selected.contains(p.id),
              reasonSuggestions: reasonSuggestions,
            ),
        ],
      ),
    ];
  }
}

enum _PaymentAction { approve, reject }

/// Sticky bar under the list: "৩টি নির্বাচিত · মোট ৳১,৫০০" and the approve
/// button, which asks for confirmation with the same figures first.
class _BulkBar extends StatelessWidget {
  const _BulkBar({required this.state});

  final PaymentVerificationsState state;

  Future<void> _approve(BuildContext context, String count, String total) async {
    final loc = AppLocalizations.of(context);
    final bloc = context.read<PaymentVerificationsBloc>();
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text(loc.bulkConfirmTitle(count, total)),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(false),
            child: Text(loc.commonCancel),
          ),
          FilledButton(
            onPressed: () => Navigator.of(ctx).pop(true),
            child: Text(loc.bulkConfirmYes),
          ),
        ],
      ),
    );
    if (ok == true) bloc.add(const PaymentVerificationsBulkApproveRequested());
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
                  style: Theme.of(context)
                      .textTheme
                      .titleSmall
                      ?.copyWith(fontWeight: FontWeight.w700),
                ),
              ),
              const SizedBox(width: 8),
              AppButton(
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

class _PaymentCard extends StatefulWidget {
  const _PaymentCard({
    required this.payment,
    required this.busy,
    this.selectable = false,
    this.selected = false,
    this.reasonSuggestions,
  });

  final AdminInstallmentPayment payment;
  final bool busy;

  /// Bulk select (admin_bulk_verify), pending rows only.
  final bool selectable;
  final bool selected;
  final Future<List<String>> Function()? reasonSuggestions;

  @override
  State<_PaymentCard> createState() => _PaymentCardState();
}

class _PaymentCardState extends State<_PaymentCard> {
  _PaymentAction? _active;

  bool _loading(_PaymentAction action) => widget.busy && _active == action;

  void _approve() {
    setState(() => _active = _PaymentAction.approve);
    context
        .read<PaymentVerificationsBloc>()
        .add(PaymentVerificationsApproved(payment: widget.payment));
  }

  Future<void> _reject(AppLocalizations loc) async {
    final bloc = context.read<PaymentVerificationsBloc>();
    final p = widget.payment;
    final suggestions = await widget.reasonSuggestions?.call() ?? const <String>[];
    if (!mounted) return;
    final reason = await showReasonDialog(
      context,
      suggestions: suggestions,
      title: loc.adminPaymentVerificationsRejectTitle,
      summary:
          '${p.memberName ?? '—'} · ${formatTaka(p.amount)} · ${p.transactionRef}',
      label: loc.adminPaymentVerificationsReason,
      hint: loc.adminPaymentVerificationsReasonPlaceholder,
      cancelLabel: loc.adminPaymentVerificationsCancel,
      confirmLabel: loc.adminPaymentVerificationsReject,
      validator: (text) =>
          text.length < 3 ? loc.adminPaymentVerificationsReason : null,
    );
    if (reason == null || reason.length < 3 || !mounted) return;
    setState(() => _active = _PaymentAction.reject);
    bloc.add(PaymentVerificationsRejected(payment: p, reason: reason));
  }

  @override
  Widget build(BuildContext context) {
    final loc = AppLocalizations.of(context);
    final theme = Theme.of(context);
    final p = widget.payment;
    final months = p.installments
        .map((i) => '${monthLabelOf(loc, i.month)} ${i.year}')
        .join(', ');
    final note = p.note;
    final rejection = p.rejectionReason;
    return ManagementRecordCard(
      leading: ManagementAvatar(name: p.memberName ?? '?'),
      title: '${p.memberName ?? '—'} ${p.memberDisplayId ?? ''}'.trim(),
      subtitle: months,
      badge: Text(
        formatTaka(p.amount),
        style: theme.textTheme.titleMedium?.copyWith(
            color: theme.colorScheme.primary, fontWeight: FontWeight.w700),
      ),
      actions: _actions(loc),
      children: [
        if (widget.selectable)
          Row(
            children: [
              Checkbox(
                key: Key('bulkSelect_${p.id}'),
                value: widget.selected,
                onChanged: widget.busy
                    ? null
                    : (_) => context
                        .read<PaymentVerificationsBloc>()
                        .add(PaymentVerificationsToggled(p.id)),
              ),
              Text(loc.bulkSelectRow),
            ],
          ),
        InfoRow(label: loc.adminPaymentVerificationsMethod, value: p.method),
        InfoRow(
            label: loc.adminPaymentVerificationsReference,
            value: p.transactionRef),
        InfoRow(label: loc.adminPaymentVerificationsPaidOn, value: p.paidOn),
        if (p.senderAccount != null && p.senderAccount!.isNotEmpty)
          InfoRow(
              label: loc.adminPaymentVerificationsSender,
              value: p.senderAccount!),
        if (note != null && note.isNotEmpty)
          Padding(
            padding: const EdgeInsets.only(top: 6),
            child: Text('"$note"',
                style: theme.textTheme.bodyMedium
                    ?.copyWith(fontStyle: FontStyle.italic)),
          ),
        if (rejection != null && rejection.isNotEmpty)
          Padding(
            padding: const EdgeInsets.only(top: 8),
            child: ManagementCallout(
                message: rejection, icon: Icons.block_outlined, error: true),
          ),
      ],
    );
  }

  List<Widget> _actions(AppLocalizations loc) {
    final p = widget.payment;
    final busy = widget.busy;
    return [
      if (p.proofUrl != null)
        AppButton(
          label: loc.adminPaymentVerificationsViewProof,
          variant: AppButtonVariant.ghost,
          icon: Icons.visibility_outlined,
          onPressed: () => showImagePreview(context, p.proofUrl!, p.transactionRef),
        ),
      if (p.status == 'pending') ...[
        AppButton(
          label: loc.adminPaymentVerificationsReject,
          variant: AppButtonVariant.danger,
          icon: Icons.close,
          loading: _loading(_PaymentAction.reject),
          onPressed: busy ? null : () => _reject(loc),
        ),
        AppButton(
          label: loc.adminPaymentVerificationsApprove,
          icon: Icons.check,
          loading: _loading(_PaymentAction.approve),
          onPressed: busy ? null : _approve,
        ),
      ],
    ];
  }
}
