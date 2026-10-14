part of 'submissions_bloc.dart';

class SubmissionsState extends Equatable {
  const SubmissionsState({
    this.filter,
    this.items = const [],
    this.loading = false,
    this.error,
    this.search = '',
  });

  final SubmissionStatus? filter;

  /// Active search term; empty when none (or under two characters).
  final String search;
  final List<SubmissionSummary> items;
  final bool loading;
  final Object? error;

  SubmissionsState copyWith({
    SubmissionStatus? Function()? filter,
    List<SubmissionSummary>? items,
    bool? loading,
    Object? Function()? error,
    String? search,
  }) =>
      SubmissionsState(
        filter: filter == null ? this.filter : filter(),
        items: items ?? this.items,
        loading: loading ?? this.loading,
        error: error == null ? this.error : error(),
        search: search ?? this.search,
      );

  @override
  List<Object?> get props => [filter, items, loading, error, search];
}

final class SubmissionsData extends SubmissionsState {
  const SubmissionsData(
      {super.filter, super.items, super.loading, super.error, super.search});
}
