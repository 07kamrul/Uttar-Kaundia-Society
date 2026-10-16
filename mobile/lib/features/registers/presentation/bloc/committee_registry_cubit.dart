import '../../../governance/presentation/list_form_cubit.dart';
import '../../data/committee_registry_repository.dart';
import '../../domain/committee_registry_entities.dart';

/// Committee registry (Angular committee-registry.component.ts): the 11 posts,
/// every vacancy case, the term form and the resignation / removal / decide
/// actions. Vacancies and the member list fail soft (empty), like Angular.
class CommitteeRegistryCubit extends ListFormCubit<CommitteeData> {
  CommitteeRegistryCubit(this._repository);

  final CommitteeRegistryRepository _repository;
  List<MemberOption>? _members;
  CaseFilter _caseFilter = CaseFilter.all;

  CaseFilter get caseFilter => _caseFilter;

  @override
  Future<CommitteeData> fetch() async {
    // The soft futures never throw, so starting them before the overview is safe.
    final vacancies = _softList(_repository.vacancies);
    final cached = _members;
    final members = cached == null ? _softList(_repository.approvedMembers) : Future.value(cached);
    final overview = await _repository.overview();
    final loadedMembers = await members;
    _members = loadedMembers;
    return CommitteeData(posts: overview.posts, vacancies: await vacancies, members: loadedMembers);
  }

  static Future<List<T>> _softList<T>(Future<List<T>> Function() fetch) async {
    try {
      return await fetch();
    } on Exception {
      return <T>[];
    }
  }

  void setCaseFilter(CaseFilter filter) {
    _caseFilter = filter;
    // Re-emit so listeners rebuild with the new filter.
    emit(state.copyWith());
  }

  /// Shows or hides a post's term history (fetched on first open).
  Future<void> toggleHistory(String postKey) async {
    final data = state.data;
    if (data == null) return;
    if (data.histories.containsKey(postKey)) {
      emit(state.copyWith(data: data.withHistories({...data.histories}..remove(postKey))));
      return;
    }
    try {
      final history = await _repository.postHistory(postKey);
      if (isClosed) return;
      final latest = state.data ?? data;
      emit(state.copyWith(data: latest.withHistories({...latest.histories, postKey: history})));
    } on Exception catch (e) {
      if (!isClosed) emit(state.copyWith(actionError: e));
    }
  }

  /// Updates [editingTermId] when given, else creates a term for [postKey].
  Future<bool> saveTerm({
    required String postKey,
    required int memberId,
    required TermInput input,
    int? editingTermId,
  }) =>
      run(() async {
        if (editingTermId != null) {
          await _repository.updateTerm(editingTermId, input);
        } else {
          await _repository.createTerm(postKey: postKey, memberId: memberId, input: input);
        }
      });

  Future<bool> recordResignation(RegistryPost post) {
    final holder = post.holder;
    if (holder == null) return Future.value(false);
    return run(() => _repository.recordResignation(post.key, holder.id));
  }

  Future<bool> acknowledge(PostVacancy vacancy) => run(() => _repository.acknowledge(vacancy.id));

  Future<bool> issueRemoval(PostVacancy vacancy, String note) {
    final trimmed = note.trim();
    if (trimmed.isEmpty) return Future.value(false);
    return run(() => _repository.issueRemovalNotice(vacancy.id, trimmed));
  }

  /// [decision]: removed | retained.
  Future<bool> decide(PostVacancy vacancy, String decision, String note) {
    final trimmed = note.trim();
    if (trimmed.isEmpty) return Future.value(false);
    return run(() => _repository.decide(vacancy.id, decision, trimmed));
  }
}
