from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, UploadFile
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.auth import get_current_user
from app.database import get_database, tenant_db
from app.models.bill import Bill, BillSaveRequest
from app.models.common import new_id, utc_now
from app.services.image_utils import preprocess_bill_image
from app.services.ocr_bill import extract_bill_from_image
from app.services.stock_engine import add_stock_lot

router = APIRouter(prefix="/api/bills", tags=["bills"])


@router.post("/scan")
async def scan_bill(file: UploadFile, user: dict = Depends(get_current_user)):
    raw = await file.read()
    if not raw:
        raise HTTPException(status_code=400, detail="Empty file upload")
    try:
        jpeg_bytes = preprocess_bill_image(raw)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Could not read image: {exc}") from exc

    try:
        extracted = await extract_bill_from_image(jpeg_bytes)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    return {"extracted": extracted}


@router.post("")
async def save_bill(
    body: BillSaveRequest,
    user: dict = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_database),
):
    tdb = tenant_db(db, user)
    bill = Bill(**body.model_dump())

    expense_ids: list[str] = []
    now = utc_now()
    expense_docs = []
    for item in bill.items:
        expense_id = new_id()
        expense_ids.append(expense_id)
        expense_docs.append(
            {
                "id": expense_id,
                "date": bill.bill_date or now[:10],
                "item": item.name,
                "amount": item.total,
                "unit_price": item.unit_price,
                "quantity": item.quantity,
                "category": "Purchase",
                "party": bill.vendor,
                "source": "bill_ocr",
                "source_id": bill.id,
                "created_at": now,
            }
        )
    if expense_docs:
        await tdb.expenses.insert_many(expense_docs)
    bill.expense_ids = expense_ids

    for item in bill.items:
        if not item.name:
            continue
        await tdb.item_master.update_one(
            {"name": item.name},
            {
                "$set": {
                    "last_unit_price": item.unit_price,
                    "unit": item.unit or "pcs",
                    "hsn": item.hsn,
                    "updated_at": now,
                },
                "$setOnInsert": {
                    "id": new_id(),
                    "created_at": now,
                    "current_stock": 0,
                    "is_prepped": False,
                },
            },
            upsert=True,
        )
        item_doc = await tdb.item_master.find_one({"name": item.name})
        if item_doc and item.quantity > 0:
            await add_stock_lot(tdb, item_doc["id"], item.quantity, item.unit_price, source="purchase")

    await tdb.bills.insert_one(bill.model_dump())
    return {"bill": bill.model_dump()}


@router.get("")
async def list_bills(
    skip: int = 0,
    limit: int = 50,
    user: dict = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_database),
):
    tdb = tenant_db(db, user)
    cursor = tdb.bills.find({}, {"_id": 0}).sort("bill_date", -1).skip(skip).limit(limit)
    bills = await cursor.to_list(length=limit)
    total = await tdb.bills.count_documents({})
    return {"bills": bills, "total": total}


@router.get("/{bill_id}")
async def get_bill(bill_id: str, user: dict = Depends(get_current_user), db: AsyncIOMotorDatabase = Depends(get_database)):
    tdb = tenant_db(db, user)
    bill = await tdb.bills.find_one({"id": bill_id}, {"_id": 0})
    if not bill:
        raise HTTPException(status_code=404, detail="Bill not found")
    return {"bill": bill}


@router.delete("/{bill_id}")
async def delete_bill(bill_id: str, user: dict = Depends(get_current_user), db: AsyncIOMotorDatabase = Depends(get_database)):
    tdb = tenant_db(db, user)
    bill = await tdb.bills.find_one({"id": bill_id})
    if not bill:
        raise HTTPException(status_code=404, detail="Bill not found")

    deleted_expenses = 0
    if bill.get("expense_ids"):
        result = await tdb.expenses.delete_many({"id": {"$in": bill["expense_ids"]}})
        deleted_expenses = result.deleted_count
    await tdb.bills.delete_one({"id": bill_id})
    return {"ok": True, "cascaded": {"expenses_deleted": deleted_expenses}}
