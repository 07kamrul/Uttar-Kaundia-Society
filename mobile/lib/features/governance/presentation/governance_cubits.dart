import '../data/governance_repository.dart';
import '../domain/governance_entities.dart';
import 'list_form_cubit.dart';

Future<T?> _optional<T>(Future<T> Function() load) async {
  try {
    return await load();
  } catch (_) {
    return null;
  }
}

/// Complaints list + new-complaint form. The form constants are optional: if
/// they fail to load the list still shows.
class ComplaintsCubit extends ListFormCubit<ComplaintsData> {
  ComplaintsCubit(this._repo);

  final GovernanceRepository _repo;

  @override
  Future<ComplaintsData> fetch() async {
    final complaints = await _repo.myComplaints();
    final constants = await _optional(_repo.complaintConstants);
    return ComplaintsData(complaints: complaints, constants: constants);
  }

  Future<bool> create({required String category, required String subject, required String details}) =>
      run(() => _repo.createComplaint(category: category, subject: subject, details: details));
}

/// Emergency help and the land-protection form both read the complaint constants.
class ComplaintConstantsCubit extends ListFormCubit<ComplaintConstants> {
  ComplaintConstantsCubit(this._repo);

  final GovernanceRepository _repo;

  @override
  Future<ComplaintConstants> fetch() => _repo.complaintConstants();

  Future<bool> submitLand(Map<String, dynamic> form, {String? evidencePath, String? evidenceName}) => run(
        () => _repo.submitLandComplaint(form, evidencePath: evidencePath, evidenceName: evidenceName),
        reload: false,
      );
}

class ServiceStandardCubit extends ListFormCubit<ServiceStandardData> {
  ServiceStandardCubit(this._repo);

  final GovernanceRepository _repo;

  @override
  Future<ServiceStandardData> fetch() => _repo.serviceStandard();
}

/// Elections the member can see, the selected one in detail, and the posts.
class ElectionsCubit extends ListFormCubit<ElectionsData> {
  ElectionsCubit(this._repo);

  final GovernanceRepository _repo;
  int? _selectedId;

  @override
  Future<ElectionsData> fetch() async {
    final elections = await _repo.listElections();
    final posts = (await _optional(_repo.governanceConstants))?.councilPosts ?? const <CouncilPost>[];
    if (elections.isEmpty) return ElectionsData(elections: elections, selected: null, posts: posts);
    final id = elections.any((e) => e.id == _selectedId) ? _selectedId! : elections.first.id;
    _selectedId = id;
    return ElectionsData(elections: elections, selected: await _repo.myElection(id), posts: posts);
  }

  Future<void> select(int id) {
    _selectedId = id;
    return load();
  }

  Future<bool> nominate(String postKey, String statement) =>
      run(() => _repo.nominateSelf(_selectedId!, postKey, statement.trim()));

  Future<bool> vote(String postKey, int nominationId) =>
      run(() => _repo.castVote(_selectedId!, postKey, nominationId));
}

class PetitionsCubit extends ListFormCubit<PetitionsData> {
  PetitionsCubit(this._repo);

  final GovernanceRepository _repo;

  @override
  Future<PetitionsData> fetch() async {
    final mine = await _repo.myPetitions();
    final days = (await _optional(_repo.governanceConstants))?.petitionResponseDays;
    return PetitionsData(mine: mine, signed: state.data?.signed ?? const [], responseDays: days);
  }

  Future<bool> create({required String title, required String justification}) =>
      run(() => _repo.createPetition(title: title, justification: justification));

  /// Signs by id; the petition then shows under "signed" with its progress.
  Future<bool> sign(int id) async {
    Petition? signed;
    final ok = await run(() async => signed = await _repo.signPetition(id), reload: false);
    final data = state.data;
    if (ok && signed != null && data != null && !isClosed) emit(state.copyWith(data: data.withSigned(signed!)));
    return ok;
  }
}

class WelfareCubit extends ListFormCubit<List<WelfareRequest>> {
  WelfareCubit(this._repo);

  final GovernanceRepository _repo;

  @override
  Future<List<WelfareRequest>> fetch() => _repo.myWelfareRequests();

  Future<bool> apply({required String requestType, required num amount, required String reason}) =>
      run(() => _repo.applyWelfare(requestType: requestType, amount: amount, reason: reason));
}

class AmendmentsCubit extends ListFormCubit<AmendmentsData> {
  AmendmentsCubit(this._repo);

  final GovernanceRepository _repo;

  @override
  Future<AmendmentsData> fetch() async {
    final proposals = await _repo.myProposals();
    final versions = await _optional(_repo.amendmentVersions) ?? const <ConstitutionVersion>[];
    return AmendmentsData(proposals: proposals, versions: versions);
  }

  Future<bool> propose({
    required String title,
    required String rationale,
    required String proposedText,
    required bool isDissolution,
  }) =>
      run(() => _repo.createProposal(
            title: title,
            rationale: rationale,
            proposedText: proposedText,
            isDissolution: isDissolution,
          ));

  Future<bool> withdraw(int id) => run(() => _repo.withdrawProposal(id));
}
