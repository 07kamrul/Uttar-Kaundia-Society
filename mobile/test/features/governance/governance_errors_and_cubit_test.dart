import 'package:flutter_test/flutter_test.dart';
import 'package:kaundia_app/core/network/api_exception.dart';
import 'package:kaundia_app/features/governance/presentation/governance_errors.dart';
import 'package:kaundia_app/features/governance/presentation/list_form_cubit.dart';
import 'package:kaundia_app/l10n/app_localizations_bn.dart';

ApiException _status(int code, {String? message, String? errorCode}) => ApiException(
      type: ApiExceptionType.business,
      statusCode: code,
      message: message,
      errorCode: errorCode,
    );

class _Cubit extends ListFormCubit<List<int>> {
  _Cubit(this.loads);

  final List<Object> loads;
  int calls = 0;

  @override
  Future<List<int>> fetch() async {
    final next = loads[calls < loads.length ? calls : loads.length - 1];
    calls++;
    if (next is Exception) throw next;
    return next as List<int>;
  }
}

void main() {
  final bn = AppLocalizationsBn();

  group('govErrorMessage', () {
    test('403 and 409 get the action specific message', () {
      expect(govErrorMessage(bn, _status(403), GovAction.vote), bn.govErrVoteForbidden);
      expect(govErrorMessage(bn, _status(409), GovAction.vote), bn.govErrVoteConflict);
      expect(govErrorMessage(bn, _status(403), GovAction.nominate), bn.govErrNominateForbidden);
      expect(govErrorMessage(bn, _status(409), GovAction.sign), bn.govErrSignConflict);
      expect(govErrorMessage(bn, _status(404), GovAction.sign), bn.govErrSignNotFound);
      expect(govErrorMessage(bn, _status(422), GovAction.landComplaint), bn.govErrLandMissing);
      expect(govErrorMessage(bn, _status(409), GovAction.withdraw), bn.govErrWithdrawConflict);
    });

    test('a structured detail.code wins over the status', () {
      expect(govErrorMessage(bn, _status(409, errorCode: 'FEATURE_DISABLED'), GovAction.vote),
          bn.apiErrorFeatureDisabled);
    });

    test('never shows the raw server text', () {
      final text = govErrorMessage(bn, _status(500, message: 'Traceback secret'), GovAction.vote);
      expect(text, isNot(contains('secret')));
      expect(text, bn.apiErrorServer);
    });

    test('offline and unknown errors use the shared messages', () {
      expect(govErrorMessage(bn, const ApiException(type: ApiExceptionType.network), GovAction.vote),
          bn.apiErrorOffline);
      expect(govErrorMessage(bn, StateError('x'), GovAction.other), bn.apiErrorUnknown);
    });
  });

  group('ListFormCubit', () {
    test('load fills data', () async {
      final c = _Cubit([
        [1, 2]
      ]);
      expect(c.state.loading, isTrue);
      await c.load();
      expect(c.state.data, [1, 2]);
      expect(c.state.loading, isFalse);
      expect(c.state.loadError, isNull);
      await c.close();
    });

    test('a failed load keeps the error for a retry', () async {
      final c = _Cubit([
        const ApiException(type: ApiExceptionType.network),
        [3]
      ]);
      await c.load();
      expect(c.state.loadError, isA<ApiException>());
      expect(c.state.data, isNull);
      await c.load();
      expect(c.state.data, [3]);
      expect(c.state.loadError, isNull);
      await c.close();
    });

    test('a successful action reloads and counts as done', () async {
      final c = _Cubit([
        [1],
        [1, 2]
      ]);
      await c.load();
      final ok = await c.run(() async {});
      expect(ok, isTrue);
      expect(c.state.data, [1, 2]);
      expect(c.state.doneCount, 1);
      expect(c.state.busy, isFalse);
      expect(c.state.actionError, isNull);
      await c.close();
    });

    test('a failed action keeps the data and records the error', () async {
      final c = _Cubit([
        [1]
      ]);
      await c.load();
      final ok = await c.run(() async => throw _status(409));
      expect(ok, isFalse);
      expect(c.state.data, [1]);
      expect(c.state.doneCount, 0);
      expect(c.state.actionError, isA<ApiException>());
      expect(c.state.busy, isFalse);
      await c.close();
    });

    test('a second action is ignored while one is running', () async {
      final c = _Cubit([
        [1]
      ]);
      await c.load();
      var runs = 0;
      final first = c.run(() async {
        runs++;
        await Future<void>.delayed(const Duration(milliseconds: 10));
      });
      final second = c.run(() async => runs++);
      expect(await second, isFalse);
      await first;
      expect(runs, 1);
      await c.close();
    });
  });
}
