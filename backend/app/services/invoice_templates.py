from app.services.indian_number import amount_in_words, format_inr

_BASE_STYLE = """
<style>
  body {{ font-family: 'Segoe UI', Arial, sans-serif; color: #222; margin: 0; padding: 24px; }}
  .header {{ display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 3px solid {accent}; padding-bottom: 12px; margin-bottom: 16px; }}
  .header h1 {{ margin: 0; color: {accent}; }}
  .party-block {{ display: flex; justify-content: space-between; margin-bottom: 16px; font-size: 13px; }}
  table {{ width: 100%; border-collapse: collapse; margin-bottom: 12px; }}
  th, td {{ border: 1px solid #ccc; padding: 6px 8px; font-size: 13px; text-align: left; }}
  th {{ background: {accent}; color: #fff; }}
  .totals {{ width: 40%; margin-left: auto; }}
  .totals td {{ border: none; padding: 3px 8px; }}
  .grand-total {{ font-weight: bold; font-size: 15px; border-top: 2px solid {accent}; }}
  .words {{ font-size: 12px; font-style: italic; margin-top: 8px; }}
</style>
"""


def _rows(items: list[dict]) -> str:
    return "".join(
        f"<tr><td>{i['name']}</td><td>{i.get('hsn') or ''}</td><td>{i['quantity']:g}</td>"
        f"<td>{format_inr(i['unit_price'])}</td><td>{i['tax_rate']:g}%</td><td>{format_inr(i['total'])}</td></tr>"
        for i in items
    )


def render_invoice_html(invoice: dict, company: dict, theme: str = "classic") -> str:
    accent = "#0f766e" if theme == "colored" else "#1a1a1a"
    style = _BASE_STYLE.format(accent=accent)
    return f"""<!DOCTYPE html><html><head><meta charset="utf-8">{style}</head><body>
    <div class="header">
      <div><h1>{company.get('name') or 'Company Name'}</h1><p>{company.get('address') or ''}</p><p>GSTIN: {company.get('gstin') or '—'}</p></div>
      <div style="text-align:right"><h2>TAX INVOICE</h2><p>Invoice #: {invoice['invoice_number']}</p><p>Date: {invoice['invoice_date']}</p></div>
    </div>
    <div class="party-block">
      <div><strong>Bill To</strong><br>{invoice['customer_name']}<br>{invoice.get('customer_gstin') or ''}<br>{invoice.get('customer_phone') or ''}</div>
    </div>
    <table>
      <thead><tr><th>Item</th><th>HSN</th><th>Qty</th><th>Rate</th><th>GST</th><th>Amount</th></tr></thead>
      <tbody>{_rows(invoice['items'])}</tbody>
    </table>
    <table class="totals">
      <tr><td>Subtotal</td><td>{format_inr(invoice['subtotal'])}</td></tr>
      <tr><td>CGST</td><td>{format_inr(invoice['cgst_amount'])}</td></tr>
      <tr><td>SGST</td><td>{format_inr(invoice['sgst_amount'])}</td></tr>
      <tr><td>IGST</td><td>{format_inr(invoice['igst_amount'])}</td></tr>
      <tr class="grand-total"><td>Total</td><td>{format_inr(invoice['total'])}</td></tr>
    </table>
    <div class="words">Amount in words: {amount_in_words(invoice['total'])}</div>
    </body></html>"""
