from fastapi import APIRouter, Depends, HTTPException
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.auth import get_current_user
from app.database import get_database, tenant_db
from app.models.common import utc_now
from app.models.item import ItemMaster, ItemMasterUpsert

router = APIRouter(prefix="/api/items", tags=["items"])


@router.get("")
async def list_items(user: dict = Depends(get_current_user), db: AsyncIOMotorDatabase = Depends(get_database)):
    tdb = tenant_db(db, user)
    items = await tdb.item_master.find({}, {"_id": 0}).sort("name", 1).to_list(length=None)
    return {"items": items}


@router.get("/reorder")
async def reorder_alerts(user: dict = Depends(get_current_user), db: AsyncIOMotorDatabase = Depends(get_database)):
    tdb = tenant_db(db, user)
    items = await tdb.item_master.find({}, {"_id": 0}).to_list(length=None)
    alerts = [i for i in items if i.get("reorder_level") is not None and i.get("current_stock", 0) <= i["reorder_level"]]
    return {"items": alerts}


@router.post("")
async def create_item(
    body: ItemMasterUpsert,
    user: dict = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_database),
):
    tdb = tenant_db(db, user)
    item = ItemMaster(**{k: v for k, v in body.model_dump().items() if v is not None})
    await tdb.item_master.insert_one(item.model_dump())
    return {"item": item.model_dump()}


@router.put("/{item_id}")
async def update_item(
    item_id: str,
    body: ItemMasterUpsert,
    user: dict = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_database),
):
    tdb = tenant_db(db, user)
    update = {k: v for k, v in body.model_dump().items() if v is not None}
    update["updated_at"] = utc_now()
    result = await tdb.item_master.update_one({"id": item_id}, {"$set": update})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Item not found")
    item = await tdb.item_master.find_one({"id": item_id}, {"_id": 0})
    return {"item": item}


@router.delete("/{item_id}")
async def delete_item(item_id: str, user: dict = Depends(get_current_user), db: AsyncIOMotorDatabase = Depends(get_database)):
    tdb = tenant_db(db, user)
    result = await tdb.item_master.delete_one({"id": item_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Item not found")
    return {"ok": True}
