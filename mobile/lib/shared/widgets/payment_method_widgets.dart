import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:image_picker/image_picker.dart';

import '../../core/theme/app_theme.dart';
import '../../features/registration/domain/registration_form.dart' show PaymentMethod, PaymentMethodX;
import '../../l10n/app_localizations.dart';

/// Payment UI shared by the registration payment step (Batch 1) and the member
/// pay flow (Batch 2): method cards, the society's account with copy buttons,
/// the reference label by method, the abroad note and the proof picker.

/// Methods offered as cards, in display order (canonical contract keys).
const kPaymentCardMethods = [
  PaymentMethod.cash,
  PaymentMethod.bkash,
  PaymentMethod.nagad,
  PaymentMethod.rocket,
  PaymentMethod.bank,
  PaymentMethod.other,
];

String paymentMethodLabel(AppLocalizations l10n, PaymentMethod m) => switch (m) {
      PaymentMethod.cash => l10n.regPayCash,
      PaymentMethod.bkash => l10n.regPayBkash,
      PaymentMethod.nagad => l10n.regPayNagad,
      PaymentMethod.rocket => l10n.regPayRocket,
      PaymentMethod.bank => l10n.regPayBank,
      PaymentMethod.other => l10n.regPayOther,
      PaymentMethod.mfs => l10n.regPayBkash,
      PaymentMethod.unknown => '',
    };

/// "ট্রানজেকশন আইডি (TrxID)" for mobile banking, "রসিদ নম্বর" otherwise.
String paymentReferenceLabel(AppLocalizations l10n, PaymentMethod m) =>
    m.usesTransactionId ? l10n.regPayRefTrx : l10n.regPayRefReceipt;

IconData paymentMethodIcon(PaymentMethod m) => switch (m) {
      PaymentMethod.cash => Icons.payments_outlined,
      PaymentMethod.bank => Icons.account_balance_outlined,
      PaymentMethod.other => Icons.more_horiz,
      _ => Icons.phone_android_outlined,
    };

/// Copies [text] and shows a short "কপি হয়েছে" confirmation.
Future<void> copyToClipboardWithToast(BuildContext context, String text) async {
  final messenger = ScaffoldMessenger.maybeOf(context);
  final copied = AppLocalizations.of(context).regPayCopied;
  await Clipboard.setData(ClipboardData(text: text));
  messenger
    ?..hideCurrentSnackBar()
    ..showSnackBar(SnackBar(content: Text(copied), duration: const Duration(seconds: 2)));
}

/// Tappable method cards. [selected] may be null (nothing chosen yet).
class PaymentMethodCards extends StatelessWidget {
  const PaymentMethodCards({super.key, required this.selected, required this.onSelected});

  final PaymentMethod? selected;
  final ValueChanged<PaymentMethod> onSelected;

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final theme = Theme.of(context);
    return LayoutBuilder(
      key: const Key('paymentMethodCards'),
      builder: (context, constraints) {
        final columns = constraints.maxWidth >= 480 ? 3 : 2;
        final width = (constraints.maxWidth - 8 * (columns - 1)) / columns;
        return Wrap(
          spacing: 8,
          runSpacing: 8,
          children: [
            for (final m in kPaymentCardMethods)
              SizedBox(
                width: width,
                child: Semantics(
                  inMutuallyExclusiveGroup: true,
                  checked: selected == m,
                  button: true,
                  label: paymentMethodLabel(l10n, m),
                  excludeSemantics: true,
                  child: InkWell(
                    key: Key('payMethod_${m.canonicalKey}'),
                    borderRadius: BorderRadius.circular(AppRadius.md),
                    onTap: () => onSelected(m),
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
                          Icon(paymentMethodIcon(m), color: theme.colorScheme.primary),
                          const SizedBox(width: 8),
                          Expanded(
                            child: Text(
                              paymentMethodLabel(l10n, m),
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

/// One society account to display. Empty strings are skipped.
class PaymentAccountLine {
  const PaymentAccountLine({this.accountName = '', this.label = '', this.number = ''});

  final String accountName;
  final String label;
  final String number;
}

/// The society's account(s) for the chosen method, each value with a copy button.
class PaymentAccountsBox extends StatelessWidget {
  const PaymentAccountsBox({super.key, required this.accounts});

  final List<PaymentAccountLine> accounts;

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

/// "If you live abroad a relative can pay for you" hint.
class AbroadPaymentNote extends StatelessWidget {
  const AbroadPaymentNote({super.key});

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

/// A picked proof file: path on disk plus display name.
typedef PickedProof = ({String path, String name});

/// Asks camera vs gallery/file, then picks. Null when cancelled.
Future<PickedProof?> pickPaymentProof(BuildContext context) async {
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
  if (source == null) return null;
  if (source == 'camera') {
    final shot = await ImagePicker().pickImage(source: ImageSource.camera);
    return shot == null ? null : (path: shot.path, name: shot.name);
  }
  final result = await FilePicker.platform.pickFiles(
    type: FileType.custom,
    allowedExtensions: ['jpg', 'jpeg', 'png', 'pdf'],
  );
  final file = result?.files.singleOrNull;
  return file?.path == null ? null : (path: file!.path!, name: file.name);
}
