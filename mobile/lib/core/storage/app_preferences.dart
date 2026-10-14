import 'package:shared_preferences/shared_preferences.dart';

/// Persisted app preferences: theme mode + language (krmf_theme / krmf_lang
/// equivalents) and the registration draft.
class AppPreferences {
  AppPreferences(this._prefs);

  final SharedPreferences _prefs;

  static const _themeKey = 'app_theme_mode'; // system|light|dark
  static const _langKey = 'krmf_lang'; // bn (default) | en
  static const _draftKey = 'ukams_registration_draft';
  static const _mapTourKey = 'krmf_map_tour_v1';
  static const _textSizeKey = 'krmf_text_size';
  static const _dataSaverKey = 'krmf_data_saver';

  /// "লেখা বড় করুন" (ui_a11y_v2): the two supported factors.
  static const double textScaleNormal = 1.0;
  static const double textScaleLarge = 1.15;

  String get themeMode {
    final v = _prefs.getString(_themeKey);
    final normalized = (v == 'light' || v == 'dark') ? v : null;
    return normalized ?? 'system';
  }

  Future<void> setThemeMode(String mode) => _prefs.setString(_themeKey, mode);

  String get language => _prefs.getString(_langKey) ?? 'bn';

  Future<void> setLanguage(String code) => _prefs.setString(_langKey, code);

  String? get registrationDraft {
    final v = _prefs.getString(_draftKey);
    return (v == null || v.isEmpty) ? null : v;
  }

  Future<void> setRegistrationDraft(String json) => _prefs.setString(_draftKey, json);

  Future<void> clearRegistrationDraft() => _prefs.remove(_draftKey);

  /// The first-time tour of the plot map (map_wizard) was seen or skipped.
  bool get mapTourDone => _prefs.getBool(_mapTourKey) ?? false;

  Future<void> setMapTourDone(bool done) => _prefs.setBool(_mapTourKey, done);

  /// Text size factor (1.0 or 1.15); anything else reads as 1.0.
  double get textScale {
    final v = _prefs.getDouble(_textSizeKey);
    return v == textScaleLarge ? textScaleLarge : textScaleNormal;
  }

  Future<void> setTextScale(double scale) => _prefs.setDouble(
      _textSizeKey, scale == textScaleLarge ? textScaleLarge : textScaleNormal);

  /// "ডেটা সাশ্রয়" (data_saver): the member's own switch.
  bool get dataSaver => _prefs.getBool(_dataSaverKey) ?? false;

  Future<void> setDataSaver(bool on) => _prefs.setBool(_dataSaverKey, on);
}
