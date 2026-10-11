"""Shared letterhead PDF helper for governance letters (application
acknowledgment/rejection, complaint acknowledgment, resolution certificate and
the land-protection form copy).

Uses the ReportPDF letterhead/footer from the finance report so every letter
carries the society identity without duplicating layout code.
"""

from datetime import datetime, timezone

from fpdf import FPDF

from app.services.finance_pdf import INK, ReportPDF, register_report_fonts

ORG_NAME = "উত্তর কাউন্দিয়া আবাসন মালিক কল্যাণ সোসাইটি"


def render_letter(
    *,
    title: str,
    ref_no: str,
    body_sections: list[tuple[str, list[str]]],
    meta_line: str | None = None,
) -> bytes:
    """Render a letterhead letter. `body_sections` is a list of
    (section_title, paragraphs)."""
    now_label = datetime.now(timezone.utc).strftime("%d/%m/%Y")
    pdf = ReportPDF(
        org_name=ORG_NAME,
        period_label=now_label,
        generated_at_label=now_label,
        report_title=title,
        meta_line=meta_line or f"স্মারক নম্বর: {ref_no}   |   তারিখ: {now_label}",
    )
    register_report_fonts(pdf)
    pdf.add_page()
    for section, paragraphs in body_sections:
        pdf.set_font("bn", "B", 11.5)
        pdf.set_text_color(*INK)
        pdf.cell(text=section, new_x="LMARGIN", new_y="NEXT")
        pdf.ln(1)
        pdf.set_font("bn", "", 10.5)
        for paragraph in paragraphs:
            pdf.multi_cell(w=0, h=6, text=paragraph, new_x="LMARGIN", new_y="NEXT")
        pdf.ln(3)
    return bytes(pdf.output())
