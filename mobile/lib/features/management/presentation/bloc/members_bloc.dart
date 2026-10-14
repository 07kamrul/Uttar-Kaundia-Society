import 'dart:async';

import 'package:equatable/equatable.dart';
import 'package:flutter_bloc/flutter_bloc.dart';

import '../../data/admin_repository.dart';
import '../../domain/admin_entities.dart';
import 'submissions_bloc.dart' show normalizeSearch;

part 'members_event.dart';
part 'members_state.dart';

class MembersBloc extends Bloc<MembersEvent, MembersState> {
  MembersBloc({required AdminRepository repository})
      : _repository = repository,
        super(const MembersState()) {
    on<MembersLoadRequested>(_onLoad);
    on<MembersSearchChanged>((e, emit) async {
      final q = normalizeSearch(e.query);
      if (q == state.search) return;
      emit(state.copyWith(search: q));
      await _onLoad(const MembersLoadRequested(), emit);
    });
    on<MemberDeleted>(_onDelete);
    on<MemberPasswordResetRequested>(_onResetPassword);
  }

  final AdminRepository _repository;

  Future<void> _onLoad(
    MembersLoadRequested e,
    Emitter<MembersState> emit,
  ) async {
    emit(state.copyWith(loading: true, error: () => null));
    try {
      final items = await _repository.listMembers(
          search: state.search.isEmpty ? null : state.search);
      emit(state.copyWith(items: items, loading: false));
    } catch (err) {
      emit(state.copyWith(loading: false, error: () => err));
    }
  }

  Future<void> _onDelete(
    MemberDeleted e,
    Emitter<MembersState> emit,
  ) async {
    emit(state.copyWith(busyId: () => e.memberId, error: () => null));
    try {
      await _repository.deleteMember(e.memberId);
      emit(state.copyWith(
        busyId: () => null,
        items: state.items
            .where((m) => m.id != e.memberId)
            .toList(growable: false),
      ));
      e.completer?.complete(true);
    } catch (err) {
      emit(state.copyWith(busyId: () => null, error: () => err));
      e.completer?.complete(false);
    }
  }

  Future<void> _onResetPassword(
    MemberPasswordResetRequested e,
    Emitter<MembersState> emit,
  ) async {
    emit(state.copyWith(busyId: () => e.memberId, error: () => null));
    try {
      final tempPassword = await _repository.resetMemberPassword(e.memberId);
      emit(state.copyWith(busyId: () => null));
      e.completer?.complete(tempPassword);
    } catch (err) {
      emit(state.copyWith(busyId: () => null, error: () => err));
      e.completer?.completeError(err);
    }
  }
}
