import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:kaundia_app/core/auth/session.dart';
import 'package:kaundia_app/core/di/injector.dart';
import 'package:kaundia_app/core/feature_flags/feature_flags_repository.dart';
import 'package:kaundia_app/core/feature_flags/feature_flags_service.dart';
import 'package:kaundia_app/core/router/guards.dart';

class _Repo implements FeatureFlagsRepository {
  _Repo(this.flags);
  final Map<String, bool> flags;
  @override
  Future<Map<String, bool>> fetch() async => flags;
}

void main() {
  Future<GoRouter> pumpRouter(WidgetTester tester, Map<String, bool> flags, String start) async {
    await sl.reset();
    sl.registerSingleton<SessionManager>(
        SessionManager()..set(const Session(accessToken: 't', role: 'member', permissions: {'profile.view_own'})));
    final service = FeatureFlagsService(_Repo(flags));
    await service.load();
    sl.registerSingleton<FeatureFlagsService>(service);
    addTearDown(sl.reset);
    final router = GoRouter(
      initialLocation: start,
      redirect: appRedirect,
      routes: [
        for (final p in ['/installments', '/cost-shares', '/picnic-payment', '/payments'])
          GoRoute(path: p, builder: (_, s) => Text('page:${s.uri}')),
      ],
    );
    await tester.pumpWidget(MaterialApp.router(routerConfig: router));
    await tester.pumpAndSettle();
    return router;
  }

  testWidgets('flag off: the old routes stay where they are', (tester) async {
    for (final route in ['/installments', '/cost-shares', '/picnic-payment']) {
      final router = await pumpRouter(tester, const {}, route);
      expect(router.routeInformationProvider.value.uri.toString(), route);
    }
  });

  testWidgets('flag on: installments, cost shares and picnic land on /payments', (tester) async {
    const flags = {'pay_merged_page': true};
    var router = await pumpRouter(tester, flags, '/installments');
    expect(router.routeInformationProvider.value.uri.toString(), '/payments?kind=installment');
    router = await pumpRouter(tester, flags, '/cost-shares');
    expect(router.routeInformationProvider.value.uri.toString(), '/payments?kind=cost_share');
    router = await pumpRouter(tester, flags, '/picnic-payment');
    expect(router.routeInformationProvider.value.uri.toString(), '/payments?kind=other_fee&fee=picnic');
  });
}
