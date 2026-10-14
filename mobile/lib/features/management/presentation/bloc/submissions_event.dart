part of 'submissions_bloc.dart';

// ----- Submissions queue -----

sealed class SubmissionsEvent extends Equatable {
  const SubmissionsEvent();

  @override
  List<Object?> get props => const [];
}

final class SubmissionsLoadRequested extends SubmissionsEvent {
  const SubmissionsLoadRequested();
}

/// Search box (admin_console): name / mobile / member id. Under two
/// characters counts as no search.
final class SubmissionsSearchChanged extends SubmissionsEvent {
  const SubmissionsSearchChanged(this.query);

  final String query;

  @override
  List<Object?> get props => [query];
}

final class SubmissionsFilterChanged extends SubmissionsEvent {
  const SubmissionsFilterChanged(this.filter);

  final SubmissionStatus? filter;

  @override
  List<Object?> get props => [filter];
}
