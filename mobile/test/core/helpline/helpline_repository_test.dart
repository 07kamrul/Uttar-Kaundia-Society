import 'package:flutter_test/flutter_test.dart';
import 'package:kaundia_app/core/helpline/helpline_repository.dart';
import 'package:kaundia_app/core/network/api_client.dart';
import 'package:kaundia_app/core/network/api_exception.dart';
import 'package:mocktail/mocktail.dart';

class _MockApi extends Mock implements ApiClient {}

void main() {
  late _MockApi api;
  late HelplineRepository repo;

  setUp(() {
    api = _MockApi();
    repo = HelplineRepository(apiClient: api);
  });

  test('empty settings mean disabled', () async {
    when(() => api.getUri('/public/helpline'))
        .thenAnswer((_) async => {'phone': null, 'whatsapp': null, 'hours_text': null, 'enabled': false});
    final h = await repo.load();
    expect(h.enabled, isFalse);
    expect(h.phone, isNull);
  });

  test('parses numbers and hours', () async {
    when(() => api.getUri('/public/helpline')).thenAnswer((_) async => {
          'phone': '+8801712345678',
          'whatsapp': '+8801812345678',
          'hours_text': 'সকাল ১০টা - সন্ধ্যা ৬টা',
          'enabled': true,
        });
    final h = await repo.load();
    expect(h.enabled, isTrue);
    expect(h.phone, '+8801712345678');
    expect(h.whatsapp, '+8801812345678');
    expect(h.hoursText, 'সকাল ১০টা - সন্ধ্যা ৬টা');
  });

  test('enabled is derived from the numbers when the server omits it', () async {
    when(() => api.getUri('/public/helpline')).thenAnswer((_) async => {'phone': '+8801712345678'});
    expect((await repo.load()).enabled, isTrue);
  });

  test('a successful answer is cached for the session', () async {
    when(() => api.getUri('/public/helpline')).thenAnswer((_) async => {'phone': '+8801712345678'});
    await repo.load();
    await repo.load();
    verify(() => api.getUri('/public/helpline')).called(1);
  });

  test('a failure hides the help button and is retried next time', () async {
    when(() => api.getUri('/public/helpline')).thenThrow(const ApiException(type: ApiExceptionType.network));
    expect((await repo.load()).enabled, isFalse);
    when(() => api.getUri('/public/helpline')).thenAnswer((_) async => {'whatsapp': '+8801812345678'});
    expect((await repo.load()).enabled, isTrue);
  });
}
