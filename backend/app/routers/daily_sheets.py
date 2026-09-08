from fastapi import APIRouter, Depends, HTTPException, UploadFile
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.auth import get_current_user
from app.database import get_database, tenant_db
from app.models.common import utc_now
from app.models.daily_sheet import DailySheet, DailySheetSaveRequest
from app.services.daily_sheet_engine import route_daily_sheet, unroute_daily_sheet
from app.services.image_utils import preprocess_bill_image
from app.services.ocr_daily_sheet import extract_daily_sheet_from_image

router = APIRouter(prefix="/api/daily-sheets", tags=["daily-sheets"])


@router.post("/scan")
async def scan_daily_sheet(file: UploadFile, user: dict = Depends(get_current_user)):
    raw = await file.read()
    if not raw:
        raise HTTPException(status_code=400, detail="Empty file upload")
    jpeg_bytes = preprocess_bill_image(raw)
    try:
        extracted = await extract_daily_sheet_from_image(jpeg_bytes)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    return {"extracted": extracted}


@router.post("")
async def save_daily_sheet(
    body: DailySheetSaveRequest,
    user: dict = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_database),
):
    tdb = tenant_db(db, user)
    payload = body.model_dump(exclude={"id"})

    if body.id:
        existing = await tdb.daily_sheets.find_one({"id": body.id})
        if not existing:
            raise HTTPException(status_code=404, detail="Daily sheet not found")
        await unroute_daily_sheet(tdb, existing)
        sheet = DailySheet(**payload, id=body.id, created_at=existing["created_at"], updated_at=utc_now())
    else:
        sheet = DailySheet(**payload)

    sheet_dict = sheet.model_dump()
    sheet_dict["routed"] = await route_daily_sheet(tdb, sheet_dict)
    sheet_dict["vouchers_generated"] = []

    await tdb.daily_sheets.replace_one({"id": sheet_dict["id"]}, sheet_dict, upsert=True)
    return {"sheet": sheet_dict}


@router.get("")
async def list_daily_sheets(
    skip: int = 0,
    limit: int = 50,
    user: dict = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_database),
):
    tdb = tenant_db(db, user)
    cursor = tdb.daily_sheets.find({}, {"_id": 0}).sort("sheet_date", -1).skip(skip).limit(limit)
    sheets = await cursor.to_list(length=limit)
    total = await tdb.daily_sheets.count_documents({})
    return {"sheets": sheets, "total": total}


@router.get("/{sheet_id}")
async def get_daily_sheet(sheet_id: str, user: dict = Depends(get_current_user), db: AsyncIOMotorDatabase = Depends(get_database)):
    tdb = tenant_db(db, user)
    sheet = await tdb.daily_sheets.find_one({"id": sheet_id}, {"_id": 0})
    if not sheet:
        raise HTTPException(status_code=404, detail="Daily sheet not found")
    return {"sheet": sheet}


@router.delete("/{sheet_id}")
async def delete_daily_sheet(sheet_id: str, user: dict = Depends(get_current_user), db: AsyncIOMotorDatabase = Depends(get_database)):
    tdb = tenant_db(db, user)
    sheet = await tdb.daily_sheets.find_one({"id": sheet_id})
    if not sheet:
        raise HTTPException(status_code=404, detail="Daily sheet not found")
    cascaded = await unroute_daily_sheet(tdb, sheet)
    await tdb.daily_sheets.delete_one({"id": sheet_id})
    return {"ok": True, "cascaded": cascaded}
