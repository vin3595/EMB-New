from fastapi import APIRouter, Depends
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.auth import require_admin
from app.database import get_database, tenant_db

router = APIRouter(prefix="/api/admin", tags=["admin"])


@router.get("/tenants")
async def list_tenants(user: dict = Depends(require_admin), db: AsyncIOMotorDatabase = Depends(get_database)):
    owners = await db.users.find({}, {"_id": 0, "id": 1, "email": 1, "name": 1, "role": 1, "created_at": 1}).to_list(length=None)
    tenants = []
    for owner in owners:
        tdb = tenant_db(db, owner)
        bills_count = await tdb.bills.count_documents({})
        sheets_count = await tdb.daily_sheets.count_documents({})
        vouchers_count = await tdb.vouchers.count_documents({})
        tenants.append(
            {
                **owner,
                "bills_count": bills_count,
                "daily_sheets_count": sheets_count,
                "vouchers_count": vouchers_count,
            }
        )
    return {"tenants": tenants}
