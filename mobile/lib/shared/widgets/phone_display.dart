import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../core/phone/phone.dart';
import '../../l10n/app_localizations.dart';
import '../utils/external_link_launcher.dart';
import 'widgets.dart' show showAppToast;

/// Read-only phone number: formatted international number plus call, WhatsApp
/// and copy (E.164) actions.
///
/// * Valid numbers get every action.
/// * Plausible-but-unknown numbers (possible) are formatted and copyable, but
///   never dialled.
/// * Anything unparseable is shown as the raw text only.
/// * `null` / blank renders nothing.
///
/// [compact] swaps the labelled buttons for icon buttons (lists); every target
/// stays at least 48dp. [actions] narrows the buttons (see [PhoneActions]).
/// Which buttons a [PhoneDisplay] offers.
enum PhoneActions {
  /// Call, WhatsApp and copy.
  all,

  /// Copy only, for screens that already render their own call buttons.
  copyOnly,

  /// The formatted number alone.
  none,
}

class PhoneDisplay extends StatelessWidget {
  const PhoneDisplay(
    this.phone, {
    super.key,
    this.compact = false,
    this.actions = PhoneActions.all,
    this.style,
    this.launcher = const UrlLauncherExternalLinkLauncher(),
  });

  final String? phone;
  final bool compact;
  final PhoneActions actions;
  final TextStyle? style;
  final ExternalLinkLauncher launcher;

  @override
  Widget build(BuildContext context) {
    final raw = (phone ?? '').trim();
    if (raw.isEmpty) return const SizedBox.shrink();

    final parsed = normalizePhone(raw);
    final e164 = parsed.e164;
    final lang = Localizations.localeOf(context).languageCode == 'bn' ? 'bn' : 'en';
    final number = Text(
      e164 == null ? raw : formatPhoneInternational(e164, lang: lang),
      textDirection: e164 == null ? null : TextDirection.ltr,
      style: style ?? Theme.of(context).textTheme.bodyLarge,
    );
    if (e164 == null || actions == PhoneActions.none) return number;

    final buttons = _PhoneActions(
      e164: e164,
      display: formatPhoneInternational(e164, lang: lang),
      dialable: parsed.isDialable && actions == PhoneActions.all,
      compact: compact,
      launcher: launcher,
    );
    return compact
        ? Wrap(
            crossAxisAlignment: WrapCrossAlignment.center,
            spacing: 4,
            children: [number, buttons],
          )
        : Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            mainAxisSize: MainAxisSize.min,
            children: [number, const SizedBox(height: 6), buttons],
          );
  }
}

class _PhoneActions extends StatelessWidget {
  const _PhoneActions({
    required this.e164,
    required this.display,
    required this.dialable,
    required this.compact,
    required this.launcher,
  });

  final String e164;
  final String display;
  final bool dialable;
  final bool compact;
  final ExternalLinkLauncher launcher;

  Future<void> _open(BuildContext context, Uri? uri) async {
    final failedMessage = AppLocalizations.of(context).phoneDisplayOpenFailed;
    final opened = uri != null && await launcher.open(uri);
    if (!opened && context.mounted) showAppToast(context, failedMessage, error: true);
  }

  Future<void> _copy(BuildContext context) async {
    final copiedMessage = AppLocalizations.of(context).phoneDisplayCopied;
    await Clipboard.setData(ClipboardData(text: e164));
    if (context.mounted) showAppToast(context, copiedMessage);
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final call = _ActionButton(
      key: const Key('phoneDisplayCall'),
      icon: Icons.call_outlined,
      label: l10n.phoneDisplayCall,
      semantics: l10n.phoneDisplayCallAria(display),
      compact: compact,
      onPressed: () => _open(context, telUri(e164)),
    );
    final whatsapp = _ActionButton(
      key: const Key('phoneDisplayWhatsapp'),
      icon: Icons.chat_outlined,
      label: l10n.phoneDisplayWhatsapp,
      semantics: l10n.phoneDisplayWhatsappAria(display),
      compact: compact,
      onPressed: () => _open(context, whatsAppUri(e164)),
    );
    final copy = IconButton(
      key: const Key('phoneDisplayCopy'),
      tooltip: l10n.phoneDisplayCopy,
      constraints: const BoxConstraints(minWidth: 48, minHeight: 48),
      icon: const Icon(Icons.copy_outlined),
      onPressed: () => _copy(context),
    );
    return Wrap(
      spacing: compact ? 0 : 8,
      runSpacing: 4,
      crossAxisAlignment: WrapCrossAlignment.center,
      children: [if (dialable) call, if (dialable) whatsapp, copy],
    );
  }
}

/// Labelled outlined button, or a plain icon button in compact mode.
class _ActionButton extends StatelessWidget {
  const _ActionButton({
    super.key,
    required this.icon,
    required this.label,
    required this.semantics,
    required this.compact,
    required this.onPressed,
  });

  final IconData icon;
  final String label;
  final String semantics;
  final bool compact;
  final VoidCallback onPressed;

  @override
  Widget build(BuildContext context) {
    if (compact) {
      return IconButton(
        tooltip: semantics,
        constraints: const BoxConstraints(minWidth: 48, minHeight: 48),
        icon: Icon(icon),
        onPressed: onPressed,
      );
    }
    return Semantics(
      label: semantics,
      button: true,
      excludeSemantics: true,
      child: OutlinedButton.icon(
        style: OutlinedButton.styleFrom(minimumSize: const Size(48, 48)),
        icon: Icon(icon, size: 20),
        label: Text(label),
        onPressed: onPressed,
      ),
    );
  }
}
