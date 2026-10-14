import '../di/injector.dart';
import '../feature_flags/feature_flag.dart';
import '../feature_flags/feature_flag_builder.dart';
import '../storage/app_preferences.dart';

/// Data saver is on only when the server flag is on and the member switched
/// it on (Profile > প্রদর্শন). Off when nothing is registered.
bool dataSaverActive() =>
    flagEnabled(FeatureFlag.dataSaver) &&
    sl.isRegistered<AppPreferences>() &&
    sl<AppPreferences>().dataSaver;
