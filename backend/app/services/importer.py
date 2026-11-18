import csv
import hashlib
import io
from datetime import date
from decimal import Decimal
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.models.finance import Account, CategorizationRule, Category, Transaction, User


async def ensure_demo_setup(db: AsyncSession) -> Account:
    result = await db.execute(select(Account).limit(1))
    account = result.scalar_one_or_none()
    if account:
        return account

    user = User(email="demo@finance.local", hashed_password="demo_not_for_login")
    db.add(user)
    await db.flush()

    account = Account(user_id=user.id, name="Konto główne PLN", currency="PLN")
    db.add(account)

    categories_data = [
        ("Wynagrodzenie", "income", "#10b981"),
        ("Zakupy spożywcze", "expense", "#3b82f6"),
        ("Transport i paliwo", "expense", "#f59e0b"),
        ("Subskrypcje", "expense", "#8b5cf6"),
        ("Zakupy inne", "expense", "#ec4899"),
    ]
    categories_map: dict[str, Category] = {}
    for name, cat_type, color in categories_data:
        cat = Category(name=name, type=cat_type, color=color)
        db.add(cat)
        categories_map[name] = cat

    await db.flush()

    rules_data = [
        ("WYNAGRODZENIE", "Wynagrodzenie"),
        ("BIEDRONKA", "Zakupy spożywcze"),
        ("LIDL", "Zakupy spożywcze"),
        ("ZABKA", "Zakupy spożywcze"),
        ("ORLEN", "Transport i paliwo"),
        ("NETFLIX", "Subskrypcje"),
        ("SPOTIFY", "Subskrypcje"),
        ("ALLEGRO", "Zakupy inne"),
    ]
    for keyword, cat_name in rules_data:
        db.add(CategorizationRule(keyword=keyword, category_id=categories_map[cat_name].id))

    await db.commit()
    await db.refresh(account)
    return account


def _build_hash(account_id: int, tx_date: date, amount: Decimal, description: str) -> str:
    raw = f"{account_id}:{tx_date.isoformat()}:{amount}:{description.strip().upper()}"
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


async def process_csv_import(db: AsyncSession, raw_bytes: bytes) -> tuple[int, int]:
    account = await ensure_demo_setup(db)

    rules_result = await db.execute(select(CategorizationRule))
    rules = rules_result.scalars().all()

    text = raw_bytes.decode("utf-8-sig")
    reader = csv.DictReader(io.StringIO(text))

    parsed_rows = []
    candidate_hashes = []

    for row in reader:
        tx_date = date.fromisoformat(row["date"].strip())
        description = row["description"].strip()
        amount = Decimal(row["amount"].strip().replace(",", "."))
        tx_hash = _build_hash(account.id, tx_date, amount, description)

        parsed_rows.append((tx_date, description, amount, tx_hash))
        candidate_hashes.append(tx_hash)

    if not candidate_hashes:
        return 0, 0

    existing_result = await db.execute(
        select(Transaction.transaction_hash).where(Transaction.transaction_hash.in_(candidate_hashes))
    )
    existing_hashes = set(existing_result.scalars().all())

    imported = 0
    skipped = 0
    seen_in_batch: set[str] = set()

    for tx_date, description, amount, tx_hash in parsed_rows:
        if tx_hash in existing_hashes or tx_hash in seen_in_batch:
            skipped += 1
            continue

        seen_in_batch.add(tx_hash)
        desc_upper = description.upper()
        matched_category_id = next(
            (rule.category_id for rule in rules if rule.keyword.upper() in desc_upper),
            None,
        )

        db.add(
            Transaction(
                account_id=account.id,
                category_id=matched_category_id,
                amount=amount,
                description=description,
                transaction_date=tx_date,
                transaction_hash=tx_hash,
            )
        )
        imported += 1

    await db.commit()
    return imported, skipped