import 'package:flutter/material.dart';

import '../../../../l10n/app_localizations.dart';

/// map_wizard notice: one short sentence with a "বিস্তারিত" link that expands
/// to the full existing disclaimer text, unchanged.
class ShortDisclaimer extends StatefulWidget {
  const ShortDisclaimer({super.key, this.margin});

  final EdgeInsetsGeometry? margin;

  @override
  State<ShortDisclaimer> createState() => _ShortDisclaimerState();
}

class _ShortDisclaimerState extends State<ShortDisclaimer> {
  bool _expanded = false;

  @override
  Widget build(BuildContext context) {
    final loc = AppLocalizations.of(context);
    final scheme = Theme.of(context).colorScheme;
    final style = TextStyle(fontSize: 13, color: scheme.onSecondaryContainer);
    return Semantics(
      container: true,
      child: Container(
        margin: widget.margin,
        padding: const EdgeInsets.fromLTRB(12, 6, 4, 6),
        decoration: BoxDecoration(
          color: scheme.secondaryContainer,
          borderRadius: BorderRadius.circular(12),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Icon(Icons.info_outline,
                    size: 18, color: scheme.onSecondaryContainer),
                const SizedBox(width: 8),
                Expanded(
                  child: Text(loc.mapWizardShortNotice, style: style),
                ),
                TextButton(
                  key: const Key('shortNoticeMore'),
                  onPressed: () => setState(() => _expanded = !_expanded),
                  style: TextButton.styleFrom(
                    foregroundColor: scheme.onSecondaryContainer,
                    minimumSize: const Size(48, 48),
                  ),
                  child: Text(
                    _expanded ? loc.commonClose : loc.mapWizardNoticeMore,
                  ),
                ),
              ],
            ),
            if (_expanded)
              Padding(
                padding: const EdgeInsets.only(right: 8, bottom: 6),
                child: Text(
                  loc.boundaryDisclaimer,
                  key: const Key('shortNoticeFull'),
                  style: style,
                ),
              ),
          ],
        ),
      ),
    );
  }
}
