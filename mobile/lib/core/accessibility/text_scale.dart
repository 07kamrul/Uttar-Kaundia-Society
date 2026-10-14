import 'dart:math' as math;

import 'package:flutter/widgets.dart';

/// Largest text factor the app ever applies, system setting included.
const double kMaxTextScale = 1.3;

/// The system text setting times the member's "লেখা বড় করুন" factor, capped at
/// [max]. A smaller system setting is respected.
TextScaler effectiveTextScaler(
  TextScaler system, {
  required double pref,
  double max = kMaxTextScale,
}) =>
    TextScaler.linear(math.min(system.scale(1.0) * pref, max));

/// `MaterialApp.builder` for ui_a11y_v2.
Widget a11yTextScaleBuilder(
  BuildContext context,
  Widget? child, {
  required double pref,
}) {
  final media = MediaQuery.of(context);
  return MediaQuery(
    data: media.copyWith(
      textScaler: effectiveTextScaler(media.textScaler, pref: pref),
    ),
    child: child ?? const SizedBox.shrink(),
  );
}
