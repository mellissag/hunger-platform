"""Экспорт payroll-отчёта в XLSX / PDF."""

from __future__ import annotations

from io import BytesIO
from typing import Any

from fpdf import FPDF
from openpyxl import Workbook
from openpyxl.styles import Font


def payroll_to_xlsx(rows: list[dict[str, Any]], *, period_label: str) -> bytes:
    wb = Workbook()
    ws = wb.active
    ws.title = "Payroll"
    ws.append(["Payroll report", period_label])
    ws.append([])
    header = [
        "Master",
        "Revenue",
        "Completed",
        "Payroll %",
        "Payroll amount",
    ]
    ws.append(header)
    for c in ws[3]:
        c.font = Font(bold=True)
    total_rev = 0.0
    total_pay = 0.0
    for r in rows:
        rev = float(r.get("revenue", "0") or 0)
        pay = float(r.get("payroll_amount", "0") or 0)
        total_rev += rev
        total_pay += pay
        ws.append(
            [
                r.get("display_name", ""),
                r.get("revenue", ""),
                r.get("completed_bookings", ""),
                r.get("payroll_percent", ""),
                r.get("payroll_amount", ""),
            ]
        )
    ws.append([])
    ws.append(["Total", "", "", "", f"{total_pay:.2f}"])
    buf = BytesIO()
    wb.save(buf)
    return buf.getvalue()


def payroll_to_pdf(rows: list[dict[str, Any]], *, period_label: str, title: str = "Payroll") -> bytes:
    pdf = FPDF()
    pdf.add_page()
    pdf.set_font("Helvetica", "B", 14)
    pdf.cell(0, 10, title, ln=True)
    pdf.set_font("Helvetica", size=10)
    pdf.cell(0, 8, period_label, ln=True)
    pdf.ln(4)
    pdf.set_font("Helvetica", "B", 9)
    col_w = 38
    for h in ["Master", "Revenue", "Done", "%", "Payroll"]:
        pdf.cell(col_w, 7, h[:18], border=1)
    pdf.ln()
    pdf.set_font("Helvetica", size=9)
    total_pay = 0.0
    for r in rows:
        pay = float(r.get("payroll_amount", "0") or 0)
        total_pay += pay
        pdf.cell(col_w, 7, str(r.get("display_name", ""))[:22], border=1)
        pdf.cell(col_w, 7, str(r.get("revenue", ""))[:12], border=1)
        pdf.cell(col_w, 7, str(r.get("completed_bookings", ""))[:8], border=1)
        pdf.cell(col_w, 7, str(r.get("payroll_percent", ""))[:8], border=1)
        pdf.cell(col_w, 7, str(r.get("payroll_amount", ""))[:12], border=1)
        pdf.ln()
    pdf.ln(2)
    pdf.set_font("Helvetica", "B", 10)
    pdf.cell(0, 8, f"Total payroll: {total_pay:.2f}", ln=True)
    out = pdf.output(dest="S")
    if isinstance(out, str):
        return out.encode("latin-1")
    return bytes(out)
