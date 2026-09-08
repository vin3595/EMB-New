import calendar

from fastapi import APIRouter, Depends, HTTPException
from motor.motor_asyncio import AsyncIOMotorDatabase
from pydantic import BaseModel

from app.auth import get_current_user
from app.database import get_database, tenant_db
from app.models.common import new_id, utc_now
from app.models.staff import PayrollLine, Staff, StaffUpsert

router = APIRouter(prefix="/api/staff", tags=["staff"])


@router.get("")
async def list_staff(user: dict = Depends(get_current_user), db: AsyncIOMotorDatabase = Depends(get_database)):
    tdb = tenant_db(db, user)
    staff = await tdb.staff.find({}, {"_id": 0}).sort("name", 1).to_list(length=None)
    return {"staff": staff}


@router.post("")
async def create_staff(body: StaffUpsert, user: dict = Depends(get_current_user), db: AsyncIOMotorDatabase = Depends(get_database)):
    tdb = tenant_db(db, user)
    staff = Staff(**body.model_dump())
    await tdb.staff.insert_one(staff.model_dump())
    return {"staff": staff.model_dump()}


@router.put("/{staff_id}")
async def update_staff(
    staff_id: str, body: StaffUpsert, user: dict = Depends(get_current_user), db: AsyncIOMotorDatabase = Depends(get_database)
):
    tdb = tenant_db(db, user)
    update = body.model_dump()
    update["updated_at"] = utc_now()
    result = await tdb.staff.update_one({"id": staff_id}, {"$set": update})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Staff member not found")
    return {"staff": await tdb.staff.find_one({"id": staff_id}, {"_id": 0})}


@router.delete("/{staff_id}")
async def delete_staff(staff_id: str, user: dict = Depends(get_current_user), db: AsyncIOMotorDatabase = Depends(get_database)):
    tdb = tenant_db(db, user)
    result = await tdb.staff.delete_one({"id": staff_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Staff member not found")
    return {"ok": True}


class TransactionRequest(BaseModel):
    txn_type: str  # "advance" | "repayment"
    amount: float
    note: str | None = None
    txn_date: str


@router.get("/{staff_id}/transactions")
async def staff_transactions(staff_id: str, user: dict = Depends(get_current_user), db: AsyncIOMotorDatabase = Depends(get_database)):
    tdb = tenant_db(db, user)
    txns = await tdb.staff_transactions.find({"staff_id": staff_id}, {"_id": 0}).sort("txn_date", -1).to_list(length=None)
    return {"transactions": txns}


@router.post("/{staff_id}/transactions")
async def add_staff_transaction(
    staff_id: str, body: TransactionRequest, user: dict = Depends(get_current_user), db: AsyncIOMotorDatabase = Depends(get_database)
):
    tdb = tenant_db(db, user)
    staff = await tdb.staff.find_one({"id": staff_id})
    if not staff:
        raise HTTPException(status_code=404, detail="Staff member not found")

    last_txn = await tdb.staff_transactions.find_one({"staff_id": staff_id}, sort=[("created_at", -1)])
    prior_balance = last_txn["balance_after"] if last_txn else 0.0
    delta = body.amount if body.txn_type == "advance" else -body.amount
    new_balance = prior_balance + delta

    txn = {
        "id": new_id(),
        "staff_id": staff_id,
        "staff_name": staff["name"],
        "txn_type": body.txn_type,
        "amount": body.amount,
        "note": body.note,
        "txn_date": body.txn_date,
        "source_sheet_id": None,
        "balance_after": new_balance,
        "created_at": utc_now(),
        "updated_at": utc_now(),
    }
    await tdb.staff_transactions.insert_one(txn)
    return {"transaction": txn}


@router.get("/attendance")
async def attendance(month: str, user: dict = Depends(get_current_user), db: AsyncIOMotorDatabase = Depends(get_database)):
    tdb = tenant_db(db, user)
    months = await tdb.staff_months.find({"month": month}, {"_id": 0}).to_list(length=None)
    return {"attendance": months}


@router.get("/payroll")
async def payroll(month: str, user: dict = Depends(get_current_user), db: AsyncIOMotorDatabase = Depends(get_database)):
    tdb = tenant_db(db, user)
    year, mon = int(month[:4]), int(month[5:7])
    days_in_month = calendar.monthrange(year, mon)[1]

    all_staff = await tdb.staff.find({"active": True}, {"_id": 0}).to_list(length=None)
    lines: list[PayrollLine] = []

    for s in all_staff:
        month_doc = await tdb.staff_months.find_one({"staff_id": s["id"], "month": month})
        days_worked = len(month_doc["present_dates"]) if month_doc else 0
        pro_rata = round(s["base_salary"] * days_worked / days_in_month, 2)

        last_txn = await tdb.staff_transactions.find_one({"staff_id": s["id"]}, sort=[("created_at", -1)])
        outstanding = last_txn["balance_after"] if last_txn else 0.0

        lines.append(
            PayrollLine(
                staff_id=s["id"],
                staff_name=s["name"],
                designation=s.get("designation"),
                base_salary=s["base_salary"],
                days_in_month=days_in_month,
                days_worked=days_worked,
                pro_rata_salary=pro_rata,
                advances_outstanding=outstanding,
                net_payable=round(pro_rata - outstanding, 2),
            )
        )

    return {"payroll": [line.model_dump() for line in lines]}
