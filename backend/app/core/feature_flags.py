"""Feature-flag registry (UX simplification rollout).

Flags let a change ship hidden first and be deleted one release later. The
registry below is the source of truth for which keys exist and their default;
the ``feature_flags`` table only stores admin overrides. Unknown keys are
rejected so a typo can never silently read as "off".
"""

from dataclasses import dataclass

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.feature_flag import FeatureFlag


@dataclass(frozen=True)
class FlagDef:
    key: str
    default: bool
    description: str


_FLAGS = (
    FlagDef("reg_occupation_optional", False, "Occupation optional at registration (R2)"),
    FlagDef("reg_hide_nationality", False, "Nationality hidden unless 'other country' ticked (R3)"),
    FlagDef("reg_road_optional", False, "Road optional in addresses (R4)"),
    FlagDef(
        "reg_dag_unknown",
        False,
        "Allow 'I don't know my dag' — admin completes before approval (R5)",
    ),
    FlagDef("reg_add_property_button", False, "'+ add property' instead of count stepper (R6)"),
    FlagDef(
        "reg_min_one_proof",
        False,
        "At least one ownership proof instead of one file per ticked doc (R7)",
    ),
    FlagDef("password_policy_v2", False, "Min 8 chars + common-password blocklist, no forced digit (R8)"),
    FlagDef("nav_merged_entries", False, "Merged member/admin menu entries (R9)"),
    FlagDef("nav_advanced_section", False, "Technical screens under Settings › Advanced (R10)"),
)

FEATURE_FLAGS: dict[str, FlagDef] = {flag.key: flag for flag in _FLAGS}


async def load_overrides(db: AsyncSession) -> dict[str, FeatureFlag]:
    rows = (await db.execute(select(FeatureFlag))).scalars().all()
    return {row.key: row for row in rows}


async def is_enabled(db: AsyncSession, key: str) -> bool:
    """DB override if present, else the registry default. Unknown key -> KeyError."""
    flag = FEATURE_FLAGS[key]
    override = await db.get(FeatureFlag, key)
    return flag.default if override is None else bool(override.enabled)
