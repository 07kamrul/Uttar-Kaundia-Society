import 'dart:async';

import 'package:flutter/material.dart';

import '../../../../core/layout/responsive.dart';
import '../../../../l10n/app_localizations.dart';

/// Search box above an admin queue (admin_console): name / mobile / member
/// id. Reports the typed text 300 ms after the last key; the bloc treats
/// fewer than two characters as no search.
class QueueSearchField extends StatefulWidget {
  const QueueSearchField({
    super.key,
    required this.onChanged,
    this.debounce = const Duration(milliseconds: 300),
  });

  final ValueChanged<String> onChanged;
  final Duration debounce;

  @override
  State<QueueSearchField> createState() => _QueueSearchFieldState();
}

class _QueueSearchFieldState extends State<QueueSearchField> {
  final _controller = TextEditingController();
  Timer? _timer;

  @override
  void dispose() {
    _timer?.cancel();
    _controller.dispose();
    super.dispose();
  }

  void _schedule() {
    _timer?.cancel();
    _timer = Timer(widget.debounce, () => widget.onChanged(_controller.text.trim()));
    setState(() {});
  }

  @override
  Widget build(BuildContext context) {
    final loc = AppLocalizations.of(context);
    return Padding(
      padding: EdgeInsets.symmetric(horizontal: context.pageGutter, vertical: 4),
      child: TextField(
        controller: _controller,
        keyboardType: TextInputType.text,
        textInputAction: TextInputAction.search,
        onChanged: (_) => _schedule(),
        onSubmitted: (_) {
          _timer?.cancel();
          widget.onChanged(_controller.text.trim());
        },
        decoration: InputDecoration(
          hintText: loc.adminSearchHint,
          prefixIcon: const Icon(Icons.search),
          suffixIcon: _controller.text.isEmpty
              ? null
              : IconButton(
                  tooltip: loc.commonClose,
                  icon: const Icon(Icons.close),
                  onPressed: () {
                    _controller.clear();
                    _schedule();
                  },
                ),
        ),
      ),
    );
  }
}
