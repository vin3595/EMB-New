import csv
import io

from fastapi import APIRouter, Depends, HTTPException, Response
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.auth import get_current_user
from app.database import get_database, tenant_db
from app.models.voucher import BulkDeleteVouchersRequest, CommitVouchersRequest, ConvertToVouchersRequest
from app.services.notifications import send_email_with_attachment
from app.services.pdf_export import SLIP_STYLE, render_bulk_voucher_slips_html, render_voucher_slip_html
from app.services.tally_export import build_tally_voucher_xml
from app.services.voucher_engine import build_voucher_preview, commit_vouchers, reverse_vouchers

router = APIRouter(prefix="/api/vouchers", tags=["vouchers"])


def _build_filter(date_from: str | None, date_to: str | None, voucher_type: str | None, party: str | None, flagged_only: bool) -> dict:
    query: dict = {}
    if date_from or date_to:
        query["voucher_date"] = {}
        if date_from:
            query["voucher_date"]["$gte"] = date_from
        if date_to:
            query["voucher_date"]["$lte"] = date_to
    if voucher_type:
        query["voucher_type"] = voucher_type
    if party:
        query["party"] = {"$regex": party, "$options": "i"}
    if flagged_only:
        query["compliance_flag"] = {"$ne": None}
    return query


@router.post("/preview")
async def preview_vouchers(
    body: ConvertToVouchersRequest,
    user: dict = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_database),
):
    tdb = tenant_db(db, user)
    sheet = await tdb.daily_sheets.find_one({"id": body.sheet_id}, {"_id": 0})
    if not sheet:
        raise HTTPException(status_code=404, detail="Daily sheet not found")
    lines = await build_voucher_preview(tdb, sheet)
    return {"lines": lines}


@router.post("/commit")
async def commit_vouchers_endpoint(
    body: CommitVouchersRequest,
    user: dict = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_database),
):
    tdb = tenant_db(db, user)
    sheet = await tdb.daily_sheets.find_one({"id": body.sheet_id}, {"_id": 0})
    if not sheet:
        raise HTTPException(status_code=404, detail="Daily sheet not found")
    created = await commit_vouchers(tdb, sheet, [line.model_dump() for line in body.lines])
    return {"vouchers": created}


@router.post("/backfill")
async def backfill_vouchers(
    date_from: str,
    date_to: str,
    user: dict = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_database),
):
    tdb = tenant_db(db, user)
    sheets = await tdb.daily_sheets.find(
        {"sheet_date": {"$gte": date_from, "$lte": date_to}, "vouchers_generated": {"$size": 0}},
        {"_id": 0},
    ).to_list(length=None)

    total_created = 0
    for sheet in sheets:
        lines = await build_voucher_preview(tdb, sheet)
        if lines:
            created = await commit_vouchers(tdb, sheet, lines)
            total_created += len(created)

    return {"sheets_processed": len(sheets), "vouchers_created": total_created}


@router.get("")
async def list_vouchers(
    date_from: str | None = None,
    date_to: str | None = None,
    voucher_type: str | None = None,
    party: str | None = None,
    flagged_only: bool = False,
    skip: int = 0,
    limit: int = 100,
    user: dict = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_database),
):
    tdb = tenant_db(db, user)
    query = _build_filter(date_from, date_to, voucher_type, party, flagged_only)
    cursor = tdb.vouchers.find(query, {"_id": 0}).sort("voucher_date", -1).skip(skip).limit(limit)
    vouchers = await cursor.to_list(length=limit)
    total = await tdb.vouchers.count_documents(query)
    total_amount = sum(v["amount"] for v in vouchers)
    return {"vouchers": vouchers, "total": total, "total_amount": total_amount}


@router.get("/export/tally")
async def export_tally_xml(
    date_from: str | None = None,
    date_to: str | None = None,
    voucher_type: str | None = None,
    party: str | None = None,
    flagged_only: bool = False,
    user: dict = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_database),
):
    tdb = tenant_db(db, user)
    query = _build_filter(date_from, date_to, voucher_type, party, flagged_only)
    vouchers = await tdb.vouchers.find(query, {"_id": 0}).sort("voucher_date", 1).to_list(length=None)
    profile = await tdb.company_profile.find_one({"id": "profile"}, {"_id": 0}) or {}
    xml = build_tally_voucher_xml(vouchers, profile.get("name") or "Company")
    return Response(content=xml, media_type="application/xml", headers={"Content-Disposition": "attachment; filename=vouchers.xml"})


@router.get("/export/csv")
async def export_csv(
    date_from: str | None = None,
    date_to: str | None = None,
    voucher_type: str | None = None,
    party: str | None = None,
    flagged_only: bool = False,
    user: dict = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_database),
):
    tdb = tenant_db(db, user)
    query = _build_filter(date_from, date_to, voucher_type, party, flagged_only)
    vouchers = await tdb.vouchers.find(query, {"_id": 0}).sort("voucher_date", 1).to_list(length=None)

    buffer = io.StringIO()
    writer = csv.writer(buffer)
    writer.writerow(["Voucher Number", "Type", "Date", "Party", "Category", "Amount", "Payment Mode", "Compliance Flag", "Narration"])
    for v in vouchers:
        writer.writerow(
            [v["voucher_number"], v["voucher_type"], v["voucher_date"], v.get("party") or "", v.get("category") or "",
             f"{v['amount']:.2f}", v["payment_mode"], v.get("compliance_flag") or "", v.get("narration") or ""]
        )
    return Response(content=buffer.getvalue(), media_type="text/csv", headers={"Content-Disposition": "attachment; filename=vouchers.csv"})


@router.post("/export/email")
async def email_voucher_pack(
    date_from: str,
    date_to: str,
    user: dict = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_database),
):
    tdb = tenant_db(db, user)
    profile = await tdb.company_profile.find_one({"id": "profile"}, {"_id": 0}) or {}
    if not profile.get("ca_email"):
        raise HTTPException(status_code=400, detail="No CA email saved in Settings")

    vouchers = await tdb.vouchers.find(
        {"voucher_date": {"$gte": date_from, "$lte": date_to}}, {"_id": 0}
    ).sort("voucher_date", 1).to_list(length=None)
    if not vouchers:
        raise HTTPException(status_code=404, detail="No vouchers found in that date range")

    html = render_bulk_voucher_slips_html(vouchers, profile)
    send_email_with_attachment(
        api_key=profile.get("sendgrid_api_key", ""),
        from_email=profile.get("email", ""),
        to_email=profile["ca_email"],
        subject=f"Voucher pack {date_from} to {date_to}",
        html_body=f"Attached: voucher pack for {date_from} to {date_to}.",
        attachment_bytes=html.encode("utf-8"),
        attachment_name="voucher_pack.html",
        mime_type="text/html",
    )
    return {"ok": True, "vouchers_sent": len(vouchers)}


@router.post("/bulk-delete")
async def bulk_delete_vouchers(
    body: BulkDeleteVouchersRequest,
    user: dict = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_database),
):
    tdb = tenant_db(db, user)
    result = await reverse_vouchers(tdb, body.voucher_ids)
    return {"ok": True, "cascaded": result}


@router.get("/{voucher_id}")
async def get_voucher(voucher_id: str, user: dict = Depends(get_current_user), db: AsyncIOMotorDatabase = Depends(get_database)):
    tdb = tenant_db(db, user)
    voucher = await tdb.vouchers.find_one({"id": voucher_id}, {"_id": 0})
    if not voucher:
        raise HTTPException(status_code=404, detail="Voucher not found")
    return {"voucher": voucher}


@router.get("/{voucher_id}/slip")
async def get_voucher_slip(voucher_id: str, user: dict = Depends(get_current_user), db: AsyncIOMotorDatabase = Depends(get_database)):
    tdb = tenant_db(db, user)
    voucher = await tdb.vouchers.find_one({"id": voucher_id}, {"_id": 0})
    if not voucher:
        raise HTTPException(status_code=404, detail="Voucher not found")
    profile = await tdb.company_profile.find_one({"id": "profile"}, {"_id": 0}) or {}
    html = f"<!DOCTYPE html><html><head><meta charset='utf-8'>{SLIP_STYLE}</head><body>{render_voucher_slip_html(voucher, profile)}</body></html>"
    return Response(content=html, media_type="text/html")


@router.post("/print-bulk")
async def print_bulk_slips(
    date_from: str | None = None,
    date_to: str | None = None,
    voucher_type: str | None = None,
    party: str | None = None,
    flagged_only: bool = False,
    user: dict = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_database),
):
    tdb = tenant_db(db, user)
    query = _build_filter(date_from, date_to, voucher_type, party, flagged_only)
    vouchers = await tdb.vouchers.find(query, {"_id": 0}).sort("voucher_date", 1).to_list(length=None)
    profile = await tdb.company_profile.find_one({"id": "profile"}, {"_id": 0}) or {}
    html = render_bulk_voucher_slips_html(vouchers, profile)
    return Response(content=html, media_type="text/html")
