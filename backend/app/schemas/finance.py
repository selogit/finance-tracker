from datetime import date
from decimal import Decimal
from pydantic import BaseModel, ConfigDict


class CategoryOut(BaseModel):
    id: int
    name: str
    type: str
    color: str

    model_config = ConfigDict(from_attributes=True)


class TransactionOut(BaseModel):
    id: int
    amount: Decimal
    description: str
    transaction_date: date
    category: CategoryOut | None = None

    model_config = ConfigDict(from_attributes=True)


class TransactionCategoryUpdate(BaseModel):
    category_id: int | None


class ImportSummary(BaseModel):
    imported_count: int
    skipped_duplicates: int


class MonthlyCategoryStat(BaseModel):
    month: str
    category: str
    color: str
    total: Decimal