import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:kaundia_app/core/network/api_exception.dart';
import 'package:kaundia_app/features/plot_boundary/domain/geo.dart';
import 'package:kaundia_app/features/plot_boundary/domain/land_data_repository.dart';
import 'package:kaundia_app/features/plot_boundary/domain/land_entities.dart';
import 'package:kaundia_app/features/plot_boundary/domain/map_tile_session.dart';
import 'package:kaundia_app/features/plot_boundary/domain/plot_boundary_entities.dart';
import 'package:kaundia_app/features/plot_boundary/domain/plot_boundary_repository.dart';
import 'package:kaundia_app/features/plot_boundary/presentation/bloc/boundary_editor_bloc.dart';
import 'package:kaundia_app/features/plot_boundary/presentation/bloc/rs_lookup_cubit.dart';
import 'package:kaundia_app/features/plot_boundary/presentation/pages/boundary_editor_page.dart';
import 'package:kaundia_app/l10n/app_localizations.dart';
import 'package:latlong2/latlong.dart';
import 'package:mocktail/mocktail.dart';

import '../../support/blank_tile_provider.dart';

class _MockRepo extends Mock implements PlotBoundaryRepository {}

class _MockLand extends Mock implements LandDataRepository {}

const _society = SocietyBbox(
  minLng: 90.30,
  minLat: 23.78,
  maxLng: 90.347,
  maxLat: 23.838,
);

// ~55 m square inside the society.
const _rs = [
  LatLng(23.8090, 90.3230),
  LatLng(23.8095, 90.3230),
  LatLng(23.8095, 90.3236),
  LatLng(23.8090, 90.3236),
  LatLng(23.8090, 90.3230), // closed ring, as the server sends it
];
const _rs2 = [
  LatLng(23.8100, 90.3240),
  LatLng(23.8105, 90.3240),
  LatLng(23.8105, 90.3246),
  LatLng(23.8100, 90.3246),
];

PlotBoundary _saved() => const PlotBoundary(
      id: 'b1',
      propertyId: 'p1',
      status: BoundaryStatus.pendingReview,
      points: [],
      isMine: true,
    );

void main() {
  late _MockRepo repo;
  late _MockLand land;

  setUpAll(() {
    registerFallbackValue(<LatLng>[]);
    registerFallbackValue(LandLayer.rajuk);
  });

  setUp(() {
    MapTileSession.reset();
    MapTileSession.remember(); // tiles on unless a test says otherwise
    repo = _MockRepo();
    land = _MockLand();
    when(repo.getMyProperties).thenAnswer((_) async => const [
          OwnProperty(
              propertyId: 'p1', rsDag: '120', csDag: '55', landQuantity: '3'),
          OwnProperty(propertyId: 'p2', rsDag: '121', landQuantity: '40'),
          OwnProperty(propertyId: 'p3'),
        ]);
    when(repo.getMyBoundaries).thenAnswer((_) async => const []);
    when(() => repo.createBoundary(
          propertyId: any(named: 'propertyId'),
          points: any(named: 'points'),
        )).thenAnswer((_) async => _saved());
    when(() => land.lookup(LandLayer.rajuk, '120')).thenAnswer(
      (_) async => LandCollection(plots: [
        LandPlot(rings: const [_rs], rsPlotNo: '120', sheet: '12'),
      ]),
    );
    when(() => land.lookup(LandLayer.rajuk, '121')).thenAnswer(
      (_) async => LandCollection(plots: [
        LandPlot(rings: const [_rs], rsPlotNo: '121', sheet: 'A'),
        LandPlot(rings: const [_rs2], rsPlotNo: '121', sheet: 'B'),
      ]),
    );
  });

  Future<void> pump(
    WidgetTester tester, {
    bool wizard = true,
    String? propertyId,
    bool dataSaver = false,
  }) async {
    tester.view.physicalSize = const Size(420, 1100);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);
    await tester.pumpWidget(MaterialApp(
      locale: const Locale('en'),
      localizationsDelegates: const [
        AppLocalizations.delegate,
        GlobalMaterialLocalizations.delegate,
        GlobalWidgetsLocalizations.delegate,
        GlobalCupertinoLocalizations.delegate,
      ],
      supportedLocales: AppLocalizations.supportedLocales,
      home: BoundaryEditorPage(
        wizard: wizard,
        dataSaver: dataSaver,
        initialPropertyId: propertyId,
        tileProvider: BlankTileProvider(),
        createLookupCubit: () => RsLookupCubit(repository: land),
        createBloc: () => BoundaryEditorBloc(
          getMyProperties: GetMyProperties(repo),
          getMyBoundaries: GetMyBoundaries(repo),
          saveBoundary: SaveBoundary(repo),
          society: _society,
          wizard: wizard,
        ),
      ),
    ));
    await _settle(tester);
  }

  testWidgets('step 1 looks the plot up and offers three choices',
      (tester) async {
    await pump(tester);

    expect(find.text('Step 1 of 3 — Find your plot'), findsOneWidget);
    verify(() => land.lookup(LandLayer.rajuk, '120')).called(1);
    expect(find.text('The plot is marked on the map.'), findsOneWidget);
    expect(find.text('This is my plot'), findsOneWidget);
    expect(find.text('Search another plot'), findsOneWidget);
    expect(find.text("Can't find it — draw it myself"), findsOneWidget);
    expect(find.textContaining('approximate boundary'), findsOneWidget);
  });

  testWidgets('pick plot -> prefill -> undo/redo -> next -> submit',
      (tester) async {
    await pump(tester);

    await tester.tap(find.text('This is my plot'));
    await _settle(tester);
    expect(find.text('Step 2 of 3 — Set the boundary'), findsOneWidget);
    expect(find.textContaining('Points: 4'), findsOneWidget,
        reason: 'closing vertex dropped');

    // Labelled history buttons, at least 48 px tall; redo starts disabled.
    final undo = find.widgetWithText(TextButton, 'Undo one step');
    final redo = find.widgetWithText(TextButton, 'Redo');
    expect(tester.getSize(undo).height, greaterThanOrEqualTo(48));
    expect(tester.getSize(redo).height, greaterThanOrEqualTo(48));
    expect(tester.widget<TextButton>(undo).onPressed, isNotNull);
    expect(tester.widget<TextButton>(redo).onPressed, isNull);

    await tester.tap(undo);
    await _settle(tester);
    expect(find.textContaining('Points: 0'), findsOneWidget);
    expect(tester.widget<TextButton>(redo).onPressed, isNotNull);
    await tester.tap(redo);
    await _settle(tester);
    expect(find.textContaining('Points: 4'), findsOneWidget);

    expect(find.text('Declared land: 3 shotangsho'), findsOneWidget);
    await tester.tap(find.widgetWithText(FilledButton, 'Next'));
    await _settle(tester);

    expect(find.text('Step 3 of 3 — Submit'), findsOneWidget);
    expect(find.text('Match with the RS plot'), findsOneWidget);
    expect(find.textContaining('(RS plot 120)'), findsOneWidget);

    await tester.tap(find.widgetWithText(FilledButton, 'Submit'));
    await tester.pump();
    final ring = verify(() => repo.createBoundary(
          propertyId: 'p1',
          points: captureAny(named: 'points'),
        )).captured.single as List<LatLng>;
    expect(ring, hasLength(4));
    expect(ring.first, const LatLng(23.8090, 90.3230));
  });

  testWidgets('"clear all" is one undo step away; start-from-plot restores',
      (tester) async {
    await pump(tester);
    await tester.tap(find.text('This is my plot'));
    await _settle(tester);

    await tester.tap(find.text('Clear all and start again'));
    await _settle(tester);
    expect(find.textContaining('Points: 0'), findsOneWidget);

    await tester.tap(find.text('Start from the plot'));
    await _settle(tester);
    expect(find.textContaining('Points: 4'), findsOneWidget);

    await tester.tap(find.text('Draw it myself'));
    await _settle(tester);
    expect(find.textContaining('Points: 0'), findsOneWidget);
  });

  testWidgets('"can\'t find it" goes straight to free drawing', (tester) async {
    when(() => land.lookup(LandLayer.rajuk, '120'))
        .thenAnswer((_) async => const LandCollection());
    await pump(tester);

    await tester.tap(find.text("Can't find it — draw it myself"));
    await _settle(tester);

    expect(find.text('Step 2 of 3 — Set the boundary'), findsOneWidget);
    expect(find.textContaining('Points: 0'), findsOneWidget);
    expect(find.text('Start from the plot'), findsNothing);
    expect(
        tester
            .widget<FilledButton>(find.widgetWithText(FilledButton, 'Next'))
            .onPressed,
        isNull);
  });

  testWidgets('several plots share the number: the member must choose',
      (tester) async {
    await pump(tester, propertyId: 'p2');

    expect(find.text('2 plots found — choose yours.'), findsOneWidget);
    expect(find.text('RS plot 121 · sheet A'), findsOneWidget);
    expect(find.text('RS plot 121 · sheet B'), findsOneWidget);
    expect(
      tester
          .widget<FilledButton>(
              find.widgetWithText(FilledButton, 'This is my plot'))
          .onPressed,
      isNull,
    );

    await tester.tap(find.text('RS plot 121 · sheet B'));
    await _settle(tester);
    await tester.tap(find.text('This is my plot'));
    await _settle(tester);
    expect(find.textContaining('Points: 4'), findsOneWidget);
    await tester.tap(find.widgetWithText(FilledButton, 'Next'));
    await _settle(tester);
    expect(find.textContaining('(RS plot 121)'), findsOneWidget);
  });

  testWidgets('another dag can be searched; a failed lookup offers a way out',
      (tester) async {
    when(() => land.lookup(LandLayer.rajuk, '999'))
        .thenThrow(const ApiException(type: ApiExceptionType.network));
    await pump(tester);

    await tester.tap(find.text('Search another plot'));
    await _settle(tester);
    await tester.enterText(find.byKey(const Key('wizardDagField')), '999');
    await tester.tap(find.text('Search'));
    await _settle(tester);

    verify(() => land.lookup(LandLayer.rajuk, '999')).called(1);
    expect(find.textContaining('Could not look up the plot'), findsOneWidget);
    expect(find.text("Can't find it — draw it myself"), findsOneWidget);
  });

  testWidgets('a plot with no dag number skips straight to drawing',
      (tester) async {
    when(repo.getMyProperties)
        .thenAnswer((_) async => const [OwnProperty(propertyId: 'p3')]);
    await pump(tester);

    expect(find.text('Step 2 of 3 — Set the boundary'), findsOneWidget);
    verifyNever(() => land.lookup(any(), any()));
  });

  testWidgets('back returns to the previous step', (tester) async {
    await pump(tester);
    await tester.tap(find.text('This is my plot'));
    await _settle(tester);
    await tester.tap(find.widgetWithText(TextButton, 'Back'));
    await _settle(tester);
    expect(find.text('Step 1 of 3 — Find your plot'), findsOneWidget);
  });

  testWidgets('the editor map waits for "Show the map" under data saver',
      (tester) async {
    await pump(tester, dataSaver: true);
    expect(find.byType(TileLayer), findsNothing);
    await tester.tap(find.text('Show the map'));
    await _settle(tester);
    expect(find.byType(TileLayer), findsOneWidget);
  });

  testWidgets('flag off: the single-screen editor is unchanged',
      (tester) async {
    await pump(tester, wizard: false);

    expect(find.textContaining('Step 1 of 3'), findsNothing);
    expect(find.text('This is my plot'), findsNothing);
    expect(find.byIcon(Icons.undo), findsOneWidget);
    expect(find.text('Redo'), findsNothing);
    expect(find.byType(TileLayer), findsOneWidget);
    expect(find.textContaining('member-marked approximate'), findsOneWidget);
    verifyNever(() => land.lookup(any(), any()));
  });
}

Future<void> _settle(WidgetTester tester) async {
  for (var i = 0; i < 8; i++) {
    await tester.pump(const Duration(milliseconds: 60));
  }
}
