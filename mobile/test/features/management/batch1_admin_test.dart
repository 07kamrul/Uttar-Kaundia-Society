import 'dart:async';
import 'dart:io';

import 'package:bloc_test/bloc_test.dart';
import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:kaundia_app/core/enums/enums.dart';
import 'package:kaundia_app/core/network/api_client.dart';
import 'package:kaundia_app/core/network/api_exception.dart';
import 'package:kaundia_app/features/management/data/admin_repository.dart';
import 'package:kaundia_app/features/management/domain/admin_entities.dart';
import 'package:kaundia_app/features/management/domain/admin_mappers.dart';
import 'package:kaundia_app/features/management/pages/submissions_list_page.dart';
import 'package:kaundia_app/features/management/presentation/bloc/submission_detail_bloc.dart';
import 'package:kaundia_app/features/management/presentation/widgets/submission_detail_widgets.dart';
import 'package:kaundia_app/l10n/app_localizations.dart';
import 'package:mocktail/mocktail.dart';

class _MockApi extends Mock implements ApiClient {}

class _MockRepo extends Mock implements AdminRepository {}

Map<String, dynamic> _detailJson({bool needsDag = false, bool dagUnknown = false}) => {
      'id': 9,
      'status': 'pending',
      'full_name': 'n',
      'mobile': 'm',
      'created_at': '2026-01-01T00:00:00Z',
      'father_or_husband': 'f',
      'mother': 'mo',
      'dob': 'd',
      'nationality': 'n',
      'occupation': 'o',
      'nid': 'nid',
      'gender': 'g',
      'email': 'e',
      'admission_fee': '1',
      'subscription': '2',
      'receipt_no': 'r',
      'payment_method': 'cash',
      'needs_dag': needsDag,
      'properties': [
        {
          'id': 33,
          'property_type': ['জমি'],
          'dag_no_cs': '',
          'dag_no_rs': null,
          'dag_unknown': dagUnknown,
          'applicable_docs': [],
        }
      ],
      'nominees': [],
    };

SubmissionDetail _detail({bool needsDag = false}) =>
    _detailJson(needsDag: needsDag, dagUnknown: needsDag).toDetailEntity();

Widget _host(Widget child) => MaterialApp(
      localizationsDelegates: const [
        AppLocalizations.delegate,
        GlobalMaterialLocalizations.delegate,
        GlobalWidgetsLocalizations.delegate,
        GlobalCupertinoLocalizations.delegate,
      ],
      supportedLocales: AppLocalizations.supportedLocales,
      locale: const Locale('bn'),
      home: Scaffold(body: SingleChildScrollView(child: child)),
    );

void main() {
  setUpAll(() => registerFallbackValue(FormData()));

  group('mappers', () {
    test('needs_dag and dag_unknown are read from detail and property', () {
      final d = _detailJson(needsDag: true, dagUnknown: true).toDetailEntity();
      expect(d.needsDag, isTrue);
      expect(d.properties.single.dagUnknown, isTrue);
      expect(d.properties.single.id, '33');
    });

    test('missing keys default to false (older servers)', () {
      final json = _detailJson()..remove('needs_dag');
      (json['properties'] as List).first.remove('dag_unknown');
      final d = json.toDetailEntity();
      expect(d.needsDag, isFalse);
      expect(d.properties.single.dagUnknown, isFalse);
    });

    test('summary carries needs_dag', () {
      final s = <String, dynamic>{
        'id': 1,
        'full_name': 'x',
        'mobile': '1',
        'status': 'pending',
        'created_at': 'c',
        'needs_dag': true,
      }.toSummaryEntity();
      expect(s.needsDag, isTrue);
    });
  });

  group('AdminRepository', () {
    late _MockApi api;
    late AdminRepository repo;

    setUp(() {
      api = _MockApi();
      repo = AdminRepository(apiClient: api);
      when(() => api.getUri('/admin/submissions/9'))
          .thenAnswer((_) async => _detailJson());
    });

    test('fillDag PATCHes the dag endpoint with only the filled values', () async {
      when(() => api.patch(any(), any())).thenAnswer((_) async => {});

      final fresh = await repo.fillDag('9', '33', dagNoCs: ' 123 ', dagNoRs: '');

      verify(() => api.patch('/admin/submissions/9/properties/33/dag',
          {'dag_no_cs': '123', 'dag_no_rs': null})).called(1);
      expect(fresh.id, '9');
    });

    test('uploadMemberPhoto PUTs multipart memberPhoto', () async {
      when(() => api.putMultipart(any(), any())).thenAnswer((_) async => {});
      final tmp = await _tempFile();

      await repo.uploadMemberPhoto('9', tmp);

      final captured = verify(() =>
              api.putMultipart('/admin/submissions/9/photo', captureAny()))
          .captured
          .single as FormData;
      expect(captured.files.single.key, 'memberPhoto');
    });
  });

  group('SubmissionDetailBloc', () {
    late _MockRepo repo;

    setUp(() {
      repo = _MockRepo();
      when(() => repo.getSubmission('9')).thenAnswer((_) async => _detail(needsDag: true));
    });

    blocTest<SubmissionDetailBloc, SubmissionDetailState>(
      'fills the dag and replaces the submission with the refreshed one',
      build: () {
        when(() => repo.fillDag('9', '33', dagNoCs: '12', dagNoRs: null))
            .thenAnswer((_) async => _detail());
        return SubmissionDetailBloc(repository: repo, id: '9');
      },
      seed: () => SubmissionDetailData(loading: false, submission: _detail(needsDag: true)),
      act: (b) => b.add(const SubmissionDetailDagFillRequested('33', dagNoCs: '12')),
      verify: (b) {
        expect(b.state.submission!.needsDag, isFalse);
        expect(b.state.busy, isFalse);
        expect(b.state.actionError, isNull);
      },
    );

    blocTest<SubmissionDetailBloc, SubmissionDetailState>(
      'photo upload refreshes the submission',
      build: () {
        when(() => repo.uploadMemberPhoto('9', '/tmp/p.jpg')).thenAnswer((_) async => _detail());
        return SubmissionDetailBloc(repository: repo, id: '9');
      },
      seed: () => SubmissionDetailData(loading: false, submission: _detail(needsDag: true)),
      act: (b) => b.add(const SubmissionDetailPhotoUploadRequested('/tmp/p.jpg')),
      verify: (b) => expect(b.state.submission!.needsDag, isFalse),
    );

    blocTest<SubmissionDetailBloc, SubmissionDetailState>(
      'approve blocked by 409 DAG_REQUIRED surfaces an action error and keeps the page',
      build: () {
        when(() => repo.approveSubmission('9')).thenThrow(const ApiException(
            type: ApiExceptionType.server, statusCode: 409, errorCode: 'DAG_REQUIRED'));
        return SubmissionDetailBloc(repository: repo, id: '9');
      },
      seed: () => SubmissionDetailData(loading: false, submission: _detail(needsDag: true)),
      act: (b) {
        final c = Completer<bool>();
        b.add(SubmissionDetailApproveRequested(completer: c));
      },
      verify: (b) {
        expect((b.state.actionError as ApiException).errorCode, 'DAG_REQUIRED');
        expect(b.state.approveCompleted, isFalse);
      },
    );
  });

  group('dag badge', () {
    testWidgets('list card shows "দাগ দরকার" when needs_dag', (tester) async {
      await tester.pumpWidget(_host(const SubmissionListCard(
        submission: SubmissionSummary(
            id: '1',
            fullName: 'নাম',
            mobile: '+8801712345678',
            status: SubmissionStatus.pending,
            createdAt: '2026-01-01T00:00:00Z',
            needsDag: true),
      )));
      expect(find.text('দাগ দরকার'), findsOneWidget);
    });

    testWidgets('list card has no badge when the dag is known', (tester) async {
      await tester.pumpWidget(_host(const SubmissionListCard(
        submission: SubmissionSummary(
            id: '1',
            fullName: 'নাম',
            mobile: '+8801712345678',
            status: SubmissionStatus.pending,
            createdAt: '2026-01-01T00:00:00Z'),
      )));
      expect(find.text('দাগ দরকার'), findsNothing);
    });

    testWidgets('property tile shows the badge and fill form for a dag_unknown property',
        (tester) async {
      String? savedCs;
      String? savedRs;
      String? savedId;
      await tester.pumpWidget(_host(SubmissionPropertyTile(
        property: _detail(needsDag: true).properties.single,
        busy: false,
        onReplaceDocument: (_, __) {},
        onFillDag: (id, cs, rs) {
          savedId = id;
          savedCs = cs;
          savedRs = rs;
        },
      )));
      expect(find.text('দাগ দরকার'), findsOneWidget);

      await tester.tap(find.byType(ExpansionTile));
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const Key('fillDagButton')));
      await tester.pumpAndSettle();

      await tester.enterText(find.byKey(const Key('dagCsField')), '১২৩');
      await tester.tap(find.byKey(const Key('dagSaveButton')));
      await tester.pumpAndSettle();

      expect(savedId, '33');
      expect(savedCs, '123'); // Bangla digits normalised
      expect(savedRs, isNull);
    });

    testWidgets('dag form refuses an empty submission', (tester) async {
      var calls = 0;
      await tester.pumpWidget(_host(SubmissionPropertyTile(
        property: _detail(needsDag: true).properties.single,
        busy: false,
        onReplaceDocument: (_, __) {},
        onFillDag: (_, __, ___) => calls++,
      )));
      await tester.tap(find.byType(ExpansionTile));
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const Key('fillDagButton')));
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const Key('dagSaveButton')));
      await tester.pumpAndSettle();
      expect(calls, 0);
    });
  });
}

Future<String> _tempFile() async {
  return Future.value(_Tmp.create());
}

class _Tmp {
  static String create() {
    final dir = Directory.systemTemp.createTempSync('bt');
    final f = File('${dir.path}/p.jpg')..writeAsBytesSync([1, 2, 3]);
    return f.path;
  }
}
