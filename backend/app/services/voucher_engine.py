from collections import defaultdict

from app.database import TenantDB
from app.models.common import new_id, utc_now
from app.models.voucher import SECTION_40A3_FLAG, SECTION_40A3_THRESHOLD, LedgerLine

VOUCHER_TYPE_CODES = {
    "Payment": "PV",
    "Bank Payment": "BPV",
    "Salary": "SV",
    "Drawings": "DV",
    "Advance": "AV",
    "CAPEX": "CV",
    "Journal": "JV",
}

CATEGORY_TO_VOUCHER_TYPE = {
    "salary": "Salary",
    "drawings": "Drawings",
    "capex": "CAPEX",
    "capital expenditure": "CAPEX",
}


def classify_voucher_type(category: str | None, payment_mode: str = "Cash") -> str:
    key = (category or "").strip().lower()
    if key in CATEGORY_TO_VOUCHER_TYPE:
        return CATEGORY_TO_VOUCHER_TYPE[key]
    return "Bank Payment" if payment_mode == "Bank" else "Payment"


async def next_voucher_number(tdb: TenantDB, voucher_type: str, voucher_date: str) -> str:
    code = VOUCHER_TYPE_CODES.get(voucher_type, "JV")
    yymm = voucher_date[2:4] + voucher_date[5:7]  # "2026-08-21" -> "2608"
    counter_id = f"{code}-{yymm}"
    doc = await tdb.voucher_counters.find_one_and_update(
        {"id": counter_id},
        {"$inc": {"seq": 1}, "$setOnInsert": {"created_at": utc_now()}},
        upsert=True,
        return_document=True,
    )
    return f"{code}-{yymm}-{doc['seq']:04d}"


def _preview_line_from_expense(expense: dict) -> dict:
    category = expense.get("category") or "Daily Expense"
    return {
        "voucher_type": classify_voucher_type(category),
        "voucher_date": expense["date"],
        "party": expense.get("party"),
        "category": category,
        "amount": expense["amount"],
        "payment_mode": "Cash",
        "narration": f"Being {expense['item']} paid to {expense.get('party') or 'various'}",
        "compliance_flag": None,
        "source_expense_id": expense["id"],
        "is_item_based": expense.get("quantity") is not None,
        "item_name": expense["item"],
        "quantity": expense.get("quantity"),
        "unit": None,
    }


def _preview_line_from_advance(txn: dict) -> dict:
    return {
        "voucher_type": "Advance",
        "voucher_date": txn["txn_date"],
        "party": txn["staff_name"],
        "category": "Staff Advance",
        "amount": txn["amount"],
        "payment_mode": "Cash",
        "narration": f"Advance paid to {txn['staff_name']}" + (f" — {txn['note']}" if txn.get("note") else ""),
        "compliance_flag": None,
        "source_expense_id": None,
        "is_item_based": False,
        "item_name": None,
        "quantity": None,
        "unit": None,
    }


def apply_section_40a3(lines: list[dict]) -> list[dict]:
    """₹10,000 per party per day per expense category, cash only, aggregated before flagging."""
    totals: dict[tuple, float] = defaultdict(float)
    for line in lines:
        if line["payment_mode"] != "Cash":
            continue
        key = (line["voucher_date"], line.get("party") or "", line.get("category") or "")
        totals[key] += line["amount"]

    for line in lines:
        line["compliance_flag"] = None
        if line["payment_mode"] != "Cash":
            continue
        key = (line["voucher_date"], line.get("party") or "", line.get("category") or "")
        if totals[key] > SECTION_40A3_THRESHOLD:
            line["compliance_flag"] = SECTION_40A3_FLAG
    return lines


async def build_voucher_preview(tdb: TenantDB, sheet: dict) -> list[dict]:
    expenses = await tdb.expenses.find({"source_id": sheet["id"]}, {"_id": 0}).to_list(length=None)
    advances = await tdb.staff_transactions.find(
        {"source_sheet_id": sheet["id"], "txn_type": "advance"}, {"_id": 0}
    ).to_list(length=None)

    lines = [_preview_line_from_expense(e) for e in expenses] + [_preview_line_from_advance(a) for a in advances]
    return apply_section_40a3(lines)


def _ledger_lines_for(line: dict) -> list[LedgerLine]:
    cash_ledger = "Bank" if line["payment_mode"] == "Bank" else "Cash"
    debit_ledger = line.get("party") or line.get("category") or line["voucher_type"]
    return [
        LedgerLine(ledger=debit_ledger, dr_amount=line["amount"], cr_amount=0),
        LedgerLine(ledger=cash_ledger, dr_amount=0, cr_amount=line["amount"]),
    ]


async def commit_vouchers(tdb: TenantDB, sheet: dict, lines: list[dict]) -> list[dict]:
    created = []
    stock_ledger_docs = []
    now = utc_now()

    for line in lines:
        voucher_number = await next_voucher_number(tdb, line["voucher_type"], line["voucher_date"])
        voucher_id = new_id()
        stock_ledger_ids = []

        if line.get("is_item_based") and line.get("item_name"):
            sl_id = new_id()
            stock_ledger_ids.append(sl_id)
            stock_ledger_docs.append(
                {
                    "id": sl_id,
                    "item_name": line["item_name"],
                    "quantity": line.get("quantity") or 0,
                    "unit": line.get("unit"),
                    "unit_cost": (line["amount"] / line["quantity"]) if line.get("quantity") else line["amount"],
                    "direction": "in",
                    "date": line["voucher_date"],
                    "voucher_id": voucher_id,
                    "source_sheet_id": sheet["id"],
                    "created_at": now,
                }
            )

        voucher = {
            "id": voucher_id,
            "voucher_number": voucher_number,
            "voucher_type": line["voucher_type"],
            "voucher_date": line["voucher_date"],
            "party": line.get("party"),
            "category": line.get("category"),
            "amount": line["amount"],
            "payment_mode": line["payment_mode"],
            "narration": line.get("narration"),
            "ledger_lines": [l.model_dump() for l in _ledger_lines_for(line)],
            "compliance_flag": line.get("compliance_flag"),
            "source_sheet_id": sheet["id"],
            "source_bill_id": None,
            "stock_ledger_ids": stock_ledger_ids,
            "created_at": now,
            "updated_at": now,
        }
        created.append(voucher)

    if created:
        await tdb.vouchers.insert_many([dict(v) for v in created])
    if stock_ledger_docs:
        await tdb.stock_ledger.insert_many(stock_ledger_docs)

    voucher_ids = [v["id"] for v in created]
    await tdb.daily_sheets.update_one({"id": sheet["id"]}, {"$addToSet": {"vouchers_generated": {"$each": voucher_ids}}})
    return created


async def reverse_vouchers(tdb: TenantDB, voucher_ids: list[str]) -> dict:
    """Delete the given vouchers and reverse every stock_ledger entry they created."""
    if not voucher_ids:
        return {"vouchers_deleted": 0, "stock_ledger_reversed": 0}

    vouchers = await tdb.vouchers.find({"id": {"$in": voucher_ids}}, {"_id": 0}).to_list(length=None)
    stock_ledger_ids = [sid for v in vouchers for sid in v.get("stock_ledger_ids", [])]

    stock_reversed = 0
    if stock_ledger_ids:
        result = await tdb.stock_ledger.delete_many({"id": {"$in": stock_ledger_ids}})
        stock_reversed = result.deleted_count

    result = await tdb.vouchers.delete_many({"id": {"$in": voucher_ids}})

    sheet_ids = {v["source_sheet_id"] for v in vouchers if v.get("source_sheet_id")}
    for sheet_id in sheet_ids:
        await tdb.daily_sheets.update_one({"id": sheet_id}, {"$pull": {"vouchers_generated": {"$in": voucher_ids}}})

    return {"vouchers_deleted": result.deleted_count, "stock_ledger_reversed": stock_reversed}
