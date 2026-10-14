import 'package:kaundia_app/core/di/injector.dart';
import 'package:kaundia_app/core/feature_flags/feature_flags_repository.dart';
import 'package:kaundia_app/core/feature_flags/feature_flags_service.dart';

class _FakeFlagsRepo implements FeatureFlagsRepository {
  _FakeFlagsRepo(this.flags);
  final Map<String, bool> flags;
  @override
  Future<Map<String, bool>> fetch() async => flags;
}

/// Registers a flags service in DI with exactly [flags] on; call
/// `addTearDown(sl.reset)` is done here. Pass `{}` for every flag off.
Future<void> useFlags(Map<String, bool> flags) async {
  await sl.reset();
  final service = FeatureFlagsService(_FakeFlagsRepo(flags));
  await service.load();
  sl.registerSingleton<FeatureFlagsService>(service);
}
