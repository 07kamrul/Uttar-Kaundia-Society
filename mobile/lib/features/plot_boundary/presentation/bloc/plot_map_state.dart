part of 'plot_map_bloc.dart';

enum PlotMapStatus { initial, loading, loaded, failure }

enum OwnerLoadStatus { idle, loading, loaded, failure }

class PlotMapState extends Equatable {
  const PlotMapState({
    this.status = PlotMapStatus.initial,
    this.features,
    this.bbox,
    this.layer = MapLayer.street,
    this.selectedBoundaryId,
    this.highlightedBoundaryId,
    this.ownerStatus = OwnerLoadStatus.idle,
    this.owner,
    this.ownerFailureKind,
    this.failureKind,
    this.tilesRequested = true,
  });

  final PlotMapStatus status;
  final List<BoundaryFeature>? features;
  final SocietyBbox? bbox;
  final MapLayer layer;
  final String? selectedBoundaryId;
  final String? highlightedBoundaryId;

  final OwnerLoadStatus ownerStatus;
  final BoundaryOwner? owner;

  /// Set when the owner lookup fails (rate limit, not approved, network...).
  final PlotBoundaryFailureKind? ownerFailureKind;
  final PlotBoundaryFailureKind? failureKind;

  /// map_wizard data-saver start: false until the member taps "মানচিত্র
  /// দেখুন", so no basemap tile is downloaded before then. Always true with
  /// the flag off.
  final bool tilesRequested;

  BoundaryFeature? get selectedFeature {
    final id = selectedBoundaryId;
    if (id == null) return null;
    for (final f in features ?? const <BoundaryFeature>[]) {
      if (f.boundaryId == id) return f;
    }
    return null;
  }

  PlotMapState copyWith({
    PlotMapStatus? status,
    List<BoundaryFeature>? features,
    SocietyBbox? bbox,
    MapLayer? layer,
    String? selectedBoundaryId,
    String? highlightedBoundaryId,
    bool clearSelectedBoundary = false,
    bool clearHighlighted = false,
    OwnerLoadStatus? ownerStatus,
    BoundaryOwner? owner,
    bool clearOwner = false,
    PlotBoundaryFailureKind? ownerFailureKind,
    bool clearOwnerFailure = false,
    PlotBoundaryFailureKind? failureKind,
    bool clearFailure = false,
    bool? tilesRequested,
  }) {
    return PlotMapState(
      status: status ?? this.status,
      features: features ?? this.features,
      bbox: bbox ?? this.bbox,
      layer: layer ?? this.layer,
      selectedBoundaryId: clearSelectedBoundary
          ? null
          : (selectedBoundaryId ?? this.selectedBoundaryId),
      highlightedBoundaryId: clearHighlighted
          ? null
          : (highlightedBoundaryId ?? this.highlightedBoundaryId),
      ownerStatus: ownerStatus ?? this.ownerStatus,
      owner: clearOwner ? null : (owner ?? this.owner),
      ownerFailureKind: clearOwnerFailure
          ? null
          : (ownerFailureKind ?? this.ownerFailureKind),
      failureKind: clearFailure ? null : (failureKind ?? this.failureKind),
      tilesRequested: tilesRequested ?? this.tilesRequested,
    );
  }

  @override
  List<Object?> get props => [
        status,
        features,
        bbox,
        layer,
        selectedBoundaryId,
        highlightedBoundaryId,
        ownerStatus,
        owner,
        ownerFailureKind,
        failureKind,
        tilesRequested,
      ];
}
