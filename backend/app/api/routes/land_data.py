"""Member-facing land-record endpoints backed by the local dataset.

Serves the ingested BDS mouza map (geometry + dag numbers only — the source
layer contains no personal data) through our own authenticated API, with the
same guards as the plot-map feature: approved members only, bbox required,
result caps, rate limiting. No outbound network calls.
"""

import hashlib
import logging
import math
from collections.abc import Callable

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.permissions import require_member_permission
from app.core.rate_limit import SlidingWindowRateLimiter
from app.db.session import get_db
from app.models.member import Member, MemberStatus
from app.services.audit import record_audit
from app.services.land_data import (
    BBox,
    LandDataProvider,
    get_land_data_provider,
)
from app.api.routes.plot_map import _parse_bbox

router = APIRouter(prefix="/land", tags=["land"])

VIEW_PERMISSION = "boundary.view"

logger = logging.getLogger(__name__)
_settings = get_settings()
_detail_limiter = SlidingWindowRateLimiter(
    max_requests=_settings.dag_detail_rate_limit,
    window_seconds=_settings.dag_detail_rate_window_seconds,
)


def _enforce_detail_rate_limit(member_id: int) -> None:
    retry_after = _detail_limiter.check(member_id)
    if retry_after is None:
        return
    logger.warning("Dag detail rate limit reached by member_id=%s", member_id)
    raise HTTPException(
        status_code=status.HTTP_429_TOO_MANY_REQUESTS,
        detail={
            "code": "DAG_DETAIL_RATE_LIMITED",
            "message": "Too many dag lookups. Please try again later.",
        },
        headers={"Retry-After": str(max(1, math.ceil(retry_after)))},
    )


# Bump when the served bbox payload shape changes so browsers drop old copies.
_LAYER_PAYLOAD_VERSION = "2"
# Browsers keep the layer but revalidate every time: a 304 costs one round trip
# and still runs the auth check, so a suspended member stops getting data.
_LAYER_CACHE_CONTROL = "private, no-cache"


def _layer_etag(provider: LandDataProvider, layer: str, viewport: BBox, cap: int) -> str:
    key = f"{_LAYER_PAYLOAD_VERSION}|{layer}|{viewport}|{cap}".encode()
    return f'"{provider.cache_tag}-{hashlib.sha256(key).hexdigest()[:16]}"'


def _etag_matches(if_none_match: str | None, etag: str) -> bool:
    """RFC 9110 weak comparison; proxies that gzip may add a W/ prefix."""
    if not if_none_match:
        return False
    candidates = {tag.strip().removeprefix("W/") for tag in if_none_match.split(",")}
    return "*" in candidates or etag in candidates


def feature_collection_response(
    request: Request,
    provider: LandDataProvider,
    layer: str,
    viewport: BBox,
    load_chunks: Callable[[BBox, int], list[bytes]],
) -> Response:
    """GeoJSON FeatureCollection for a map layer, assembled from the provider's
    pre-encoded features (no per-request JSON walk) and revalidated by ETag.

    ``load_chunks`` runs only on a cache miss, so a 304 skips the scan too."""
    cap = get_settings().land_map_result_cap
    etag = _layer_etag(provider, layer, viewport, cap)
    headers = {"ETag": etag, "Cache-Control": _LAYER_CACHE_CONTROL}
    if _etag_matches(request.headers.get("if-none-match"), etag):
        return Response(status_code=status.HTTP_304_NOT_MODIFIED, headers=headers)
    chunks = load_chunks(viewport, cap + 1)
    truncated = len(chunks) > cap
    served = chunks[:cap]
    head = (
        f'{{"type":"FeatureCollection","count":{len(served)},'
        f'"truncated":{"true" if truncated else "false"},"features":['
    ).encode()
    body = b"".join((head, b",".join(served), b"]}"))
    return Response(content=body, media_type="application/json", headers=headers)


def _approved(member: Member) -> Member:
    if member.status != MemberStatus.APPROVED:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={"code": "APPROVED_MEMBERS_ONLY", "message": "Approved members only."},
        )
    return member


@router.get("/meta")
def get_land_meta(
    member: Member = Depends(require_member_permission(VIEW_PERMISSION)),
    provider: LandDataProvider = Depends(get_land_data_provider),
) -> dict:
    """Dataset provenance, survey availability, counts. No checksums."""
    _approved(member)
    return provider.dataset_meta()


@router.get("/sheets")
def get_land_sheets(
    survey: str = Query(..., description="e.g. 'bds'"),
    member: Member = Depends(require_member_permission(VIEW_PERMISSION)),
    provider: LandDataProvider = Depends(get_land_data_provider),
) -> dict:
    _approved(member)
    sheets = provider.list_sheets(survey)
    if not sheets:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "SURVEY_NOT_FOUND", "message": f"No sheets for survey '{survey}'."},
        )
    return {"survey": survey, "sheets": sheets}


@router.get("/dags")
def get_dags_in_bbox(
    request: Request,
    bbox: str = Query(..., description="minLng,minLat,maxLng,maxLat"),
    member: Member = Depends(require_member_permission(VIEW_PERMISSION)),
    provider: LandDataProvider = Depends(get_land_data_provider),
) -> Response:
    """Dag polygons (number + geometry only) whose centroid falls in the bbox."""
    _approved(member)
    return feature_collection_response(
        request, provider, "dags", _parse_bbox(bbox), provider.features_json_in_bbox
    )


@router.get("/dag/{survey}/lookup/{dag_no}")
def lookup_dag(
    survey: str,
    dag_no: str,
    member: Member = Depends(require_member_permission(VIEW_PERMISSION)),
    provider: LandDataProvider = Depends(get_land_data_provider),
) -> dict:
    """Find every sheet containing a dag number (accepts Bangla digits).

    Declared before the /dag/{survey}/{sheet}/{dag} catch-all — FastAPI matches
    in declaration order, so "lookup" would otherwise be read as a sheet name.
    """
    _approved(member)
    features = provider.find_dags(survey, dag_no)
    return {"type": "FeatureCollection", "count": len(features), "features": features}


@router.get("/dag/{survey}/{sheet}/{dag}")
async def get_dag_details(
    survey: str,
    sheet: str,
    dag: str,
    member: Member = Depends(require_member_permission(VIEW_PERMISSION)),
    provider: LandDataProvider = Depends(get_land_data_provider),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Land details + khatian/owner rows for one dag (the official-style dialog).

    The only door to owner names: one dag per call, approved members only,
    rate-limited and audited. There is deliberately no list/search/export.
    """
    _approved(member)
    _enforce_detail_rate_limit(member.id)
    details = provider.get_dag_details(survey, sheet, dag)
    if details is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={
                "code": "DAG_NOT_FOUND",
                "message": f"No dag {dag} on sheet {sheet} of survey '{survey}' in the local dataset.",
            },
        )
    record_audit(
        db,
        actor_admin_id=None,
        action="land.dag_detail_lookup",
        entity_type="land_dag",
        entity_id=f"{details['survey']}:{details['sheet']}:{details['dag']}",
        detail=f"viewer_member_id={member.id}",
    )
    await db.commit()
    return details


@router.get("/masterplan")
def get_masterplan_in_bbox(
    request: Request,
    bbox: str = Query(..., description="minLng,minLat,maxLng,maxLat"),
    member: Member = Depends(require_member_permission(VIEW_PERMISSION)),
    provider: LandDataProvider = Depends(get_land_data_provider),
) -> Response:
    """RAJUK DAP 2022–2035 RS-plot overlay (ingested once at deploy time)."""
    _approved(member)
    return feature_collection_response(
        request, provider, "masterplan", _parse_bbox(bbox), provider.masterplan_json_in_bbox
    )


@router.get("/masterplan/lookup/{rs_plot_no}")
def lookup_masterplan_plot(
    rs_plot_no: str,
    member: Member = Depends(require_member_permission(VIEW_PERMISSION)),
    provider: LandDataProvider = Depends(get_land_data_provider),
) -> dict:
    """Find every RS plot with this number (accepts "RS-4611", "4611", Bangla digits)."""
    _approved(member)
    features = provider.masterplan_find(rs_plot_no)
    return {"type": "FeatureCollection", "count": len(features), "features": features}


__all__ = ["feature_collection_response", "router"]
