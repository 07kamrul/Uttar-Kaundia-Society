import 'package:flutter/foundation.dart';

import '../storage/app_preferences.dart';

/// The member's two display switches (text size, data saver), observable so
/// the app rebuilds the moment one changes. Whether they take effect is
/// decided by the ui_a11y_v2 / data_saver flags where they are read.
class DisplayPrefs extends ChangeNotifier {
  DisplayPrefs(this._prefs)
      : _textScale = _prefs.textScale,
        _dataSaver = _prefs.dataSaver;

  final AppPreferences _prefs;
  double _textScale;
  bool _dataSaver;

  double get textScale => _textScale;
  bool get textLarge => _textScale > AppPreferences.textScaleNormal;
  bool get dataSaver => _dataSaver;

  Future<void> setTextLarge(bool on) async {
    _textScale = on ? AppPreferences.textScaleLarge : AppPreferences.textScaleNormal;
    notifyListeners();
    await _prefs.setTextScale(_textScale);
  }

  Future<void> setDataSaver(bool on) async {
    _dataSaver = on;
    notifyListeners();
    await _prefs.setDataSaver(on);
  }
}
