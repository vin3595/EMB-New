from fastapi import APIRouter, Depends
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.auth import get_current_user
from app.database import get_database, tenant_db
from app.models.settings import CompanyProfile

router = APIRouter(prefix="/api/settings", tags=["settings"])

PROFILE_DOC_ID = "profile"


@router.get("/company")
async def get_company_profile(user: dict = Depends(get_current_user), db: AsyncIOMotorDatabase = Depends(get_database)):
    tdb = tenant_db(db, user)
    doc = await tdb.company_profile.find_one({"id": PROFILE_DOC_ID}, {"_id": 0})
    return {"profile": doc or CompanyProfile().model_dump()}


@router.put("/company")
async def update_company_profile(
    body: CompanyProfile,
    user: dict = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_database),
):
    tdb = tenant_db(db, user)
    data = body.model_dump()
    data["id"] = PROFILE_DOC_ID
    await tdb.company_profile.replace_one({"id": PROFILE_DOC_ID}, data, upsert=True)
    return {"profile": data}
