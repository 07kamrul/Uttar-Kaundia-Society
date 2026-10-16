import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:open_filex/open_filex.dart';

import '../../../core/di/injector.dart';
import '../../../core/format/bn_format.dart';
import '../../../core/network/api_error_messages.dart';
import '../../../l10n/app_localizations.dart';
import '../../../shared/utils/download_utils.dart';
import '../../../shared/widgets/widgets.dart';
import '../../governance/presentation/list_form_cubit.dart';
import '../presentation/registers_strings.dart';

/// Saves downloaded bytes and opens them; injectable so tests skip the disk.
typedef FileOpener = Future<void> Function(List<int> bytes, String fileName);

Future<void> saveAndOpenFile(List<int> bytes, String fileName) async {
  final file = await saveDownload(bytes, fileName);
  await OpenFilex.open(file.path);
}

/// The signed-in user's permissions (empty when signed out).
Set<String> sessionPermissions() => sl<SessionManager>().session?.permissions ?? const <String>{};

/// `১১ অক্টো ২০২৬`; empty or unparseable values show a dash / the raw text.
String regDate(BuildContext context, String? iso) {
  if (iso == null || iso.isEmpty) return '—';
  final date = DateTime.tryParse(iso);
  return date == null ? iso : bnDate(date, locale: RegistersStrings.of(context).lang, short: true);
}

String regNumber(BuildContext context, Object value) => bnNumber(value, locale: RegistersStrings.of(context).lang);

String regTaka(BuildContext context, num value) => taka(value, locale: RegistersStrings.of(context).lang);

/// Page frame for the register pages: header with actions, skeleton while the
/// first load runs, retry on a failed first load, pull-to-refresh after.
class RegisterPage<C extends ListFormCubit<T>, T> extends StatelessWidget {
  const RegisterPage({
    super.key,
    required this.title,
    required this.subtitle,
    required this.icon,
    required this.loadError,
    required this.builder,
    this.actions = const [],
    this.toolbar = const [],
  });

  final String title;
  final String subtitle;
  final IconData icon;
  final String loadError;
  final List<Widget> actions;

  /// Shown above the data even while loading (filters).
  final List<Widget> toolbar;
  final List<Widget> Function(BuildContext context, T data, ListFormState<T> state) builder;

  @override
  Widget build(BuildContext context) {
    return BlocBuilder<C, ListFormState<T>>(
      builder: (context, state) {
        final cubit = context.read<C>();
        final header = PageHeader(title: title, subtitle: subtitle, icon: icon);
        final actionRow = actions.isEmpty
            ? const SizedBox.shrink()
            : Padding(
                padding: const EdgeInsets.symmetric(horizontal: 16),
                child: Wrap(spacing: 8, runSpacing: 8, children: actions),
              );
        final data = state.data;
        final body = <Widget>[
          if (data == null && state.loadError != null)
            InlineError(message: loadError, onRetry: cubit.load)
          else if (data == null || state.loading)
            const SkeletonLoader(lines: 4)
          else
            ...builder(context, data, state),
        ];
        return PageBody(
          onRefresh: data == null ? null : cubit.load,
          children: [header, actionRow, ...toolbar, ...body],
        );
      },
    );
  }
}

/// Inline error for the last failed action (plain message, never server text).
class RegActionError extends StatelessWidget {
  const RegActionError({super.key, required this.error});

  final Object? error;

  @override
  Widget build(BuildContext context) {
    final e = error;
    if (e == null) return const SizedBox.shrink();
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 6),
      child: Text(
        apiErrorMessage(AppLocalizations.of(context), e),
        style: TextStyle(color: Theme.of(context).colorScheme.error),
      ),
    );
  }
}

/// Read-only field that opens a date picker; holds `yyyy-MM-dd` in [value].
class RegDateField extends StatelessWidget {
  const RegDateField({
    super.key,
    required this.label,
    required this.value,
    required this.onChanged,
    this.isRequired = true,
  });

  final String label;
  final String value;
  final ValueChanged<String> onChanged;
  final bool isRequired;

  Future<void> _pick(BuildContext context) async {
    final initial = DateTime.tryParse(value) ?? DateTime.now();
    final picked = await showDatePicker(
      context: context,
      initialDate: initial,
      firstDate: DateTime(1990),
      lastDate: DateTime(2100),
    );
    if (picked != null) onChanged(isoDay(picked));
  }

  @override
  Widget build(BuildContext context) {
    final strings = RegistersStrings.of(context);
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: FormField<String>(
        initialValue: value,
        validator: (_) => isRequired && value.isEmpty ? strings.required : null,
        builder: (field) => InkWell(
          onTap: () => _pick(context),
          child: InputDecorator(
            decoration: InputDecoration(
              labelText: label,
              errorText: field.errorText,
              suffixIcon: const Icon(Icons.calendar_today_outlined, size: 18),
            ),
            child: Text(value.isEmpty ? '—' : regDate(context, value)),
          ),
        ),
      ),
    );
  }
}

/// Asks for a non-empty reason (Angular window.prompt); null when cancelled.
Future<String?> askReason(BuildContext context, {required String prompt}) async {
  final reason = await showDialog<String>(context: context, builder: (_) => _ReasonDialog(prompt: prompt));
  return reason == null || reason.isEmpty ? null : reason;
}

/// Owns its controller so it is disposed only after the exit animation.
class _ReasonDialog extends StatefulWidget {
  const _ReasonDialog({required this.prompt});

  final String prompt;

  @override
  State<_ReasonDialog> createState() => _ReasonDialogState();
}

class _ReasonDialogState extends State<_ReasonDialog> {
  final _controller = TextEditingController();

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final strings = RegistersStrings.of(context);
    return AlertDialog(
      title: Text(widget.prompt),
      content: TextField(
        key: const Key('reasonField'),
        controller: _controller,
        autofocus: true,
        minLines: 2,
        maxLines: 4,
        decoration: InputDecoration(labelText: strings.reasonLabel),
      ),
      actions: [
        TextButton(onPressed: () => Navigator.of(context).pop(), child: Text(strings.cancel)),
        FilledButton(
          key: const Key('reasonConfirm'),
          onPressed: () => Navigator.of(context).pop(_controller.text.trim()),
          child: Text(strings.confirm),
        ),
      ],
    );
  }
}

/// Yes / no confirmation; true only on yes.
Future<bool> askConfirm(BuildContext context, String message, {bool destructive = false}) async {
  final strings = RegistersStrings.of(context);
  final ok = await showDialog<bool>(
    context: context,
    builder: (ctx) => AlertDialog(
      content: Text(message),
      actions: [
        TextButton(onPressed: () => Navigator.of(ctx).pop(false), child: Text(strings.cancel)),
        FilledButton(
          key: const Key('confirmYes'),
          style: destructive ? FilledButton.styleFrom(backgroundColor: Theme.of(ctx).colorScheme.error) : null,
          onPressed: () => Navigator.of(ctx).pop(true),
          child: Text(strings.confirm),
        ),
      ],
    ),
  );
  return ok ?? false;
}

/// Downloads with [fetch] then hands the bytes to [open]; toasts on failure.
Future<void> downloadWith(
  BuildContext context, {
  required Future<List<int>> Function() fetch,
  required String fileName,
  required FileOpener open,
}) async {
  final failed = RegistersStrings.of(context).loadFailed;
  final messenger = ScaffoldMessenger.maybeOf(context);
  try {
    await open(await fetch(), fileName);
  } on Exception {
    messenger?.showSnackBar(SnackBar(content: Text(failed)));
  }
}
