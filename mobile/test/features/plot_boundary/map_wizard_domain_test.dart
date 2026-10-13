import 'package:bloc_test/bloc_test.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:kaundia_app/core/network/api_exception.dart';
import 'package:kaundia_app/features/plot_boundary/domain/land_data_repository.dart';
import 'package:kaundia_app/features/plot_boundary/domain/land_entities.dart';
import 'package:kaundia_app/features/plot_boundary/domain/map_legend.dart';
import 'package:kaundia_app/features/plot_boundary/domain/plot_boundary_entities.dart';
import 'package:kaundia_app/features/plot_boundary/domain/rs_match.dart';
import 'package:kaundia_app/features/plot_boundary/presentation/bloc/rs_lookup_cubit.dart';
import 'package:latlong2/latlong.dart';
import 'package:mocktail/mocktail.dart';

class _MockLandRepo extends Mock implements LandDataRepository {}

// ~110 m square.
const _base = [
  LatLng(23.8000, 90.3000),
  LatLng(23.8010, 90.3000),
  LatLng(23.8010, 90.3010),
  LatLng(23.8000, 90.3010),
];

// The same square shifted east by half its width.
const _half = [
  LatLng(23.8000, 90.3005),
  LatLng(23.8010, 90.3005),
  LatLng(23.8010, 90.3015),
  LatLng(23.8000, 90.3015),
];

// Far away.
const _far = [
  LatLng(23.8200, 90.3300),
  LatLng(23.8210, 90.3300),
  LatLng(23.8210, 90.3310),
  LatLng(23.8200, 90.3310),
];

LandPlot _plot(List<LatLng> ring, {String? rs, String? sheet}) =>
    LandPlot(rings: [ring], rsPlotNo: rs, sheet: sheet);

void main() {
  group('legendKindFor (map_wizard legend)', () {
    test('approved shapes of others are green, mine are blue', () {
      expect(legendKindFor(BoundaryStatus.approved, isMine: false),
          MapLegendKind.approved);
      expect(legendKindFor(BoundaryStatus.approved, isMine: true),
          MapLegendKind.mine);
    });

    test('waiting shapes are amber, but mine stay blue', () {
      expect(legendKindFor(BoundaryStatus.pendingReview, isMine: false),
          MapLegendKind.pending);
      expect(legendKindFor(BoundaryStatus.pendingReview, isMine: true),
          MapLegendKind.mine);
    });

    test('rejected, withdrawn and superseded shapes are not drawn', () {
      expect(legendKindFor(BoundaryStatus.rejected, isMine: true), isNull);
      expect(legendKindFor(BoundaryStatus.rejected, isMine: false), isNull);
      for (final raw in ['withdrawn', 'superseded', 'draft']) {
        final status = BoundaryStatusX.fromName(raw);
        expect(legendKindFor(status, isMine: true), isNull, reason: raw);
        expect(legendKindFor(status, isMine: false), isNull, reason: raw);
      }
    });

    test('disputed shapes keep their base colour', () {
      expect(legendKindFor(BoundaryStatus.disputed, isMine: false),
          MapLegendKind.approved);
      expect(legendKindFor(BoundaryStatus.disputed, isMine: true),
          MapLegendKind.mine);
    });

    test('only my waiting shape is dashed', () {
      expect(legendDashed(BoundaryStatus.pendingReview, isMine: true), isTrue);
      expect(legendDashed(BoundaryStatus.approved, isMine: true), isFalse);
      expect(legendDashed(BoundaryStatus.pendingReview, isMine: false), isFalse);
    });

    test('uses the contract colours', () {
      expect(MapLegendKind.approved.lightArgb, 0xFF2E7D32);
      expect(MapLegendKind.mine.lightArgb, 0xFF1E66D0);
      expect(MapLegendKind.pending.lightArgb, 0xFFC9861E);
    });
  });

  group('bestRsMatch', () {
    test('identical shapes match fully and do not diverge', () {
      final m = bestRsMatch(_base, [_plot(_base, rs: '4611')])!;
      expect(m.rsPlotNo, '4611');
      expect(m.matchPct, greaterThan(97));
      expect(m.diverges, isFalse);
    });

    test('a half-shifted copy is about one third (intersection over union)', () {
      final m = bestRsMatch(_half, [_plot(_base, rs: '4611')])!;
      expect(m.matchPct, closeTo(33.3, 4));
      expect(m.diverges, isTrue);
    });

    test('the threshold is 60 percent', () {
      expect(kRsDivergenceThresholdPct, 60);
    });

    test('picks the best of several candidates', () {
      final m = bestRsMatch(_base, [
        _plot(_half, rs: '1'),
        _plot(_base, rs: '2'),
        _plot(_far, rs: '3'),
      ])!;
      expect(m.rsPlotNo, '2');
    });

    test('no overlap, no candidates or a degenerate drawing gives null', () {
      expect(bestRsMatch(_base, [_plot(_far, rs: '9')]), isNull);
      expect(bestRsMatch(_base, const []), isNull);
      expect(bestRsMatch(_base.take(2).toList(), [_plot(_base, rs: '1')]), isNull);
    });

    test('a candidate without any plot number is labelled by its dag', () {
      final m = bestRsMatch(
        _base,
        [LandPlot(rings: const [_base], dag: '77')],
      )!;
      expect(m.rsPlotNo, '77');
    });
  });

  group('RsLookupCubit', () {
    late _MockLandRepo repo;

    setUpAll(() => registerFallbackValue(LandLayer.rajuk));
    setUp(() => repo = _MockLandRepo());

    blocTest<RsLookupCubit, RsLookupState>(
      'looks the dag up on the RAJUK layer and keeps every candidate',
      build: () {
        when(() => repo.lookup(LandLayer.rajuk, '4611')).thenAnswer(
          (_) async => LandCollection(plots: [
            _plot(_base, rs: '4611', sheet: '12'),
            _plot(_half, rs: '4611', sheet: '13'),
          ]),
        );
        return RsLookupCubit(repository: repo);
      },
      act: (c) => c.lookup('4611'),
      expect: () => [
        isA<RsLookupState>()
            .having((s) => s.status, 'status', RsLookupStatus.loading)
            .having((s) => s.query, 'query', '4611'),
        isA<RsLookupState>()
            .having((s) => s.status, 'status', RsLookupStatus.found)
            .having((s) => s.candidates, 'candidates', hasLength(2))
            .having((s) => s.selected, 'selected', isNull),
      ],
    );

    blocTest<RsLookupCubit, RsLookupState>(
      'a single candidate is selected automatically',
      build: () {
        when(() => repo.lookup(LandLayer.rajuk, any())).thenAnswer(
          (_) async => LandCollection(plots: [_plot(_base, rs: '1')]),
        );
        return RsLookupCubit(repository: repo);
      },
      act: (c) => c.lookup('1'),
      verify: (c) => expect(c.state.selected, c.state.candidates.single),
    );

    blocTest<RsLookupCubit, RsLookupState>(
      'Bangla digits and an RS- prefix are accepted',
      build: () {
        when(() => repo.lookup(LandLayer.rajuk, any()))
            .thenAnswer((_) async => const LandCollection());
        return RsLookupCubit(repository: repo);
      },
      act: (c) => c.lookup(' RS-৪৬১১ '),
      verify: (c) {
        verify(() => repo.lookup(LandLayer.rajuk, '4611')).called(1);
        expect(c.state.status, RsLookupStatus.notFound);
      },
    );

    blocTest<RsLookupCubit, RsLookupState>(
      'the member picks one of several candidates',
      build: () {
        when(() => repo.lookup(LandLayer.rajuk, any())).thenAnswer(
          (_) async => LandCollection(plots: [
            _plot(_base, rs: '5', sheet: 'A'),
            _plot(_half, rs: '5', sheet: 'B'),
          ]),
        );
        return RsLookupCubit(repository: repo);
      },
      act: (c) async {
        await c.lookup('5');
        c.select(1);
      },
      verify: (c) => expect(c.state.selected?.sheet, 'B'),
    );

    blocTest<RsLookupCubit, RsLookupState>(
      'a failed lookup is reported so the member can retry or draw',
      build: () {
        when(() => repo.lookup(LandLayer.rajuk, any()))
            .thenThrow(const ApiException(type: ApiExceptionType.network));
        return RsLookupCubit(repository: repo);
      },
      act: (c) => c.lookup('9'),
      verify: (c) => expect(c.state.status, RsLookupStatus.failure),
    );

    blocTest<RsLookupCubit, RsLookupState>(
      'an empty query does nothing and reset clears the result',
      build: () => RsLookupCubit(repository: repo),
      act: (c) {
        c.lookup('   ');
        c.reset();
      },
      expect: () => [isA<RsLookupState>()
          .having((s) => s.status, 'status', RsLookupStatus.idle)],
      verify: (_) => verifyNever(() => repo.lookup(any(), any())),
    );
  });
}
