from fastapi import FastAPI, APIRouter, HTTPException, Query
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
import math
from pathlib import Path
from pydantic import BaseModel, Field, ConfigDict
from typing import List, Optional, Any, Dict
import uuid
from datetime import datetime, timezone
import httpx
import asyncio


ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

app = FastAPI(title="GeoPulse Studio API")
api_router = APIRouter(prefix="/api")

# ---------- Overpass Category Query Templates ----------
OVERPASS_ENDPOINTS = [
    "https://overpass.kumi.systems/api/interpreter",
    "https://overpass-api.de/api/interpreter",
    "https://overpass.private.coffee/api/interpreter",
]

CATEGORY_QUERIES: Dict[str, str] = {
    "parks": '(node["leisure"="park"](around:{r},{lat},{lon});way["leisure"="park"](around:{r},{lat},{lon}););out center tags;',
    "schools": '(node["amenity"="school"](around:{r},{lat},{lon});way["amenity"="school"](around:{r},{lat},{lon}););out center tags;',
    "daycares": '(node["amenity"~"kindergarten|childcare"](around:{r},{lat},{lon});way["amenity"~"kindergarten|childcare"](around:{r},{lat},{lon}););out center tags;',
    "gas_stations": '(node["amenity"="fuel"](around:{r},{lat},{lon});way["amenity"="fuel"](around:{r},{lat},{lon}););out center tags;',
    "hospitals": '(node["amenity"="hospital"](around:{r},{lat},{lon});way["amenity"="hospital"](around:{r},{lat},{lon}););out center tags;',
    "restaurants": '(node["amenity"="restaurant"](around:{r},{lat},{lon});way["amenity"="restaurant"](around:{r},{lat},{lon}););out center tags;',
    "supermarkets": '(node["shop"="supermarket"](around:{r},{lat},{lon});way["shop"="supermarket"](around:{r},{lat},{lon}););out center tags;',
    "ev_chargers": '(node["amenity"="charging_station"](around:{r},{lat},{lon}););out tags;',
}

def haversine(lat1, lon1, lat2, lon2):
    R = 6371000.0
    p1 = math.radians(lat1); p2 = math.radians(lat2)
    dp = math.radians(lat2 - lat1); dl = math.radians(lon2 - lon1)
    a = math.sin(dp/2)**2 + math.cos(p1)*math.cos(p2)*math.sin(dl/2)**2
    return 2*R*math.asin(math.sqrt(a))

# ---------- Models ----------
class StatusCheck(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    client_name: str
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class StatusCheckCreate(BaseModel):
    client_name: str

class CustomLayer(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    color: str = "#38BDF8"
    icon: str = "MapPin"
    geojson: Dict[str, Any]
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())

class CustomLayerCreate(BaseModel):
    name: str
    color: Optional[str] = "#38BDF8"
    icon: Optional[str] = "MapPin"
    geojson: Dict[str, Any]

# ---------- Routes ----------
@api_router.get("/")
async def root():
    return {"service": "GeoPulse Studio API", "status": "ok"}

@api_router.post("/status", response_model=StatusCheck)
async def create_status_check(input: StatusCheckCreate):
    obj = StatusCheck(client_name=input.client_name)
    doc = obj.model_dump()
    doc['timestamp'] = doc['timestamp'].isoformat()
    await db.status_checks.insert_one(doc)
    return obj

@api_router.get("/status", response_model=List[StatusCheck])
async def get_status_checks():
    rows = await db.status_checks.find({}, {"_id": 0}).to_list(1000)
    for r in rows:
        if isinstance(r.get('timestamp'), str):
            r['timestamp'] = datetime.fromisoformat(r['timestamp'])
    return rows


@api_router.get("/geocode")
async def geocode(q: str = Query(..., min_length=1)):
    """Address search via Nominatim (OSM)."""
    url = "https://nominatim.openstreetmap.org/search"
    params = {"q": q, "format": "json", "limit": 6, "addressdetails": 1}
    headers = {"User-Agent": "GeoPulseStudio/1.0"}
    try:
        async with httpx.AsyncClient(timeout=15.0) as cli:
            r = await cli.get(url, params=params, headers=headers)
            r.raise_for_status()
            data = r.json()
        results = [
            {
                "display_name": row.get("display_name"),
                "lat": float(row["lat"]),
                "lon": float(row["lon"]),
                "type": row.get("type"),
                "class": row.get("class"),
                "importance": row.get("importance", 0),
            }
            for row in data
        ]
        return {"results": results}
    except httpx.HTTPError as e:
        raise HTTPException(status_code=502, detail=f"geocode failed: {e}")


async def _query_overpass(category: str, lat: float, lon: float, radius: int) -> List[Dict[str, Any]]:
    if category not in CATEGORY_QUERIES:
        return []
    q = "[out:json][timeout:25];" + CATEGORY_QUERIES[category].format(r=radius, lat=lat, lon=lon)
    for endpoint in OVERPASS_ENDPOINTS:
        try:
            async with httpx.AsyncClient(timeout=30.0) as cli:
                r = await cli.post(endpoint, data={"data": q})
                r.raise_for_status()
                data = r.json()
                break
        except (httpx.HTTPError, ValueError):
            data = None
            continue
    if not data:
        return []
    out = []
    for el in data.get("elements", []):
        if el.get("type") == "node":
            plat, plon = el.get("lat"), el.get("lon")
        else:
            c = el.get("center") or {}
            plat, plon = c.get("lat"), c.get("lon")
        if plat is None or plon is None:
            continue
        tags = el.get("tags", {}) or {}
        out.append({
            "id": f"{el.get('type')}/{el.get('id')}",
            "lat": plat,
            "lon": plon,
            "name": tags.get("name") or tags.get("operator") or category.replace("_", " ").title(),
            "category": category,
            "tags": tags,
            "distance_m": round(haversine(lat, lon, plat, plon), 1),
        })
    out.sort(key=lambda x: x["distance_m"])
    return out


@api_router.get("/pois")
async def get_pois(
    lat: float = Query(...),
    lon: float = Query(...),
    radius: int = Query(3000, ge=50, le=25000),
    categories: str = Query("parks,schools,daycares,gas_stations"),
):
    """Fetch POIs from Overpass within radius grouped by category."""
    cats = [c.strip() for c in categories.split(",") if c.strip() in CATEGORY_QUERIES]
    tasks = [_query_overpass(c, lat, lon, radius) for c in cats]
    results = await asyncio.gather(*tasks)
    return {
        "center": {"lat": lat, "lon": lon},
        "radius": radius,
        "categories": {c: r for c, r in zip(cats, results)},
        "counts": {c: len(r) for c, r in zip(cats, results)},
        "total": sum(len(r) for r in results),
    }


@api_router.get("/weather")
async def weather(lat: float, lon: float):
    url = "https://api.open-meteo.com/v1/forecast"
    params = {
        "latitude": lat,
        "longitude": lon,
        "current": "temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,weather_code,wind_speed_10m,wind_direction_10m",
        "timezone": "auto",
    }
    try:
        async with httpx.AsyncClient(timeout=15.0) as cli:
            r = await cli.get(url, params=params)
            r.raise_for_status()
            return r.json()
    except httpx.HTTPError as e:
        raise HTTPException(status_code=502, detail=str(e))


@api_router.get("/air-quality")
async def air_quality(lat: float, lon: float):
    url = "https://air-quality-api.open-meteo.com/v1/air-quality"
    params = {
        "latitude": lat,
        "longitude": lon,
        "current": "us_aqi,pm10,pm2_5,carbon_monoxide,nitrogen_dioxide,ozone",
        "timezone": "auto",
    }
    try:
        async with httpx.AsyncClient(timeout=15.0) as cli:
            r = await cli.get(url, params=params)
            r.raise_for_status()
            return r.json()
    except httpx.HTTPError as e:
        raise HTTPException(status_code=502, detail=str(e))


@api_router.get("/elevation")
async def elevation(lat: float, lon: float):
    url = "https://api.open-meteo.com/v1/elevation"
    params = {"latitude": lat, "longitude": lon}
    try:
        async with httpx.AsyncClient(timeout=15.0) as cli:
            r = await cli.get(url, params=params)
            r.raise_for_status()
            return r.json()
    except httpx.HTTPError as e:
        raise HTTPException(status_code=502, detail=str(e))


@api_router.post("/custom-layers", response_model=CustomLayer)
async def create_custom_layer(payload: CustomLayerCreate):
    obj = CustomLayer(**payload.model_dump())
    await db.custom_layers.insert_one(obj.model_dump())
    return obj


@api_router.get("/custom-layers", response_model=List[CustomLayer])
async def list_custom_layers():
    rows = await db.custom_layers.find({}, {"_id": 0}).to_list(500)
    return rows


@api_router.delete("/custom-layers/{layer_id}")
async def delete_custom_layer(layer_id: str):
    res = await db.custom_layers.delete_one({"id": layer_id})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="layer not found")
    return {"deleted": layer_id}


app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
