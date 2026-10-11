"""default_term_end: term_start + TERM_YEARS without crashing on leap days."""

from datetime import date

from app.models.committee_election import TERM_YEARS, default_term_end


def test_regular_date_adds_term_years() -> None:
    assert default_term_end(date(2026, 10, 11)) == date(2026 + TERM_YEARS, 10, 11)


def test_leap_day_clamps_to_feb_28() -> None:
    assert default_term_end(date(2028, 2, 29)) == date(2028 + TERM_YEARS, 2, 28)
