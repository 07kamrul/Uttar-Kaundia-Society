"""Match a member-drawn boundary to the RS dag (RAJUK masterplan) polygons.

The match is the intersection-over-union of the drawn ring and each candidate
RS polygon, as a percentage, and is always recomputed server-side at submit
time so the stored value cannot be spoofed by the client. It is reference info
for the reviewing committee, not an ownership claim.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Iterable

from app.services import geo
from app.services.land_data import get_land_data_provider

# Pad the drawn bbox so RS parcels that only partly overlap are still fetched.
_BBOX_PAD_DEG = 0.0005
# Edge-touching neighbours clip to ~0; ignore numerical dust.
_MIN_INTERSECTION_SQM = 0.5


@dataclass(frozen=True)
class RsMatch:
    rs_plot_no: str
    match_pct: float


def _outer_ring(geometry: dict | None) -> list[list[float]] | None:
    if not geometry or geometry.get("type") != "Polygon":
        return None
    rings = geometry.get("coordinates") or []
    return rings[0] if rings else None


def _iou_pct(drawn: list[list[float]], other: list[list[float]]) -> float:
    inter = geo.intersection_area_sqm(drawn, other, skip_overlap_gate=True)
    if inter < _MIN_INTERSECTION_SQM:
        return 0.0
    union = geo.geodesic_area_sqm(drawn) + geo.geodesic_area_sqm(other) - inter
    if union <= 0:
        return 0.0
    return round(min(100.0, inter / union * 100.0), 1)


def best_match(drawn_geometry: dict, features: Iterable[dict[str, Any]]) -> RsMatch | None:
    drawn = _outer_ring(drawn_geometry)
    if drawn is None:
        return None
    best: RsMatch | None = None
    for feature in features:
        ring = _outer_ring(feature.get("geometry"))
        rs_no = (feature.get("properties") or {}).get("rs_plot_no")
        if ring is None or not rs_no:
            continue
        pct = _iou_pct(drawn, ring)
        if pct > 0 and (best is None or pct > best.match_pct):
            best = RsMatch(rs_plot_no=str(rs_no), match_pct=pct)
    return best


def match_for_geometry(drawn_geometry: dict, provider: Any | None = None) -> RsMatch | None:
    drawn = _outer_ring(drawn_geometry)
    if drawn is None:
        return None
    provider = provider or get_land_data_provider()
    lngs = [p[0] for p in drawn]
    lats = [p[1] for p in drawn]
    bbox = (
        min(lngs) - _BBOX_PAD_DEG,
        min(lats) - _BBOX_PAD_DEG,
        max(lngs) + _BBOX_PAD_DEG,
        max(lats) + _BBOX_PAD_DEG,
    )
    return best_match(drawn_geometry, provider.masterplan_features_in_bbox(bbox))
