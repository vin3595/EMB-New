from datetime import date

from fastapi import APIRouter, Depends
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.auth import get_current_user
from app.database import get_database, tenant_db
from app.models.voucher import SECTION_40A3_FLAG

router = APIRouter(prefix="/api/dashboard", tags=["dashboard"])


@router.get("")
async def dashboard(user: dict = Depends(get_current_user), db: AsyncIOMotorDatabase = Depends(get_database)):
    tdb = tenant_db(db, user)
    today = date.today().isoformat()
    year_start = f"{date.today().year}-01-01"

    todays_sheet = await tdb.daily_sheets.find_one({"sheet_date": today}, {"_id": 0})
    todays_cash_out = todays_sheet["cash_out"] if todays_sheet else 0

    ytd_expenses_cursor = tdb.expenses.aggregate(
        [{"$match": {"date": {"$gte": year_start}}}, {"$group": {"_id": None, "total": {"$sum": "$amount"}}}]
    )
    ytd_expenses = await ytd_expenses_cursor.to_list(length=1)
    expenses_ytd = ytd_expenses[0]["total"] if ytd_expenses else 0

    top_vendors_cursor = tdb.bills.aggregate(
        [
            {"$group": {"_id": "$vendor", "total": {"$sum": "$total"}}},
            {"$sort": {"total": -1}},
            {"$limit": 5},
        ]
    )
    top_vendors = [{"vendor": v["_id"], "total": v["total"]} async for v in top_vendors_cursor]

    top_categories_cursor = tdb.expenses.aggregate(
        [
            {"$match": {"date": {"$gte": year_start}}},
            {"$group": {"_id": "$category", "total": {"$sum": "$amount"}}},
            {"$sort": {"total": -1}},
            {"$limit": 5},
        ]
    )
    top_categories = [{"category": c["_id"] or "Uncategorized", "total": c["total"]} async for c in top_categories_cursor]

    items = await tdb.item_master.find({}, {"_id": 0}).to_list(length=None)
    upcoming_reorders = [
        i for i in items if i.get("reorder_level") is not None and i.get("current_stock", 0) <= i["reorder_level"]
    ]

    disallowed_cursor = tdb.vouchers.aggregate(
        [
            {"$match": {"voucher_date": {"$gte": year_start}, "compliance_flag": SECTION_40A3_FLAG}},
            {"$group": {"_id": None, "total": {"$sum": "$amount"}}},
        ]
    )
    disallowed = await disallowed_cursor.to_list(length=1)
    section_40a3_ytd = disallowed[0]["total"] if disallowed else 0

    recent_bills = await tdb.bills.find({}, {"_id": 0}).sort("created_at", -1).limit(5).to_list(length=5)
    recent_sheets = await tdb.daily_sheets.find({}, {"_id": 0}).sort("sheet_date", -1).limit(5).to_list(length=5)

    return {
        "todays_cash_out": todays_cash_out,
        "expenses_ytd": expenses_ytd,
        "top_vendors": top_vendors,
        "top_categories": top_categories,
        "upcoming_reorders": upcoming_reorders,
        "section_40a3_ytd_disallowed": section_40a3_ytd,
        "recent_bills": recent_bills,
        "recent_daily_sheets": recent_sheets,
    }
