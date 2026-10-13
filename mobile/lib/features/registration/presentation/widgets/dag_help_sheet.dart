import 'package:flutter/material.dart';

import '../../../../core/theme/app_theme.dart';
import '../../../../l10n/app_localizations.dart';

/// "আমার দাগ কোথায় পাব?" bottom sheet with a schematic (not a real document)
/// showing where the khatian number and CS / RS dag sit on a porcha.
Future<void> showDagHelpSheet(BuildContext context) {
  return showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    useSafeArea: true,
    showDragHandle: true,
    builder: (_) => const _DagHelpSheet(),
  );
}

class _DagHelpSheet extends StatelessWidget {
  const _DagHelpSheet();

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final theme = Theme.of(context);
    return SingleChildScrollView(
      padding: const EdgeInsets.fromLTRB(20, 0, 20, 24),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(l10n.regDagHelpLink,
              style: theme.textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w700)),
          const SizedBox(height: 8),
          Text(l10n.regDagHelpIntro, style: theme.textTheme.bodyLarge),
          const SizedBox(height: 16),
          Text(l10n.regDagHelpSchemaTitle, style: theme.textTheme.labelLarge),
          const SizedBox(height: 8),
          const DagHelpIllustration(),
          const SizedBox(height: 16),
          Text(l10n.regDagHelpTip, style: theme.textTheme.bodyMedium),
          const SizedBox(height: 16),
          FilledButton(
            onPressed: () => Navigator.of(context).pop(),
            child: Text(l10n.regDagHelpClose),
          ),
        ],
      ),
    );
  }
}

/// Illustration built from plain widgets: a blank paper with grey "text lines"
/// and three highlighted boxes (khatian no., CS dag, RS dag). No real data.
class DagHelpIllustration extends StatelessWidget {
  const DagHelpIllustration({super.key});

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final scheme = Theme.of(context).colorScheme;
    return Semantics(
      label: l10n.regDagHelpSchemaTitle,
      child: AspectRatio(
        key: const Key('dagHelpIllustration'),
        aspectRatio: 4 / 3,
        child: DecoratedBox(
          decoration: BoxDecoration(
            color: Colors.white,
            border: Border.all(color: scheme.outline, width: 1.5),
            borderRadius: BorderRadius.circular(AppRadius.sm),
          ),
          child: ClipRRect(
            borderRadius: BorderRadius.circular(AppRadius.sm),
            child: Stack(
              fit: StackFit.expand,
              children: [
                const CustomPaint(painter: _PaperLinesPainter()),
                Padding(
                  padding: const EdgeInsets.all(12),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      Align(
                        alignment: AlignmentDirectional.centerEnd,
                        child: _Callout(label: l10n.regDagHelpKhatian, color: scheme.primary, number: '1'),
                      ),
                      const Spacer(),
                      Row(
                        children: [
                          Expanded(
                              child: _Callout(label: l10n.regDagHelpCs, color: scheme.secondary, number: '2')),
                          const SizedBox(width: 12),
                          Expanded(
                              child: _Callout(label: l10n.regDagHelpRs, color: scheme.error, number: '3')),
                        ],
                      ),
                      const Spacer(),
                    ],
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _Callout extends StatelessWidget {
  const _Callout({required this.label, required this.color, required this.number});

  final String label;
  final Color color;
  final String number;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 8),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.12),
        border: Border.all(color: color, width: 2),
        borderRadius: BorderRadius.circular(6),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          CircleAvatar(
            radius: 10,
            backgroundColor: color,
            child: Text(number, style: const TextStyle(color: Colors.white, fontSize: 12)),
          ),
          const SizedBox(width: 6),
          Flexible(
            child: Text(label, style: Theme.of(context).textTheme.labelMedium, softWrap: true),
          ),
        ],
      ),
    );
  }
}

/// Faint horizontal rules imitating lines of text on the paper.
class _PaperLinesPainter extends CustomPainter {
  const _PaperLinesPainter();

  @override
  void paint(Canvas canvas, Size size) {
    final paint = Paint()
      ..color = const Color(0xFFD9D9D9)
      ..strokeWidth = 3
      ..strokeCap = StrokeCap.round;
    const gap = 22.0;
    for (var y = gap; y < size.height - 8; y += gap) {
      final endX = size.width - 16 - ((y ~/ gap) % 3) * 18;
      canvas.drawLine(Offset(16, y), Offset(endX, y), paint);
    }
  }

  @override
  bool shouldRepaint(_PaperLinesPainter oldDelegate) => false;
}
