import 'package:flutter/widgets.dart';

import '../di/injector.dart';
import 'feature_flag.dart';
import 'feature_flags_service.dart';

/// Rebuilds when the flags refresh. Reads the DI-registered service unless
/// [service] is given; an unregistered service means every flag is off.
class FeatureFlagBuilder extends StatelessWidget {
  const FeatureFlagBuilder({super.key, required this.flag, required this.builder, this.service});

  final FeatureFlag flag;
  final Widget Function(BuildContext context, bool enabled) builder;
  final FeatureFlagsService? service;

  @override
  Widget build(BuildContext context) {
    final s = service ?? (sl.isRegistered<FeatureFlagsService>() ? sl<FeatureFlagsService>() : null);
    if (s == null) return builder(context, false);
    return ListenableBuilder(listenable: s, builder: (ctx, _) => builder(ctx, s.isEnabled(flag)));
  }
}

/// Current value of [flag] without subscribing; false when no service is registered.
bool flagEnabled(FeatureFlag flag) =>
    sl.isRegistered<FeatureFlagsService>() && sl<FeatureFlagsService>().isEnabled(flag);
