from datetime import date

import openpyxl
from fastapi import APIRouter, Depends, HTTPException, UploadFile
from io import BytesIO
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.auth import get_current_user
from app.database import get_database, tenant_db
from app.models.common import new_id, utc_now
from app.models.item import PrepBatchRequest, ProductionRunRequest, Recipe, RecipeUpsert
from app.services.barcode import build_zpl_label
from app.services.stock_engine import add_stock_lot, consume_fifo, get_or_create_item

router = APIRouter(prefix="/api", tags=["recipes"])

MARGIN_ALERT_THRESHOLD = 0.65  # wholesale cost above 65% of sale price gets flagged


@router.get("/recipes")
async def list_recipes(
    recipe_type: str | None = None, user: dict = Depends(get_current_user), db: AsyncIOMotorDatabase = Depends(get_database)
):
    tdb = tenant_db(db, user)
    query = {"recipe_type": recipe_type} if recipe_type else {}
    recipes = await tdb.recipes.find(query, {"_id": 0}).sort("name", 1).to_list(length=None)
    return {"recipes": recipes}


@router.post("/recipes")
async def create_recipe(body: RecipeUpsert, user: dict = Depends(get_current_user), db: AsyncIOMotorDatabase = Depends(get_database)):
    tdb = tenant_db(db, user)
    recipe = Recipe(**body.model_dump())
    await tdb.recipes.insert_one(recipe.model_dump())
    return {"recipe": recipe.model_dump()}


@router.put("/recipes/{recipe_id}")
async def update_recipe(
    recipe_id: str, body: RecipeUpsert, user: dict = Depends(get_current_user), db: AsyncIOMotorDatabase = Depends(get_database)
):
    tdb = tenant_db(db, user)
    update = body.model_dump()
    update["updated_at"] = utc_now()
    result = await tdb.recipes.update_one({"id": recipe_id}, {"$set": update})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Recipe not found")
    return {"recipe": await tdb.recipes.find_one({"id": recipe_id}, {"_id": 0})}


@router.delete("/recipes/{recipe_id}")
async def delete_recipe(recipe_id: str, user: dict = Depends(get_current_user), db: AsyncIOMotorDatabase = Depends(get_database)):
    tdb = tenant_db(db, user)
    result = await tdb.recipes.delete_one({"id": recipe_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Recipe not found")
    return {"ok": True}


@router.get("/recipes/margin-alerts")
async def margin_alerts(user: dict = Depends(get_current_user), db: AsyncIOMotorDatabase = Depends(get_database)):
    tdb = tenant_db(db, user)
    recipes = await tdb.recipes.find({"recipe_type": "menu", "sale_price": {"$ne": None}}, {"_id": 0}).to_list(length=None)
    items_by_id = {i["id"]: i async for i in tdb.item_master.find({}, {"_id": 0})}

    alerts = []
    for recipe in recipes:
        cost = sum((items_by_id.get(line["item_id"], {}).get("last_unit_price") or 0) * line["quantity"] for line in recipe["bom"])
        sale_price = recipe["sale_price"] or 0
        if sale_price > 0 and cost / sale_price > MARGIN_ALERT_THRESHOLD:
            alerts.append(
                {
                    "recipe_id": recipe["id"],
                    "recipe_name": recipe["name"],
                    "cost": round(cost, 2),
                    "sale_price": sale_price,
                    "cost_ratio": round(cost / sale_price, 3),
                }
            )
    return {"alerts": alerts}


@router.post("/recipes/petpooja-sync")
async def petpooja_sync(file: UploadFile, user: dict = Depends(get_current_user), db: AsyncIOMotorDatabase = Depends(get_database)):
    tdb = tenant_db(db, user)
    raw = await file.read()
    try:
        workbook = openpyxl.load_workbook(BytesIO(raw), data_only=True)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Could not read XLSX: {exc}") from exc

    sheet = workbook.active
    updated, created = 0, 0
    for row in sheet.iter_rows(min_row=2, values_only=True):
        if not row or not row[0]:
            continue
        name = str(row[0]).strip()
        opening_qty = float(row[1]) if len(row) > 1 and row[1] is not None else 0
        unit = str(row[2]).strip() if len(row) > 2 and row[2] else "pcs"

        existing = await tdb.item_master.find_one({"name": name})
        if existing:
            await tdb.item_master.update_one({"id": existing["id"]}, {"$set": {"current_stock": opening_qty, "unit": unit, "updated_at": utc_now()}})
            updated += 1
        else:
            now = utc_now()
            await tdb.item_master.insert_one(
                {
                    "id": new_id(),
                    "name": name,
                    "sku": None,
                    "unit": unit,
                    "hsn": None,
                    "current_stock": opening_qty,
                    "last_unit_price": None,
                    "mrp": None,
                    "reorder_level": None,
                    "is_prepped": False,
                    "created_at": now,
                    "updated_at": now,
                }
            )
            created += 1

    await tdb.petpooja_syncs.insert_one(
        {"id": new_id(), "filename": file.filename, "updated": updated, "created": created, "created_at": utc_now()}
    )
    return {"updated": updated, "created": created}


@router.get("/recipes/petpooja-sync/history")
async def petpooja_sync_history(user: dict = Depends(get_current_user), db: AsyncIOMotorDatabase = Depends(get_database)):
    tdb = tenant_db(db, user)
    history = await tdb.petpooja_syncs.find({}, {"_id": 0}).sort("created_at", -1).limit(20).to_list(length=20)
    return {"history": history}


@router.post("/prep-batches")
async def run_prep_batch(body: PrepBatchRequest, user: dict = Depends(get_current_user), db: AsyncIOMotorDatabase = Depends(get_database)):
    tdb = tenant_db(db, user)
    recipe = await tdb.recipes.find_one({"id": body.recipe_id, "recipe_type": "prep"}, {"_id": 0})
    if not recipe:
        raise HTTPException(status_code=404, detail="Prep recipe not found")

    total_cost = 0.0
    consumption_log = []
    for line in recipe["bom"]:
        result = await consume_fifo(tdb, line["item_id"], line["quantity"] * body.batches)
        total_cost += result["total_cost"]
        consumption_log.append({"item_id": line["item_id"], "item_name": line["item_name"], "quantity": line["quantity"] * body.batches, "cost": result["total_cost"]})

    yield_qty = recipe["yield_quantity"] * body.batches
    output_item = await get_or_create_item(tdb, recipe["name"], unit=recipe["yield_unit"], is_prepped=True)
    unit_cost = total_cost / yield_qty if yield_qty else 0
    await add_stock_lot(tdb, output_item["id"], yield_qty, unit_cost, source="prep")

    batch_doc = {
        "id": new_id(),
        "recipe_id": recipe["id"],
        "recipe_name": recipe["name"],
        "batches": body.batches,
        "yield_quantity": yield_qty,
        "yield_unit": recipe["yield_unit"],
        "total_cost": round(total_cost, 2),
        "consumption": consumption_log,
        "note": body.note,
        "created_at": utc_now(),
    }
    await tdb.prep_batches.insert_one(batch_doc)
    return {"batch": {k: v for k, v in batch_doc.items() if k != "_id"}}


@router.get("/prep-batches")
async def list_prep_batches(user: dict = Depends(get_current_user), db: AsyncIOMotorDatabase = Depends(get_database)):
    tdb = tenant_db(db, user)
    batches = await tdb.prep_batches.find({}, {"_id": 0}).sort("created_at", -1).to_list(length=None)
    return {"batches": batches}


async def _next_lot_number(tdb, prefix: str = "LOT") -> str:
    today = date.today().strftime("%Y%m%d")
    counter_id = f"{prefix}-{today}"
    doc = await tdb.lot_counters.find_one_and_update(
        {"id": counter_id}, {"$inc": {"seq": 1}, "$setOnInsert": {"created_at": utc_now()}}, upsert=True, return_document=True
    )
    return f"{prefix}-{today}-{doc['seq']:03d}"


@router.post("/production/run")
async def run_production(body: ProductionRunRequest, user: dict = Depends(get_current_user), db: AsyncIOMotorDatabase = Depends(get_database)):
    tdb = tenant_db(db, user)
    recipe = await tdb.recipes.find_one({"id": body.recipe_id}, {"_id": 0})
    if not recipe:
        raise HTTPException(status_code=404, detail="Recipe not found")

    scale = body.lot_size / recipe["yield_quantity"] if recipe["yield_quantity"] else body.lot_size
    total_cost = 0.0
    consumed_lots = []
    for line in recipe["bom"]:
        result = await consume_fifo(tdb, line["item_id"], line["quantity"] * scale)
        total_cost += result["total_cost"]
        consumed_lots.append({"item_id": line["item_id"], "item_name": line["item_name"], "quantity": line["quantity"] * scale, **result})

    lot_number = await _next_lot_number(tdb)
    unit_cost = total_cost / body.lot_size if body.lot_size else 0
    zpl = build_zpl_label(lot_number, recipe["name"], body.lot_size, recipe["yield_unit"])

    lot_doc = {
        "id": new_id(),
        "recipe_id": recipe["id"],
        "recipe_name": recipe["name"],
        "lot_number": lot_number,
        "quantity_produced": body.lot_size,
        "unit": recipe["yield_unit"],
        "unit_cost": round(unit_cost, 2),
        "total_cost": round(total_cost, 2),
        "expiry_date": body.expiry_date,
        "consumed_lots": consumed_lots,
        "zpl_label": zpl,
        "created_at": utc_now(),
        "updated_at": utc_now(),
    }
    await tdb.production_lots.insert_one(lot_doc)

    output_item = await get_or_create_item(tdb, recipe["name"], unit=recipe["yield_unit"])
    await add_stock_lot(tdb, output_item["id"], body.lot_size, unit_cost, source="production")

    return {"lot": {k: v for k, v in lot_doc.items() if k != "_id"}}


@router.get("/production/lots")
async def list_production_lots(user: dict = Depends(get_current_user), db: AsyncIOMotorDatabase = Depends(get_database)):
    tdb = tenant_db(db, user)
    lots = await tdb.production_lots.find({}, {"_id": 0}).sort("created_at", -1).to_list(length=None)
    return {"lots": lots}
