import json
import os
from datetime import datetime, timezone

from sqlalchemy import DateTime, Float, ForeignKey, Integer, String, Text, create_engine
from sqlalchemy.engine import make_url
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, sessionmaker

DATABASE_URL = os.getenv("DATABASE_URL", "").strip()
if not DATABASE_URL:
    raise RuntimeError("Configura DATABASE_URL de Supabase en backend/.env.")

database_url = make_url(DATABASE_URL)
if database_url.drivername not in {"postgres", "postgresql", "postgresql+psycopg"}:
    raise RuntimeError("DATABASE_URL debe apuntar a PostgreSQL de Supabase.")
IS_POSTGRES = True
# Psycopg 3 and required SSL keep the connection to hosted PostgreSQL encrypted.
database_url = database_url.set(drivername="postgresql+psycopg")
if "sslmode" not in database_url.query:
    database_url = database_url.update_query_dict({"sslmode": "require"})
engine = create_engine(database_url, pool_pre_ping=True)
SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


def utcnow():
    return datetime.now(timezone.utc)


class Base(DeclarativeBase):
    pass


class User(Base):
    __tablename__ = "users"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(100))
    email: Mapped[str] = mapped_column(String(254), unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(500))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class Profile(Base):
    __tablename__ = "profiles"
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    age: Mapped[int | None] = mapped_column(Integer, nullable=True)
    sex: Mapped[str | None] = mapped_column(String(40), nullable=True)
    height_cm: Mapped[float | None] = mapped_column(Float, nullable=True)
    current_weight_kg: Mapped[float | None] = mapped_column(Float, nullable=True)
    target_weight_kg: Mapped[float | None] = mapped_column(Float, nullable=True)
    activity_level: Mapped[str] = mapped_column(String(40), default="moderado")
    goal: Mapped[str] = mapped_column(String(80), default="mejorar hábitos")
    food_preferences: Mapped[str] = mapped_column(Text, default="")
    allergies: Mapped[str] = mapped_column(Text, default="")
    excluded_foods: Mapped[str] = mapped_column(Text, default="")
    diet_type: Mapped[str] = mapped_column(String(40), default="omnívora")
    budget: Mapped[str] = mapped_column(String(100), default="")


class AnalysisRecord(Base):
    __tablename__ = "analyses"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    data_json: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, index=True)


class DiaryEntry(Base):
    __tablename__ = "diary_entries"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    analysis_id: Mapped[int | None] = mapped_column(ForeignKey("analyses.id", ondelete="SET NULL"), nullable=True)
    meal_type: Mapped[str] = mapped_column(String(40), default="otros")
    items_json: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, index=True)


class FoodRecord(Base):
    __tablename__ = "food_records"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    fdc_id: Mapped[int] = mapped_column(Integer, unique=True, index=True)
    name: Mapped[str] = mapped_column(String(250))
    query: Mapped[str] = mapped_column(String(250), index=True)
    data_json: Mapped[str] = mapped_column(Text)
    source: Mapped[str] = mapped_column(String(80), default="USDA FoodData Central")
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class ChatMessage(Base):
    __tablename__ = "chat_messages"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    mode: Mapped[str] = mapped_column(String(20), default="assistant")
    role: Mapped[str] = mapped_column(String(20))
    content: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, index=True)


def init_database():
    Base.metadata.create_all(bind=engine)
    if IS_POSTGRES:
        # The browser never uses the Supabase Data API. Keep these tables
        # unavailable to anon/authenticated API roles as defense in depth;
        # FastAPI connects privately and scopes records by its own user ID.
        from sqlalchemy import text

        with engine.begin() as connection:
            for table_name in ("users", "profiles", "analyses", "diary_entries", "food_records", "chat_messages"):
                connection.execute(text(f'ALTER TABLE "{table_name}" ENABLE ROW LEVEL SECURITY'))


def dump_json(value) -> str:
    return json.dumps(value, ensure_ascii=False)


def load_json(value: str):
    return json.loads(value)
