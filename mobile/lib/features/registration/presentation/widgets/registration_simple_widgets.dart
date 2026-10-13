import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_bloc/flutter_bloc.dart';

import '../../../../core/format/bn_format.dart';
import '../../../../core/theme/app_theme.dart';
import '../../../../l10n/app_localizations.dart';
import '../bloc/registration_bloc.dart';
import 'registration_stepper.dart';

/// Small widgets that only the regSimplifiedUi flow shows.

/// "ধাপ ২ / ৬ — সম্পত্তি" header above the step content.
class RegStepHeader extends StatelessWidget {
  const RegStepHeader({super.key, required this.step});

  final int step;

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final theme = Theme.of(context);
    final lang = l10n.localeName;
    final title = RegistrationStepper.shortLabelKeys[step]?.call(l10n) ?? '';
    final text = '${l10n.regStepWord} ${bnNumber(step, locale: lang)} / '
        '${bnNumber(RegistrationStepper.stepCount, locale: lang)} — $title';
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: Semantics(
        header: true,
        child: Text(
          text,
          key: const Key('regStepHeader'),
          style: theme.textTheme.titleMedium?.copyWith(
            color: theme.colorScheme.primary,
            fontWeight: FontWeight.w700,
          ),
        ),
      ),
    );
  }
}

/// "আপনার তথ্য সংরক্ষিত আছে, পরে আবার এসে শেষ করতে পারেন।"
class RegDraftSavedLine extends StatelessWidget {
  const RegDraftSavedLine({super.key});

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Row(
      mainAxisAlignment: MainAxisAlignment.center,
      children: [
        Icon(Icons.cloud_done_outlined, size: 16, color: theme.colorScheme.onSurfaceVariant),
        const SizedBox(width: 6),
        Flexible(
          child: Text(
            AppLocalizations.of(context).regDraftSaved,
            key: const Key('draftSavedLine'),
            textAlign: TextAlign.center,
            style: theme.textTheme.bodySmall,
          ),
        ),
      ],
    );
  }
}

/// Copies [text] and shows a short "কপি হয়েছে" confirmation.
Future<void> copyToClipboardWithToast(BuildContext context, String text) async {
  final messenger = ScaffoldMessenger.maybeOf(context);
  final copied = AppLocalizations.of(context).regPayCopied;
  await Clipboard.setData(ClipboardData(text: text));
  messenger
    ?..hideCurrentSnackBar()
    ..showSnackBar(SnackBar(content: Text(copied), duration: const Duration(seconds: 2)));
}

/// Full-screen confirmation: three plain lines and the reference with a copy button.
class RegistrationSuccessView extends StatelessWidget {
  const RegistrationSuccessView({super.key, required this.reference, required this.onHome});

  final String reference;
  final VoidCallback onHome;

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final theme = Theme.of(context);
    return Padding(
      padding: const EdgeInsets.all(24),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Icon(Icons.check_circle_rounded, color: theme.colorScheme.primary, size: 72),
          const SizedBox(height: 16),
          Text(
            l10n.regSuccessTitle,
            textAlign: TextAlign.center,
            style: theme.textTheme.headlineSmall?.copyWith(fontWeight: FontWeight.w700),
          ),
          const SizedBox(height: 12),
          Text(l10n.regSuccessLine2, textAlign: TextAlign.center, style: theme.textTheme.titleMedium),
          const SizedBox(height: 8),
          Text(l10n.regSuccessLine3, textAlign: TextAlign.center, style: theme.textTheme.titleMedium),
          if (reference.isNotEmpty) ...[
            const SizedBox(height: 24),
            Text(l10n.regSuccessReference, textAlign: TextAlign.center, style: theme.textTheme.bodySmall),
            const SizedBox(height: 6),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
              decoration: BoxDecoration(
                color: theme.colorScheme.secondaryContainer,
                borderRadius: BorderRadius.circular(AppRadius.sm),
              ),
              child: Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Flexible(
                    child: SelectableText(
                      reference,
                      textAlign: TextAlign.center,
                      style: theme.textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w700),
                    ),
                  ),
                  IconButton(
                    key: const Key('successCopyReference'),
                    tooltip: l10n.regSuccessCopyRef,
                    constraints: const BoxConstraints(minWidth: 48, minHeight: 48),
                    icon: const Icon(Icons.copy_rounded),
                    onPressed: () => copyToClipboardWithToast(context, reference),
                  ),
                ],
              ),
            ),
          ],
          const SizedBox(height: 24),
          FilledButton(
            onPressed: () {
              context.read<RegistrationBloc>().add(const SubmitSuccessAcknowledged());
              onHome();
            },
            child: Text(l10n.regSuccessHome),
          ),
        ],
      ),
    );
  }
}
