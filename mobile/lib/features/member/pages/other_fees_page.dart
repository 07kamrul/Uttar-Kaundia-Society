import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';

import '../../../core/di/injector.dart';
import '../../../core/layout/responsive.dart';
import '../../../core/network/api_client.dart';
import '../../../core/network/api_error_messages.dart';
import '../../../l10n/app_localizations.dart';
import '../../../shared/widgets/widgets.dart';
import '../data/other_fees_repository.dart';
import '../presentation/bloc/other_fees_cubit.dart';
import '../presentation/other_fees_strings.dart';
import '../presentation/widgets/member_ui.dart';
import '../presentation/widgets/other_fees_form_cards.dart';
import '../presentation/widgets/other_fees_history.dart';

/// Port of Angular OtherFeesComponent (`/other-fees`): one page for every
/// non-installment fee type, picnic included. [initialType] preselects a type
/// (`/other-fees?type=picnic`, the old Picnic page deep link).
class OtherFeesPage extends StatelessWidget {
  const OtherFeesPage({super.key, this.initialType, this.repository});

  final String? initialType;

  /// Injected in tests; defaults to the app ApiClient.
  final OtherFeesRepository? repository;

  @override
  Widget build(BuildContext context) {
    return BlocProvider(
      create: (_) => OtherFeesCubit(
        repository ?? OtherFeesRepository(apiClient: sl<ApiClient>()),
        initialType: initialType,
      )..start(),
      child: const _OtherFeesView(),
    );
  }
}

class _OtherFeesView extends StatelessWidget {
  const _OtherFeesView();

  @override
  Widget build(BuildContext context) {
    final loc = AppLocalizations.of(context);
    final s = OtherFeesStrings.of(context);
    return BlocConsumer<OtherFeesCubit, OtherFeesState>(
      listenWhen: (a, b) => b.saveError != null && a.saveError != b.saveError,
      listener: (context, state) {
        final err = state.saveError;
        if (err != null) showAppToast(context, apiErrorMessage(loc, err), error: true);
      },
      builder: (context, state) {
        final cubit = context.read<OtherFeesCubit>();
        final type = state.selectedType;
        final total = state.lastSavedTotal;
        return PageBody(
          maxWidth: Breakpoints.formMaxWidth,
          onRefresh: () => reloadAndWait<OtherFeesState>(
            cubit,
            cubit.refresh,
            (st) => !st.typesLoading && !st.historyLoading,
          ),
          children: [
            PageHeader(title: s.title, subtitle: s.subtitle, icon: Icons.receipt_long_outlined),
            if (state.doneCount > 0 && total != null)
              NoticeBanner(
                key: const Key('otherFeesSuccess'),
                tone: NoticeTone.success,
                message: s.saveSuccess(total),
              ),
            OtherFeesTypeCard(state: state, cubit: cubit),
            if (type != null && type.isPicnic)
              OtherFeesHeadsCard(key: const Key('otherFeesHeadsCard'), state: state, cubit: cubit),
            if (type != null) OtherFeesPaymentCard(state: state, cubit: cubit),
            ...otherFeesHistory(context, state, cubit),
          ],
        );
      },
    );
  }
}
