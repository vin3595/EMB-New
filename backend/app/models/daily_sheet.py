from pydantic import BaseModel, Field

from app.models.common import TimestampedModel, new_id


class ExpenseRow(BaseModel):
    id: str = Field(default_factory=new_id)
    item: str
    amount: float = 0
    unit_price: float | None = None
    quantity: float | None = None
    category: str | None = None
    party: str | None = None


class VijayRasRow(BaseModel):
    id: str = Field(default_factory=new_id)
    item: str
    quantity: float = 0
    unit: str | None = None
    amount: float = 0
    direction: str  # "in" (Vijay Ras Bhandar, retail incoming) | "out" (Vijay Ras, wholesale outgoing)


class StaffAdvanceRow(BaseModel):
    id: str = Field(default_factory=new_id)
    staff_name: str
    amount: float = 0
    note: str | None = None


class DueCollectedRow(BaseModel):
    id: str = Field(default_factory=new_id)
    party: str
    amount: float = 0
    note: str | None = None


class RoutedBacklink(BaseModel):
    collection: str
    ids: list[str] = Field(default_factory=list)


class DailySheet(TimestampedModel):
    sheet_date: str
    cash_in: float = 0
    cash_out: float = 0
    vijay_ras_bhandar: list[VijayRasRow] = Field(default_factory=list)
    vijay_ras: list[VijayRasRow] = Field(default_factory=list)
    expenses: list[ExpenseRow] = Field(default_factory=list)
    absent_staff: list[str] = Field(default_factory=list)
    advances: list[StaffAdvanceRow] = Field(default_factory=list)
    dues_collected: list[DueCollectedRow] = Field(default_factory=list)
    image_asset_id: str | None = None
    source: str = "ocr"  # ocr | manual
    low_confidence: bool = False
    routed: list[RoutedBacklink] = Field(default_factory=list)
    vouchers_generated: list[str] = Field(default_factory=list)


class DailySheetSaveRequest(BaseModel):
    id: str | None = None  # present when re-saving/editing an existing sheet
    sheet_date: str
    cash_in: float = 0
    cash_out: float = 0
    vijay_ras_bhandar: list[VijayRasRow] = Field(default_factory=list)
    vijay_ras: list[VijayRasRow] = Field(default_factory=list)
    expenses: list[ExpenseRow] = Field(default_factory=list)
    absent_staff: list[str] = Field(default_factory=list)
    advances: list[StaffAdvanceRow] = Field(default_factory=list)
    dues_collected: list[DueCollectedRow] = Field(default_factory=list)
    image_asset_id: str | None = None
    source: str = "ocr"
    low_confidence: bool = False
