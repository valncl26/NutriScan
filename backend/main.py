import base64
import os

from dotenv import load_dotenv
from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from openai import APIConnectionError, APIError, OpenAI
from pydantic import BaseModel, ConfigDict, Field

load_dotenv()

MAX_IMAGE_BYTES = 10 * 1024 * 1024
ALLOWED_IMAGE_TYPES = {"image/jpeg", "image/png", "image/webp"}
MODEL = os.getenv("OPENAI_MODEL", "gpt-4.1-mini")


class FoodItem(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str = Field(description="Nombre claro del alimento, en español")
    portion: str = Field(description="Descripción legible de la porción estimada")
    grams: float = Field(ge=1, le=3000, description="Masa comestible estimada en gramos")
    confidence: float = Field(ge=0, le=1, description="Confianza visual de identificación, de 0 a 1")
    calories: float = Field(ge=0, le=5000, description="Kilocalorías estimadas para esta porción")
    protein_g: float = Field(ge=0, le=500, description="Proteína estimada en gramos para esta porción")
    carbs_g: float = Field(ge=0, le=1000, description="Carbohidratos estimados en gramos para esta porción")
    fat_g: float = Field(ge=0, le=500, description="Grasa total estimada en gramos para esta porción")
    saturated_fat_g: float = Field(ge=0, le=300, description="Grasa saturada estimada en gramos")
    fiber_g: float = Field(ge=0, le=300, description="Fibra estimada en gramos")
    sugar_g: float = Field(ge=0, le=500, description="Azúcares estimados en gramos")
    sodium_mg: float = Field(ge=0, le=100000, description="Sodio estimado en miligramos")


class MealAnalysis(BaseModel):
    model_config = ConfigDict(extra="forbid")

    summary: str = Field(description="Resumen breve del plato en español")
    items: list[FoodItem] = Field(min_length=1, max_length=20)
    notes: list[str] = Field(description="Advertencias sobre ingredientes o porciones inciertas")


app = FastAPI(title="NutriScan API", version="0.1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=False,
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)


@app.get("/api/health")
def health():
    return {"status": "ok", "ai_configured": bool(os.getenv("OPENAI_API_KEY"))}


@app.post("/api/analyze", response_model=MealAnalysis)
async def analyze(image: UploadFile = File(...)):
    if image.content_type not in ALLOWED_IMAGE_TYPES:
        raise HTTPException(status_code=415, detail="Usa una imagen JPG, PNG o WEBP.")

    contents = await image.read(MAX_IMAGE_BYTES + 1)
    if not contents:
        raise HTTPException(status_code=400, detail="El archivo está vacío.")
    if len(contents) > MAX_IMAGE_BYTES:
        raise HTTPException(status_code=413, detail="La imagen debe pesar menos de 10 MB.")

    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        raise HTTPException(
            status_code=503,
            detail="Falta OPENAI_API_KEY. Configúrala en backend/.env y reinicia el servidor Python.",
        )

    data_url = f"data:{image.content_type};base64,{base64.b64encode(contents).decode('ascii')}"
    try:
        response = OpenAI(api_key=api_key).responses.parse(
            model=MODEL,
            input=[
                {
                    "role": "system",
                    "content": (
                        "Eres un estimador visual de alimentos. Responde en español. "
                        "Analiza solo lo visible; no afirmes ingredientes ocultos como hechos. "
                        "Estima por separado cada alimento o ingrediente distinguible, el peso "
                        "comestible y sus nutrientes para esa porción. Los datos nutricionales "
                        "son aproximaciones visuales, no mediciones ni valores clínicos. "
                        "Usa confianza baja cuando la identificación o cantidad sea dudosa y "
                        "explícalo en notes. No inventes precisión: redondea porciones y valores. "
                        "Si la imagen no muestra comida, devuelve un alimento llamado 'No se detectó comida' "
                        "con una nota que indique que se necesita otra foto."
                    ),
                },
                {
                    "role": "user",
                    "content": [
                        {"type": "input_text", "text": "Analiza esta fotografía de comida para NutriScan."},
                        {"type": "input_image", "image_url": data_url, "detail": "low"},
                    ],
                },
            ],
            text_format=MealAnalysis,
        )
    except APIConnectionError as exc:
        raise HTTPException(status_code=502, detail="No se pudo conectar con OpenAI. Revisa tu conexión.") from exc
    except APIError as exc:
        raise HTTPException(status_code=502, detail="OpenAI no pudo completar el análisis. Inténtalo de nuevo.") from exc

    result = response.output_parsed
    if result is None:
        raise HTTPException(status_code=502, detail="La IA no devolvió un resultado utilizable. Inténtalo otra vez.")
    if result.items and result.items[0].name == "No se detectó comida":
        raise HTTPException(status_code=422, detail="No se detectaron alimentos. Prueba con una foto más clara del plato.")
    return result
