from pydantic import BaseModel, Field

from app.models.common import TimestampedModel, new_id


class InvoiceItem(BaseModel):
    id: str = Field(default_factory=new_id)
    item_id: str | None = None
    name: str
    hsn: str | None = None
    quantity: float = 1
    unit_price: float = 0
    tax_rate: float = 0
    total: float = 0


class Invoice(TimestampedModel):
    invoice_number: str
    invoice_date: str
    customer_name: str
    customer_gstin: str | None = None
    customer_phone: str | None = None
    customer_email: str | None = None
    items: list[InvoiceItem] = Field(default_factory=list)
    subtotal: float = 0
    cgst_amount: float = 0
    sgst_amount: float = 0
    igst_amount: float = 0
    total: float = 0
    theme: str = "classic"  # classic | colored
    payment_status: str = "unpaid"  # unpaid | paid | partial
    razorpay_link: str | None = None


class InvoiceCreateRequest(BaseModel):
    invoice_date: str
    customer_name: str
    customer_gstin: str | None = None
    customer_phone: str | None = None
    customer_email: str | None = None
    items: list[InvoiceItem]
    theme: str = "classic"
    is_intra_state: bool = True
