import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:go_router/go_router.dart';

import '../../../core/phone/phone.dart';
import '../../../l10n/app_localizations.dart';
import '../../../shared/utils/external_link_launcher.dart';
import '../../../shared/widgets/phone_display.dart';
import '../../../shared/widgets/widgets.dart';
import '../../member/presentation/widgets/member_ui.dart';
import '../data/governance_repository.dart';
import '../domain/governance_entities.dart';
import '../presentation/governance_cubits.dart';
import '../presentation/list_form_cubit.dart';
import 'governance_widgets.dart';

/// Help desk: emergency numbers, the five first steps and the complaint links.
/// The steps are fixed text, so they show even when the numbers cannot load.
class EmergencyHelpPage extends StatelessWidget {
  const EmergencyHelpPage({
    super.key,
    this.repository,
    this.launcher = const UrlLauncherExternalLinkLauncher(),
  });

  final GovernanceRepository? repository;
  final ExternalLinkLauncher launcher;

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final steps = [
      l10n.govEmergencyStep1,
      l10n.govEmergencyStep2,
      l10n.govEmergencyStep3,
      l10n.govEmergencyStep4,
      l10n.govEmergencyStep5,
    ];
    return BlocProvider(
      create: (_) => ComplaintConstantsCubit(governanceRepo(repository))..load(),
      child: BlocBuilder<ComplaintConstantsCubit, ListFormState<ComplaintConstants>>(
        builder: (context, state) {
          final contacts = state.data?.emergencyContacts ?? const <EmergencyContact>[];
          return PageBody(
            children: [
              PageHeader(
                title: l10n.navEmergencyHelp,
                subtitle: l10n.govEmergencySubtitle,
                icon: Icons.warning_amber_outlined,
              ),
              if (contacts.isNotEmpty)
                GovCard(
                  title: l10n.govEmergencyContacts,
                  icon: Icons.phone_in_talk_outlined,
                  children: [for (final c in contacts) _ContactTile(contact: c, launcher: launcher)],
                ),
              GovCard(
                title: l10n.govEmergencyStepsTitle,
                icon: Icons.checklist_outlined,
                children: [
                  for (var i = 0; i < steps.length; i++)
                    Padding(
                      padding: const EdgeInsets.only(bottom: 10),
                      child: Row(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          CircleAvatar(radius: 14, child: Text(govNumber(context, i + 1))),
                          const SizedBox(width: 10),
                          Expanded(child: Text(steps[i])),
                        ],
                      ),
                    ),
                ],
              ),
              Gutter(
                vertical: 6,
                child: Wrap(spacing: 12, runSpacing: 8, children: [
                  AppButton(
                    key: const Key('emergencyLandComplaint'),
                    label: l10n.govEmergencyFileLand,
                    icon: Icons.shield_outlined,
                    variant: AppButtonVariant.secondary,
                    onPressed: () => context.go('/complaints/land-protection'),
                  ),
                  AppButton(
                    key: const Key('emergencyComplaint'),
                    label: l10n.govEmergencyFileComplaint,
                    icon: Icons.edit_outlined,
                    variant: AppButtonVariant.secondary,
                    onPressed: () => context.go('/complaints'),
                  ),
                ]),
              ),
            ],
          );
        },
      ),
    );
  }
}

/// One emergency number. Full phone numbers go through [PhoneDisplay]; short
/// service codes (999, 109) are not valid phone numbers, so they get a plain
/// big number and a call button.
class _ContactTile extends StatelessWidget {
  const _ContactTile({required this.contact, required this.launcher});

  final EmergencyContact contact;
  final ExternalLinkLauncher launcher;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final isFullPhone = normalizePhone(contact.number).e164 != null;
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(contact.label, style: theme.textTheme.bodyMedium),
          const SizedBox(height: 4),
          if (isFullPhone)
            PhoneDisplay(contact.number, launcher: launcher)
          else
            Row(children: [
              Text(
                govNumber(context, contact.number),
                style: theme.textTheme.headlineSmall?.copyWith(color: theme.colorScheme.error),
              ),
              const Spacer(),
              FilledButton.icon(
                key: Key('emergencyCall_${contact.key}'),
                style: FilledButton.styleFrom(minimumSize: const Size(48, 48)),
                onPressed: () => launcher.open(Uri(scheme: 'tel', path: contact.number)),
                icon: const Icon(Icons.call_outlined),
                label: Text(AppLocalizations.of(context).govEmergencyCall),
              ),
            ]),
        ],
      ),
    );
  }
}
