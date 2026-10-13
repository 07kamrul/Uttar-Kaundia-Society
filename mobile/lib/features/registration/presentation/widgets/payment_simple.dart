import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:image_picker/image_picker.dart';

import '../../../../core/format/bn_format.dart';
import '../../../../core/theme/app_theme.dart';
import '../../../../l10n/app_localizations.dart';
import '../../data/registration_config_repository.dart';
import '../../domain/registration_form.dart';
import '../../domain/registration_validators.dart';
import '../bloc/registration_bloc.dart';
import 'registration_inputs.dart';
import 'registration_l10n.dart';
import 'registration_simple_widgets.dart';

/// Step 4 behind regSimplifiedUi: read-only fee in taka, method cards, the
/// society's account (from /public/registration-config) with copy buttons, a
/// reference field labelled by method, a screenshot upload and the abroad note.

/// Methods offered as cards, in display order (canonical contract keys).
const _cardMethods = [
  PaymentMethod.cash,
  PaymentMethod.bkash,
  PaymentMethod.nagad,
  PaymentMethod.rocket,
  PaymentMethod.bank,
  PaymentMethod.other,
];

String _methodLabel(AppLocalizations l10n, PaymentMethod m) => switch (m) {
      PaymentMethod.cash => l10n.regPayCash,
      PaymentMethod.bkash => l10n.regPayBkash,
      PaymentMethod.nagad => l10n.regPayNagad,
      PaymentMethod.rocket => l10n.regPayRocket,
      PaymentMethod.bank => l10n.regPayBank,
      PaymentMethod.other => l10n.regPayOther,
      PaymentMethod.mfs => l10n.regPayBkash,
      PaymentMethod.unknown => '',
    };

/// Localized label of a chosen method (review screen, summaries).
String paymentMethodLabel(AppLocalizations l10n, PaymentMethod m) => _methodLabel(l10n, m);

IconData _methodIcon(PaymentMethod m) => switch (m) {
      PaymentMethod.cash => Icons.payments_outlined,
      PaymentMethod.bank => Icons.account_balance_outlined,
      PaymentMethod.other => Icons.more_horiz,
      _ => Icons.phone_android_outlined,
    };

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
              _MethodCards(selected: method),
              if (accounts.isNotEmpty) _AccountBox(accounts: accounts),
            ],
          ),
        ),
        RegSectionCard(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              RegTextField(
                key: const Key('receiptNoField'),
                label: method.usesTransactionId ? l10n.regPayRefTrx : l10n.regPayRefReceipt,
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
        if (state.flags.abroadAddress && f.currentAddressAbroad) const _AbroadNote(),
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

class _MethodCards extends StatelessWidget {
  const _MethodCards({required this.selected});

  final PaymentMethod selected;

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final theme = Theme.of(context);
    final bloc = context.read<RegistrationBloc>();
    return LayoutBuilder(
      key: const Key('paymentMethodCards'),
      builder: (context, constraints) {
        final columns = constraints.maxWidth >= 480 ? 3 : 2;
        final width = (constraints.maxWidth - 8 * (columns - 1)) / columns;
        return Wrap(
          spacing: 8,
          runSpacing: 8,
          children: [
            for (final m in _cardMethods)
              SizedBox(
                width: width,
                child: Semantics(
                  inMutuallyExclusiveGroup: true,
                  checked: selected == m,
                  button: true,
                  label: _methodLabel(l10n, m),
                  excludeSemantics: true,
                  child: InkWell(
                    key: Key('payMethod_${m.canonicalKey}'),
                    borderRadius: BorderRadius.circular(AppRadius.md),
                    onTap: () => bloc.add(PaymentMethodSelected(m)),
                    child: Container(
                      constraints: const BoxConstraints(minHeight: 56),
                      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
                      decoration: BoxDecoration(
                        color: selected == m ? theme.colorScheme.primaryContainer : theme.colorScheme.surface,
                        border: Border.all(
                          color: selected == m ? theme.colorScheme.primary : theme.colorScheme.outline,
                          width: selected == m ? 2 : 1.5,
                        ),
                        borderRadius: BorderRadius.circular(AppRadius.md),
                      ),
                      child: Row(
                        children: [
                          Icon(_methodIcon(m), color: theme.colorScheme.primary),
                          const SizedBox(width: 8),
                          Expanded(
                            child: Text(
                              _methodLabel(l10n, m),
                              style: theme.textTheme.titleSmall,
                              maxLines: 2,
                              overflow: TextOverflow.ellipsis,
                            ),
                          ),
                          if (selected == m) Icon(Icons.check_circle, color: theme.colorScheme.primary, size: 20),
                        ],
                      ),
                    ),
                  ),
                ),
              ),
          ],
        );
      },
    );
  }
}

/// The society's account(s) for the chosen method, each value with a copy button.
class _AccountBox extends StatelessWidget {
  const _AccountBox({required this.accounts});

  final List<PaymentAccount> accounts;

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final theme = Theme.of(context);
    return Container(
      key: const Key('paymentAccounts'),
      margin: const EdgeInsets.only(top: 12),
      padding: const EdgeInsets.fromLTRB(12, 10, 4, 6),
      decoration: BoxDecoration(
        color: theme.colorScheme.secondaryContainer,
        borderRadius: BorderRadius.circular(AppRadius.sm),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(l10n.regPayAccountTitle, style: theme.textTheme.labelLarge),
          for (final a in accounts) ...[
            const SizedBox(height: 6),
            if (a.accountName.isNotEmpty) _CopyRow(label: l10n.regPayAccountName, value: a.accountName, copyable: false),
            if (a.label.isNotEmpty) SelectableText(a.label, style: theme.textTheme.titleSmall),
            if (a.number.isNotEmpty) _CopyRow(label: l10n.regPayAccountNumber, value: a.number),
          ],
        ],
      ),
    );
  }
}

class _CopyRow extends StatelessWidget {
  const _CopyRow({required this.label, required this.value, this.copyable = true});

  final String label;
  final String value;
  final bool copyable;

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final theme = Theme.of(context);
    return Row(
      children: [
        Expanded(
          child: Padding(
            padding: const EdgeInsets.symmetric(vertical: 6),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(label, style: theme.textTheme.bodySmall),
                Text(value, style: theme.textTheme.titleMedium),
              ],
            ),
          ),
        ),
        if (copyable)
          TextButton.icon(
            key: Key('copy_$value'),
            icon: const Icon(Icons.copy_rounded, size: 18),
            onPressed: () => copyToClipboardWithToast(context, value),
            label: Text(l10n.regPayCopy),
          )
        else
          const SizedBox(height: 48),
      ],
    );
  }
}

class _AbroadNote extends StatelessWidget {
  const _AbroadNote();

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Container(
      key: const Key('abroadPaymentNote'),
      margin: const EdgeInsets.symmetric(vertical: 6),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: theme.colorScheme.primaryContainer.withValues(alpha: 0.6),
        borderRadius: BorderRadius.circular(AppRadius.sm),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(Icons.public, size: 20, color: theme.colorScheme.primary),
          const SizedBox(width: 8),
          Expanded(child: Text(AppLocalizations.of(context).regPayAbroadNote, style: theme.textTheme.bodyMedium)),
        ],
      ),
    );
  }
}

/// "পেমেন্টের স্ক্রিনশট দিন": gallery / file, or camera; compressed by the bloc.
class _ScreenshotField extends StatelessWidget {
  const _ScreenshotField();

  Future<void> _pick(BuildContext context) async {
    final bloc = context.read<RegistrationBloc>();
    final l10n = AppLocalizations.of(context);
    final source = await showModalBottomSheet<String>(
      context: context,
      useSafeArea: true,
      builder: (sheet) => Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          ListTile(
            leading: const Icon(Icons.photo_camera_outlined),
            title: Text(l10n.regPickCamera),
            onTap: () => Navigator.of(sheet).pop('camera'),
          ),
          ListTile(
            leading: const Icon(Icons.photo_library_outlined),
            title: Text(l10n.regPickFile),
            onTap: () => Navigator.of(sheet).pop('file'),
          ),
        ],
      ),
    );
    if (source == null) return;
    if (source == 'camera') {
      final shot = await ImagePicker().pickImage(source: ImageSource.camera);
      if (shot != null) bloc.add(ReceiptFileAttached(shot.path, shot.name));
      return;
    }
    final result = await FilePicker.platform.pickFiles(
      type: FileType.custom,
      allowedExtensions: ['jpg', 'jpeg', 'png', 'pdf'],
    );
    final file = result?.files.singleOrNull;
    if (file?.path != null) bloc.add(ReceiptFileAttached(file!.path!, file.name));
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
