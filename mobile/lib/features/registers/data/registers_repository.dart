import '../../../core/network/api_client.dart';
import '../domain/registers_entities.dart';
import 'registers_json.dart';

/// Asset register and welfare-activity register (Module 7).
/// Mirrors Angular registers.service.ts.
class RegistersRepository {
  RegistersRepository({required ApiClient apiClient}) : _api = apiClient;

  final ApiClient _api;
  static const _assets = '/admin/assets';
  static const _activities = '/admin/welfare-activities';

  Future<List<SocietyAsset>> assets(AssetFilter filter) async {
    final search = blankToNull(filter.search);
    final data = await _api.getUri(_assets, query: {
      if (filter.includeInactive) 'include_inactive': 'true',
      if (search != null) 'search': search,
    });
    return [for (final r in jsonList(data)) _asset(jsonMap(r))];
  }

  Future<SocietyAsset> createAsset(AssetInput input) async =>
      _asset(jsonMap(await _api.post(_assets, input.toJson())));

  Future<SocietyAsset> updateAsset(int id, AssetInput input) async =>
      _asset(jsonMap(await _api.patch('$_assets/$id', input.toJson())));

  Future<void> deactivateAsset(int id, String reason) => deleteWithReason(_api, '$_assets/$id', reason);

  Future<List<int>> assetRegisterPdf() => _api.downloadBytes('$_assets/register.pdf');

  Future<List<WelfareActivity>> activities({String? type}) async {
    final data = await _api.getUri(_activities, query: {if (type != null && type.isNotEmpty) 'activity_type': type});
    return [for (final r in jsonList(data)) _activity(jsonMap(r))];
  }

  Future<WelfareActivity> createActivity(ActivityInput input) async =>
      _activity(jsonMap(await _api.post(_activities, input.toJson())));

  Future<WelfareActivity> updateActivity(int id, ActivityInput input) async =>
      _activity(jsonMap(await _api.patch('$_activities/$id', input.toJson())));

  Future<void> deleteActivity(int id) async {
    await _api.delete('$_activities/$id');
  }

  Future<List<int>> activitiesPdf() => _api.downloadBytes('$_activities/list.pdf');

  static SocietyAsset _asset(Map<dynamic, dynamic> m) => SocietyAsset(
        id: jsonInt(m['id']),
        assetCode: jsonStr(m['asset_code']),
        name: jsonStr(m['name']),
        description: jsonStrN(m['description']),
        category: jsonStr(m['category']),
        acquisitionDate: jsonStr(m['acquisition_date']),
        value: jsonNum(m['value']),
        condition: jsonStr(m['condition']),
        location: jsonStrN(m['location']),
        notes: jsonStrN(m['notes']),
        isActive: m['is_active'] == true,
      );

  static WelfareActivity _activity(Map<dynamic, dynamic> m) => WelfareActivity(
        id: jsonInt(m['id']),
        activityDate: jsonStr(m['activity_date']),
        title: jsonStr(m['title']),
        activityType: jsonStr(m['activity_type']),
        participantsCount: jsonInt(m['participants_count']),
        participantNotes: jsonStrN(m['participant_notes']),
        outcome: jsonStrN(m['outcome']),
        organizer: jsonStrN(m['organizer']),
        notes: jsonStrN(m['notes']),
      );
}
