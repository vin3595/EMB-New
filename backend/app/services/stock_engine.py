from fastapi import HTTPException

from app.database import TenantDB
from app.models.common import new_id, utc_now


async def add_stock_lot(tdb: TenantDB, item_id: str, quantity: float, unit_cost: float, source: str) -> str:
    if quantity <= 0:
        return ""
    lot_id = new_id()
    await tdb.stock_lots.insert_one(
        {
            "id": lot_id,
            "item_id": item_id,
            "quantity_remaining": quantity,
            "unit_cost": unit_cost,
            "source": source,
            "created_at": utc_now(),
        }
    )
    await tdb.item_master.update_one({"id": item_id}, {"$inc": {"current_stock": quantity}, "$set": {"updated_at": utc_now()}})
    return lot_id


async def consume_fifo(tdb: TenantDB, item_id: str, quantity_needed: float) -> dict:
    """Consume `quantity_needed` units of item_id from its oldest lots first.

    Returns {"total_cost": float, "consumed": [{"lot_id", "quantity", "unit_cost"}]}.
    Raises HTTPException(400) if the item doesn't have enough stock across all lots.
    """
    lots = await tdb.stock_lots.find({"item_id": item_id, "quantity_remaining": {"$gt": 0}}).sort("created_at", 1).to_list(length=None)

    available = sum(lot["quantity_remaining"] for lot in lots)
    if available < quantity_needed:
        raise HTTPException(status_code=400, detail=f"Insufficient stock for item {item_id}: need {quantity_needed}, have {available}")

    remaining = quantity_needed
    total_cost = 0.0
    consumed = []
    for lot in lots:
        if remaining <= 0:
            break
        take = min(lot["quantity_remaining"], remaining)
        new_remaining = lot["quantity_remaining"] - take
        await tdb.stock_lots.update_one({"id": lot["id"]}, {"$set": {"quantity_remaining": new_remaining}})
        total_cost += take * lot["unit_cost"]
        consumed.append({"lot_id": lot["id"], "quantity": take, "unit_cost": lot["unit_cost"]})
        remaining -= take

    await tdb.item_master.update_one({"id": item_id}, {"$inc": {"current_stock": -quantity_needed}, "$set": {"updated_at": utc_now()}})
    return {"total_cost": total_cost, "consumed": consumed}


async def get_or_create_item(tdb: TenantDB, name: str, unit: str = "pcs", is_prepped: bool = False) -> dict:
    item = await tdb.item_master.find_one({"name": name})
    if item:
        return item
    now = utc_now()
    item = {
        "id": new_id(),
        "name": name,
        "sku": None,
        "unit": unit,
        "hsn": None,
        "current_stock": 0,
        "last_unit_price": None,
        "mrp": None,
        "reorder_level": None,
        "is_prepped": is_prepped,
        "created_at": now,
        "updated_at": now,
    }
    await tdb.item_master.insert_one(item)
    return item
