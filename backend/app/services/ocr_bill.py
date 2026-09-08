import json

from app.ai_client import extract_json

BILL_EXTRACTION_PROMPT = """You are an expert Indian accounts clerk digitizing a photographed vendor
purchase bill (kirana / restaurant / distributor trade). These bills come from distributors like
Vadilal, Amul, Shiv Gauri, Havmor, Britannia, HUL, and dozens of local wholesalers, each with a
slightly different column layout. Extract every field with total accuracy — this feeds real
accounting entries.

COMMON COLUMN LAYOUTS YOU WILL SEE (not exhaustive):
  Sr | Item | HSN | MRP | UOM | Basic Rate | PremDisc | SchDisc | Net Rate | Taxable | GST% | Total
  Description | Quantity | Rate | per | Disc. % | Amount   (no per-line GST% column — GST is a
    single block total at the bottom: SGST X%, CGST X%)
  Sr | Particulars | HSN | Qty | Unit | Rate | Disc% | Taxable Value | CGST | SGST | IGST | Amount

GOLDEN RULE: Find the rightmost "Total" / "Amount" / "Net Amount" column FIRST for each line and
for the bill as a whole. Anchor every other number to that total and work backwards — a total you
read correctly makes every other field checkable; guess the total last and errors compound.

ANTI-PATTERNS — do not make these mistakes:
  - Do NOT confuse a "Disc %" / "Disc. %" column with a "GST %" column. If the bill only has one
    percentage column near the rate and no separate tax-rate column, that percentage is a
    DISCOUNT, and tax_rate for that line must be null (GST is stated once at the bill level
    instead, e.g. "SGST 2.5% / CGST 2.5%").
  - Do NOT put the MRP into unit_price. unit_price is the vendor's billed rate (Basic Rate / Net
    Rate / Rate), never the printed MRP. Extract MRP separately if a column for it exists.
  - Do NOT treat packaging tags like "[1*14]", "(1*12)", "BOMBER PLW (1*14)" as quantity
    multipliers. These describe pack composition (e.g. 1 box of 14 units), not a multiplication
    you should apply to quantity or rate — quantity is whatever the Qty/Quantity column states.
  - Do NOT invent a tax_rate when none is printed per line — leave it null and rely on the
    bill-level cgst_amount / sgst_amount / igst_amount instead.
  - Round-off lines (e.g. "Round Off: 0.27") belong in round_off, not as a line item.

Return ONLY a single JSON object, no prose, no markdown fences, matching exactly this shape:
{
  "vendor": string,
  "gstin": string | null,
  "bill_date": string | null,           // ISO 8601 YYYY-MM-DD if determinable
  "invoice_number": string | null,
  "subtotal": number,                    // sum of taxable value before GST, before round-off
  "cgst_amount": number,
  "sgst_amount": number,
  "igst_amount": number,
  "round_off": number,
  "total": number,                       // the printed grand total — the single source of truth
  "global_discount_percent": number | null,
  "global_discount_amount": number | null,
  "items": [
    {
      "name": string,
      "hsn": string | null,
      "quantity": number,
      "unit": string | null,
      "unit_price": number,              // billed rate, never MRP
      "mrp": number | null,
      "discount_amount": number,
      "discount_percent": number | null,
      "tax_rate": number | null,         // per-line GST% ONLY if the bill has that column
      "total": number                    // this line's amount column, read first
    }
  ]
}

Every number must be a plain JSON number (no currency symbols, no commas). If a field is not
present on the bill, use null (or 0 for amounts that are genuinely absent, like igst_amount on an
intra-state bill). Return valid JSON only.
"""


async def extract_bill_from_image(image_bytes: bytes) -> dict:
    data = await extract_json(BILL_EXTRACTION_PROMPT, image_bytes=image_bytes, media_type="image/jpeg")
    return apply_sanity_check(data)


def apply_sanity_check(data: dict) -> dict:
    """Two checks, either of which can flag the bill as low-confidence:
    1) sum(items.total) vs subtotal (catches line-item extraction errors) — only when
       the bill states GST at the bill level, since per-line-GST layouts fold tax into
       each line's total and legitimately sum straight to the grand total instead.
    2) subtotal + cgst + sgst + igst + round_off vs the printed total (catches tax/total
       math errors), which holds regardless of layout.
    """
    items = data.get("items") or []
    items_sum = sum(float(item.get("total") or 0) for item in items)
    subtotal = float(data.get("subtotal") or 0)
    printed_total = float(data.get("total") or 0)
    tax_total = float(data.get("cgst_amount") or 0) + float(data.get("sgst_amount") or 0) + float(data.get("igst_amount") or 0)
    round_off = float(data.get("round_off") or 0)

    data["low_confidence"] = False
    data["confidence_note"] = None
    notes = []

    has_bill_level_gst = tax_total > 0
    if has_bill_level_gst and subtotal > 0:
        deviation = abs(items_sum - subtotal) / subtotal
        if deviation > 0.01:
            notes.append(f"Line items sum to {items_sum:.2f} but the subtotal is {subtotal:.2f} ({deviation * 100:.1f}% off)")

    if printed_total > 0:
        computed_total = subtotal + tax_total + round_off
        deviation = abs(computed_total - printed_total) / printed_total
        if deviation > 0.01:
            notes.append(f"Subtotal + tax + round-off = {computed_total:.2f} but the printed total is {printed_total:.2f} ({deviation * 100:.1f}% off)")

    if notes:
        data["low_confidence"] = True
        data["confidence_note"] = "; ".join(notes) + " — please double-check before saving."
    return data


def dumps_for_debug(data: dict) -> str:
    return json.dumps(data, indent=2, ensure_ascii=False)
