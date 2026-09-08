from app.database import TenantDB
from app.models.common import new_id, utc_now
from app.services.staff_match import fuzzy_match_staff


def _month_of(date_str: str) -> str:
    return date_str[:7]


async def unroute_daily_sheet(tdb: TenantDB, sheet: dict) -> dict:
    """Delete every doc a previous save of this sheet spawned, and reverse any
    vouchers/stock ledger entries generated from it. Safe to call on a sheet
    that was never routed (e.g. brand new)."""
    counts = {"expenses": 0, "vijay_ras_entries": 0, "staff_transactions": 0, "dues_entries": 0}

    for link in sheet.get("routed", []):
        collection = link.get("collection")
        ids = link.get("ids") or []
        if not ids:
            continue
        if collection == "attendance":
            sheet_date = sheet["sheet_date"]
            month = _month_of(sheet_date)
            await tdb.staff_months.update_many(
                {"staff_id": {"$in": ids}, "month": month},
                {"$pull": {"present_dates": sheet_date}},
            )
            continue
        if collection in counts:
            result = await tdb[collection].delete_many({"id": {"$in": ids}})
            counts[collection] = result.deleted_count

    if sheet.get("vouchers_generated"):
        from app.services.voucher_engine import reverse_vouchers  # local import avoids a circular dependency

        await reverse_vouchers(tdb, sheet["vouchers_generated"])

    return counts


async def route_daily_sheet(tdb: TenantDB, sheet: dict) -> list[dict]:
    """Create expenses / vijay_ras_entries / staff_transactions / dues_entries rows
    for a (freshly unrouted) daily sheet, mark attendance, and return the new
    `routed` backlink list to store on the sheet doc."""
    now = utc_now()
    sheet_date = sheet["sheet_date"]
    sheet_id = sheet["id"]
    routed: list[dict] = []

    expense_ids = []
    expense_docs = []
    for row in sheet.get("expenses", []):
        eid = new_id()
        expense_ids.append(eid)
        expense_docs.append(
            {
                "id": eid,
                "date": sheet_date,
                "item": row["item"],
                "amount": row["amount"],
                "unit_price": row.get("unit_price"),
                "quantity": row.get("quantity"),
                "category": row.get("category") or "Daily Expense",
                "party": None,
                "source": "daily_sheet",
                "source_id": sheet_id,
                "created_at": now,
            }
        )
    if expense_docs:
        await tdb.expenses.insert_many(expense_docs)
        routed.append({"collection": "expenses", "ids": expense_ids})

    vijay_ras_ids = []
    vijay_ras_docs = []
    for row in sheet.get("vijay_ras_bhandar", []):
        vid = new_id()
        vijay_ras_ids.append(vid)
        vijay_ras_docs.append({**row, "id": vid, "direction": "in", "date": sheet_date, "source_id": sheet_id, "created_at": now})
    for row in sheet.get("vijay_ras", []):
        vid = new_id()
        vijay_ras_ids.append(vid)
        vijay_ras_docs.append({**row, "id": vid, "direction": "out", "date": sheet_date, "source_id": sheet_id, "created_at": now})
    if vijay_ras_docs:
        await tdb.vijay_ras_entries.insert_many(vijay_ras_docs)
        routed.append({"collection": "vijay_ras_entries", "ids": vijay_ras_ids})

    dues_ids = []
    dues_docs = []
    for row in sheet.get("dues_collected", []):
        did = new_id()
        dues_ids.append(did)
        dues_docs.append(
            {"id": did, "party": row["party"], "amount": row["amount"], "note": row.get("note"), "date": sheet_date, "source_id": sheet_id, "created_at": now}
        )
    if dues_docs:
        await tdb.dues_entries.insert_many(dues_docs)
        routed.append({"collection": "dues_entries", "ids": dues_ids})

    all_staff = await tdb.staff.find({}).to_list(length=None)

    txn_ids = []
    txn_docs = []
    for row in sheet.get("advances", []):
        staff = fuzzy_match_staff(row["staff_name"], all_staff)
        prior_balance = 0.0
        if staff:
            last_txn = await tdb.staff_transactions.find_one({"staff_id": staff["id"]}, sort=[("created_at", -1)])
            prior_balance = last_txn["balance_after"] if last_txn else 0.0
        new_balance = prior_balance + row["amount"]
        tid = new_id()
        txn_ids.append(tid)
        txn_docs.append(
            {
                "id": tid,
                "staff_id": staff["id"] if staff else None,
                "staff_name": staff["name"] if staff else row["staff_name"],
                "txn_type": "advance",
                "amount": row["amount"],
                "note": row.get("note"),
                "txn_date": sheet_date,
                "source_sheet_id": sheet_id,
                "balance_after": new_balance,
                "created_at": now,
            }
        )
    if txn_docs:
        await tdb.staff_transactions.insert_many(txn_docs)
        routed.append({"collection": "staff_transactions", "ids": txn_ids})

    absent_docs = [fuzzy_match_staff(name, all_staff) for name in sheet.get("absent_staff", [])]
    absent_ids = {s["id"] for s in absent_docs if s}
    present_staff_ids = [s["id"] for s in all_staff if s.get("active", True) and s["id"] not in absent_ids]

    month = _month_of(sheet_date)
    for staff_id in present_staff_ids:
        await tdb.staff_months.update_one(
            {"staff_id": staff_id, "month": month},
            {
                "$addToSet": {"present_dates": sheet_date},
                "$setOnInsert": {"id": new_id(), "created_at": now},
            },
            upsert=True,
        )
    if present_staff_ids:
        routed.append({"collection": "attendance", "ids": present_staff_ids})

    return routed
