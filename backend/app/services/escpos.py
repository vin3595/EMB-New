from app.services.indian_number import format_inr

ESC = b"\x1b"
GS = b"\x1d"
INIT = ESC + b"@"
BOLD_ON = ESC + b"E\x01"
BOLD_OFF = ESC + b"E\x00"
CENTER = ESC + b"a\x01"
LEFT = ESC + b"a\x00"
CUT = GS + b"V\x01"


def build_escpos_receipt(invoice: dict, company: dict, width_chars: int = 32) -> bytes:
    """Build an ESC/POS byte stream for a 58mm (32 char) or 80mm (48 char) thermal roll."""
    out = INIT + CENTER + BOLD_ON
    out += (company.get("name") or "Company").encode("ascii", "ignore") + b"\n"
    out += BOLD_OFF
    out += (company.get("address") or "").encode("ascii", "ignore")[:width_chars] + b"\n"
    out += f"GSTIN: {company.get('gstin') or '-'}\n".encode("ascii", "ignore")
    out += LEFT + ("-" * width_chars).encode() + b"\n"
    out += f"Invoice: {invoice['invoice_number']}\n".encode("ascii", "ignore")
    out += f"Date: {invoice['invoice_date']}\n".encode("ascii", "ignore")
    out += ("-" * width_chars).encode() + b"\n"

    for item in invoice["items"]:
        name = item["name"][: width_chars - 10]
        line1 = f"{name}\n".encode("ascii", "ignore")
        line2 = f"{item['quantity']:g} x {item['unit_price']:.2f} = {item['total']:.2f}\n".encode("ascii", "ignore")
        out += line1 + line2

    out += ("-" * width_chars).encode() + b"\n"
    out += BOLD_ON + f"TOTAL: {format_inr(invoice['total'])}\n".encode("ascii", "ignore") + BOLD_OFF
    out += CENTER + b"Thank you!\n\n\n"
    out += CUT
    return out
