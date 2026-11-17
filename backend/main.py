import os
from datetime import datetime, timedelta, timezone
from typing import Annotated, Literal

import jwt
from dotenv import load_dotenv
from fastapi import Depends, FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from openai import APIConnectionError, APIError, AsyncOpenAI
from pwdlib import PasswordHash
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

load_dotenv()

from database import (AnalysisRecord, ChatMessage, DiaryEntry, Profile, SessionLocal,
                      User, dump_json, get_local_secret, init_database, load_json)
from nutrition import search_food, scale_nutrients

MAX_IMAGE_BYTES = 10 * 1024 * 1024
ALLOWED_IMAGE_TYPES = {"image/jpeg", "image/png", "image/webp"}
MODEL = os.getenv("OPENAI_MODEL", "gpt-6-luna")
JWT_SECRET = os.getenv("NUTRISCAN_SECRET_KEY") or get_local_secret()
JWT_ALGORITHM = "HS256"
TOKEN_DAYS = 7
password_hash = PasswordHash.recommended()
bearer = HTTPBearer(auto_error=False)


class VisionFoodItem(BaseModel):
    model_config = ConfigDict(extra="forbid")
    name: str = Field(description="Nombre claro del alimento, en español")
    fdc_query: str = Field(description="Nombre genérico del alimento en inglés para buscar nutrientes de referencia")
    portion: str = Field(description="Descripción legible de la porción estimada")
    grams: float = Field(ge=1, le=3000, description="Masa comestible estimada en gramos")
    confidence: float = Field(ge=0, le=1, description="Confianza visual de identificación, de 0 a 1")
    calories: float = Field(ge=0, le=5000, description="Kilocalorías estimadas para esta porción")
    protein_g: float = Field(ge=0, le=500, description="Proteína estimada para esta porción en gramos")
    carbs_g: float = Field(ge=0, le=1000, description="Carbohidratos estimados para esta porción en gramos")
    fat_g: float = Field(ge=0, le=500, description="Grasa total estimada para esta porción en gramos")
    saturated_fat_g: float = Field(ge=0, le=300)
    fiber_g: float = Field(ge=0, le=300)
    sugar_g: float = Field(ge=0, le=500)
    sodium_mg: float = Field(ge=0, le=100000)


class FoodItem(VisionFoodItem):
    source: str = "estimación visual IA"
    reference_name: str | None = None


class MealAnalysis(BaseModel):
    model_config = ConfigDict(extra="forbid")
    summary: str
    items: list[VisionFoodItem] = Field(min_length=1, max_length=20)
    notes: list[str]


class Credentials(BaseModel):
    email: str = Field(min_length=3, max_length=254)
    password: str = Field(min_length=8, max_length=128)


class Registration(Credentials):
    name: str = Field(min_length=2, max_length=100)


class ProfileUpdate(BaseModel):
    age: int | None = Field(default=None, ge=13, le=120)
    sex: str | None = Field(default=None, max_length=40)
    height_cm: float | None = Field(default=None, ge=80, le=250)
    current_weight_kg: float | None = Field(default=None, ge=25, le=400)
    target_weight_kg: float | None = Field(default=None, ge=25, le=400)
    activity_level: str | None = Field(default=None, max_length=40)
    goal: str | None = Field(default=None, max_length=80)
    food_preferences: str | None = Field(default=None, max_length=1000)
    allergies: str | None = Field(default=None, max_length=1000)
    excluded_foods: str | None = Field(default=None, max_length=1000)
    diet_type: str | None = Field(default=None, max_length=40)
    budget: str | None = Field(default=None, max_length=100)


class DiaryCreate(BaseModel):
    analysis_id: int | None = None
    meal_type: Literal["desayuno", "media mañana", "almuerzo", "merienda", "cena", "otros"] = "otros"
    items: list[FoodItem] = Field(min_length=1, max_length=20)


class AssistantRequest(BaseModel):
    message: str = Field(min_length=1, max_length=3000)
    mode: Literal["assistant", "recipe", "plan"] = "assistant"


app = FastAPI(title="NutriScan API", version="0.2.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=False,
    allow_methods=["GET", "POST", "PUT", "DELETE"],
    allow_headers=["*"])
init_database()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def user_payload(user: User):
    return {"id": user.id, "name": user.name, "email": user.email}


def profile_payload(profile: Profile):
    return {column.name: getattr(profile, column.name) for column in Profile.__table__.columns if column.name != "user_id"}


def get_current_user(
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer)],
    db: Annotated[Session, Depends(get_db)],
) -> User:
    if credentials is None:
        raise HTTPException(status_code=401, detail="Inicia sesión para continuar.")
    try:
        payload = jwt.decode(credentials.credentials, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        user_id = int(payload["sub"])
    except (jwt.InvalidTokenError, KeyError, TypeError, ValueError) as exc:
        raise HTTPException(status_code=401, detail="La sesión venció. Inicia sesión otra vez.") from exc
    user = db.get(User, user_id)
    if user is None:
        raise HTTPException(status_code=401, detail="La cuenta ya no existe.")
    return user


CurrentUser = Annotated[User, Depends(get_current_user)]
Database = Annotated[Session, Depends(get_db)]


def create_token(user_id: int) -> str:
    expires = datetime.now(timezone.utc) + timedelta(days=TOKEN_DAYS)
    return jwt.encode({"sub": str(user_id), "exp": expires}, JWT_SECRET, algorithm=JWT_ALGORITHM)


@app.get("/api/health")
def health():
    return {"status": "ok", "ai_configured": bool(os.getenv("OPENAI_API_KEY"))}


@app.post("/api/auth/register")
def register(data: Registration, db: Database):
    email = data.email.strip().lower()
    if "@" not in email:
        raise HTTPException(status_code=422, detail="Escribe un correo válido.")
    if db.scalar(select(User).where(User.email == email)):
        raise HTTPException(status_code=409, detail="Ya existe una cuenta con ese correo.")
    user = User(name=data.name.strip(), email=email, password_hash=password_hash.hash(data.password))
    db.add(user)
    db.flush()
    db.add(Profile(user_id=user.id))
    db.commit()
    db.refresh(user)
    return {"access_token": create_token(user.id), "token_type": "bearer", "user": user_payload(user)}


@app.post("/api/auth/login")
def login(data: Credentials, db: Database):
    user = db.scalar(select(User).where(User.email == data.email.strip().lower()))
    if user is None or not password_hash.verify(data.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Correo o contraseña incorrectos.")
    return {"access_token": create_token(user.id), "token_type": "bearer", "user": user_payload(user)}


@app.get("/api/auth/me")
def me(user: CurrentUser):
    return user_payload(user)


@app.get("/api/profile")
def get_profile(user: CurrentUser, db: Database):
    profile = db.get(Profile, user.id)
    return profile_payload(profile)


@app.put("/api/profile")
def save_profile(data: ProfileUpdate, user: CurrentUser, db: Database):
    profile = db.get(Profile, user.id)
    if profile is None:
        profile = Profile(user_id=user.id)
        db.add(profile)
    for key, value in data.model_dump(exclude_unset=True).items():
        setattr(profile, key, value)
    db.commit()
    db.refresh(profile)
    return profile_payload(profile)


@app.post("/api/analyze")
async def analyze(user: CurrentUser, db: Database, image: UploadFile = File(...)):
    if image.content_type not in ALLOWED_IMAGE_TYPES:
        raise HTTPException(status_code=415, detail="Usa una imagen JPG, PNG o WEBP.")
    contents = await image.read(MAX_IMAGE_BYTES + 1)
    if not contents:
        raise HTTPException(status_code=400, detail="El archivo está vacío.")
    if len(contents) > MAX_IMAGE_BYTES:
        raise HTTPException(status_code=413, detail="La imagen debe pesar menos de 10 MB.")
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        raise HTTPException(status_code=503, detail="Falta OPENAI_API_KEY. Configúrala en backend/.env.")

    import base64
    data_url = f"data:{image.content_type};base64,{base64.b64encode(contents).decode('ascii')}"
    try:
        response = await AsyncOpenAI(api_key=api_key).responses.parse(
            model=MODEL,
            input=[
                {"role": "system", "content": (
                    "Estimas alimentos visibles en fotos, en español. No afirmes ingredientes ocultos. "
                    "Devuelve alimentos distinguibles, peso comestible estimado y nutrientes para esa porción. "
                    "Incluye fdc_query como nombre genérico EN INGLÉS para buscar el alimento en USDA FoodData Central. "
                    "Los valores visuales son aproximaciones, no mediciones. Usa confianza baja si hay duda y explica en notes. "
                    "Redondea; no aparentes precisión. Si no hay comida, usa el nombre 'No se detectó comida'."
                )},
                {"role": "user", "content": [
                    {"type": "input_text", "text": "Analiza esta fotografía de comida para NutriScan."},
                    {"type": "input_image", "image_url": data_url, "detail": "high"},
                ]},
            ],
            text_format=MealAnalysis,
        )
    except APIConnectionError as exc:
        raise HTTPException(status_code=502, detail="No se pudo conectar con OpenAI. Revisa tu conexión.") from exc
    except APIError as exc:
        raise HTTPException(status_code=502, detail="OpenAI no pudo completar el análisis. Revisa la clave, el saldo o inténtalo de nuevo.") from exc
    result = response.output_parsed
    if result is None:
        raise HTTPException(status_code=502, detail="La IA no devolvió un resultado utilizable. Inténtalo otra vez.")
    if result.items and result.items[0].name == "No se detectó comida":
        raise HTTPException(status_code=422, detail="No se detectaron alimentos. Prueba con una foto más clara del plato.")

    items = []
    notes = list(result.notes)
    for item in result.items:
        item_data = item.model_dump()
        reference = await search_food(item.fdc_query, db)
        if reference and any(reference["per_100g"].values()):
            item_data.update(scale_nutrients(reference["per_100g"], item.grams))
            item_data["source"] = "USDA FoodData Central"
            item_data["reference_name"] = reference["name"]
        else:
            item_data["source"] = "estimación visual IA"
            if not any(note.startswith("No se encontró fuente nutricional") for note in notes):
                notes.append("Algunos valores no encontraron coincidencia en la base nutricional y son estimaciones visuales de la IA.")
        items.append(item_data)
    result_data = {"summary": result.summary, "items": items, "notes": notes}
    record = AnalysisRecord(user_id=user.id, data_json=dump_json(result_data))
    db.add(record)
    db.commit()
    db.refresh(record)
    return {"analysis_id": record.id, "created_at": record.created_at.isoformat(), **result_data}


@app.get("/api/analyses")
def list_analyses(user: CurrentUser, db: Database, limit: int = 50):
    records = db.scalars(select(AnalysisRecord).where(AnalysisRecord.user_id == user.id)
                         .order_by(AnalysisRecord.created_at.desc()).limit(min(max(limit, 1), 100))).all()
    return [{"analysis_id": row.id, "created_at": row.created_at.isoformat(), **load_json(row.data_json)} for row in records]


@app.post("/api/diary")
def add_diary_entry(data: DiaryCreate, user: CurrentUser, db: Database):
    if data.analysis_id is not None:
        analysis = db.scalar(select(AnalysisRecord).where(AnalysisRecord.id == data.analysis_id, AnalysisRecord.user_id == user.id))
        if analysis is None:
            raise HTTPException(status_code=404, detail="No se encontró ese análisis.")
    entry = DiaryEntry(user_id=user.id, analysis_id=data.analysis_id, meal_type=data.meal_type,
                       items_json=dump_json([item.model_dump() for item in data.items]))
    db.add(entry)
    db.commit()
    db.refresh(entry)
    return {"id": entry.id, "analysis_id": entry.analysis_id, "meal_type": entry.meal_type,
            "items": load_json(entry.items_json), "created_at": entry.created_at.isoformat()}


@app.get("/api/diary")
def list_diary(user: CurrentUser, db: Database, limit: int = 100):
    records = db.scalars(select(DiaryEntry).where(DiaryEntry.user_id == user.id)
                         .order_by(DiaryEntry.created_at.desc()).limit(min(max(limit, 1), 200))).all()
    return [{"id": row.id, "analysis_id": row.analysis_id, "meal_type": row.meal_type,
             "items": load_json(row.items_json), "created_at": row.created_at.isoformat()} for row in records]


@app.delete("/api/diary/{entry_id}")
def delete_diary_entry(entry_id: int, user: CurrentUser, db: Database):
    entry = db.scalar(select(DiaryEntry).where(DiaryEntry.id == entry_id, DiaryEntry.user_id == user.id))
    if entry is None:
        raise HTTPException(status_code=404, detail="No se encontró esa comida.")
    db.delete(entry)
    db.commit()
    return {"deleted": True}


@app.get("/api/foods")
async def foods(query: str, user: CurrentUser, db: Database):
    if len(query.strip()) < 2:
        raise HTTPException(status_code=422, detail="Escribe al menos dos letras para buscar.")
    food = await search_food(query, db)
    if not food:
        raise HTTPException(status_code=503, detail="No se pudo consultar FoodData Central. Intenta de nuevo más tarde.")
    return food


@app.get("/api/chat/history")
def chat_history(user: CurrentUser, db: Database, mode: Literal["assistant", "recipe", "plan"] = "assistant"):
    messages = db.scalars(select(ChatMessage).where(ChatMessage.user_id == user.id, ChatMessage.mode == mode)
                          .order_by(ChatMessage.created_at.desc()).limit(40)).all()
    return [{"role": row.role, "content": row.content, "created_at": row.created_at.isoformat()} for row in reversed(messages)]


@app.post("/api/assistant")
async def assistant(data: AssistantRequest, user: CurrentUser, db: Database):
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        raise HTTPException(status_code=503, detail="Falta OPENAI_API_KEY. Configúrala en backend/.env.")
    profile = db.get(Profile, user.id)
    profile_context = profile_payload(profile) if profile else {}
    diary = db.scalars(select(DiaryEntry).where(DiaryEntry.user_id == user.id)
                       .order_by(DiaryEntry.created_at.desc()).limit(20)).all()
    diary_context = [{"meal_type": row.meal_type, "items": load_json(row.items_json), "created_at": row.created_at.isoformat()} for row in diary]
    mode_instructions = {
        "assistant": "Responde dudas generales de nutrición y hábitos, de forma clara y breve.",
        "recipe": "Propón una receta práctica con ingredientes, cantidades, preparación y estimación nutricional. Respeta alergias y preferencias.",
        "plan": "Propón un ejemplo de plan de comidas para un día, con porciones y nutrientes aproximados. Evita recomendaciones extremas y explica que es orientativo.",
    }
    system = (
        "Eres NutriScan, un asistente de bienestar alimentario. Responde en español, con tono amable. "
        "No diagnostiques enfermedades ni sustituyas a nutricionistas o profesionales de salud. "
        "No inventes datos del perfil. Considera alergias y restricciones como límites estrictos; si hay riesgo, pregunta. "
        "Las calorías y nutrientes son estimaciones y no consejo médico. " + mode_instructions[data.mode] +
        "\nPerfil del usuario (JSON): " + dump_json(profile_context) +
        "\nRegistros recientes del diario (JSON): " + dump_json(diary_context)
    )
    history = db.scalars(select(ChatMessage).where(ChatMessage.user_id == user.id, ChatMessage.mode == data.mode)
                         .order_by(ChatMessage.created_at.desc()).limit(10)).all()
    input_messages = [{"role": "system", "content": system}]
    input_messages.extend({"role": row.role, "content": row.content} for row in reversed(history))
    input_messages.append({"role": "user", "content": data.message})
    try:
        response = await AsyncOpenAI(api_key=api_key).responses.create(model=MODEL, input=input_messages)
    except APIConnectionError as exc:
        raise HTTPException(status_code=502, detail="No se pudo conectar con OpenAI.") from exc
    except APIError as exc:
        raise HTTPException(status_code=502, detail="OpenAI no pudo responder. Revisa tu clave o saldo API.") from exc
    answer = response.output_text.strip()
    if not answer:
        raise HTTPException(status_code=502, detail="La IA devolvió una respuesta vacía. Inténtalo otra vez.")
    db.add(ChatMessage(user_id=user.id, mode=data.mode, role="user", content=data.message))
    db.add(ChatMessage(user_id=user.id, mode=data.mode, role="assistant", content=answer))
    db.commit()
    return {"answer": answer, "mode": data.mode}
