from app.services import rs_match


def _square(lng: float, lat: float, size: float = 0.0004) -> dict:
    ring = [
        [lng, lat],
        [lng + size, lat],
        [lng + size, lat + size],
        [lng, lat + size],
        [lng, lat],
    ]
    return {"type": "Polygon", "coordinates": [ring]}


def _rs(rs_no: str, geometry: dict) -> dict:
    return {"type": "Feature", "properties": {"rs_plot_no": rs_no}, "geometry": geometry}


def test_identical_polygon_matches_fully():
    drawn = _square(90.3366, 23.8012)
    match = rs_match.best_match(drawn, [_rs("RS-1", drawn)])
    assert match is not None
    assert match.rs_plot_no == "RS-1"
    assert match.match_pct >= 99.0


def test_partial_overlap_scores_between_zero_and_hundred():
    drawn = _square(90.3366, 23.8012)
    shifted = _square(90.3368, 23.8012)  # half-shifted
    match = rs_match.best_match(drawn, [_rs("RS-2", shifted)])
    assert match is not None
    assert 20.0 < match.match_pct < 60.0


def test_picks_best_of_several_candidates():
    drawn = _square(90.3366, 23.8012)
    far = _square(90.3366, 23.8100)
    match = rs_match.best_match(drawn, [_rs("RS-FAR", far), _rs("RS-NEAR", drawn)])
    assert match is not None
    assert match.rs_plot_no == "RS-NEAR"


def test_no_overlap_returns_none():
    drawn = _square(90.3366, 23.8012)
    assert rs_match.best_match(drawn, [_rs("RS-FAR", _square(90.4, 23.9))]) is None


def test_ignores_features_without_polygon_geometry():
    drawn = _square(90.3366, 23.8012)
    bad = {"type": "Feature", "properties": {"rs_plot_no": "RS-X"}, "geometry": None}
    assert rs_match.best_match(drawn, [bad]) is None


def test_match_for_geometry_uses_provider_bbox():
    drawn = _square(90.336616, 23.801159)

    class FakeProvider:
        def masterplan_features_in_bbox(self, bbox, limit=500):
            assert bbox[0] < bbox[2] and bbox[1] < bbox[3]
            return [_rs("RS-9", drawn)]

    match = rs_match.match_for_geometry(drawn, provider=FakeProvider())
    assert match is not None and match.rs_plot_no == "RS-9"
