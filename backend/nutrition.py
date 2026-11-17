import os

import httpx
from sqlalchemy import select
from sqlalchemy.orm import Session

from database import FoodRecord, dump_json, load_json

FDC_URL = "https://api.nal.usda.gov/fdc/v1/foods/search"
FDC_KEY = os.getenv("FDC_API_KEY", "DEMO_KEY")
NUTRIENT_IDS = {
    1008: "calories",
    1003: "protein_g",
    1005: "carbs_g",
    1004: "fat_g",
    1258: "saturated_fat_g",
    1079: "fiber_g",
    2000: "sugar_g",
    1093: "sodium_mg",
}


def nutrients_from_food(food: dict) -> dict:
    result = {key: 0.0 for key in NUTRIENT_IDS.values()}
    for nutrient in food.get("foodNutrients", []):
        key = NUTRIENT_IDS.get(nutrient.get("nutrientId"))
        if key and nutrient.get("value") is not None:
            result[key] = float(nutrient["value"])
    return result


async def search_food(query: str, db: Session) -> dict | None:
    normalized = " ".join(query.strip().lower().split())
    if not normalized:
        return None
    cached = db.scalar(select(FoodRecord).where(FoodRecord.query == normalized))
    if cached:
        return load_json(cached.data_json)

    try:
        async with httpx.AsyncClient(timeout=8.0) as client:
            response = await client.get(
                FDC_URL,
                params={"api_key": FDC_KEY, "query": query, "pageSize": 5,
                        "dataType": ["Foundation", "SR Legacy", "Survey (FNDDS)"]},
            )
        response.raise_for_status()
        foods = response.json().get("foods", [])
    except (httpx.HTTPError, ValueError):
        return None
    if not foods:
        return None

    # Prefer unbranded Foundation/SR Legacy records, which describe generic foods.
    food = next((item for item in foods if item.get("dataType") in {"Foundation", "SR Legacy"}), foods[0])
    data = {
        "fdc_id": food.get("fdcId"),
        "name": food.get("description", query),
        "data_type": food.get("dataType", "FoodData Central"),
        "per_100g": nutrients_from_food(food),
        "source": "USDA FoodData Central",
    }
    if data["fdc_id"]:
        record = db.scalar(select(FoodRecord).where(FoodRecord.fdc_id == data["fdc_id"]))
        if record:
            record.query = normalized
            record.name = data["name"]
            record.data_json = dump_json(data)
        else:
            db.add(FoodRecord(fdc_id=data["fdc_id"], name=data["name"], query=normalized, data_json=dump_json(data)))
        db.commit()
    return data


def scale_nutrients(per_100g: dict, grams: float) -> dict:
    factor = grams / 100
    return {key: round(float(value) * factor, 1) for key, value in per_100g.items()}
