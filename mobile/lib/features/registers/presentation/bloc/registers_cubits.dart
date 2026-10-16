import '../../../governance/presentation/list_form_cubit.dart';
import '../../data/registers_repository.dart';
import '../../domain/registers_entities.dart';

/// Asset register (Angular asset-register.component.ts): search + "show
/// removed" filter, create / edit / deactivate, register PDF.
class AssetRegisterCubit extends ListFormCubit<List<SocietyAsset>> {
  AssetRegisterCubit(this._repository);

  final RegistersRepository _repository;
  AssetFilter _filter = const AssetFilter();

  AssetFilter get filter => _filter;

  @override
  Future<List<SocietyAsset>> fetch() => _repository.assets(_filter);

  Future<void> setFilter({String? search, bool? includeInactive}) {
    _filter = AssetFilter(
      search: search ?? _filter.search,
      includeInactive: includeInactive ?? _filter.includeInactive,
    );
    return load();
  }

  /// Creates when [editing] is null, else updates that asset.
  Future<bool> save(AssetInput input, {SocietyAsset? editing}) => run(() async {
        if (editing == null) {
          await _repository.createAsset(input);
        } else {
          await _repository.updateAsset(editing.id, input);
        }
      });

  Future<bool> deactivate(SocietyAsset asset, String reason) {
    final trimmed = reason.trim();
    if (trimmed.isEmpty) return Future.value(false);
    return run(() => _repository.deactivateAsset(asset.id, trimmed));
  }

  Future<List<int>> registerPdf() => _repository.assetRegisterPdf();
}

/// Welfare-activity register (Angular welfare-activities.component.ts): type
/// filter, create / edit / delete, list PDF.
class WelfareActivitiesCubit extends ListFormCubit<List<WelfareActivity>> {
  WelfareActivitiesCubit(this._repository);

  final RegistersRepository _repository;
  String _type = '';

  /// '' means every type.
  String get typeFilter => _type;

  @override
  Future<List<WelfareActivity>> fetch() => _repository.activities(type: _type.isEmpty ? null : _type);

  Future<void> setType(String type) {
    _type = type;
    return load();
  }

  Future<bool> save(ActivityInput input, {WelfareActivity? editing}) => run(() async {
        if (editing == null) {
          await _repository.createActivity(input);
        } else {
          await _repository.updateActivity(editing.id, input);
        }
      });

  Future<bool> delete(WelfareActivity activity) => run(() => _repository.deleteActivity(activity.id));

  Future<List<int>> listPdf() => _repository.activitiesPdf();
}
