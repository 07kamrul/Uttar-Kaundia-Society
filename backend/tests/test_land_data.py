"""Tests for the local land dataset provider and its /api/land endpoints.

The suite must pass offline: a socket-blocking fixture fails loudly if any
test tries to open a network connection, proving the endpoints never call the
former external map sources.
"""

import socket

import pytest

from app.core.security import create_access_token
from app.models.member import Member, MemberStatus
from app.models.property import Property
from app.services.land_data import (
    LandDataError,
    LocalJsonLandDataProvider,
    get_land_data_provider,
)

pytestmark = pytest.mark.asyncio


@pytest.fixture(autouse=True)
def _no_network(monkeypatch):
    """Any outbound connection inside these tests is a regression: the whole
    point of the local dataset is that the app never dials out for land data."""

    def _blocked(*args, **kwargs):
        raise AssertionError(f"network access attempted: {args}")

    monkeypatch.setattr(socket, "create_connection", _blocked)
    monkeypatch.setattr(socket.socket, "connect", _blocked)


@pytest.fixture
def provider() -> LocalJsonLandDataProvider:
    return get_land_data_provider()


def _member_headers(member: Member) -> dict:
    return {"Authorization": f"Bearer {create_access_token(str(member.id), 'member')}"}


async def _approved_member(db_session, name: str, status: MemberStatus = MemberStatus.APPROVED) -> Member:
    member = Member(
        status=status,
        full_name=name,
        father_or_husband=f"Father{name}",
        mother=f"Mother{name}",
        dob="1970-02-03",
        nationality="Bangladeshi",
        occupation="Farmer",
        nid=f"99776655{name[-2:]}",
        mobile=f"0171122334{name[-2:]}",
        gender="পুরুষ",
        email=f"{name.lower()}@example.com",
        permanent_house="House",
        admission_fee="500",
        subscription="100",
        receipt_no=f"RCPT-{name}",
        payment_method="Cash",
        submission_date="2026-01-01",
        show_in_neighbour_directory=True,
    )
    member.properties = [
        Property(
            property_type=["plot"],
            khatian_no="K-1",
            dag_no_rs="101",
            dag_no_cs="91",
            land_quantity="5",
            ownership="single",
        )
    ]
    db_session.add(member)
    await db_session.commit()
    await db_session.refresh(member, attribute_names=["properties"])
    return member


# ---- provider -------------------------------------------------------------


def test_provider_loads_dataset(provider):
    meta = provider.dataset_meta()
    assert meta["counts"]["dags"] > 6000
    assert "sha256" not in meta  # integrity data is not client-facing
    assert provider.list_sheets("bds")
    assert provider.list_sheets("nonexistent") == []


def test_provider_get_dag_and_bangla_digits(provider):
    feature = provider.get_dag("bds", "001", "13")
    assert feature is not None
    assert feature["properties"]["dag"] == "13"
    assert feature["geometry"]["type"] == "Polygon"
    # coordinates are [lng, lat] with Bangladesh ranges
    ring = feature["geometry"]["coordinates"][0]
    lng, lat = ring[0]
    assert 86 < lng < 94 and 20 < lat < 28
    # zero-padding and Bangla digits both normalize to the same feature
    assert provider.get_dag("bds", "1", "13") is feature
    bangla = provider.get_dag("bds", "০০১", "১৩")
    assert bangla is not None


def test_provider_missing_dag_is_none(provider):
    assert provider.get_dag("bds", "001", "999999") is None


def test_provider_find_dags(provider):
    hits = provider.find_dags("bds", "১৩")
    assert hits and all(h["properties"]["dag"] == "13" for h in hits)


def test_provider_masterplan_find_accepts_digits_prefix_and_bangla(provider):
    feature = provider.masterplan_features_in_bbox(
        (90.3039, 23.7851, 90.3423, 23.8327), limit=1
    )
    assert feature, "overlay dataset must be present for this test"
    rs = feature[0]["properties"]["rs_plot_no"]  # e.g. "RS-4611"
    digits = rs.split("-")[-1]
    bangla = digits.translate(str.maketrans("0123456789", "০১২৩৪৫৬৭৮৯"))
    for query in (rs, digits.lower(), bangla):
        hits = provider.masterplan_find(query)
        assert hits, query
        assert all(h["properties"]["rs_plot_no"] == rs for h in hits)


def test_provider_masterplan_find_missing_is_empty(provider):
    assert provider.masterplan_find("9999999") == []


def test_provider_bbox_query_inside_mouza(provider):
    features = provider.features_in_bbox((90.326, 23.820, 90.335, 23.830), limit=50)
    assert features
    assert len(features) <= 50
    for f in features:
        lng, lat = provider._centroid_of(f)
        assert 90.326 <= lng <= 90.335 and 23.820 <= lat <= 23.830


def test_startup_fails_on_missing_dataset(tmp_path, monkeypatch):
    monkeypatch.setattr("app.services.land_data.get_settings", lambda: type(
        "S", (), {"land_data_dir": str(tmp_path / "nope")})())
    get_land_data_provider.cache_clear()
    with pytest.raises(LandDataError, match="missing"):
        get_land_data_provider()
    get_land_data_provider.cache_clear()


def test_startup_fails_on_checksum_mismatch(provider, tmp_path, monkeypatch):
    import shutil

    root = tmp_path / "tampered"
    shutil.copytree(provider.root, root)
    (root / "sheets.json").write_text("{}")  # content no longer matches meta sha256
    monkeypatch.setattr("app.services.land_data.get_settings", lambda: type(
        "S", (), {"land_data_dir": str(root)})())
    get_land_data_provider.cache_clear()
    with pytest.raises(LandDataError, match="checksum"):
        get_land_data_provider()
    get_land_data_provider.cache_clear()


# ---- endpoints ------------------------------------------------------------


async def test_endpoints_require_auth(client):
    assert (await client.get("/api/land/meta")).status_code == 401
    assert (await client.get("/api/land/dags", params={"bbox": "90.32,23.82,90.33,23.83"})).status_code == 401
    assert (await client.get("/api/land/dag/bds/001/13")).status_code == 401
    assert (await client.get("/api/land/dag/bds/lookup/13")).status_code == 401
    assert (await client.get("/api/land/masterplan", params={"bbox": "90.32,23.82,90.33,23.83"})).status_code == 401
    assert (await client.get("/api/land/masterplan/lookup/4611")).status_code == 401


async def test_dags_requires_bbox(client, db_session):
    member = await _approved_member(db_session, "BboxMember")
    resp = await client.get("/api/land/dags", headers=_member_headers(member))
    assert resp.status_code == 422


async def test_dags_happy_path(client, db_session):
    member = await _approved_member(db_session, "LandMember")
    resp = await client.get(
        "/api/land/dags",
        params={"bbox": "90.326,23.820,90.335,23.830"},
        headers=_member_headers(member),
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["type"] == "FeatureCollection"
    assert body["count"] > 0
    props = body["features"][0]["properties"]
    # no personal data in the served payload
    assert set(props) <= {"survey", "sheet", "dag", "label_bn", "area_sqm"}


async def test_full_mouza_not_truncated_by_default_cap(client, db_session, provider):
    """The whole mouza is visible in one viewport, so the default result cap
    must cover the entire dataset — a lower cap silently drops whole sheets
    from the map (the member just sees blank areas)."""
    member = await _approved_member(db_session, "FullMouzaMember")
    resp = await client.get(
        "/api/land/dags",
        params={"bbox": "90.295,23.78,90.36,23.84"},
        headers=_member_headers(member),
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["truncated"] is False
    assert body["count"] == provider.dataset_meta()["counts"]["dags"]


async def test_pending_member_forbidden(client, db_session):
    member = await _approved_member(db_session, "PendingMember", MemberStatus.PENDING)
    resp = await client.get(
        "/api/land/dags",
        params={"bbox": "90.326,23.820,90.335,23.830"},
        headers=_member_headers(member),
    )
    assert resp.status_code == 403


async def test_single_dag_404(client, db_session):
    member = await _approved_member(db_session, "MissingDagMember")
    ok = await client.get("/api/land/dag/bds/001/13", headers=_member_headers(member))
    assert ok.status_code == 200
    assert {"total_land", "khatians", "mouza", "source"} <= ok.json().keys()
    missing = await client.get("/api/land/dag/bds/001/999999", headers=_member_headers(member))
    assert missing.status_code == 404


async def test_masterplan_overlay(client, db_session):
    member = await _approved_member(db_session, "MasterplanMember")
    resp = await client.get(
        "/api/land/masterplan",
        params={"bbox": "90.3039,23.7851,90.3423,23.8327"},
        headers=_member_headers(member),
    )
    assert resp.status_code == 200
    assert resp.json()["count"] > 0


async def test_masterplan_lookup_happy_path(client, db_session):
    member = await _approved_member(db_session, "RsLookupMember")
    bbox = {"bbox": "90.3039,23.7851,90.3423,23.8327"}
    sample = await client.get("/api/land/masterplan", params=bbox, headers=_member_headers(member))
    rs = sample.json()["features"][0]["properties"]["rs_plot_no"]

    resp = await client.get(f"/api/land/masterplan/lookup/{rs}", headers=_member_headers(member))
    assert resp.status_code == 200
    body = resp.json()
    assert body["type"] == "FeatureCollection"
    assert body["count"] >= 1
    assert all(f["properties"]["rs_plot_no"] == rs for f in body["features"])

    # the same plot is reachable without the RS- prefix and via Bangla digits
    digits = rs.split("-")[-1]
    for query in (digits, digits.translate(str.maketrans("0123456789", "০১২৩৪৫৬৭৮৯"))):
        alt = await client.get(f"/api/land/masterplan/lookup/{query}", headers=_member_headers(member))
        assert alt.status_code == 200
        assert alt.json()["count"] == body["count"]


async def test_masterplan_lookup_unknown_plot_is_empty_collection(client, db_session):
    member = await _approved_member(db_session, "RsLookupMissing")
    resp = await client.get(
        "/api/land/masterplan/lookup/9999999", headers=_member_headers(member)
    )
    assert resp.status_code == 200
    assert resp.json() == {"type": "FeatureCollection", "count": 0, "features": []}


def test_provider_reads_each_dataset_file_once(provider, monkeypatch):
    """Startup cost is disk-bound: verifying a checksum and then parsing the
    same file must not read it from disk twice."""
    from collections import Counter
    from pathlib import Path

    reads: Counter = Counter()
    real_read_bytes, real_read_text = Path.read_bytes, Path.read_text

    def counting_read_bytes(self):
        reads[str(self)] += 1
        return real_read_bytes(self)

    def counting_read_text(self, *args, **kwargs):
        reads[str(self)] += 1
        return real_read_text(self, *args, **kwargs)

    monkeypatch.setattr(Path, "read_bytes", counting_read_bytes)
    monkeypatch.setattr(Path, "read_text", counting_read_text)
    LocalJsonLandDataProvider(provider.root)

    assert reads, "provider must read the dataset"
    twice = {path: n for path, n in reads.items() if n > 1}
    assert not twice, f"files read more than once: {sorted(twice)[:3]}"


async def test_dags_bbox_payload_matches_provider_features(client, db_session, provider):
    member = await _approved_member(db_session, "DagsPayloadMember")
    bbox = (90.326, 23.820, 90.335, 23.830)
    resp = await client.get(
        "/api/land/dags",
        params={"bbox": ",".join(map(str, bbox))},
        headers=_member_headers(member),
    )
    assert resp.status_code == 200
    assert resp.headers["content-type"].startswith("application/json")
    assert resp.json()["features"] == provider.features_in_bbox(bbox, limit=10_000)


async def test_masterplan_bbox_payload_drops_unused_search_field(client, db_session, provider):
    member = await _approved_member(db_session, "MasterplanTrimMember")
    bbox = (90.3039, 23.7851, 90.3423, 23.8327)
    resp = await client.get(
        "/api/land/masterplan",
        params={"bbox": ",".join(map(str, bbox))},
        headers=_member_headers(member),
    )
    assert resp.status_code == 200
    served = resp.json()["features"]
    expected = provider.masterplan_features_in_bbox(bbox, limit=10_000)
    assert len(served) == len(expected) > 0
    assert all("address_search" not in f["properties"] for f in served)
    assert served[0]["geometry"] == expected[0]["geometry"]
    assert served[0]["properties"]["rs_plot_no"] == expected[0]["properties"]["rs_plot_no"]


async def test_bbox_layers_report_truncation_at_cap(client, db_session, monkeypatch):
    from app.core.config import get_settings

    monkeypatch.setattr(get_settings(), "land_map_result_cap", 1)
    member = await _approved_member(db_session, "CapMember")
    for path in ("/api/land/dags", "/api/land/masterplan"):
        resp = await client.get(
            path, params={"bbox": "90.295,23.78,90.36,23.84"}, headers=_member_headers(member)
        )
        body = resp.json()
        assert (body["count"], body["truncated"], len(body["features"])) == (1, True, 1), path


async def test_bbox_layers_revalidate_with_etag(client, db_session):
    """The dataset only changes on redeploy, so repeat map loads must cost a
    304 instead of re-downloading every polygon."""
    member = await _approved_member(db_session, "EtagMember")
    headers = _member_headers(member)
    for path in ("/api/land/dags", "/api/land/masterplan"):
        params = {"bbox": "90.326,23.820,90.335,23.830"}
        first = await client.get(path, params=params, headers=headers)
        etag = first.headers["etag"]
        assert "private" in first.headers["cache-control"]

        again = await client.get(path, params=params, headers={**headers, "If-None-Match": etag})
        assert again.status_code == 304
        assert again.content == b""

        other = await client.get(path, params={"bbox": "90.30,23.79,90.34,23.83"}, headers=headers)
        assert other.headers["etag"] != etag

        anonymous = await client.get(path, params=params, headers={"If-None-Match": etag})
        assert anonymous.status_code == 401


async def test_dag_lookup_endpoint(client, db_session):
    member = await _approved_member(db_session, "DagLookupMember")
    resp = await client.get("/api/land/dag/bds/lookup/১৩", headers=_member_headers(member))
    assert resp.status_code == 200
    body = resp.json()
    assert body["count"] >= 1
    assert all(f["properties"]["dag"] == "13" for f in body["features"])
