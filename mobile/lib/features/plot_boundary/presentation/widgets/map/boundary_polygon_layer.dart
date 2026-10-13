import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';

import '../../../domain/dag_number.dart';
import '../../../domain/map_legend.dart';
import '../../../domain/plot_boundary_entities.dart';
import '../boundary_status_style.dart';

/// Member-marked boundaries. Live shapes are solid; the owner's own pending
/// or rejected proposal is dashed. Features whose dag numbers do not match
/// [query] are hidden, and [highlightedId] is drawn thicker on top.
class BoundaryPolygonLayer extends StatefulWidget {
  const BoundaryPolygonLayer({
    super.key,
    required this.features,
    this.query = '',
    this.highlightedId,
    this.simplified = false,
  });

  final List<BoundaryFeature> features;
  final String query;
  final String? highlightedId;

  /// map_wizard: three legend colours; rejected, withdrawn and superseded
  /// shapes are not drawn at all.
  final bool simplified;

  static final RegExp _whitespace = RegExp(r'\s');

  static bool matches(BoundaryFeature feature, String query) {
    final needle = toAsciiDigits(query).replaceAll(_whitespace, '');
    if (needle.isEmpty) return true;
    return [feature.rsDag, feature.csDag].whereType<String>().any(
          (d) => toAsciiDigits(d).replaceAll(_whitespace, '').contains(needle),
        );
  }

  @override
  State<BoundaryPolygonLayer> createState() => _BoundaryPolygonLayerState();
}

class _BoundaryPolygonLayerState extends State<BoundaryPolygonLayer> {
  List<Polygon>? _polygons;
  Brightness? _brightness;

  @override
  void didUpdateWidget(BoundaryPolygonLayer old) {
    super.didUpdateWidget(old);
    if (!identical(old.features, widget.features) ||
        old.query != widget.query ||
        old.simplified != widget.simplified ||
        old.highlightedId != widget.highlightedId) {
      _polygons = null;
    }
  }

  List<Polygon> _build(BuildContext context) {
    final primary = Theme.of(context).colorScheme.primary;
    return [
      for (final f in widget.features)
        if (f.points.isNotEmpty &&
            BoundaryPolygonLayer.matches(f, widget.query) &&
            (!widget.simplified ||
                legendKindFor(f.status, isMine: f.isMine) != null))
          _polygon(context, f, primary),
    ];
  }

  Polygon _polygon(BuildContext context, BoundaryFeature f, Color primary) {
    final (fill, stroke) = widget.simplified
        ? BoundaryStatusStyle.legendColors(
            context,
            legendKindFor(f.status, isMine: f.isMine)!,
          )
        : BoundaryStatusStyle.colorsFor(
            context,
            status: f.status,
            isMine: f.isMine,
          );
    final isProposal = widget.simplified
        ? legendDashed(f.status, isMine: f.isMine)
        : f.isMine && f.status != BoundaryStatus.approved;
    final isHighlighted = f.boundaryId == widget.highlightedId;
    return Polygon(
      points: f.points,
      color: fill,
      borderColor: isHighlighted ? primary : stroke,
      borderStrokeWidth: isHighlighted ? 5 : 2,
      pattern: isProposal
          ? StrokePattern.dashed(segments: const [6, 6])
          : const StrokePattern.solid(),
    );
  }

  @override
  Widget build(BuildContext context) {
    final brightness = Theme.of(context).brightness;
    if (_brightness != brightness) {
      _brightness = brightness;
      _polygons = null;
    }
    return PolygonLayer(polygons: _polygons ??= _build(context));
  }
}
