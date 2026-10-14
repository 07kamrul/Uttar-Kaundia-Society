part of 'members_bloc.dart';

// ----- Members list -----

class MembersState extends Equatable {
  const MembersState(
      {this.items = const [],
      this.loading = false,
      this.error,
      this.busyId,
      this.search = ''});

  /// Active search term; empty when none.
  final String search;

  final List<Member> items;
  final bool loading;
  final Object? error;

  /// Member currently being mutated (delete/reset password).
  final String? busyId;

  MembersState copyWith({
    List<Member>? items,
    bool? loading,
    Object? Function() error = _unset,
    String? Function() busyId = _unset,
    String? search,
  }) =>
      MembersState(
        items: items ?? this.items,
        loading: loading ?? this.loading,
        error: error == _unset ? this.error : error(),
        busyId: busyId == _unset ? this.busyId : busyId(),
        search: search ?? this.search,
      );


  @override
  List<Object?> get props => [items, loading, error, busyId, search];
}

/// "Argument not passed" marker for [MembersState.copyWith]. A plain
/// top-level function, so `x == _unset` is reliable (the old generic
/// tear-off never compared equal, which made every default call throw).
Never _unset() => throw UnsupportedError('sentinel');
