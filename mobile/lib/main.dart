import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import 'app.dart';
import 'core/auth/auth_repository.dart';
import 'core/config/app_config.dart';
import 'core/di/injector.dart';
import 'core/feature_flags/feature_flags_service.dart';

Future<void> main() async {
  if (kReleaseMode) AppConfig.assertReleaseSafe();
  WidgetsFlutterBinding.ensureInitialized();
  await SystemChrome.setPreferredOrientations([DeviceOrientation.portraitUp]);
  await configureDependencies();
  // Fire-and-forget: flags default to false and never block startup.
  unawaited(sl<FeatureFlagsService>().load());
  // Rebuild the session from stored tokens before the router's first redirect.
  final restored = await sl<AuthRepository>().restoreSession();
  if (restored != null) sl<SessionManager>().set(restored);
  runApp(const KaundiaApp());
}
