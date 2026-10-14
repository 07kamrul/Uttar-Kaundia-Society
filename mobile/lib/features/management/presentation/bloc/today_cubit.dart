import 'package:equatable/equatable.dart';
import 'package:flutter_bloc/flutter_bloc.dart';

import '../../data/admin_repository.dart';
import '../../domain/today_entities.dart';

enum TodayStatus { loading, loaded, error }

class TodayState extends Equatable {
  const TodayState({this.status = TodayStatus.loading, this.summary, this.error});

  final TodayStatus status;
  final TodaySummary? summary;
  final Object? error;

  @override
  List<Object?> get props => [status, summary, error];
}

/// "আজকের কাজ": one request, skeleton while it runs, retryable on failure.
class TodayCubit extends Cubit<TodayState> {
  TodayCubit({required AdminRepository repository})
      : _repository = repository,
        super(const TodayState());

  final AdminRepository _repository;

  Future<void> load() async {
    emit(const TodayState());
    try {
      emit(TodayState(status: TodayStatus.loaded, summary: await _repository.today()));
    } catch (e) {
      emit(TodayState(status: TodayStatus.error, error: e));
    }
  }
}
