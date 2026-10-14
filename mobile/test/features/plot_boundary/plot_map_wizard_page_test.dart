import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:kaundia_app/core/storage/app_preferences.dart';
import 'package:kaundia_app/features/plot_boundary/domain/geo.dart';
import 'package:kaundia_app/features/plot_boundary/domain/land_data_repository.dart';
import 'package:kaundia_app/features/plot_boundary/domain/land_entities.dart';
import 'package:kaundia_app/features/plot_boundary/domain/map_tile_session.dart';
import 'package:kaundia_app/features/plot_boundary/domain/plot_boundary_entities.dart';
import 'package:kaundia_app/features/plot_boundary/domain/plot_boundary_repository.dart';
import 'package:kaundia_app/features/plot_boundary/presentation/bloc/land_map_bloc.dart';
import 'package:kaundia_app/features/plot_boundary/presentation/bloc/my_location_cubit.dart';
import 'package:kaundia_app/features/plot_boundary/presentation/bloc/plot_map_bloc.dart';
import 'package:kaundia_app/features/plot_boundary/presentation/pages/plot_map_page.dart';
import 'package:kaundia_app/features/plot_boundary/presentation/widgets/map/boundary_polygon_layer.dart';
import 'package:kaundia_app/features/plot_boundary/presentation/widgets/map/map_disclaimer.dart';
import 'package:kaundia_app/l10n/app_localizations.dart';
import 'package:latlong2/latlong.dart';
import 'package:mocktail/mocktail.dart';

import '../../support/blank_tile_provider.dart';

class _MockPlotRepo extends Mock implements PlotBoundaryRepository {}

class _MockLandRepo extends Mock implements LandDataRepository {}

class _MockPrefs extends Mock implements AppPreferences {}

const _ring = [
  LatLng(23.808, 90.322),
  LatLng(23.808, 90.324),
  LatLng(23.810, 90.324),
  LatLng(23.810, 90.322),
];
const _ring2 = [
  LatLng(23.812, 90.326),
  LatLng(23.812, 90.328),
  LatLng(23.814, 90.328),
  LatLng(23.814, 90.326),
];

const _bbox = SocietyBbox(
  minLng: 90.30,
  minLat: 23.78,
  maxLng: 90.347,
  maxLat: 23.838,
);

void main() {
  late _MockPlotRepo plotRepo;
  late _MockLandRepo landRepo;
  late _MockPrefs prefs;

  setUpAll(() {
    registerFallbackValue(_bbox);
    registerFallbackValue(LandLayer.bds);
  });

  setUp(() {
    MapDisclaimer.resetSession();
    MapTileSession.reset();
    plotRepo = _MockPlotRepo();
    landRepo = _MockLandRepo();
    prefs = _MockPrefs();
    when(() => prefs.mapTourDone).thenReturn(true);
    when(() => prefs.setMapTourDone(any())).thenAnswer((_) async {});
    when(() => plotRepo.getPlotMap(any())).thenAnswer((_) async => [
          const BoundaryFeature(
            boundaryId: 'b1',
            propertyId: 'p1',
            status: BoundaryStatus.approved,
            isMine: false,
            points: _ring,
            rsDag: '1',
          ),
          const BoundaryFeature(
            boundaryId: 'b2',
            propertyId: 'p2',
            status: BoundaryStatus.rejected,
            isMine: true,
            points: _ring2,
            rsDag: '2',
          ),
        ]);
    when(() => landRepo.plotsInBbox(any(), any()))
        .thenAnswer((_) async => const LandCollection());
  });

  Future<void> pumpPage(
    WidgetTester tester, {
    required bool wizard,
    bool dataSaver = false,
  }) async {
    tester.view.physicalSize = const Size(400, 800);
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
      home: PlotMapPage(
        wizard: wizard,
        dataSaver: dataSaver,
        preferences: prefs,
        canDraw: true,
        tileProvider: BlankTileProvider(),
        createBloc: () => PlotMapBloc(
          getPlotMap: GetPlotMap(plotRepo),
          getBoundaryOwner: GetBoundaryOwner(plotRepo),
          debounce: Duration.zero,
        ),
        createLandBloc: () =>
            LandMapBloc(repository: landRepo, debounce: Duration.zero),
        createLocationCubit: () => MyLocationCubit(
          society: _bbox,
          positionProvider: () async => null,
        ),
      ),
    ));
    await _settle(tester);
  }

  int polygons(WidgetTester tester) => tester
      .widget<PolygonLayer>(find.descendant(
        of: find.byType(BoundaryPolygonLayer),
        matching: find.byType(PolygonLayer),
      ))
      .polygons
      .length;

  group('flag off: unchanged', () {
    testWidgets('tiles on init, mode tabs, 5-item legend, old notice',
        (tester) async {
      await pumpPage(tester, wizard: false);

      expect(find.byType(TileLayer), findsOneWidget);
      expect(find.text('BDS dag map'), findsOneWidget);
      expect(find.text('More layers'), findsNothing);
      expect(find.text('Show the map'), findsNothing);
      expect(find.textContaining('member-marked approximate'), findsOneWidget);
      expect(find.byTooltip('Satellite'), findsOneWidget);
      expect(polygons(tester), 2, reason: 'rejected shapes still drawn');

      await tester.tap(find.text('Legend'));
      await _settle(tester);
      for (final l in ['Approved', 'Mine', 'Rejected', 'Disputed']) {
        expect(find.text(l), findsOneWidget, reason: l);
      }
    });
  });

  group('map_wizard', () {
    testWidgets('no tile layer until "Show the map" is tapped', (tester) async {
      await pumpPage(tester, wizard: true);

      expect(find.byType(TileLayer), findsNothing);
      expect(find.text('Show the map'), findsOneWidget);
      expect(find.text('Uses internet data'), findsOneWidget);
      expect(find.text('BDS dag map'), findsNothing, reason: 'tabs replaced');

      await tester.tap(find.text('Show the map'));
      await _settle(tester);

      expect(find.byType(TileLayer), findsOneWidget);
      expect(find.text('Show the map'), findsNothing);
      expect(MapTileSession.ok, isTrue);
    });

    testWidgets('a choice made earlier in the session is respected',
        (tester) async {
      MapTileSession.remember();
      await pumpPage(tester, wizard: true);

      expect(find.byType(TileLayer), findsOneWidget);
      expect(find.text('Show the map'), findsNothing);
    });

    testWidgets('data saver asks on every visit even after agreeing',
        (tester) async {
      MapTileSession.remember();
      await pumpPage(tester, wizard: true, dataSaver: true);

      expect(find.byType(TileLayer), findsNothing);
      expect(find.text('Show the map'), findsOneWidget);
    });

    testWidgets('the layers sheet switches the view', (tester) async {
      await pumpPage(tester, wizard: true);

      await tester.tap(find.text('More layers'));
      await _settle(tester);
      expect(find.text('RAJUK RS plots'), findsOneWidget);
      expect(find.text('Satellite'), findsOneWidget);

      await tester.tap(find.byKey(const Key('layerView_bds')));
      await _settle(tester);
      verify(() => landRepo.plotsInBbox(LandLayer.bds, any())).called(1);
    });

    testWidgets('satellite is hidden from the layers sheet under data saver',
        (tester) async {
      await pumpPage(tester, wizard: true, dataSaver: true);
      await tester.tap(find.text('More layers'));
      await _settle(tester);
      expect(find.text('Satellite'), findsNothing);
    });

    testWidgets('legend has three coloured words; rejected is not drawn',
        (tester) async {
      await pumpPage(tester, wizard: true);

      await tester.tap(find.text('Legend'));
      await _settle(tester);
      for (final l in ['Approved', 'Mine', 'Waiting']) {
        expect(find.text(l), findsOneWidget, reason: l);
      }
      expect(find.text('Rejected'), findsNothing);
      expect(find.text('Disputed'), findsNothing);
      expect(find.byTooltip('Satellite'), findsNothing);
      expect(polygons(tester), 1);
    });

    testWidgets('the short notice expands to the full text', (tester) async {
      await pumpPage(tester, wizard: true);

      expect(find.textContaining('approximate boundary'), findsOneWidget);
      expect(find.byKey(const Key('shortNoticeFull')), findsNothing);
      await tester.tap(find.byKey(const Key('shortNoticeMore')));
      await _settle(tester);
      expect(find.byKey(const Key('shortNoticeFull')), findsOneWidget);
    });

    testWidgets('the first-time tour shows once and can be replayed',
        (tester) async {
      when(() => prefs.mapTourDone).thenReturn(false);
      await pumpPage(tester, wizard: true);

      expect(find.byKey(const Key('mapTourCard')), findsOneWidget);
      expect(find.textContaining('government mouza map, RAJUK'), findsOneWidget);
      expect(find.text('1 of 4'), findsOneWidget);

      for (var i = 0; i < 3; i++) {
        await tester.tap(find.byKey(const Key('tourNext')));
        await _settle(tester);
      }
      expect(find.text('4 of 4'), findsOneWidget);
      expect(find.text('Got it'), findsOneWidget);
      await tester.tap(find.byKey(const Key('tourNext')));
      await _settle(tester);

      expect(find.byKey(const Key('mapTourCard')), findsNothing);
      verify(() => prefs.setMapTourDone(true)).called(1);

      await tester.tap(find.byKey(const Key('mapHelpMenu')));
      await _settle(tester);
      await tester.tap(find.text('Show the tour again'));
      await _settle(tester);
      expect(find.byKey(const Key('mapTourCard')), findsOneWidget);
    });

    testWidgets('skipping the tour remembers it; seen tours do not show',
        (tester) async {
      when(() => prefs.mapTourDone).thenReturn(false);
      await pumpPage(tester, wizard: true);
      await tester.tap(find.byKey(const Key('tourSkip')));
      await _settle(tester);
      expect(find.byKey(const Key('mapTourCard')), findsNothing);
      verify(() => prefs.setMapTourDone(true)).called(1);

      await tester.pumpWidget(const SizedBox());
      when(() => prefs.mapTourDone).thenReturn(true);
      await pumpPage(tester, wizard: true);
      expect(find.byKey(const Key('mapTourCard')), findsNothing);
    });
  });
}

Future<void> _settle(WidgetTester tester) async {
  for (var i = 0; i < 8; i++) {
    await tester.pump(const Duration(milliseconds: 60));
  }
}
