from app.ai_client import extract_json

DAILY_SHEET_EXTRACTION_PROMPT = """You are digitizing a photograph of a handwritten Indian kirana
shop day-book ("kitab") page. The handwriting may be in Hindi/Hinglish or English, often mixing
both on the same page. Extract every section you can find into structured JSON. Not every section
appears on every page — omit what isn't present rather than inventing it.

SECTIONS TO LOOK FOR:
  - Cash In / Cash Out totals for the day (often at the top or bottom, "Jama"/"Naam" or "In"/"Out")
  - "Vijay Ras Bhandar" — retail incoming inventory (goods received into the retail shop)
  - "Vijay Ras" — wholesale outgoing (goods sent out to wholesale customers)
  - Expenses — a list of (item, amount) rows, sometimes with a per-unit rate and quantity
  - Absent staff — names of staff marked absent that day (often just a name with a cross or "A")
  - Advances given to staff — (staff name, amount)
  - Dues collected from customers/parties — (party name, amount)

Return ONLY a single JSON object, no prose, no markdown fences, matching exactly this shape:
{
  "cash_in": number,
  "cash_out": number,
  "vijay_ras_bhandar": [ { "item": string, "quantity": number, "unit": string | null, "amount": number } ],
  "vijay_ras": [ { "item": string, "quantity": number, "unit": string | null, "amount": number } ],
  "expenses": [ { "item": string, "amount": number, "unit_price": number | null, "quantity": number | null, "category": string | null } ],
  "absent_staff": [ string ],
  "advances": [ { "staff_name": string, "amount": number, "note": string | null } ],
  "dues_collected": [ { "party": string, "amount": number, "note": string | null } ]
}

All amounts are plain JSON numbers, no currency symbols or commas. Use your best reading of messy
handwriting — if a word is ambiguous, prefer the most common kirana-shop term. Return valid JSON only.
"""


async def extract_daily_sheet_from_image(image_bytes: bytes) -> dict:
    data = await extract_json(DAILY_SHEET_EXTRACTION_PROMPT, image_bytes=image_bytes, media_type="image/jpeg")
    data.setdefault("low_confidence", False)
    return data
