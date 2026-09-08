from pydantic import BaseModel, Field

from app.models.common import TimestampedModel


class ItemMaster(TimestampedModel):
    name: str
    sku: str | None = None
    unit: str = "pcs"
    hsn: str | None = None
    current_stock: float = 0
    last_unit_price: float | None = None
    mrp: float | None = None
    reorder_level: float | None = None
    is_prepped: bool = False  # true for intermediate items produced by a prep recipe


class ItemMasterUpsert(BaseModel):
    name: str
    sku: str | None = None
    unit: str = "pcs"
    hsn: str | None = None
    current_stock: float | None = None
    last_unit_price: float | None = None
    mrp: float | None = None
    reorder_level: float | None = None
    is_prepped: bool = False


class BOMLine(BaseModel):
    item_id: str
    item_name: str
    quantity: float
    unit: str


class Recipe(TimestampedModel):
    name: str
    recipe_type: str  # "menu" | "prep"
    yield_quantity: float = 1
    yield_unit: str = "pcs"
    bom: list[BOMLine] = Field(default_factory=list)
    sale_price: float | None = None  # for menu recipes, used in margin alerts


class RecipeUpsert(BaseModel):
    name: str
    recipe_type: str
    yield_quantity: float = 1
    yield_unit: str = "pcs"
    bom: list[BOMLine] = Field(default_factory=list)
    sale_price: float | None = None


class PrepBatchRequest(BaseModel):
    recipe_id: str
    batches: float = 1
    note: str | None = None


class StockLot(BaseModel):
    """One FIFO-consumable lot for an item — either purchased or produced."""

    id: str
    item_id: str
    quantity_remaining: float
    unit_cost: float
    source: str  # "purchase" | "prep" | "production"
    created_at: str


class ProductionLot(TimestampedModel):
    recipe_id: str
    recipe_name: str
    lot_number: str
    quantity_produced: float
    unit: str
    unit_cost: float
    total_cost: float
    expiry_date: str | None = None
    consumed_lots: list[dict] = Field(default_factory=list)


class ProductionRunRequest(BaseModel):
    recipe_id: str
    lot_size: float
    expiry_date: str | None = None
