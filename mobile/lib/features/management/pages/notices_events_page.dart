import 'package:flutter/material.dart';

import '../../../l10n/app_localizations.dart';
import 'events_management_page.dart';
import 'notices_management_page.dart';

/// "নোটিশ ও অনুষ্ঠান": the two existing management pages as tabs
/// (admin_console, manage_notices). The old routes stay.
class NoticesEventsPage extends StatefulWidget {
  const NoticesEventsPage({super.key, this.initialTab, this.noticesBuilder, this.eventsBuilder, this.onTabChanged});

  /// `notices` or `events` (the `?tab=` value).
  final String? initialTab;
  final WidgetBuilder? noticesBuilder;
  final WidgetBuilder? eventsBuilder;

  /// Lets the router keep the tab in the URL.
  final ValueChanged<String>? onTabChanged;

  @override
  State<NoticesEventsPage> createState() => _NoticesEventsPageState();
}

class _NoticesEventsPageState extends State<NoticesEventsPage> {
  late String _tab = widget.initialTab == 'events' ? 'events' : 'notices';

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context);
    return Column(
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 8, 16, 0),
          child: Wrap(
            spacing: 8,
            children: [
              for (final (key, label) in [('notices', l.noticesEventsTabNotices), ('events', l.noticesEventsTabEvents)])
                ChoiceChip(
                  key: Key('noticesEventsTab_$key'),
                  label: Text(label),
                  selected: _tab == key,
                  onSelected: (_) {
                    setState(() => _tab = key);
                    widget.onTabChanged?.call(key);
                  },
                ),
            ],
          ),
        ),
        Expanded(
          child: _tab == 'events'
              ? (widget.eventsBuilder ?? (_) => const EventsManagementPage())(context)
              : (widget.noticesBuilder ?? (_) => const NoticesManagementPage())(context),
        ),
      ],
    );
  }
}
