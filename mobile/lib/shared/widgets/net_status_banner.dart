import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';

import '../../core/di/injector.dart';
import '../../core/network/network_status.dart';
import '../../l10n/app_localizations.dart';

/// Offline / slow / "connected again" strip (net_status_banner). A polite
/// live region, so screen readers announce changes without stealing focus.
class NetStatusBanner extends StatelessWidget {
  const NetStatusBanner({super.key, this.cubit});

  /// Test seam; the DI-registered cubit by default.
  final NetworkStatusCubit? cubit;

  @override
  Widget build(BuildContext context) {
    final source = cubit ?? (sl.isRegistered<NetworkStatusCubit>() ? sl<NetworkStatusCubit>() : null);
    if (source == null) return const SizedBox.shrink();
    return BlocBuilder<NetworkStatusCubit, NetStatus>(
      bloc: source,
      builder: (context, status) {
        if (status == NetStatus.online) return const SizedBox.shrink();
        final loc = AppLocalizations.of(context);
        final scheme = Theme.of(context).colorScheme;
        final (text, icon, color, onColor) = switch (status) {
          NetStatus.offline => (loc.netOffline, Icons.wifi_off, scheme.errorContainer, scheme.onErrorContainer),
          NetStatus.slow => (loc.netSlow, Icons.network_check, scheme.secondaryContainer, scheme.onSecondaryContainer),
          _ => (loc.netReconnected, Icons.wifi, scheme.primaryContainer, scheme.onPrimaryContainer),
        };
        return Semantics(
          liveRegion: true,
          container: true,
          child: Material(
            color: color,
            child: SafeArea(
              top: false,
              bottom: false,
              child: Padding(
                padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
                child: Row(
                  children: [
                    Icon(icon, size: 20, color: onColor),
                    const SizedBox(width: 10),
                    Expanded(
                      child: Text(text, style: TextStyle(fontSize: 14, color: onColor, fontWeight: FontWeight.w600)),
                    ),
                  ],
                ),
              ),
            ),
          ),
        );
      },
    );
  }
}
