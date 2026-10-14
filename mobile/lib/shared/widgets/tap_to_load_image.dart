import 'package:flutter/material.dart';

import '../../core/data_saver/data_saver.dart';
import '../../l10n/app_localizations.dart';

/// With data saver on, a big picture shows a "ছবি দেখুন" button and downloads
/// only when tapped; otherwise [builder] runs straight away (unchanged).
class TapToLoadImage extends StatefulWidget {
  const TapToLoadImage({super.key, required this.builder, this.dataSaver});

  final Widget Function() builder;

  /// Test seam; [dataSaverActive] when null.
  final bool? dataSaver;

  @override
  State<TapToLoadImage> createState() => _TapToLoadImageState();
}

class _TapToLoadImageState extends State<TapToLoadImage> {
  bool _requested = false;

  @override
  Widget build(BuildContext context) {
    final saver = widget.dataSaver ?? dataSaverActive();
    if (!saver || _requested) return widget.builder();
    return Center(
      child: OutlinedButton.icon(
        style: OutlinedButton.styleFrom(minimumSize: const Size(48, 48)),
        onPressed: () => setState(() => _requested = true),
        icon: const Icon(Icons.image_outlined),
        label: Text(AppLocalizations.of(context).tapToLoadImage),
      ),
    );
  }
}
