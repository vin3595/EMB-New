from xml.etree.ElementTree import Element, SubElement, tostring
from xml.dom import minidom


def _date_ddmmyyyy_to_tally(date_str: str) -> str:
    """'2026-08-21' -> '20260821' (Tally's YYYYMMDD)."""
    return date_str.replace("-", "")


def build_tally_voucher_xml(vouchers: list[dict], company_name: str) -> str:
    """Build a Tally-importable XML document for the given vouchers.

    Convention used (matches Tally's own XML export for payment/receipt vouchers):
    the ledger being debited carries ISDEEMEDPOSITIVE=Yes with a negative AMOUNT,
    the ledger being credited carries ISDEEMEDPOSITIVE=No with a positive AMOUNT.
    """
    envelope = Element("ENVELOPE")
    header = SubElement(envelope, "HEADER")
    SubElement(header, "TALLYREQUEST").text = "Import Data"

    body = SubElement(envelope, "BODY")
    import_data = SubElement(body, "IMPORTDATA")
    request_desc = SubElement(import_data, "REQUESTDESC")
    SubElement(request_desc, "REPORTNAME").text = "Vouchers"
    static_vars = SubElement(request_desc, "STATICVARIABLES")
    SubElement(static_vars, "SVCURRENTCOMPANY").text = company_name

    request_data = SubElement(import_data, "REQUESTDATA")

    for v in vouchers:
        message = SubElement(request_data, "TALLYMESSAGE")
        message.set("xmlns:UDF", "TallyUDF")
        voucher = SubElement(message, "VOUCHER")
        voucher.set("VCHTYPE", v["voucher_type"])
        voucher.set("ACTION", "Create")

        SubElement(voucher, "DATE").text = _date_ddmmyyyy_to_tally(v["voucher_date"])
        SubElement(voucher, "VOUCHERTYPENAME").text = v["voucher_type"]
        SubElement(voucher, "VOUCHERNUMBER").text = v["voucher_number"]
        SubElement(voucher, "PARTYLEDGERNAME").text = v.get("party") or "Cash"
        SubElement(voucher, "NARRATION").text = v.get("narration") or ""
        if v.get("compliance_flag"):
            SubElement(voucher, "NARRATION").text = f"{v.get('narration') or ''} [Section 40A(3) cash limit exceeded]"

        for line in v.get("ledger_lines", []):
            entry = SubElement(voucher, "ALLLEDGERENTRIES.LIST")
            SubElement(entry, "LEDGERNAME").text = line["ledger"]
            if line["dr_amount"] > 0:
                SubElement(entry, "ISDEEMEDPOSITIVE").text = "Yes"
                SubElement(entry, "AMOUNT").text = f"-{line['dr_amount']:.2f}"
            else:
                SubElement(entry, "ISDEEMEDPOSITIVE").text = "No"
                SubElement(entry, "AMOUNT").text = f"{line['cr_amount']:.2f}"

    rough = tostring(envelope, encoding="utf-8")
    return minidom.parseString(rough).toprettyxml(indent="  ")
