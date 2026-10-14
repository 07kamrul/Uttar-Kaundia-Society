import 'package:flutter/material.dart';

import '../../../../l10n/app_localizations.dart';
import 'dag_help_sheet.dart';

/// "?" on a registration step (ui_a11y_v2): two or three plain lines. Step 2
/// reuses the plot-number help sheet.
class StepHelpButton extends StatelessWidget {
  const StepHelpButton({super.key, required this.step});

  final int step;

  @override
  Widget build(BuildContext context) {
    return IconButton(
      tooltip: AppLocalizations.of(context).regHelpTooltip,
      constraints: const BoxConstraints(minWidth: 48, minHeight: 48),
      icon: const Icon(Icons.help_outline),
      onPressed: () => showStepHelp(context, step),
    );
  }
}

Future<void> showStepHelp(BuildContext context, int step) {
  if (step == 2) return showDagHelpSheet(context);
  final loc = AppLocalizations.of(context);
  final text = switch (step) {
    1 => loc.regHelpStep1,
    3 => loc.regHelpStep3,
    4 => loc.regHelpStep4,
    5 => loc.regHelpStep5,
    _ => loc.regHelpStep6,
  };
  return showModalBottomSheet<void>(
    context: context,
    showDragHandle: true,
    builder: (_) => SafeArea(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(20, 0, 20, 24),
        child: Text(text, style: Theme.of(context).textTheme.bodyLarge),
      ),
    ),
  );
}
