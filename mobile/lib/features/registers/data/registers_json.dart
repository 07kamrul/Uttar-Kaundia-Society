import 'package:dio/dio.dart';

import '../../../core/network/api_client.dart';
import '../../../core/network/api_exception.dart';
import '../domain/committee_registry_entities.dart';

/// Lenient JSON readers shared by the registers repositories (same idiom as
/// the governance repository: bad or missing values never throw).
String jsonStr(dynamic v) => v?.toString() ?? '';
String? jsonStrN(dynamic v) => v?.toString();
int jsonInt(dynamic v) => v is num ? v.toInt() : int.tryParse(jsonStr(v)) ?? 0;
int? jsonIntN(dynamic v) => v == null ? null : jsonInt(v);
num jsonNum(dynamic v) => v is num ? v : num.tryParse(jsonStr(v)) ?? 0;
num? jsonNumN(dynamic v) => v == null ? null : jsonNum(v);
Map<dynamic, dynamic> jsonMap(dynamic v) => v is Map ? v : const {};
List<dynamic> jsonList(dynamic v) => v is List ? v : const [];

/// "" -> null, otherwise the trimmed text (Angular `x.trim() || null`).
String? blankToNull(String? v) {
  final t = v?.trim() ?? '';
  return t.isEmpty ? null : t;
}

/// Approved members for the pickers (Angular filters adminService.listMembers()).
Future<List<MemberOption>> fetchApprovedMembers(ApiClient api) async {
  final data = await api.getUri('/admin/members');
  return [
    for (final raw in jsonList(data))
      if (jsonStr(jsonMap(raw)['status']) == 'approved')
        MemberOption(
          id: jsonInt(jsonMap(raw)['id']),
          fullName: jsonStr(jsonMap(raw)['full_name']),
          memberId: jsonStrN(jsonMap(raw)['member_id']),
        ),
  ];
}

/// DELETE with a `{reason}` body (Angular HttpClient.request('DELETE')).
/// [ApiClient.delete] has no body parameter, so this goes through dio and
/// maps failures to [ApiException] like every other call.
Future<void> deleteWithReason(ApiClient api, String path, String reason) async {
  try {
    await api.dio.delete<dynamic>(path, data: {'reason': reason});
  } on DioException catch (e) {
    throw ApiException.fromDio(e);
  }
}
