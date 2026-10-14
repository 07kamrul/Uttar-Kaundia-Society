import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';

import '../../../core/di/injector.dart';
import '../../../core/format/bn_format.dart';
import '../../../core/network/api_client.dart';
import '../../../core/network/api_error_messages.dart';
import '../../../l10n/app_localizations.dart';
import '../../../shared/widgets/widgets.dart';
import '../../member/presentation/widgets/member_ui.dart';
import '../data/governance_repository.dart';
import '../presentation/governance_errors.dart';
import '../presentation/list_form_cubit.dart';
import 'governance_labels.dart';

/// The repository a page uses: the injected test double, else the app one.
GovernanceRepository governanceRepo(GovernanceRepository? injected) =>
    injected ?? GovernanceRepository(apiClient: sl<ApiClient>());

String govLang(BuildContext context) => Localizations.localeOf(context).languageCode == 'bn' ? 'bn' : 'en';

/// `১১ অক্টোবর ২০২৬`; an unparseable or empty value shows a dash.
String govDate(BuildContext context, String? iso) {
  if (iso == null || iso.isEmpty) return '—';
  final date = DateTime.tryParse(iso);
  return date == null ? iso : bnDate(date, locale: govLang(context));
}

String govNumber(BuildContext context, Object value) => bnNumber(value, locale: govLang(context));

/// Shared page frame: header, skeleton while loading, retry on a failed first
/// load, pull-to-refresh once there is data.
class GovPage<C extends ListFormCubit<T>, T> extends StatelessWidget {
  const GovPage({
    super.key,
    required this.title,
    required this.subtitle,
    required this.icon,
    required this.builder,
  });

  final String title;
  final String? subtitle;
  final IconData icon;
  final List<Widget> Function(BuildContext context, T data, ListFormState<T> state) builder;

  @override
  Widget build(BuildContext context) {
    return BlocBuilder<C, ListFormState<T>>(
      builder: (context, state) {
        final cubit = context.read<C>();
        final header = PageHeader(title: title, subtitle: subtitle, icon: icon);
        final data = state.data;
        if (data == null) {
          return PageBody(children: [
            header,
            if (state.loadError != null)
              InlineError(message: apiErrorMessage(AppLocalizations.of(context), state.loadError!), onRetry: cubit.load)
            else
              const SkeletonLoader(lines: 4),
          ]);
        }
        return PageBody(onRefresh: cubit.load, children: [header, ...builder(context, data, state)]);
      },
    );
  }
}

/// Inline error for the last failed form action (plain message, never the server text).
class GovActionError extends StatelessWidget {
  const GovActionError({super.key, required this.error, required this.action});

  final Object? error;
  final GovAction action;

  @override
  Widget build(BuildContext context) {
    final e = error;
    if (e == null) return const SizedBox.shrink();
    return NoticeBanner(tone: NoticeTone.error, message: govErrorMessage(AppLocalizations.of(context), e, action));
  }
}

String? requiredText(BuildContext context, String? value) =>
    (value ?? '').trim().isEmpty ? AppLocalizations.of(context).govFieldRequired : null;

/// Card with a title and padded form children.
class GovCard extends StatelessWidget {
  const GovCard({super.key, required this.title, this.hint, required this.children, this.icon});

  final String title;
  final String? hint;
  final IconData? icon;
  final List<Widget> children;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return AppCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(children: [
            if (icon != null) ...[Icon(icon, color: theme.colorScheme.primary), const SizedBox(width: 8)],
            Expanded(child: Text(title, style: theme.textTheme.titleMedium)),
          ]),
          if (hint != null)
            Padding(
              padding: const EdgeInsets.only(top: 4),
              child: Text(hint!, style: theme.textTheme.bodySmall),
            ),
          const SizedBox(height: 12),
          ...children,
        ],
      ),
    );
  }
}

/// A text field with the shared "required" check.
class GovField extends StatelessWidget {
  const GovField({
    super.key,
    required this.controller,
    required this.label,
    this.required = true,
    this.lines = 1,
    this.keyboardType,
    this.maxLength,
    this.validator,
  });

  final TextEditingController controller;
  final String label;
  final bool required;
  final int lines;
  final TextInputType? keyboardType;
  final int? maxLength;
  final String? Function(String?)? validator;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: TextFormField(
        controller: controller,
        minLines: lines,
        maxLines: lines == 1 ? 1 : lines + 2,
        maxLength: maxLength,
        keyboardType: keyboardType ?? (lines > 1 ? TextInputType.multiline : null),
        decoration: InputDecoration(labelText: label, counterText: ''),
        validator: validator ?? (required ? (v) => requiredText(context, v) : null),
      ),
    );
  }
}

/// Coloured status chip.
class GovBadge extends StatelessWidget {
  const GovBadge(this.tone, this.label, {super.key});

  final GovTone tone;
  final String label;

  @override
  Widget build(BuildContext context) => StatusBadge(
        label: label,
        kind: switch (tone) {
          GovTone.good => StatusKind.approved,
          GovTone.warn => StatusKind.pending,
          GovTone.bad => StatusKind.rejected,
          GovTone.neutral => StatusKind.neutral,
        },
      );
}
