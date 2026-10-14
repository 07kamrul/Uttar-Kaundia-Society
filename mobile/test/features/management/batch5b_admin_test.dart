import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:kaundia_app/core/enums/enums.dart';
import 'package:kaundia_app/core/feature_flags/feature_flag.dart';
import 'package:kaundia_app/core/navigation/nav_items.dart';
import 'package:kaundia_app/core/network/api_client.dart';
import 'package:kaundia_app/core/network/api_exception.dart';
import 'package:kaundia_app/core/router/guards.dart';
import 'package:kaundia_app/features/management/data/console_repository.dart';
import 'package:kaundia_app/features/management/domain/console_entities.dart';
import 'package:kaundia_app/features/management/pages/applications_page.dart';
import 'package:kaundia_app/features/management/pages/cache_stats_page.dart';
import 'package:kaundia_app/features/management/pages/notices_events_page.dart';
import 'package:kaundia_app/features/management/pages/phone_fixes_page.dart';
import 'package:kaundia_app/l10n/app_localizations_bn.dart';
import 'package:mocktail/mocktail.dart';

import '../../support/pump_app.dart';

class _MockApi extends Mock implements ApiClient {}

class _MockPhone extends Mock implements PhoneFixRepository {}

class _MockCache extends Mock implements CacheStatsRepository {}

class _MockApps extends Mock implements MembershipApplicationRepository {}

const _everything = {
  'membership.review', 'membership_application.manage', 'member.view_all', 'member.manage',
  'manage_finance', 'manage_fee_settings', 'manage_costs', 'manage_system_config',
  'manage_notices', 'manage_roles', 'view_audit_log', 'property.review',
};

void main() {
  final bn = AppLocalizationsBn();

  test('flag keys used by this batch exist', () {
    expect(FeatureFlag.adminConsole.key, 'admin_console');
    expect(FeatureFlag.navAdvancedSection.key, 'nav_advanced_section');
    expect(FeatureFlag.feeWizard.key, 'fee_wizard');
  });

  group('route guards (same permissions as Angular)', () {
    test('applications opens with either intake permission', () {
      expect(requiredPermissionFor('/applications'), ['membership.review', 'membership_application.manage']);
      expect(requiredPermissionFor('/applications?tab=membership'),
          ['membership.review', 'membership_application.manage']);
    });

    test('notices-events, phone-fixes and cache stats', () {
      expect(requiredPermissionFor('/notices-events'), ['manage_notices']);
      expect(requiredPermissionFor('/phone-fixes'), ['member.manage']);
      expect(requiredPermissionFor('/advanced/cache'), ['manage_system_config']);
    });
  });

  group('nav entries', () {
    List<String> flat({bool console = false}) => AppNav.visibleFor(
          landingTier: LandingTier.superAdmin,
          can: _everything.contains,
          adminConsole: console,
        ).map((i) => i.route).toList();

    List<String> grouped({bool console = false}) => [
          for (final g in AppNav.adminGroups(
              landingTier: LandingTier.superAdmin, can: _everything.contains, adminConsole: console))
            for (final i in g.items) i.route,
        ];

    const added = ['/applications', '/notices-events', '/phone-fixes'];

    test('every flag off: the flat menu has none of the new entries', () {
      expect(flat(), predicate<List<String>>((r) => !r.any(added.contains), 'has none of the console pages'));
      expect(flat(), isNot(contains('/advanced/cache')));
      expect(flat(), containsAll(['/submissions', '/notices-management', '/events-management']));
    });

    test('admin_console swaps in the merged pages (flat and grouped)', () {
      for (final routes in [flat(console: true), grouped(console: true)]) {
        expect(routes, containsAll(added));
        expect(routes, isNot(contains('/submissions')));
        expect(routes, isNot(contains('/notices-management')));
        expect(routes, isNot(contains('/events-management')));
      }
    });

    test('grouped menu with admin_console off lists the old pages and no console pages', () {
      final routes = grouped();
      expect(routes, containsAll(['/submissions', '/notices-management', '/events-management']));
      expect(routes, predicate<List<String>>((r) => !r.any(added.contains), 'has none of the console pages'));
    });

    test('cache stats sits in Advanced, once, whatever admin_console says', () {
      for (final console in [false, true]) {
        final groups = AppNav.adminGroups(
            landingTier: LandingTier.superAdmin, can: _everything.contains, adminConsole: console);
        expect(groups.last.advanced, isTrue);
        expect(groups.last.items.map((i) => i.route), contains('/advanced/cache'));
        expect(grouped(console: console).where((r) => r == '/advanced/cache'), hasLength(1));
      }
    });

    test('permissions still filter the new entries', () {
      final routes = [
        for (final g in AppNav.adminGroups(
            landingTier: LandingTier.management, can: {'member.manage'}.contains, adminConsole: true))
          for (final i in g.items) i.route,
      ];
      expect(routes, ['/phone-fixes']);
    });

    test('with admin_console on no route appears twice', () {
      expect(grouped(console: true).toSet().length, grouped(console: true).length);
      expect(flat(console: true).toSet().length, flat(console: true).length);
    });
  });

  group('repositories', () {
    late _MockApi api;
    setUp(() => api = _MockApi());

    test('phone fixes: list maps rows, resolve PUTs the mobile', () async {
      when(() => api.getUri('/admin/phone-fixes')).thenAnswer((_) async => [
            {
              'id': 3,
              'entity_type': 'member',
              'field': 'mobile',
              'raw_value': '১৭১২',
              'member_code': 'M-3',
              'member_name': 'রহিম',
            }
          ]);
      when(() => api.put('/admin/phone-fixes/3', any())).thenAnswer((_) async => {});
      final repo = PhoneFixRepository(apiClient: api);
      final rows = await repo.list();
      expect(rows.single.rawValue, '১৭১২');
      expect(rows.single.memberName, 'রহিম');
      await repo.resolve(3, '+8801712345678');
      verify(() => api.put('/admin/phone-fixes/3', {'mobile': '+8801712345678'})).called(1);
    });

    test('cache stats maps maxsize / ttl_seconds / hit_ratio', () async {
      when(() => api.getUri('/admin/cache/stats')).thenAnswer((_) async => {
            'enabled': true,
            'caches': [
              {'name': 'config', 'size': 3, 'maxsize': 100, 'ttl_seconds': 60, 'hit_ratio': 0.5, 'invalidations': 2}
            ],
          });
      final stats = await CacheStatsRepository(apiClient: api).stats();
      expect(stats.enabled, isTrue);
      expect(stats.caches.single.maxSize, 100);
      expect(stats.caches.single.ttlSeconds, 60);
      expect(stats.caches.single.hitRatio, 0.5);
    });

    test('membership applications: filter + search params and actions', () async {
      when(() => api.getUri('/admin/membership-applications', query: any(named: 'query')))
          .thenAnswer((_) async => [
                {
                  'id': 5,
                  'application_no': 'A-5',
                  'full_name': 'করিম',
                  'mobile': '01712345678',
                  'status': 'received',
                  'submitted_at': '2026-10-01T00:00:00Z',
                  'sla': {'state': 'due_soon', 'days_remaining': 2},
                }
              ]);
      when(() => api.post(any(), any())).thenAnswer((_) async => {});
      final repo = MembershipApplicationRepository(apiClient: api);
      final rows = await repo.list(status: 'received', search: 'করিম');
      verify(() => api.getUri('/admin/membership-applications',
          query: {'status_filter': 'received', 'search': 'করিম'})).called(1);
      expect(rows.single.applicationNo, 'A-5');
      expect(rows.single.slaState, 'due_soon');
      await repo.startReview(5);
      await repo.approve(5);
      await repo.reject(5, 'কাগজ অস্পষ্ট');
      verify(() => api.post('/admin/membership-applications/5/start-review', {})).called(1);
      verify(() => api.post('/admin/membership-applications/5/approve', {'member_class': 'general'})).called(1);
      verify(() => api.post('/admin/membership-applications/5/reject', {'reason': 'কাগজ অস্পষ্ট'})).called(1);
    });
  });

  group('ApplicationsPage', () {
    Widget reg() => const Text('REG');
    Widget mem() => const Text('MEM');

    testWidgets('both tabs with both permissions; registrations first', (tester) async {
      await pumpBn(
          tester,
          ApplicationsPage(
              can: _everything.contains, registrationsBuilder: (_) => reg(), membershipBuilder: (_) => mem()));
      expect(find.text(bn.adminApplicationsTabRegistrations), findsOneWidget);
      expect(find.text(bn.adminApplicationsTabMembership), findsOneWidget);
      expect(find.text('REG'), findsOneWidget);
      await tester.tap(find.text(bn.adminApplicationsTabMembership));
      await tester.pumpAndSettle();
      expect(find.text('MEM'), findsOneWidget);
    });

    testWidgets('a tab is hidden without its permission', (tester) async {
      await pumpBn(
          tester,
          ApplicationsPage(
              can: {'membership_application.manage'}.contains,
              registrationsBuilder: (_) => reg(),
              membershipBuilder: (_) => mem()));
      expect(find.text(bn.adminApplicationsTabRegistrations), findsNothing);
      expect(find.text('MEM'), findsOneWidget);
    });

    testWidgets('the ?tab= value picks the tab when allowed', (tester) async {
      await pumpBn(
          tester,
          ApplicationsPage(
              can: _everything.contains,
              initialTab: 'membership',
              registrationsBuilder: (_) => reg(),
              membershipBuilder: (_) => mem()));
      expect(find.text('MEM'), findsOneWidget);
      expect(find.text('REG'), findsNothing);
    });
  });

  group('MembershipApplicationsView', () {
    late _MockApps repo;
    MembershipApplication app(int id, String status) => MembershipApplication(
        id: id,
        applicationNo: 'A-$id',
        fullName: 'আবেদনকারী $id',
        mobile: '01712345678',
        status: status,
        submittedAt: '2026-10-01',
        slaState: 'ok',
        slaDaysRemaining: 5,
        rejectionReason: null);

    setUp(() {
      repo = _MockApps();
      when(() => repo.list(status: any(named: 'status'), search: any(named: 'search')))
          .thenAnswer((_) async => [app(1, 'received'), app(2, 'under_review')]);
      when(() => repo.startReview(any())).thenAnswer((_) async {});
      when(() => repo.approve(any())).thenAnswer((_) async {});
    });

    testWidgets('lists applications and offers the right action per status', (tester) async {
      await pumpBn(tester, MembershipApplicationsView(repository: repo, searchEnabled: false));
      expect(find.text('আবেদনকারী 1'), findsOneWidget);
      expect(find.byKey(const Key('maStart_1')), findsOneWidget);
      expect(find.byKey(const Key('maApprove_2')), findsOneWidget);
      expect(find.byKey(const Key('maApprove_1')), findsNothing);
    });

    testWidgets('start review and approve call the repository then reload', (tester) async {
      await pumpBn(tester, MembershipApplicationsView(repository: repo, searchEnabled: false));
      await tester.tap(find.byKey(const Key('maStart_1')));
      await tester.pumpAndSettle();
      verify(() => repo.startReview(1)).called(1);
      await tester.tap(find.byKey(const Key('maApprove_2')));
      await tester.pumpAndSettle();
      verify(() => repo.approve(2)).called(1);
      verify(() => repo.list(status: any(named: 'status'), search: any(named: 'search'))).called(greaterThan(2));
    });

    testWidgets('a failed load shows plain Bangla, never the server text', (tester) async {
      when(() => repo.list(status: any(named: 'status'), search: any(named: 'search')))
          .thenThrow(const ApiException(type: ApiExceptionType.server, message: 'SERVER SECRET'));
      await pumpBn(tester, MembershipApplicationsView(repository: repo, searchEnabled: false));
      expect(find.text(bn.maLoadError), findsOneWidget);
      expect(find.textContaining('SERVER SECRET'), findsNothing);
    });
  });

  group('NoticesEventsPage', () {
    testWidgets('hosts notices then events as tabs', (tester) async {
      await pumpBn(
          tester,
          NoticesEventsPage(
              noticesBuilder: (_) => const Text('NOTICES'), eventsBuilder: (_) => const Text('EVENTS')));
      expect(find.text('NOTICES'), findsOneWidget);
      await tester.tap(find.text(bn.noticesEventsTabEvents));
      await tester.pumpAndSettle();
      expect(find.text('EVENTS'), findsOneWidget);
      expect(find.text('NOTICES'), findsNothing);
    });

    testWidgets('?tab=events opens events', (tester) async {
      await pumpBn(
          tester,
          NoticesEventsPage(
              initialTab: 'events',
              noticesBuilder: (_) => const Text('NOTICES'),
              eventsBuilder: (_) => const Text('EVENTS')));
      expect(find.text('EVENTS'), findsOneWidget);
    });
  });

  group('PhoneFixesPage', () {
    late _MockPhone repo;
    const fix = PhoneFix(
        id: 3,
        entityType: 'member',
        field: 'urgent_contact_mobile',
        rawValue: '১৭১২-৩৪',
        memberCode: 'M-3',
        memberName: 'রহিম');

    setUp(() {
      repo = _MockPhone();
      when(() => repo.list()).thenAnswer((_) async => [fix]);
      when(() => repo.resolve(any(), any())).thenAnswer((_) async {});
    });

    final numberField = find.descendant(of: find.byKey(const Key('phoneFix_3')), matching: find.byType(TextField));

    testWidgets('shows who, the Bangla field label and the raw value', (tester) async {
      await pumpBn(tester, PhoneFixesPage(repository: repo));
      expect(find.text(bn.phoneFixesTitle), findsOneWidget);
      expect(find.textContaining('রহিম'), findsOneWidget);
      expect(find.text(bn.phoneFixFieldMemberUrgent), findsOneWidget);
      expect(find.textContaining('১৭১২-৩৪'), findsOneWidget);
    });

    testWidgets('save stays disabled until the number is valid, then PUTs it and drops the row', (tester) async {
      await pumpBn(tester, PhoneFixesPage(repository: repo));
      FilledButton save() => tester.widget<FilledButton>(find.descendant(
          of: find.byKey(const Key('phoneFixSave_3')), matching: find.byType(FilledButton)));
      expect(save().onPressed, isNull);

      await tester.enterText(numberField.last, '01712345678');
      await tester.pumpAndSettle();
      expect(save().onPressed, isNotNull);
      await tester.tap(find.byKey(const Key('phoneFixSave_3')));
      await tester.pumpAndSettle();

      verify(() => repo.resolve(3, '+8801712345678')).called(1);
      expect(find.byKey(const Key('phoneFix_3')), findsNothing);
      expect(find.text(bn.phoneFixesEmpty), findsOneWidget);
    });

    testWidgets('PHONE_DUPLICATE shows the mapped Bangla line, not the server text', (tester) async {
      when(() => repo.resolve(any(), any())).thenThrow(const ApiException(
          type: ApiExceptionType.business, statusCode: 409, errorCode: 'PHONE_DUPLICATE', message: 'dup raw'));
      await pumpBn(tester, PhoneFixesPage(repository: repo));
      await tester.enterText(numberField.last, '01712345678');
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const Key('phoneFixSave_3')));
      await tester.pumpAndSettle();
      expect(find.text(bn.apiErrorPhoneDuplicate), findsOneWidget);
      expect(find.textContaining('dup raw'), findsNothing);
      expect(find.byKey(const Key('phoneFix_3')), findsOneWidget, reason: 'row stays for another try');
    });

    testWidgets('empty list shows the calm message', (tester) async {
      when(() => repo.list()).thenAnswer((_) async => []);
      await pumpBn(tester, PhoneFixesPage(repository: repo));
      expect(find.text(bn.phoneFixesEmpty), findsOneWidget);
    });

    testWidgets('load failure offers a retry', (tester) async {
      var calls = 0;
      when(() => repo.list()).thenAnswer((_) async {
        if (++calls == 1) throw const ApiException(type: ApiExceptionType.network);
        return [fix];
      });
      await pumpBn(tester, PhoneFixesPage(repository: repo));
      expect(find.text(bn.phoneFixesLoadError), findsOneWidget);
      await tester.tap(find.text(bn.commonRetry));
      await tester.pumpAndSettle();
      expect(find.byKey(const Key('phoneFix_3')), findsOneWidget);
    });
  });

  group('CacheStatsPage', () {
    late _MockCache repo;
    setUp(() {
      repo = _MockCache();
      when(() => repo.stats()).thenAnswer((_) async => const CacheStats(enabled: true, caches: [
            CacheStat(name: 'config_lists', size: 3, maxSize: 100, ttlSeconds: 60, hitRatio: 0.5, invalidations: 2),
          ]));
    });

    testWidgets('read-only table with Bangla numbers and no flush control', (tester) async {
      await pumpBn(tester, CacheStatsPage(repository: repo));
      expect(find.text(bn.cacheStatsOn), findsOneWidget);
      expect(find.text('config_lists'), findsOneWidget);
      expect(find.textContaining('৩ / ১০০'), findsOneWidget);
      expect(find.textContaining('৫০%'), findsOneWidget);
      // The only button is "refresh".
      expect(find.byType(FilledButton), findsNothing);
      expect(find.byKey(const Key('cacheRefresh')), findsOneWidget);
      expect(find.byKey(const Key('cacheFlush')), findsNothing);
      expect(find.textContaining('Flush'), findsNothing);
    });

    testWidgets('refresh loads again; a failure shows plain text', (tester) async {
      await pumpBn(tester, CacheStatsPage(repository: repo));
      await tester.tap(find.byKey(const Key('cacheRefresh')));
      await tester.pumpAndSettle();
      verify(() => repo.stats()).called(2);

      when(() => repo.stats()).thenThrow(const ApiException(type: ApiExceptionType.server, message: 'RAW'));
      await tester.tap(find.byKey(const Key('cacheRefresh')));
      await tester.pumpAndSettle();
      expect(find.text(bn.cacheStatsLoadError), findsOneWidget);
      expect(find.textContaining('RAW'), findsNothing);
    });
  });
}
