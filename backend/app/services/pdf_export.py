from app.services.indian_number import amount_in_words, format_inr

SLIP_STYLE = """
<style>
  @page { size: A4; margin: 16mm; }
  body { font-family: 'Segoe UI', Arial, sans-serif; color: #1a1a1a; }
  .slip { page-break-after: always; padding: 8px; border: 1px solid #333; }
  .slip:last-child { page-break-after: auto; }
  .header { text-align: center; border-bottom: 2px solid #333; padding-bottom: 8px; margin-bottom: 12px; }
  .header h1 { margin: 0; font-size: 20px; }
  .header p { margin: 2px 0; font-size: 12px; color: #444; }
  .meta { display: flex; justify-content: space-between; font-size: 13px; margin-bottom: 10px; }
  table.ledger { width: 100%; border-collapse: collapse; margin-bottom: 10px; }
  table.ledger th, table.ledger td { border: 1px solid #999; padding: 6px 8px; font-size: 13px; text-align: left; }
  table.ledger th { background: #f0ede6; }
  .amount-words { font-size: 13px; font-style: italic; margin-bottom: 10px; }
  .warning-banner { background: #fdecea; border: 1px solid #c0392b; color: #922; padding: 8px; font-size: 13px; font-weight: bold; margin-bottom: 10px; }
  .narration { font-size: 12px; margin-bottom: 16px; }
  .source-link { font-size: 11px; color: #666; margin-bottom: 16px; }
  .signatures { display: flex; justify-content: space-between; margin-top: 40px; font-size: 12px; }
  .signatures div { text-align: center; width: 30%; border-top: 1px solid #333; padding-top: 4px; }
</style>
"""


def render_voucher_slip_html(voucher: dict, company: dict) -> str:
    warning = ""
    if voucher.get("compliance_flag") == "SECTION_40A3_DISALLOWED":
        warning = (
            '<div class="warning-banner">⚠ Section 40A(3): cash payment exceeds ₹10,000 for this '
            "party/category/day — not allowable as a business deduction under the Income Tax Act.</div>"
        )

    rows = "".join(
        f"<tr><td>{line['ledger']}</td>"
        f"<td>{format_inr(line['dr_amount']) if line['dr_amount'] else ''}</td>"
        f"<td>{format_inr(line['cr_amount']) if line['cr_amount'] else ''}</td></tr>"
        for line in voucher.get("ledger_lines", [])
    )

    source_line = ""
    if voucher.get("source_sheet_id"):
        source_line = f'<div class="source-link">Sourced from daily sheet: {voucher["source_sheet_id"]}</div>'
    elif voucher.get("source_bill_id"):
        source_line = f'<div class="source-link">Sourced from bill: {voucher["source_bill_id"]}</div>'

    return f"""
    <div class="slip">
      <div class="header">
        <h1>{company.get('name') or 'Company Name'}</h1>
        <p>{company.get('address') or ''}</p>
        <p>GSTIN: {company.get('gstin') or '—'}</p>
      </div>
      <div class="meta">
        <div><strong>Voucher No:</strong> {voucher['voucher_number']}</div>
        <div><strong>Type:</strong> {voucher['voucher_type']}</div>
        <div><strong>Date:</strong> {voucher['voucher_date']}</div>
      </div>
      {warning}
      <table class="ledger">
        <thead><tr><th>Ledger</th><th>Debit</th><th>Credit</th></tr></thead>
        <tbody>{rows}</tbody>
      </table>
      <div class="amount-words">Amount in words: {amount_in_words(voucher['amount'])}</div>
      <div class="narration"><strong>Narration:</strong> {voucher.get('narration') or '—'}</div>
      {source_line}
      <div class="signatures">
        <div>Prepared By</div>
        <div>Approved By</div>
        <div>Received By</div>
      </div>
    </div>
    """


def render_bulk_voucher_slips_html(vouchers: list[dict], company: dict) -> str:
    slips = "".join(render_voucher_slip_html(v, company) for v in vouchers)
    return f"<!DOCTYPE html><html><head><meta charset='utf-8'>{SLIP_STYLE}</head><body>{slips}</body></html>"
