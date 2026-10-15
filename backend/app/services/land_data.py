"""Local land-record data provider (Uttar Kaundia BDS mouza map).

Replaces the former runtime proxies to the government map portals: the whole
dataset is ingested ahead of time by ``scripts/ingest_land_data/`` and shipped
as JSON/GeoJSON under ``data/uttar-kaundia/``. This module is the single
abstraction the app reads it through — nothing here performs network I/O.

Startup behaviour is fail-fast: missing files, corrupt JSON, or a checksum
mismatch against ``meta.json`` raise ``LandDataError``, which the app turns
into a clear boot failure (the map feature cannot work without the dataset,
and silently serving an empty map would hide the problem).

The map layer contains no personal data — only dag numbers and geometry.
Owner names live solely in ``khatians/<survey>/<sheet>.json`` and leave this
module only through ``get_dag_details`` (one dag at a time, never listed,
indexed or searched).
"""

from __future__ import annotations

import hashlib
import json
import logging
import math
from abc import ABC, abstractmethod
from collections.abc import Iterable
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path
from typing import NamedTuple

from app.core.config import get_settings

logger = logging.getLogger(__name__)

BBox = tuple[float, float, float, float]  # min_lng, min_lat, max_lng, max_lat

# Overlay properties the map layers never read; left out of the pre-serialized
# bbox payload (lookups still return the full feature).
MASTERPLAN_BBOX_OMIT = frozenset({"address_search"})


class _Row(NamedTuple):
    """One map polygon: centroid for the bbox scan, the feature itself, and
    its compact JSON encoding built once at load so bbox responses are a join
    of ready-made bytes instead of a per-request walk over every coordinate."""

    lng: float
    lat: float
    feature: dict
    json: bytes


@dataclass(frozen=True)
class _VerifiedDataset:
    meta: dict
    fingerprint: str  # sha256 of meta.json, which pins every file's checksum
    files: dict[str, bytes]  # checksum-verified raw bytes, keyed by relative path


class LandDataError(RuntimeError):
    """Raised when the local land dataset is missing, corrupt or tampered."""


class LandDataProvider(ABC):
    """Read-only view over the ingested land dataset."""

    @abstractmethod
    def list_sheets(self, survey: str) -> list[str]: ...

    @abstractmethod
    def get_dag(self, survey: str, sheet: str, dag: str) -> dict | None:
        """Full GeoJSON feature for one dag, or None."""

    @abstractmethod
    def get_dag_details(self, survey: str, sheet: str, dag: str) -> dict | None:
        """Official land details + khatian/owner rows for one dag, or None."""

    @abstractmethod
    def find_dags(self, survey: str, dag_no: str) -> list[dict]:
        """All features whose dag number equals ``dag_no`` in the survey."""

    @abstractmethod
    def features_in_bbox(self, bbox: BBox, limit: int = 500) -> list[dict]:
        """Features whose centroid intersects the bbox, capped at ``limit``."""

    @abstractmethod
    def dataset_meta(self) -> dict: ...

    @abstractmethod
    def masterplan_features_in_bbox(self, bbox: BBox, limit: int = 500) -> list[dict]:
        """RAJUK DAP overlay plots (may be empty when the overlay wasn't ingested)."""

    @abstractmethod
    def masterplan_find(self, rs_plot_no: str) -> list[dict]:
        """All overlay plots whose RS number equals ``rs_plot_no``."""

    @abstractmethod
    def features_json_in_bbox(self, bbox: BBox, limit: int = 500) -> list[bytes]:
        """``features_in_bbox`` as pre-encoded compact JSON, one item per feature."""

    @abstractmethod
    def masterplan_json_in_bbox(self, bbox: BBox, limit: int = 500) -> list[bytes]:
        """Overlay plots as pre-encoded JSON, without ``MASTERPLAN_BBOX_OMIT`` properties."""

    @property
    @abstractmethod
    def cache_tag(self) -> str:
        """Short token that changes whenever the dataset content changes."""


def _ascii_digits(text: str) -> str:
    return (text or "").translate(str.maketrans("০১২৩৪৫৬৭৮৯", "0123456789")).strip()


def _normalize_sheet(sheet: str) -> str:
    """Sheets are zero-padded 3-digit strings ("001"); accept "1" too."""
    s = _ascii_digits(str(sheet))
    if s.isdigit() and len(s) < 3:
        s = s.zfill(3)
    return s


def _compact_json(value: object) -> bytes:
    """Same encoding as Starlette's JSONResponse, so pre-built bytes and
    regular responses are byte-for-byte interchangeable."""
    return json.dumps(value, ensure_ascii=False, allow_nan=False, separators=(",", ":")).encode("utf-8")


def _rows_in_bbox(rows: Iterable[_Row], bbox: BBox, limit: int) -> list[_Row]:
    min_lng, min_lat, max_lng, max_lat = bbox
    out: list[_Row] = []
    for row in rows:
        if min_lng <= row.lng <= max_lng and min_lat <= row.lat <= max_lat:
            out.append(row)
            if len(out) >= limit:
                break
    return out


def _normalize_rs(rs_plot_no: str) -> str:
    """RS plots are stored as "RS-4611"; index and query them by digits only,
    so "4611", "RS-4611" and Bangla digits all match the same plot."""
    return _ascii_digits(str(rs_plot_no)).upper().replace("RS-", "").strip()


class LocalJsonLandDataProvider(LandDataProvider):
    """Loads data/uttar-kaundia into memory once and serves lookups from it."""

    def __init__(self, root: Path):
        self.root = root
        # Each file is read exactly once: the checksum pass keeps the verified
        # bytes and the loaders parse those (startup is disk-bound).
        verified = self._load_and_verify()
        self._meta = verified.meta
        self._cache_tag = verified.fingerprint[:16]
        self._sheets: dict[str, list[str]] = self._meta_sheets(verified)
        self._features: dict[str, dict] = {}  # "survey:sheet:dag" -> feature
        self._by_dag: dict[str, list[str]] = {}  # "survey:dag" -> keys
        self._dag_rows: list[_Row] = []
        self._build_index(verified)
        self._khatians: dict[str, dict] = self._load_khatians()
        self._masterplan: list[_Row] = self._load_masterplan(verified)

    # -- loading -----------------------------------------------------------

    def _load_and_verify(self) -> _VerifiedDataset:
        meta_path = self.root / "meta.json"
        if not meta_path.is_file():
            raise LandDataError(
                f"Land dataset meta file missing: {meta_path}. "
                "Run scripts/ingest_land_data/ingest.py to produce it."
            )
        meta_bytes = meta_path.read_bytes()
        try:
            meta = json.loads(meta_bytes)
        except json.JSONDecodeError as exc:
            raise LandDataError(f"Land dataset meta.json is corrupt: {exc}") from exc

        files: dict[str, bytes] = {}
        for rel, expected in (meta.get("sha256") or {}).items():
            path = self.root / rel
            if not path.is_file():
                raise LandDataError(f"Land dataset file missing: {path}")
            raw = path.read_bytes()
            if hashlib.sha256(raw).hexdigest() != expected:
                raise LandDataError(
                    f"Land dataset checksum mismatch for {rel} — "
                    "the file changed after ingestion; re-run the ingest script."
                )
            files[rel] = raw
        return _VerifiedDataset(
            meta=meta, fingerprint=hashlib.sha256(meta_bytes).hexdigest(), files=files
        )

    def _read_json(self, rel: str, verified: _VerifiedDataset) -> dict:
        """Parse a dataset file, reusing its verified bytes when it was checksummed."""
        path = self.root / rel
        raw = verified.files.get(rel)
        if raw is None:
            if not path.is_file():
                raise LandDataError(f"Land dataset file missing: {path}")
            raw = path.read_bytes()
        try:
            return json.loads(raw)
        except json.JSONDecodeError as exc:
            raise LandDataError(f"Land dataset file corrupt ({path}): {exc}") from exc

    def _meta_sheets(self, verified: _VerifiedDataset) -> dict[str, list[str]]:
        raw = self._read_json("sheets.json", verified)
        return {survey: sorted(sheets) for survey, sheets in raw.items()}

    def _build_index(self, verified: _VerifiedDataset) -> None:
        count = 0
        for survey in self._sheets:
            for sheet in self._sheets[survey]:
                fc = self._read_json(f"dags/{survey}/{sheet}.geojson", verified)
                for feature in fc.get("features", []):
                    props = feature.get("properties", {})
                    dag = _ascii_digits(str(props.get("dag", "")))
                    if not dag:
                        continue
                    key = f"{survey}:{sheet}:{dag}"
                    self._features[key] = feature
                    self._by_dag.setdefault(f"{survey}:{dag}", []).append(key)
                    lng, lat = self._centroid_of(feature)
                    self._dag_rows.append(_Row(lng, lat, feature, _compact_json(feature)))
                    count += 1
        expected = (self._meta.get("counts") or {}).get("dags")
        if expected is not None and expected != count:
            raise LandDataError(
                f"Land dataset inconsistent: meta.json says {expected} dags, "
                f"files contain {count}."
            )
        logger.info(
            "Land dataset loaded: %s dags, %s surveys, dataset_version=%s",
            count, len(self._sheets), self._meta.get("dataset_version"),
        )

    @staticmethod
    def _centroid_of(feature: dict) -> tuple[float, float]:
        ring = feature["geometry"]["coordinates"][0]
        pts = ring[:-1] if ring[0] == ring[-1] else ring
        lng = sum(p[0] for p in pts) / len(pts)
        lat = sum(p[1] for p in pts) / len(pts)
        return (lng, lat)

    def _load_khatians(self) -> dict[str, dict]:
        """Per-dag khatian records, verified against meta.json and complete:
        every geometry dag must have one (the detail dialog relies on it)."""
        block = self._meta.get("khatians")
        if not block:
            raise LandDataError(
                "Land dataset has no khatian block in meta.json. "
                "Run scripts/ingest_land_data/build_khatians.py."
            )
        unit = (block.get("land_unit") or {}).get("unit")
        if not unit:
            raise LandDataError("Khatian land-area unit is not verified in meta.json.")
        records: dict[str, dict] = {}
        for rel, expected in (block.get("sha256") or {}).items():
            path = self.root / rel
            if not path.is_file():
                raise LandDataError(f"Khatian dataset file missing: {path}")
            raw = path.read_bytes()
            if hashlib.sha256(raw).hexdigest() != expected:
                raise LandDataError(
                    f"Khatian dataset checksum mismatch for {rel} — re-run build_khatians.py."
                )
            try:
                by_dag = json.loads(raw)
            except json.JSONDecodeError as exc:
                raise LandDataError(f"Khatian dataset file corrupt ({path}): {exc}") from exc
            survey, sheet = rel.removesuffix(".json").split("/")[-2:]
            for dag, record in by_dag.items():
                records[f"{survey}:{sheet}:{dag}"] = record
        uncovered = self._features.keys() - records.keys()
        if uncovered:
            raise LandDataError(
                f"Khatian dataset incomplete: {len(uncovered)} dags without a record, "
                f"e.g. {sorted(uncovered)[:3]}."
            )
        return records

    def _load_masterplan(self, verified: _VerifiedDataset) -> list[_Row]:
        """RAJUK DAP overlay, optional — an absent file is not an error."""
        self._masterplan_by_rs: dict[str, list[dict]] = {}
        rel = "masterplan.geojson"
        if rel not in verified.files and not (self.root / rel).is_file():
            return []
        fc = self._read_json(rel, verified)
        out: list[_Row] = []
        for feature in fc.get("features", []):
            props = feature.get("properties", {})
            served = {
                **feature,
                "properties": {k: v for k, v in props.items() if k not in MASTERPLAN_BBOX_OMIT},
            }
            lng, lat = self._centroid_of(feature)
            out.append(_Row(lng, lat, feature, _compact_json(served)))
            rs = props.get("rs_plot_no")
            if rs:
                self._masterplan_by_rs.setdefault(_normalize_rs(rs), []).append(feature)
        return out

    # -- LandDataProvider ----------------------------------------------------

    def list_sheets(self, survey: str) -> list[str]:
        return list(self._sheets.get(survey, []))

    def get_dag(self, survey: str, sheet: str, dag: str) -> dict | None:
        return self._features.get(f"{survey}:{_normalize_sheet(sheet)}:{_ascii_digits(dag)}")

    def get_dag_details(self, survey: str, sheet: str, dag: str) -> dict | None:
        key = f"{survey}:{_normalize_sheet(sheet)}:{_ascii_digits(dag)}"
        record = self._khatians.get(key)
        if record is None:
            return None
        block = self._meta["khatians"]
        return {
            "survey": survey,
            "sheet": _normalize_sheet(sheet),
            "dag": _ascii_digits(dag),
            "mouza": block["mouza"],
            "total_land": record["total_land"],
            "khatians": record["khatians"],
            "source_note": record.get("source_note"),
            "source": {
                "name": "settlement.gov.bd",
                "fetched_at": block["fetched_at"],
                "dataset_version": self._meta.get("dataset_version"),
            },
        }

    def find_dags(self, survey: str, dag_no: str) -> list[dict]:
        keys = self._by_dag.get(f"{survey}:{_ascii_digits(dag_no)}", [])
        return [self._features[k] for k in keys]

    def features_in_bbox(self, bbox: BBox, limit: int = 500) -> list[dict]:
        return [row.feature for row in _rows_in_bbox(self._dag_rows, bbox, limit)]

    def features_json_in_bbox(self, bbox: BBox, limit: int = 500) -> list[bytes]:
        return [row.json for row in _rows_in_bbox(self._dag_rows, bbox, limit)]

    @property
    def cache_tag(self) -> str:
        return self._cache_tag

    def dataset_meta(self) -> dict:
        # Checksums are an integrity mechanism, not client data.
        meta = dict(self._meta)
        meta.pop("sha256", None)
        meta["khatians"] = {
            k: v for k, v in (meta.get("khatians") or {}).items() if k != "sha256"
        }
        return meta

    def masterplan_features_in_bbox(self, bbox: BBox, limit: int = 500) -> list[dict]:
        return [row.feature for row in _rows_in_bbox(self._masterplan, bbox, limit)]

    def masterplan_json_in_bbox(self, bbox: BBox, limit: int = 500) -> list[bytes]:
        return [row.json for row in _rows_in_bbox(self._masterplan, bbox, limit)]

    def masterplan_find(self, rs_plot_no: str) -> list[dict]:
        return list(self._masterplan_by_rs.get(_normalize_rs(rs_plot_no), []))


@lru_cache(maxsize=1)
def get_land_data_provider() -> LocalJsonLandDataProvider:
    """Process-wide provider. Raises LandDataError at first use (startup)."""
    settings = get_settings()
    return LocalJsonLandDataProvider(Path(settings.land_data_dir))


def point_in_polygon(lng: float, lat: float, feature: dict) -> bool:
    ring = feature["geometry"]["coordinates"][0]
    inside = False
    j = len(ring) - 1
    for i in range(len(ring)):
        xi, yi = ring[i]
        xj, yj = ring[j]
        if (yi > lat) != (yj > lat) and lng < (xj - xi) * (lat - yi) / (yj - yi) + xi:
            inside = not inside
        j = i
    return inside


__all__ = [
    "MASTERPLAN_BBOX_OMIT",
    "BBox",
    "LandDataError",
    "LandDataProvider",
    "LocalJsonLandDataProvider",
    "get_land_data_provider",
    "point_in_polygon",
]
