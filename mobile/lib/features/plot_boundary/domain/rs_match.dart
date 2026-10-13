import 'package:equatable/equatable.dart';
import 'package:latlong2/latlong.dart';

import 'geo.dart';
import 'land_entities.dart';

/// Below this overlap the drawn shape is flagged as diverging from every RS dag.
const double kRsDivergenceThresholdPct = 60;

/// Samples per side of the grid used to estimate the overlap.
const int _gridSize = 64;

/// How well the drawn outline matches one RAJUK RS plot.
class RsMatch extends Equatable {
  const RsMatch({
    required this.rsPlotNo,
    required this.matchPct,
    required this.diverges,
  });

  final String rsPlotNo;

  /// Intersection over union of the two shapes, 0-100, one decimal.
  final double matchPct;
  final bool diverges;

  @override
  List<Object?> get props => [rsPlotNo, matchPct, diverges];
}

/// Intersection-over-union of [drawn] against each candidate RS plot. Returns
/// the best candidate, or null when nothing overlaps. Reference information
/// for the member and the committee, not an ownership claim. The overlap is
/// estimated on a sample grid (no geometry library): good to a few percent.
RsMatch? bestRsMatch(List<LatLng> drawn, Iterable<LandPlot> candidates) {
  if (drawn.length < 3) return null;
  RsMatch? best;
  for (final plot in candidates) {
    final label = plot.rsPlotNo ?? plot.dag ?? plot.plotNo;
    final rings = [
      for (final r in plot.rings)
        if (r.length >= 3) r,
    ];
    if (label == null || label.isEmpty || rings.isEmpty) continue;
    final pct = _overlapPct(drawn, rings);
    if (pct > 0 && (best == null || pct > best.matchPct)) {
      best = RsMatch(
        rsPlotNo: label,
        matchPct: pct,
        diverges: pct < kRsDivergenceThresholdPct,
      );
    }
  }
  return best;
}

double _overlapPct(List<LatLng> drawn, List<List<LatLng>> rings) {
  final box = SocietyBbox.around([drawn, ...rings].expand((r) => r));
  if (box == null) return 0;
  final dLat = (box.maxLat - box.minLat) / _gridSize;
  final dLng = (box.maxLng - box.minLng) / _gridSize;
  if (dLat <= 0 || dLng <= 0) return 0;
  var inDrawn = 0;
  var inPlot = 0;
  var inBoth = 0;
  for (var i = 0; i < _gridSize; i++) {
    final lat = box.minLat + (i + 0.5) * dLat;
    for (var j = 0; j < _gridSize; j++) {
      final p = LatLng(lat, box.minLng + (j + 0.5) * dLng);
      final a = pointInRing(p, drawn);
      final b = rings.any((r) => pointInRing(p, r));
      if (a) inDrawn++;
      if (b) inPlot++;
      if (a && b) inBoth++;
    }
  }
  final union = inDrawn + inPlot - inBoth;
  if (union == 0 || inBoth == 0) return 0;
  return (inBoth / union * 1000).roundToDouble() / 10;
}
