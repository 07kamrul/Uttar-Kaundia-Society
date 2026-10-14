import 'package:bloc_test/bloc_test.dart';
import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:get_it/get_it.dart';
import 'package:go_router/go_router.dart';
import 'package:kaundia_app/core/auth/auth_repository.dart';
import 'package:kaundia_app/core/di/injector.dart';
import 'package:kaundia_app/core/network/api_error_messages.dart';
import 'package:kaundia_app/core/network/api_exception.dart';
import 'package:kaundia_app/features/auth/bloc/auth_bloc.dart';
import 'package:kaundia_app/features/auth/pages/login_page.dart';
import 'package:kaundia_app/features/auth/pages/reset_password_page.dart';
import 'package:kaundia_app/features/home/home_status_cubit.dart';
import 'package:kaundia_app/features/member/data/member_repository.dart';
import 'package:kaundia_app/features/member/domain/member_entities.dart';
import 'package:kaundia_app/features/member/presentation/bloc/change_password_bloc.dart';
import 'package:kaundia_app/l10n/app_localizations.dart';
import 'package:kaundia_app/l10n/app_localizations_bn.dart';
import 'package:mocktail/mocktail.dart';

import '../../support/payments_fixtures.dart';

class _MockAuthRepo extends Mock implements AuthRepository {}

class _MockMemberRepo extends Mock implements MemberRepository {}

ApiException _status(int code, {String? errorCode}) => ApiException(
      type: code == 401 ? ApiExceptionType.unauthorized : ApiExceptionType.server,
      statusCode: code,
      errorCode: errorCode,
    );

void main() {
  final bn = AppLocalizationsBn();

  setUpAll(() {
    final sl = GetIt.instance;
    if (!sl.isRegistered<SessionManager>()) {
      sl.registerLazySingleton<SessionManager>(() => SessionManager());
    }
  });

  group('login page', () {
    late _MockAuthRepo repo;
    setUp(() => repo = _MockAuthRepo());

    Widget harness(Widget page) => BlocProvider<AuthBloc>(
          create: (_) => AuthBloc(repository: repo),
          child: MaterialApp(
            locale: const Locale('bn'),
            localizationsDelegates: AppLocalizations.localizationsDelegates,
            supportedLocales: AppLocalizations.supportedLocales,
            home: page,
          ),
        );

    Future<void> login(WidgetTester tester, Widget page, String id) async {
      await tester.pumpWidget(harness(page));
      await tester.enterText(find.byType(TextField).at(0), id);
      await tester.enterText(find.byType(TextField).at(1), 'secret123');
      await tester.tap(find.text(bn.authLoginSubmitButton));
      await tester.pumpAndSettle();
    }

    testWidgets('flag on: the new label, helper and a text keyboard', (tester) async {
      await tester.pumpWidget(harness(const LoginPage(loginByPhone: true)));
      expect(find.text('মোবাইল / ইমেইল / সদস্য আইডি'), findsOneWidget);
      expect(find.text('বিদেশি নম্বর হলে + ও দেশের কোড সহ লিখুন'), findsOneWidget);
      final field = tester.widget<TextField>(find.byType(TextField).first);
      expect(field.keyboardType, TextInputType.text);
      expect(field.autofillHints, contains(AutofillHints.username));
    });

    testWidgets('flag off: label, helper and keyboard are unchanged', (tester) async {
      await tester.pumpWidget(harness(const LoginPage(loginByPhone: false)));
      expect(find.text(bn.authLoginIdentifierLabel), findsOneWidget);
      expect(find.text('বিদেশি নম্বর হলে + ও দেশের কোড সহ লিখুন'), findsNothing);
      final field = tester.widget<TextField>(find.byType(TextField).first);
      expect(field.keyboardType, TextInputType.emailAddress);
    });

    testWidgets('flag on: 401 / 409 / 429 each say something different', (tester) async {
      when(() => repo.login(any(), any())).thenThrow(_status(401));
      await login(tester, const LoginPage(loginByPhone: true), '01712345678');
      expect(find.text('মোবাইল/ইমেইল/সদস্য আইডি অথবা পাসওয়ার্ড সঠিক নয়'), findsOneWidget);

      when(() => repo.login(any(), any()))
          .thenThrow(_status(409, errorCode: 'LOGIN_AMBIGUOUS_IDENTIFIER'));
      await tester.tap(find.text(bn.authLoginSubmitButton));
      await tester.pumpAndSettle();
      expect(find.text('এই নম্বরে একাধিক অ্যাকাউন্ট আছে — ইমেইল বা সদস্য আইডি দিয়ে লগইন করুন'),
          findsOneWidget);

      when(() => repo.login(any(), any())).thenThrow(_status(429));
      await tester.tap(find.text(bn.authLoginSubmitButton));
      await tester.pumpAndSettle();
      expect(find.text('অনেকবার চেষ্টা হয়েছে, ১৫ মিনিট পরে আবার চেষ্টা করুন'), findsOneWidget);
    });

    testWidgets('flag off: every failure still shows the one old message', (tester) async {
      when(() => repo.login(any(), any()))
          .thenThrow(_status(409, errorCode: 'LOGIN_AMBIGUOUS_IDENTIFIER'));
      await login(tester, const LoginPage(loginByPhone: false), 'member01');
      expect(find.text(bn.authLoginLoginFailedError), findsOneWidget);

      when(() => repo.login(any(), any())).thenThrow(_status(429));
      await tester.tap(find.text(bn.authLoginSubmitButton));
      await tester.pumpAndSettle();
      expect(find.text(bn.authLoginLoginFailedError), findsOneWidget);
    });

    testWidgets('flag on: the identifier is sent trimmed, in any format', (tester) async {
      when(() => repo.login(any(), any())).thenThrow(_status(401));
      await login(tester, const LoginPage(loginByPhone: true), '  ০১৭১২৩৪৫৬৭৮ ');
      verify(() => repo.login('০১৭১২৩৪৫৬৭৮', 'secret123')).called(1);
    });
  });

  group('error codes', () {
    ApiException coded(int s, String c) => _status(s, errorCode: c);

    test('the new codes have their own Bangla copy', () {
      expect(apiErrorMessage(bn, coded(409, 'LOGIN_AMBIGUOUS_IDENTIFIER')),
          'এই নম্বরে একাধিক অ্যাকাউন্ট আছে — ইমেইল বা সদস্য আইডি দিয়ে লগইন করুন');
      expect(apiErrorMessage(bn, coded(422, 'PASSWORD_TOO_SHORT')),
          'পাসওয়ার্ড কমপক্ষে ৮ অক্ষরের হতে হবে');
      expect(apiErrorMessage(bn, coded(422, 'PASSWORD_TOO_COMMON')),
          'এই পাসওয়ার্ডটি খুব সাধারণ, অন্য একটি দিন');
      expect(apiErrorMessage(bn, coded(422, 'PASSWORD_SAME_AS_CURRENT')),
          'নতুন পাসওয়ার্ড আগেরটির মতো হতে পারবে না');
    });

    ApiException fromBody(int status, Object body) => ApiException.fromDio(DioException(
          requestOptions: RequestOptions(path: '/x'),
          response: Response(
              requestOptions: RequestOptions(path: '/x'), statusCode: status, data: body),
        ));

    test('a code in the detail or at the top level is read', () {
      expect(fromBody(409, {'detail': {'code': 'LOGIN_AMBIGUOUS_IDENTIFIER', 'kind': 'mobile'}}).errorCode,
          'LOGIN_AMBIGUOUS_IDENTIFIER');
      expect(fromBody(409, {'code': 'LOGIN_AMBIGUOUS_IDENTIFIER', 'kind': 'email'}).errorCode,
          'LOGIN_AMBIGUOUS_IDENTIFIER');
    });

    test('the password 422 body gives the field error and the code', () {
      final e = fromBody(422, {
        'detail': {
          'message': 'This password is too common',
          'errors': {'new_password': 'This password is too common'},
          'code': 'PASSWORD_TOO_COMMON',
        }
      });
      expect(e.errorCode, 'PASSWORD_TOO_COMMON');
      expect(e.fieldErrors['new_password'], 'This password is too common');
    });
  });

  group('change password: policy v1 / v2', () {
    test('v1 keeps the digit rule', () {
      expect(validateChangePassword(current: 'x', next: 'abcdefgh', confirm: 'abcdefgh').newError,
          ChangePasswordFieldError.policy);
    });

    test('v2 asks for length only', () {
      final ok = validateChangePassword(
          current: 'x', next: 'abcdefgh', confirm: 'abcdefgh', policyV2: true);
      expect(ok.ok, isTrue);
      expect(
          validateChangePassword(current: 'x', next: 'abcdefg', confirm: 'abcdefg', policyV2: true)
              .newError,
          ChangePasswordFieldError.policy);
      expect(
          validateChangePassword(current: 'abcdefgh', next: 'abcdefgh', confirm: 'abcdefgh', policyV2: true)
              .newError,
          ChangePasswordFieldError.sameAsCurrent);
    });

    blocTest<ChangePasswordBloc, ChangePasswordState>(
      'the bloc validates with the policy it was built with',
      build: () => ChangePasswordBloc(repository: _MockMemberRepo(), policyV2: true),
      act: (b) => b.add(const ChangePasswordValidated(
          current: 'old', next: 'abcdefgh', confirm: 'abcdefgh')),
      expect: () => [
        predicate<ChangePasswordState>((s) => s.newError == ChangePasswordFieldError.none),
      ],
    );

    blocTest<ChangePasswordBloc, ChangePasswordState>(
      'a server password code is kept so the page can show its own copy',
      build: () {
        final repo = _MockMemberRepo();
        when(() => repo.changePassword(
                currentPassword: any(named: 'currentPassword'),
                newPassword: any(named: 'newPassword')))
            .thenThrow(const ApiException(
          type: ApiExceptionType.validation,
          statusCode: 422,
          errorCode: 'PASSWORD_TOO_COMMON',
          fieldErrors: {'new_password': 'raw english'},
        ));
        return ChangePasswordBloc(repository: repo, policyV2: true);
      },
      act: (b) => b.add(const ChangePasswordSubmitted(current: 'old', next: '12345678')),
      verify: (b) {
        expect(b.state.newServerCode, 'PASSWORD_TOO_COMMON');
        expect(b.state.submitting, isFalse);
      },
    );
  });

  group('reset password page', () {
    late _MockAuthRepo repo;
    setUp(() => repo = _MockAuthRepo());

    Future<void> open(WidgetTester tester, {required bool v2}) async {
      final router = GoRouter(
        initialLocation: '/reset-password?token=abc',
        routes: [
          GoRoute(path: '/reset-password', builder: (_, __) => ResetPasswordPage(passwordPolicyV2: v2)),
          GoRoute(path: '/login', builder: (_, __) => const Text('login')),
        ],
      );
      await tester.pumpWidget(BlocProvider<AuthBloc>(
        create: (_) => AuthBloc(repository: repo),
        child: MaterialApp.router(
          routerConfig: router,
          locale: const Locale('bn'),
          localizationsDelegates: AppLocalizations.localizationsDelegates,
          supportedLocales: AppLocalizations.supportedLocales,
        ),
      ));
      await tester.pumpAndSettle();
    }

    Future<void> submit(WidgetTester tester, String password) async {
      await tester.enterText(find.byType(TextField).at(0), password);
      await tester.enterText(find.byType(TextField).at(1), password);
      await tester.tap(find.text(bn.authResetPasswordSubmitButton));
      await tester.pumpAndSettle();
    }

    testWidgets('v2 shows the length hint and blocks a short password', (tester) async {
      await open(tester, v2: true);
      expect(find.text('পাসওয়ার্ড কমপক্ষে ৮ অক্ষরের হতে হবে'), findsOneWidget);
      await submit(tester, 'abcdefg');
      verifyNever(() => repo.resetPassword(any(), any()));
      expect(find.text('পাসওয়ার্ড কমপক্ষে ৮ অক্ষরের হতে হবে'), findsWidgets);
    });

    testWidgets('v2 sends a length-8 password with no digit', (tester) async {
      when(() => repo.resetPassword(any(), any())).thenAnswer((_) async {});
      await open(tester, v2: true);
      await submit(tester, 'abcdefgh');
      verify(() => repo.resetPassword('abc', 'abcdefgh')).called(1);
    });

    testWidgets('v2 maps the server code to plain copy', (tester) async {
      when(() => repo.resetPassword(any(), any())).thenThrow(const ApiException(
          type: ApiExceptionType.validation, statusCode: 422, errorCode: 'PASSWORD_TOO_COMMON'));
      await open(tester, v2: true);
      await submit(tester, '12345678');
      expect(find.text('এই পাসওয়ার্ডটি খুব সাধারণ, অন্য একটি দিন'), findsOneWidget);
    });

    testWidgets('flag off: no client check, the old hint and the old 422 text', (tester) async {
      when(() => repo.resetPassword(any(), any())).thenThrow(
          const ApiException(type: ApiExceptionType.validation, statusCode: 422));
      await open(tester, v2: false);
      expect(find.text(bn.authResetPasswordPasswordHint), findsOneWidget);
      await submit(tester, 'abc');
      verify(() => repo.resetPassword('abc', 'abc')).called(1);
      // The error box repeats the hint's wording, so two widgets show it.
      expect(find.text(bn.authResetPasswordWeakPasswordError), findsWidgets);
    });
  });

  group('needs_dag on Home', () {
    MemberProfile profile({bool? needsDag, bool withDag = true}) => memberProfileFromApi({
          'member_id': 1,
          'status': 'approved',
          'full_name': 'রহিম',
          if (needsDag != null) 'needs_dag': needsDag,
          'properties': [
            {'id': 1, 'dag_no_cs': withDag ? '12' : null, 'dag_no_rs': null},
          ],
        });

    HomeState state(MemberProfile p) => HomeState(
          profile: AsyncCard.loaded(p),
          dues: AsyncCard.loaded(sampleSummary(totalDue: 0)),
        );

    test('the mapper reads needs_dag, and null when the server has not sent it', () {
      expect(profile(needsDag: true).needsDag, isTrue);
      expect(profile(needsDag: false).needsDag, isFalse);
      expect(profile().needsDag, isNull);
    });

    test('the server flag wins over the client-side derivation', () {
      expect(state(profile(needsDag: true, withDag: true)).nextStep, HomeNextStep.needsDag);
      expect(state(profile(needsDag: false, withDag: false)).nextStep, HomeNextStep.allGood);
    });

    test('without the flag the old derivation still applies', () {
      expect(state(profile(withDag: false)).nextStep, HomeNextStep.needsDag);
      expect(state(profile(withDag: true)).nextStep, HomeNextStep.allGood);
    });
  });
}
