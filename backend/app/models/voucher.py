from pydantic import BaseModel, Field

from app.models.common import TimestampedModel

VOUCHER_TYPES = [
    "Payment",
    "Bank Payment",
    "Salary",
    "Drawings",
    "Advance",
    "CAPEX",
    "Journal",
]

SECTION_40A3_FLAG = "SECTION_40A3_DISALLOWED"
SECTION_40A3_THRESHOLD = 10000.0


class LedgerLine(BaseModel):
    ledger: str
    dr_amount: float = 0
    cr_amount: float = 0


class Voucher(TimestampedModel):
    voucher_number: str
    voucher_type: str
    voucher_date: str
    party: str | None = None
    category: str | None = None
    amount: float = 0
    payment_mode: str = "Cash"  # Cash | Bank
    narration: str | None = None
    ledger_lines: list[LedgerLine] = Field(default_factory=list)
    compliance_flag: str | None = None
    source_sheet_id: str | None = None
    source_bill_id: str | None = None
    stock_ledger_ids: list[str] = Field(default_factory=list)


class VoucherPreviewLine(BaseModel):
    voucher_type: str
    voucher_date: str
    party: str | None = None
    category: str | None = None
    amount: float = 0
    payment_mode: str = "Cash"
    narration: str | None = None
    compliance_flag: str | None = None
    source_expense_id: str | None = None
    is_item_based: bool = False
    item_name: str | None = None
    quantity: float | None = None
    unit: str | None = None


class ConvertToVouchersRequest(BaseModel):
    sheet_id: str


class CommitVouchersRequest(BaseModel):
    sheet_id: str
    lines: list[VoucherPreviewLine]


class BulkDeleteVouchersRequest(BaseModel):
    voucher_ids: list[str]
