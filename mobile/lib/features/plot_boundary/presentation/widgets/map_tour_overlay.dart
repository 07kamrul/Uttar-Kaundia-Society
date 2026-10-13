import 'package:flutter/material.dart';

import '../../../../l10n/app_localizations.dart';
import '../../../member/domain/finance_entities.dart' show toBanglaDigits;

/// One coach mark: spotlights the widget behind [target] and says [text].
class MapTourStep {
  const MapTourStep({required this.target, required this.text});

  final GlobalKey target;
  final String text;
}

/// First-time tour of the map (map_wizard): layers button, legend, draw
/// button, help "?". Skippable; [onFinished] fires once after the last mark
/// or Skip so the page can remember it (`AppPreferences.mapTourDone`).
class MapTourOverlay extends StatefulWidget {
  const MapTourOverlay({
    super.key,
    required this.steps,
    required this.onFinished,
  });

  final List<MapTourStep> steps;
  final VoidCallback onFinished;

  @override
  State<MapTourOverlay> createState() => _MapTourOverlayState();
}

class _MapTourOverlayState extends State<MapTourOverlay> {
  int _index = 0;
  bool _finished = false;

  void _finish() {
    if (_finished) return;
    _finished = true;
    widget.onFinished();
  }

  void _next() {
    if (_index + 1 >= widget.steps.length) {
      _finish();
    } else {
      setState(() => _index++);
    }
  }

  /// The target's rectangle in this overlay's coordinates; null until it has
  /// been laid out.
  Rect? _targetRect() {
    final target = widget.steps[_index].target.currentContext?.findRenderObject();
    final me = context.findRenderObject();
    if (target is! RenderBox || me is! RenderBox) return null;
    if (!target.attached || !target.hasSize || !me.hasSize) return null;
    return me.globalToLocal(target.localToGlobal(Offset.zero)) & target.size;
  }

  @override
  Widget build(BuildContext context) {
    if (widget.steps.isEmpty) return const SizedBox.shrink();
    final loc = AppLocalizations.of(context);
    final theme = Theme.of(context);
    final last = _index + 1 == widget.steps.length;
    final bn = Localizations.localeOf(context).languageCode == 'bn';
    String digits(int n) => bn ? toBanglaDigits('$n') : '$n';
    return LayoutBuilder(
      builder: (context, constraints) {
        final rect = _targetRect();
        final cardAtBottom =
            rect == null || rect.center.dy < constraints.maxHeight / 2;
        return Stack(
          fit: StackFit.expand,
          children: [
            // Swallows taps so the map underneath stays untouched.
            GestureDetector(
              behavior: HitTestBehavior.opaque,
              onTap: () {},
              child: CustomPaint(painter: _ScrimPainter(rect)),
            ),
            Positioned(
              left: 16,
              right: 16,
              top: cardAtBottom ? null : 24,
              bottom: cardAtBottom ? 24 : null,
              child: SafeArea(
                child: Semantics(
                  liveRegion: true,
                  child: Material(
                    key: const Key('mapTourCard'),
                    elevation: 6,
                    color: theme.colorScheme.surface,
                    borderRadius: BorderRadius.circular(16),
                    child: Padding(
                      padding: const EdgeInsets.fromLTRB(16, 14, 8, 8),
                      child: Column(
                        mainAxisSize: MainAxisSize.min,
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            loc.mapWizardTourCounter(
                              digits(_index + 1),
                              digits(widget.steps.length),
                            ),
                            style: theme.textTheme.labelMedium,
                          ),
                          const SizedBox(height: 6),
                          Text(
                            widget.steps[_index].text,
                            style: theme.textTheme.bodyLarge,
                          ),
                          const SizedBox(height: 8),
                          Row(
                            mainAxisAlignment: MainAxisAlignment.end,
                            children: [
                              TextButton(
                                key: const Key('tourSkip'),
                                onPressed: _finish,
                                child: Text(loc.mapWizardTourSkip),
                              ),
                              const SizedBox(width: 4),
                              FilledButton(
                                key: const Key('tourNext'),
                                onPressed: _next,
                                child: Text(last
                                    ? loc.mapWizardTourDone
                                    : loc.mapWizardTourNext),
                              ),
                            ],
                          ),
                        ],
                      ),
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

class _ScrimPainter extends CustomPainter {
  const _ScrimPainter(this.hole);

  final Rect? hole;

  @override
  void paint(Canvas canvas, Size size) {
    final full = Path()..addRect(Offset.zero & size);
    final spot = hole;
    final path = spot == null
        ? full
        : Path.combine(
            PathOperation.difference,
            full,
            Path()
              ..addRRect(RRect.fromRectAndRadius(
                spot.inflate(6),
                const Radius.circular(14),
              )),
          );
    canvas.drawPath(path, Paint()..color = const Color(0xB3000000));
  }

  @override
  bool shouldRepaint(_ScrimPainter old) => old.hole != hole;
}
