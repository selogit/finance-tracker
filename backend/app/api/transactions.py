from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload
from app.db.session import get_db
from app.models.finance import Category, Transaction
from app.schemas.finance import (
    CategoryOut,
    ImportSummary,
    MonthlyCategoryStat,
    TransactionCategoryUpdate,
    TransactionOut,
)
from app.services.importer import process_csv_import

router = APIRouter(prefix="/api", tags=["finance"])


@router.post("/transactions/import", response_model=ImportSummary)
async def import_transactions(file: UploadFile = File(...), db: AsyncSession = Depends(get_db)):
    if not file.filename or not file.filename.endswith(".csv"):
        raise HTTPException(status_code=400, detail="Wymagany jest plik w formacie CSV.")

    content = await file.read()
    imported, skipped = await process_csv_import(db, content)
    return ImportSummary(imported_count=imported, skipped_duplicates=skipped)


@router.get("/transactions", response_model=list[TransactionOut])
async def list_transactions(category_id: int | None = None, db: AsyncSession = Depends(get_db)):
    stmt = (
        select(Transaction)
        .options(selectinload(Transaction.category))
        .order_by(Transaction.transaction_date.desc(), Transaction.id.desc())
    )
    if category_id is not None:
        stmt = stmt.where(Transaction.category_id == category_id)

    result = await db.execute(stmt)
    return result.scalars().all()


@router.patch("/transactions/{transaction_id}", response_model=TransactionOut)
async def update_transaction_category(
    transaction_id: int,
    payload: TransactionCategoryUpdate,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Transaction)
        .options(selectinload(Transaction.category))
        .where(Transaction.id == transaction_id)
    )
    transaction = result.scalar_one_or_none()
    if not transaction:
        raise HTTPException(status_code=404, detail="Nie znaleziono transakcji.")

    transaction.category_id = payload.category_id
    await db.commit()
    await db.refresh(transaction, attribute_names=["category"])
    return transaction


@router.get("/categories", response_model=list[CategoryOut])
async def list_categories(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Category).order_by(Category.name))
    return result.scalars().all()


@router.get("/analytics/monthly", response_model=list[MonthlyCategoryStat])
async def get_monthly_analytics(db: AsyncSession = Depends(get_db)):
    month_expr = func.to_char(Transaction.transaction_date, "YYYY-MM")
    stmt = (
        select(
            month_expr.label("month"),
            func.coalesce(Category.name, "Bez kategorii").label("category"),
            func.coalesce(Category.color, "#64748b").label("color"),
            func.sum(Transaction.amount).label("total"),
        )
        .outerjoin(Category, Transaction.category_id == Category.id)
        .group_by(month_expr, Category.name, Category.color)
        .order_by(month_expr.desc())
    )
    result = await db.execute(stmt)
    return [
        MonthlyCategoryStat(month=row.month, category=row.category, color=row.color, total=row.total)
        for row in result.all()
    ]