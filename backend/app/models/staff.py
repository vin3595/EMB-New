from pydantic import BaseModel, Field

from app.models.common import TimestampedModel


class Staff(TimestampedModel):
    name: str
    aliases: list[str] = Field(default_factory=list)  # handwriting/OCR spelling variants
    designation: str | None = None
    base_salary: float = 0
    active: bool = True


class StaffUpsert(BaseModel):
    name: str
    aliases: list[str] = Field(default_factory=list)
    designation: str | None = None
    base_salary: float = 0
    active: bool = True


class StaffMonth(TimestampedModel):
    staff_id: str
    month: str  # "YYYY-MM"
    present_dates: list[str] = Field(default_factory=list)


class StaffTransaction(TimestampedModel):
    staff_id: str
    staff_name: str
    txn_type: str  # "advance" | "repayment" | "salary_payout"
    amount: float
    note: str | None = None
    txn_date: str
    source_sheet_id: str | None = None
    balance_after: float = 0


class PayrollLine(BaseModel):
    staff_id: str
    staff_name: str
    designation: str | None = None
    base_salary: float
    days_in_month: int
    days_worked: int
    pro_rata_salary: float
    advances_outstanding: float
    net_payable: float
