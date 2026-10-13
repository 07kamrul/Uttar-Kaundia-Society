import 'package:flutter_test/flutter_test.dart';
import 'package:kaundia_app/core/feature_flags/feature_flag.dart';
import 'package:kaundia_app/core/feature_flags/feature_flags_repository.dart';
import 'package:kaundia_app/core/feature_flags/feature_flags_service.dart';
import 'package:kaundia_app/core/network/api_client.dart';
import 'package:kaundia_app/core/network/api_exception.dart';
import 'package:mocktail/mocktail.dart';

class MockApiClient extends Mock implements ApiClient {}

class FakeRepo implements FeatureFlagsRepository {
  FakeRepo(this._responses);
  final List<Object> _responses; // Map<String,bool> or Exception
  int calls = 0;

  @override
  Future<Map<String, bool>> fetch() async {
    final r = _responses[calls < _responses.length ? calls : _responses.length - 1];
    calls++;
    if (r is Exception) throw r;
    return r as Map<String, bool>;
  }
}

void main() {
  group('FeatureFlag enum', () {
    test('exposes the agreed server keys', () {
      expect(
        FeatureFlag.values.map((f) => f.key).toSet(),
        {
          'reg_occupation_optional',
          'reg_hide_nationality',
          'reg_road_optional',
          'reg_dag_unknown',
          'reg_add_property_button',
          'reg_min_one_proof',
          'reg_abroad_address',
          'reg_simplified_ui',
          'password_policy_v2',
          'nav_merged_entries',
          'nav_advanced_section',
        },
      );
    });
  });

  group('FeatureFlagsRepositoryImpl', () {
    late MockApiClient api;
    setUp(() => api = MockApiClient());

    test('parses {"flags": {key: bool}} from /public/feature-flags', () async {
      when(() => api.getUri('/public/feature-flags')).thenAnswer(
        (_) async => {
          'flags': {'reg_hide_nationality': true, 'nav_advanced_section': false},
        },
      );
      final flags = await FeatureFlagsRepositoryImpl(apiClient: api).fetch();
      expect(flags, {'reg_hide_nationality': true, 'nav_advanced_section': false});
    });

    test('ignores non-bool values and tolerates a malformed body', () async {
      when(() => api.getUri('/public/feature-flags')).thenAnswer(
        (_) async => {
          'flags': {'a': true, 'b': 'yes', 'c': 1, 'd': null},
        },
      );
      expect(await FeatureFlagsRepositoryImpl(apiClient: api).fetch(), {'a': true});

      when(() => api.getUri('/public/feature-flags')).thenAnswer((_) async => 'oops');
      expect(await FeatureFlagsRepositoryImpl(apiClient: api).fetch(), isEmpty);

      when(() => api.getUri('/public/feature-flags')).thenAnswer((_) async => {'flags': null});
      expect(await FeatureFlagsRepositoryImpl(apiClient: api).fetch(), isEmpty);
    });

    test('propagates ApiException', () async {
      when(() => api.getUri('/public/feature-flags'))
          .thenThrow(const ApiException(type: ApiExceptionType.network));
      await expectLater(
        FeatureFlagsRepositoryImpl(apiClient: api).fetch(),
        throwsA(isA<ApiException>()),
      );
    });
  });

  group('FeatureFlagsService', () {
    test('all flags are false before load', () {
      final s = FeatureFlagsService(FakeRepo([
        {'reg_hide_nationality': true},
      ]));
      for (final f in FeatureFlag.values) {
        expect(s.isEnabled(f), isFalse);
      }
      expect(s.isLoaded, isFalse);
    });

    test('load caches server values; unknown/missing keys are false', () async {
      final repo = FakeRepo([
        {'reg_hide_nationality': true, 'reg_road_optional': false, 'future_flag': true},
      ]);
      final s = FeatureFlagsService(repo);
      await s.load();
      expect(s.isEnabled(FeatureFlag.regHideNationality), isTrue);
      expect(s.isEnabled(FeatureFlag.regRoadOptional), isFalse);
      expect(s.isEnabled(FeatureFlag.passwordPolicyV2), isFalse);
      expect(s.isLoaded, isTrue);
    });

    test('load never throws; failure leaves every flag false', () async {
      final s = FeatureFlagsService(
        FakeRepo([const ApiException(type: ApiExceptionType.network)]),
      );
      await s.load();
      for (final f in FeatureFlag.values) {
        expect(s.isEnabled(f), isFalse);
      }
      expect(s.isLoaded, isFalse);
    });

    test('load swallows non-ApiException errors too', () async {
      final s = FeatureFlagsService(FakeRepo([Exception('boom')]));
      await expectLater(s.load(), completes);
      expect(s.isEnabled(FeatureFlag.navMergedEntries), isFalse);
    });

    test('concurrent load calls share a single request', () async {
      final repo = FakeRepo([
        {'nav_merged_entries': true},
      ]);
      final s = FeatureFlagsService(repo);
      await Future.wait([s.load(), s.load(), s.load()]);
      expect(repo.calls, 1);
      expect(s.isEnabled(FeatureFlag.navMergedEntries), isTrue);
    });

    test('a failed refresh keeps the last known good flags', () async {
      final repo = FakeRepo([
        {'nav_merged_entries': true},
        const ApiException(type: ApiExceptionType.server, statusCode: 500),
      ]);
      final s = FeatureFlagsService(repo);
      await s.load();
      await s.load();
      expect(repo.calls, 2);
      expect(s.isEnabled(FeatureFlag.navMergedEntries), isTrue);
    });

    test('notifies listeners when flags change', () async {
      final s = FeatureFlagsService(FakeRepo([
        {'reg_dag_unknown': true},
      ]));
      var notified = 0;
      s.addListener(() => notified++);
      await s.load();
      expect(notified, 1);
    });
  });
}
