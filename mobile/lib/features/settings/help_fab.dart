import 'package:flutter/material.dart';

import '../../core/di/injector.dart';
import '../../core/helpline/helpline_repository.dart';
import '../../core/phone/phone.dart' show telUri, whatsAppUri;
import '../../l10n/app_localizations.dart';
import '../../shared/utils/external_link_launcher.dart';

/// "সাহায্য দরকার?" floating button (nav_merged_entries). Invisible until the
/// society has set a phone or WhatsApp number, so there is never a dead button.
class HelpFab extends StatefulWidget {
  const HelpFab({super.key, this.repository, this.launcher = const UrlLauncherExternalLinkLauncher()});

  final HelplineRepository? repository;
  final ExternalLinkLauncher launcher;

  @override
  State<HelpFab> createState() => _HelpFabState();
}

class _HelpFabState extends State<HelpFab> {
  late final Future<Helpline> _helpline = (widget.repository ?? sl<HelplineRepository>()).load();

  @override
  Widget build(BuildContext context) {
    return FutureBuilder<Helpline>(
      future: _helpline,
      builder: (context, snapshot) {
        final helpline = snapshot.data;
        if (helpline == null || !helpline.enabled) return const SizedBox.shrink();
        final l10n = AppLocalizations.of(context);
        return FloatingActionButton.extended(
          key: const Key('helpFab'),
          icon: const Icon(Icons.support_agent),
          label: Text(l10n.helpFab),
          onPressed: () => _showSheet(context, helpline),
        );
      },
    );
  }

  void _showSheet(BuildContext context, Helpline helpline) {
    final l10n = AppLocalizations.of(context);
    final call = telUri(helpline.phone);
    final chat = whatsAppUri(helpline.whatsapp);
    showModalBottomSheet<void>(
      context: context,
      useSafeArea: true,
      builder: (sheet) => Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          ListTile(title: Text(l10n.helpFab, style: Theme.of(sheet).textTheme.titleLarge)),
          if (helpline.hoursText != null) ListTile(dense: true, title: Text(l10n.helpHours(helpline.hoursText!))),
          if (call != null)
            ListTile(
              key: const Key('helpCall'),
              leading: const Icon(Icons.call_outlined),
              title: Text(l10n.helpCall),
              onTap: () {
                Navigator.of(sheet).pop();
                widget.launcher.open(call);
              },
            ),
          if (chat != null)
            ListTile(
              key: const Key('helpWhatsapp'),
              leading: const Icon(Icons.chat_outlined),
              title: Text(l10n.helpWhatsapp),
              onTap: () {
                Navigator.of(sheet).pop();
                widget.launcher.open(chat);
              },
            ),
          const SizedBox(height: 8),
        ],
      ),
    );
  }
}
