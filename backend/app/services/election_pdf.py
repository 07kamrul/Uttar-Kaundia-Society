"""Election result sheet (নির্বাচনের ফলাফল পত্র) - letterhead PDF listing
each contested post, its candidates, votes, turnout and the confirmation
line. Bangla shaping degrades gracefully without uharfbuzz (see
register_report_fonts)."""

from dataclasses import dataclass, field
from datetime import date, datetime

from fpdf import FPDF

from app.services.finance import BN_MONTHS
from app.services.finance_pdf import (
    GREEN_DARK,
    INK,
    INK_SOFT,
    ReportPDF,
    register_report_fonts,
)

RESULT_SHEET_TITLE = "নির্বাচনের ফলাফল পত্র  •  Election Result Sheet"

_BN_DIGITS = str.maketrans("0123456789", "০১২৩৪৫৬৭৮৯")


def bn_digits(value: int | str) -> str:
    return str(value).translate(_BN_DIGITS)


def bn_date(value: date | None) -> str:
    if value is None:
        return "—"
    return bn_digits(f"{value.day} {BN_MONTHS[value.month - 1]} {value.year}")


@dataclass(frozen=True)
class ResultRow:
    post_key: str
    post_label: str
    candidates: tuple[dict, ...]  # {name, statement, votes, winner}
    votes_total: int
    winner_name: str | None
    tie: bool = False


@dataclass(frozen=True)
class ResultSheetData:
    org_name: str
    election_title: str
    generated_at_label: str
    nomination_window: str
    voting_window: str
    confirmed: bool
    confirmed_at_label: str | None
    eligible_voters: int
    rows: tuple[ResultRow, ...] = field(default_factory=tuple)


def build_result_sheet_pdf(data: ResultSheetData) -> bytes:
    pdf = ReportPDF(
        data.org_name,
        data.voting_window,
        data.generated_at_label,
        report_title=RESULT_SHEET_TITLE,
    )
    register_report_fonts(pdf)
    pdf.add_page()

    pdf.set_font("bn", "B", 13)
    pdf.set_text_color(*GREEN_DARK)
    pdf.cell(0, 9, data.election_title, new_x="LMARGIN", new_y="NEXT")
    pdf.set_font("bn", "", 9.5)
    pdf.set_text_color(*INK_SOFT)
    pdf.cell(0, 6, f"মনোনয়ন: {data.nomination_window}   |   ভোটগ্রহণ: {data.voting_window}",
             new_x="LMARGIN", new_y="NEXT")
    pdf.cell(0, 6, f"নির্বাচক সংখ্যা (স্ন্যাপশট): {bn_digits(data.eligible_voters)}",
             new_x="LMARGIN", new_y="NEXT")
    pdf.ln(2)

    for row in data.rows:
        pdf.set_font("bn", "B", 11)
        pdf.set_text_color(*INK)
        pdf.cell(0, 8, row.post_label, new_x="LMARGIN", new_y="NEXT")
        pdf.set_draw_color(*GREEN_DARK)
        pdf.set_line_width(0.3)
        pdf.line(14, pdf.get_y(), 196, pdf.get_y())

        columns = [("প্রার্থী", 78), ("মোট ভোট", 30), ("ফলাফল", 60)]
        pdf.set_font("bn", "B", 9.5)
        pdf.set_fill_color(245, 240, 228)
        for label, width in columns:
            pdf.cell(width, 7, label, border=1, fill=True)
        pdf.ln()
        pdf.set_font("bn", "", 9.5)
        for cand in row.candidates:
            pdf.cell(78, 7, cand["name"][:48], border=1)
            pdf.cell(30, 7, bn_digits(cand["votes"]), border=1, align="C")
            outcome = "নির্বাচিত" if cand.get("winner") else ("সমতা" if row.tie else "")
            pdf.cell(60, 7, outcome, border=1)
            pdf.ln()
        pdf.set_font("bn", "", 9)
        pdf.set_text_color(*INK_SOFT)
        pdf.cell(0, 6, f"মোট ভোট ({row.post_label}): {bn_digits(row.votes_total)}",
                 new_x="LMARGIN", new_y="NEXT")
        pdf.ln(3)

    pdf.ln(4)
    pdf.set_font("bn", "B", 10.5)
    pdf.set_text_color(*GREEN_DARK)
    if data.confirmed:
        pdf.multi_cell(0, 7,
            f"আনুষ্ঠানিক নিশ্চিতকরণ: {data.confirmed_at_label} তারিখে ফলাফল নিশ্চিত করা হয়েছে; "
            "বিজয়ীরা কমিটি রেজিস্ট্রিতে অন্তর্ভুক্ত হয়েছেন।")
    else:
        pdf.multi_cell(0, 7, "ফলাফল এখনো আনুষ্ঠানিকভাবে নিশ্চিত করা হয়নি (প্রাথমিক গণনা)।")
    return bytes(pdf.output())
