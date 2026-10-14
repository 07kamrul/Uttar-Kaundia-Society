import 'package:flutter/material.dart';

import '../../l10n/app_localizations.dart';

/// Plain confirmation (ui_a11y_v2): the title is a question, [consequence] is
/// one sentence, and the buttons say "হ্যাঁ, (action)" / "না, ফিরে যান", each at
/// least 48 px tall. Returns true only on yes.
Future<bool> showPlainConfirm(
  BuildContext context, {
  required String title,
  required String consequence,
  required String action,
  bool destructive = false,
}) async {
  final loc = AppLocalizations.of(context);
  final result = await showDialog<bool>(
    context: context,
    builder: (ctx) => AlertDialog(
      title: Text(title),
      content: Text(consequence),
      actionsOverflowDirection: VerticalDirection.down,
      actions: [
        TextButton(
          style: TextButton.styleFrom(minimumSize: const Size(48, 48)),
          onPressed: () => Navigator.of(ctx).pop(false),
          child: Text(loc.plainConfirmNo),
        ),
        FilledButton(
          style: FilledButton.styleFrom(
            minimumSize: const Size(48, 48),
            backgroundColor: destructive ? Theme.of(ctx).colorScheme.error : null,
          ),
          onPressed: () => Navigator.of(ctx).pop(true),
          child: Text(loc.plainConfirmYes(action)),
        ),
      ],
    ),
  );
  return result ?? false;
}
