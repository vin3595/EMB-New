from pydantic import BaseModel, Field

from app.models.common import TimestampedModel, new_id


class BillItem(BaseModel):
    id: str = Field(default_factory=new_id)
    name: str
    hsn: str | None = None
    quantity: float = 0
    unit: str | None = None
    unit_price: float = 0
    mrp: float | None = None
    discount_amount: float = 0
    discount_percent: float | None = None
    tax_rate: float | None = None
    total: float = 0


class Bill(TimestampedModel):
    vendor: str
    gstin: str | None = None
    bill_date: str | None = None
    invoice_number: str | None = None
    subtotal: float = 0
    cgst_amount: float = 0
    sgst_amount: float = 0
    igst_amount: float = 0
    round_off: float = 0
    total: float = 0
    global_discount_percent: float | None = None
    global_discount_amount: float | None = None
    items: list[BillItem] = Field(default_factory=list)
    source: str = "bill_ocr"  # bill_ocr | manual
    image_asset_id: str | None = None
    low_confidence: bool = False
    confidence_note: str | None = None
    expense_ids: list[str] = Field(default_factory=list)


class BillExtractionRequest(BaseModel):
    pass  # image comes via multipart file upload


class ManualBillRequest(BaseModel):
    vendor: str
    gstin: str | None = None
    bill_date: str | None = None
    invoice_number: str | None = None
    items: list[BillItem]
    global_discount_percent: float | None = None
    global_discount_amount: float | None = None
    cgst_amount: float = 0
    sgst_amount: float = 0
    igst_amount: float = 0
    round_off: float = 0


class BillSaveRequest(BaseModel):
    vendor: str
    gstin: str | None = None
    bill_date: str | None = None
    invoice_number: str | None = None
    subtotal: float = 0
    cgst_amount: float = 0
    sgst_amount: float = 0
    igst_amount: float = 0
    round_off: float = 0
    total: float = 0
    global_discount_percent: float | None = None
    global_discount_amount: float | None = None
    items: list[BillItem]
    source: str = "bill_ocr"
    image_asset_id: str | None = None
    low_confidence: bool = False
    confidence_note: str | None = None
