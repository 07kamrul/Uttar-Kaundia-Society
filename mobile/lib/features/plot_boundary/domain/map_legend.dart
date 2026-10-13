import 'plot_boundary_entities.dart';

/// The three colours of the simplified legend (map_wizard).
enum MapLegendKind { approved, mine, pending }

extension MapLegendKindX on MapLegendKind {
  /// Light-theme colour from the Batch 4 contract (ARGB).
  int get lightArgb => switch (this) {
        MapLegendKind.approved => 0xFF2E7D32,
        MapLegendKind.mine => 0xFF1E66D0,
        MapLegendKind.pending => 0xFFC9861E,
      };

  /// Lighter counterpart readable on a dark map background (ARGB).
  int get darkArgb => switch (this) {
        MapLegendKind.approved => 0xFF81C784,
        MapLegendKind.mine => 0xFF64B5F6,
        MapLegendKind.pending => 0xFFE0B050,
      };
}

/// Which legend colour a map shape uses; null means the shape is not drawn
/// at all. Rejected, withdrawn and superseded shapes (the latter two arrive
/// as [BoundaryStatus.draft]) stay in "my boundaries" with a status word.
/// Disputed shapes keep their base colour; the info sheet says "dispute".
MapLegendKind? legendKindFor(BoundaryStatus status, {required bool isMine}) {
  switch (status) {
    case BoundaryStatus.rejected:
    case BoundaryStatus.draft:
      return null;
    case BoundaryStatus.approved:
    case BoundaryStatus.disputed:
      return isMine ? MapLegendKind.mine : MapLegendKind.approved;
    case BoundaryStatus.pendingReview:
      return isMine ? MapLegendKind.mine : MapLegendKind.pending;
  }
}

/// My own shape that is still waiting for review is drawn dashed.
bool legendDashed(BoundaryStatus status, {required bool isMine}) =>
    isMine && status == BoundaryStatus.pendingReview;
