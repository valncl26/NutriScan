"""Copy an existing local NutriScan SQLite database into an empty Supabase DB.

Run from backend after configuring DATABASE_URL in .env:
    python migrate_sqlite_to_supabase.py
"""

from pathlib import Path

from sqlalchemy import create_engine, inspect, select, text
from dotenv import load_dotenv

load_dotenv()
from database import Base, IS_POSTGRES, engine as destination_engine


SOURCE_PATH = Path(__file__).resolve().parent / "nutriscan.db"
TABLE_ORDER = (
    "users",
    "profiles",
    "analyses",
    "diary_entries",
    "food_records",
    "chat_messages",
)
SEQUENCED_TABLES = ("users", "analyses", "diary_entries", "food_records", "chat_messages")


def main() -> None:
    if not IS_POSTGRES:
        raise SystemExit("DATABASE_URL no apunta a PostgreSQL/Supabase.")
    if not SOURCE_PATH.is_file():
        raise SystemExit(f"No existe la base SQLite local: {SOURCE_PATH}")

    Base.metadata.create_all(bind=destination_engine)
    source_engine = create_engine(f"sqlite:///{SOURCE_PATH}")
    source_inspector = inspect(source_engine)
    source_tables = set(source_inspector.get_table_names())
    missing = set(TABLE_ORDER) - source_tables
    if missing:
        raise SystemExit("La base SQLite no contiene estas tablas esperadas: " + ", ".join(sorted(missing)))

    with destination_engine.connect() as connection:
        nonempty = []
        for table_name in TABLE_ORDER:
            count = connection.scalar(text(f'SELECT count(*) FROM "{table_name}"'))
            if count:
                nonempty.append(table_name)
        if nonempty:
            raise SystemExit(
                "La base Supabase debe estar vacía antes de copiar datos. "
                "Ya tienen datos: " + ", ".join(nonempty)
            )

    copied = {}
    with source_engine.connect() as source, destination_engine.begin() as destination:
        for table_name in TABLE_ORDER:
            source_table = Base.metadata.tables[table_name]
            rows = source.execute(select(source_table)).mappings().all()
            if rows:
                destination.execute(source_table.insert(), [dict(row) for row in rows])
            copied[table_name] = len(rows)

        for table_name in SEQUENCED_TABLES:
            destination.execute(
                text(
                    "SELECT setval(pg_get_serial_sequence(:table_name, 'id'), "
                    f"COALESCE((SELECT MAX(id) FROM \"{table_name}\"), 1), "
                    f"EXISTS (SELECT 1 FROM \"{table_name}\"))"
                ),
                {"table_name": table_name},
            )

    source_engine.dispose()
    destination_engine.dispose()
    print("Migración terminada. Filas copiadas:")
    for table_name, count in copied.items():
        print(f"  {table_name}: {count}")


if __name__ == "__main__":
    main()
