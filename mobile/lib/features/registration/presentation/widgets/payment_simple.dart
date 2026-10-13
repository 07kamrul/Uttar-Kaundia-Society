import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';

import '../../../../core/format/bn_format.dart';
import '../../../../l10n/app_localizations.dart';
import '../../../../shared/widgets/payment_method_widgets.dart';
import '../../domain/registration_form.dart';
import '../../domain/registration_validators.dart';
import '../bloc/registration_bloc.dart';
import 'registration_inputs.dart';
import 'registration_l10n.dart';

/// Step 4 behind regSimplifiedUi: read-only fee in taka, method cards, the
/// society's account (from /public/registration-config) with copy buttons, a
/// reference field labelled by method, a screenshot upload and the abroad note.

export '../../../../shared/widgets/payment_method_widgets.dart' show paymentMethodLabel;

class SimplePaymentStep extends StatelessWidget {
  const SimplePaymentStep({super.key});

  @override
  Widget build(BuildContext context) {
    final state = context.watch<RegistrationBloc>().state;
    final l10n = AppLocalizations.of(context);
    final lang = l10n.localeName;
    final f = state.form;
    final method = f.paymentMethod;
    final accounts = state.paymentAccounts.where((a) => a.method == method.canonicalKey).toList();
    final err = findError(state.stepErrors, RegErrorKind.paymentMethodRequired);

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        RegSectionCard(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              _AmountRow(
                key: const Key('admissionFeeText'),
                label: l10n.registrationPaymentAdmissionFeeLabel,
                value: state.feeStatus == FeeStatus.loaded && state.hasAdmissionFee
                    ? taka(state.admissionFee, locale: lang)
                    : '—',
              ),
              const Divider(height: 20),
              _AmountRow(
                key: const Key('subscriptionText'),
                label: l10n.registrationPaymentSubscriptionLabel,
                value: state.hasSubscription ? taka(state.quote!.total, locale: lang) : '—',
              ),
              if (state.feeStatus == FeeStatus.error)
                TextButton.icon(
                  icon: const Icon(Icons.refresh, size: 18),
                  onPressed: () => context.read<RegistrationBloc>().add(const FeeRetryRequested()),
                  label: Text(l10n.registrationPaymentAdmissionFeeRetry),
                ),
              if (state.quoteStatus == QuoteStatus.error)
                TextButton.icon(
                  icon: const Icon(Icons.refresh, size: 18),
                  onPressed: () => context.read<RegistrationBloc>().add(const SubscriptionRetryRequested()),
                  label: Text(l10n.registrationPaymentSubscriptionRetry),
                ),
            ],
          ),
        ),
        RegSectionCard(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              RegLabel(
                required: true,
                text: l10n.registrationPaymentMethodLabel,
                error: err == null ? null : regErrorMessage(l10n, err),
              ),
              const SizedBox(height: 8),
              PaymentMethodCards(
                selected: method,
                onSelected: (m) => context.read<RegistrationBloc>().add(PaymentMethodSelected(m)),
              ),
              if (accounts.isNotEmpty)
                PaymentAccountsBox(
                  accounts: [
                    for (final a in accounts)
                      PaymentAccountLine(accountName: a.accountName, label: a.label, number: a.number),
                  ],
                ),
            ],
          ),
        ),
        RegSectionCard(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              RegTextField(
                key: const Key('receiptNoField'),
                label: paymentReferenceLabel(l10n, method),
                value: f.receiptNo,
                prefixIcon: Icons.receipt_long_outlined,
                textInputAction: TextInputAction.done,
                onChanged: (v) => context.read<RegistrationBloc>().add(ReceiptNoChanged(v)),
              ),
              const SizedBox(height: 16),
              const _ScreenshotField(),
              if (state.fileError?.isReceipt ?? false)
                Padding(
                  padding: const EdgeInsets.only(top: 8),
                  child: Text(
                    state.fileError!.kind == FileErrorKind.type
                        ? l10n.registrationPaymentFileTypeError
                        : l10n.registrationPaymentFileSizeError(5),
                    style: Theme.of(context)
                        .textTheme
                        .bodySmall
                        ?.copyWith(color: Theme.of(context).colorScheme.error),
                  ),
                ),
            ],
          ),
        ),
        if (state.flags.abroadAddress && f.currentAddressAbroad) const AbroadPaymentNote(),
      ],
    );
  }
}

class _AmountRow extends StatelessWidget {
  const _AmountRow({super.key, required this.label, required this.value});

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Row(
      children: [
        Expanded(child: Text(label, style: theme.textTheme.bodyLarge)),
        Text(
          value,
          style: theme.textTheme.titleLarge?.copyWith(
            color: theme.colorScheme.primary,
            fontWeight: FontWeight.w700,
          ),
        ),
      ],
    );
  }
}

/// "পেমেন্টের স্ক্রিনশট দিন": gallery / file, or camera; compressed by the bloc.
class _ScreenshotField extends StatelessWidget {
  const _ScreenshotField();

  Future<void> _pick(BuildContext context) async {
    final bloc = context.read<RegistrationBloc>();
    final picked = await pickPaymentProof(context);
    if (picked != null) bloc.add(ReceiptFileAttached(picked.path, picked.name));
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final bloc = context.read<RegistrationBloc>();
    final receipt = context.watch<RegistrationBloc>().state.form.receiptFile;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        RegLabel(text: l10n.regPayScreenshot),
        const SizedBox(height: 6),
        if (receipt?.hasFile ?? false)
          RegFileChip(
            fileName: receipt!.fileName ?? '',
            removeLabel: l10n.registrationPaymentRemoveFile,
            onRemove: () => bloc.add(const ReceiptFileRemoved()),
          )
        else
          OutlinedButton.icon(
            icon: const Icon(Icons.upload_file_outlined, size: 20),
            label: Text(l10n.regPayScreenshot),
            onPressed: () => _pick(context),
          ),
      ],
    );
  }
}
