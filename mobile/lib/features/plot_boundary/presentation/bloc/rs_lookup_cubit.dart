import 'package:equatable/equatable.dart';
import 'package:flutter_bloc/flutter_bloc.dart';

import '../../../../core/di/injector.dart';
import '../../../../core/network/api_client.dart';
import '../../../../core/network/api_exception.dart';
import '../../data/land_data_repository_impl.dart';
import '../../domain/dag_number.dart';
import '../../domain/land_data_repository.dart';
import '../../domain/land_entities.dart';

enum RsLookupStatus { idle, loading, found, notFound, failure }

class RsLookupState extends Equatable {
  const RsLookupState({
    this.status = RsLookupStatus.idle,
    this.query = '',
    this.candidates = const [],
    this.selected,
  });

  final RsLookupStatus status;

  /// The normalised dag number that was looked up.
  final String query;

  /// Every RS plot sharing the number; the member picks one when several.
  final List<LandPlot> candidates;
  final LandPlot? selected;

  bool get isLoading => status == RsLookupStatus.loading;

  @override
  List<Object?> get props => [status, query, candidates, selected];
}

/// Step 1 of the map wizard: finds the RAJUK RS plot(s) behind a dag number
/// (`/land/masterplan/lookup/{n}`, which accepts "RS-4611", "4611" and Bangla
/// digits).
class RsLookupCubit extends Cubit<RsLookupState> {
  RsLookupCubit({LandDataRepository? repository})
      : _injected = repository,
        super(const RsLookupState());

  final LandDataRepository? _injected;

  late final LandDataRepository _repository =
      _injected ?? LandDataRepositoryImpl(apiClient: sl<ApiClient>());

  /// Only the latest lookup may update state.
  int _ticket = 0;

  Future<void> lookup(String raw) async {
    final dag = normalizeDagNo(raw);
    if (dag.isEmpty) return;
    final ticket = ++_ticket;
    emit(RsLookupState(status: RsLookupStatus.loading, query: dag));
    try {
      final result = await _repository.lookup(LandLayer.rajuk, dag);
      if (ticket != _ticket) return;
      if (result.isEmpty) {
        emit(RsLookupState(status: RsLookupStatus.notFound, query: dag));
        return;
      }
      emit(RsLookupState(
        status: RsLookupStatus.found,
        query: dag,
        candidates: result.plots,
        selected: result.plots.length == 1 ? result.plots.first : null,
      ));
    } on ApiException {
      if (ticket != _ticket) return;
      emit(RsLookupState(status: RsLookupStatus.failure, query: dag));
    } on FormatException {
      if (ticket != _ticket) return;
      emit(RsLookupState(status: RsLookupStatus.failure, query: dag));
    }
  }

  void select(int index) {
    if (index < 0 || index >= state.candidates.length) return;
    emit(RsLookupState(
      status: state.status,
      query: state.query,
      candidates: state.candidates,
      selected: state.candidates[index],
    ));
  }

  void reset() {
    _ticket++;
    emit(const RsLookupState());
  }
}
