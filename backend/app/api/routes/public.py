from datetime import date, datetime, timezone

from fastapi import APIRouter, Depends, Query, Response
from pydantic import BaseModel
from sqlalchemy import case, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.cache import CacheName, cached_response, make_key
from app.db.session import get_db
from app.models.config_list_item import ConfigListItem
from app.models.event import Event
from app.models.fee_settings import FeeSetting
from app.models.member import Member, MemberStatus
from app.models.notice import Notice
from app.schemas.config_list import ConfigListItemOut
from app.schemas.event import EventOut
from app.schemas.notice import NoticeOut
from app.schemas.public import PublicStatsOut, SubscriptionQuoteOut, SubscriptionQuoteRequest
from app.services.fee_calculation import calculate_monthly_subscription

router = APIRouter(prefix="/public", tags=["public"])


def _dump(schema: type[BaseModel], rows) -> list[dict]:
    """Serialize ORM rows to plain JSON data; cached values must never hold
    session-bound objects."""
    return [schema.model_validate(row).model_dump(mode="json") for row in rows]


def _parse_amount(value: str | None) -> float:
    if not value:
        return 0
    try:
        return float(value)
    except ValueError:
        return 0


# Cached reads below serve public data only (no drafts, members-only rows or
# per-user data). Committed writes to their tables clear PUBLIC_LISTS / FEE_RATES
# (app/core/cache.py TABLE_DEPENDENCIES); the short TTL also bounds how late a
# scheduled notice (publish_at) or an event crossing "now" shows up.


@router.get("/stats", response_model=PublicStatsOut)
async def get_public_stats(response: Response, db: AsyncSession = Depends(get_db)) -> dict:
    return await cached_response(
        response, CacheName.PUBLIC_LISTS, make_key("public_stats"), lambda: _load_public_stats(db)
    )


async def _load_public_stats(db: AsyncSession) -> dict:
    # Single pass over two narrow columns. The previous version ran three
    # sequential queries (two COUNTs, then a scan of every approved member's
    # subscription) to produce the same three numbers.
    rows = await db.execute(select(Member.status, Member.subscription))

    pending_count = 0
    approved_count = 0
    monthly_subscription_total = 0.0
    for row_status, subscription in rows:
        if row_status == MemberStatus.APPROVED:
            approved_count += 1
            monthly_subscription_total += _parse_amount(subscription)
        elif row_status == MemberStatus.PENDING:
            pending_count += 1

    return PublicStatsOut(
        pending_count=pending_count,
        approved_count=approved_count,
        monthly_subscription_total=monthly_subscription_total,
    ).model_dump(mode="json")


@router.get("/fee-settings")
async def get_public_fee_settings(
    response: Response, db: AsyncSession = Depends(get_db)
) -> dict[str, float]:
    # Display only: payment-time totals are recomputed from fee_settings by
    # app/services/fee_calculation.py, which never reads this cache.
    today = date.today()
    return await cached_response(
        response,
        CacheName.FEE_RATES,
        make_key("public_fee_settings", on=today.isoformat()),
        lambda: _load_current_fee_settings(db, today),
    )


async def _load_current_fee_settings(db: AsyncSession, today: date) -> dict[str, float]:
    result = await db.execute(
        select(FeeSetting.key, FeeSetting.value)
        .where(
            FeeSetting.start_date <= today,
            or_(FeeSetting.end_date.is_(None), FeeSetting.end_date >= today),
        )
        .order_by(FeeSetting.start_date.desc(), FeeSetting.id.desc())
    )
    # Overlapping date windows are legal (a closed version keeps end_date =
    # the day the new one took effect), so the newest version wins per key.
    current: dict[str, float] = {}
    for key, value in result.all():
        current.setdefault(key, float(value))
    return current


@router.post("/registration/subscription-quote", response_model=SubscriptionQuoteOut)
async def get_subscription_quote(
    payload: SubscriptionQuoteRequest, db: AsyncSession = Depends(get_db)
) -> SubscriptionQuoteOut:
    """Live-quotes the monthly subscription (চাঁদা) for a land size, using the
    same tiered calculation the final submission recomputes from - the
    frontend never derives this amount itself."""
    breakdown = await calculate_monthly_subscription(
        db, payload.land_size_decimal, payload.billing_date or date.today()
    )
    return SubscriptionQuoteOut(
        base=breakdown.base,
        extra_units=breakdown.extra_units,
        extra_rate=breakdown.extra_rate,
        extra_amount=breakdown.extra_amount,
        total=breakdown.total,
        unit=breakdown.unit,
        rate_version_effective_from=breakdown.effective_from,
    )


@router.get("/config-lists/{category}", response_model=list[ConfigListItemOut])
async def get_public_config_list(
    category: str, response: Response, db: AsyncSession = Depends(get_db)
) -> list[dict]:
    async def load() -> list[dict]:
        result = await db.execute(
            select(ConfigListItem)
            .where(ConfigListItem.category == category, ConfigListItem.is_active == 1)
            .order_by(ConfigListItem.sort_order)
        )
        return _dump(ConfigListItemOut, result.scalars().all())

    # Category is matched case-sensitively in SQL, so it is not lowercased here.
    return await cached_response(
        response, CacheName.PUBLIC_LISTS, ("public_config_list", category), load
    )


# No auth on either endpoint: a notice/event is public once published, unless
# it was explicitly marked members-only - those rows are filtered out here
# (there is no member-only consumer yet; see app/models/notice.py).
@router.get("/notices", response_model=list[NoticeOut])
async def list_public_notices(
    response: Response,
    limit: int | None = Query(default=None, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    db: AsyncSession = Depends(get_db),
) -> list[dict]:
    return await cached_response(
        response,
        CacheName.PUBLIC_LISTS,
        make_key("public_notices", limit=limit, offset=offset),
        lambda: _load_public_notices(db, limit, offset),
    )


async def _load_public_notices(db: AsyncSession, limit: int | None, offset: int) -> list[dict]:
    now = datetime.now(timezone.utc)
    query = (
        select(Notice)
        .where(
            Notice.is_published.is_(True),
            or_(Notice.publish_at.is_(None), Notice.publish_at <= now),
            Notice.is_members_only.is_(False),
        )
        .order_by(Notice.created_at.desc(), Notice.id.desc())
    )
    if offset:
        query = query.offset(offset)
    if limit is not None:
        query = query.limit(limit)
    result = await db.execute(query)
    return _dump(NoticeOut, result.scalars().all())


@router.get("/events", response_model=list[EventOut])
async def list_public_events(
    response: Response,
    limit: int | None = Query(default=None, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    db: AsyncSession = Depends(get_db),
) -> list[dict]:
    return await cached_response(
        response,
        CacheName.PUBLIC_LISTS,
        make_key("public_events", limit=limit, offset=offset),
        lambda: _load_public_events(db, limit, offset),
    )


async def _load_public_events(db: AsyncSession, limit: int | None, offset: int) -> list[dict]:
    # Upcoming first (soonest first), then past (most recent first), in one
    # ORDER BY - the page splits the response into its two sections as-is.
    now = datetime.now(timezone.utc)
    is_upcoming = case((Event.start_at >= now, 0), else_=1)
    upcoming_start = case((Event.start_at >= now, Event.start_at), else_=None)
    past_start = case((Event.start_at < now, Event.start_at), else_=None)
    query = (
        select(Event)
        .where(Event.is_published.is_(True), Event.is_members_only.is_(False))
        .order_by(is_upcoming.asc(), upcoming_start.asc(), past_start.desc())
    )
    if offset:
        query = query.offset(offset)
    if limit is not None:
        query = query.limit(limit)
    result = await db.execute(query)
    return _dump(EventOut, result.scalars().all())
