import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';

import '../../../core/di/injector.dart';
import '../../../core/network/api_client.dart';
import '../../../core/network/api_error_messages.dart';
import '../../../core/phone/phone.dart';
import '../../../l10n/app_localizations.dart';
import '../../../shared/widgets/phone_field.dart';
import '../../../shared/widgets/widgets.dart';
import '../data/console_repository.dart';
import '../domain/console_entities.dart';
import '../presentation/bloc/console_cubits.dart';

/// "ফোন নম্বর ঠিক করুন": numbers the migration could not convert; one PUT per
/// row (member.manage). Errors are mapped by `detail.code`, never shown raw.
class PhoneFixesPage extends StatelessWidget {
  const PhoneFixesPage({super.key, this.repository});

  /// Test seam; the live repository by default.
  final PhoneFixRepository? repository;

  @override
  Widget build(BuildContext context) {
    return BlocProvider(
      create: (_) => PhoneFixesCubit(repository: repository ?? PhoneFixRepository(apiClient: sl<ApiClient>()))..load(),
      child: const _View(),
    );
  }
}

String _fieldLabel(AppLocalizations l, PhoneFix fix) => switch ('${fix.entityType}.${fix.field}') {
      'member.mobile' => l.phoneFixFieldMemberMobile,
      'member.urgent_contact_mobile' => l.phoneFixFieldMemberUrgent,
      'nominee.mobile' => l.phoneFixFieldNomineeMobile,
      'co_owner.owner_phone' => l.phoneFixFieldCoOwnerPhone,
      'membership_application.mobile' => l.phoneFixFieldApplicationMobile,
      _ => fix.field,
    };

class _View extends StatelessWidget {
  const _View();

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context);
    return BlocBuilder<PhoneFixesCubit, LoadState<PhoneFix>>(
      builder: (context, state) {
        final cubit = context.read<PhoneFixesCubit>();
        return PageBody(
          onRefresh: cubit.load,
          children: [
            PageHeader(icon: Icons.phone_forwarded_outlined, title: l.phoneFixesTitle, subtitle: l.phoneFixesSubtitle),
            if (state.loading)
              const SkeletonLoader(lines: 3, height: 120)
            else if (state.loadFailed)
              InlineError(message: l.phoneFixesLoadError, onRetry: cubit.load)
            else if (state.items.isEmpty)
              EmptyState(message: l.phoneFixesEmpty, icon: Icons.check_circle_outline)
            else
              for (final fix in state.items) _FixCard(key: Key('phoneFix_${fix.id}'), fix: fix, busy: state.busyId == fix.id),
          ],
        );
      },
    );
  }
}

class _FixCard extends StatefulWidget {
  const _FixCard({super.key, required this.fix, required this.busy});

  final PhoneFix fix;
  final bool busy;

  @override
  State<_FixCard> createState() => _FixCardState();
}

class _FixCardState extends State<_FixCard> {
  String _value = '';
  String? _error;

  bool get _valid => _value.isNotEmpty && phoneErrorKind(_value) == null;

  Future<void> _save() async {
    final cubit = context.read<PhoneFixesCubit>();
    final l = AppLocalizations.of(context);
    final ok = await cubit.resolve(widget.fix, _value);
    if (!mounted || ok) return;
    setState(() => _error = apiErrorMessage(l, cubit.state.actionError ?? Object()));
  }

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context);
    final theme = Theme.of(context);
    final fix = widget.fix;
    final who = [if (fix.memberName != null) fix.memberName!, if (fix.memberCode != null) fix.memberCode!].join(' ');
    return Card(
      margin: const EdgeInsets.symmetric(horizontal: 16, vertical: 6),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(who.isEmpty ? '—' : who, style: theme.textTheme.titleSmall),
            const SizedBox(height: 4),
            Text(_fieldLabel(l, fix), style: theme.textTheme.bodyMedium),
            const SizedBox(height: 4),
            Text('${l.phoneFixesRaw}: ${fix.rawValue}',
                style: theme.textTheme.bodySmall?.copyWith(color: theme.colorScheme.onSurfaceVariant)),
            const SizedBox(height: 8),
            PhoneField(
              value: _value,
              enabled: !widget.busy,
              onChanged: (v) => setState(() {
                _value = v;
                _error = null;
              }),
            ),
            if (_error != null)
              Padding(
                padding: const EdgeInsets.only(top: 6),
                child: Text(_error!, key: Key('phoneFixError_${fix.id}'), style: TextStyle(color: theme.colorScheme.error)),
              ),
            const SizedBox(height: 8),
            AppButton(
              key: Key('phoneFixSave_${fix.id}'),
              label: l.phoneFixesSave,
              icon: Icons.check,
              loading: widget.busy,
              onPressed: _valid && !widget.busy ? _save : null,
            ),
          ],
        ),
      ),
    );
  }
}
