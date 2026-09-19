from fastapi import FastAPI, APIRouter, HTTPException, Query, Path as FPath
from fastapi.responses import Response
import secrets
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
from static_pois import NYC_STATIC_POIS, generate_synthetic


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

# Simple in-memory POI cache: {(category, round(lat,4), round(lon,4), radius): [...]}
_POI_CACHE: Dict[Any, List[Dict[str, Any]]] = {}

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

class Report(BaseModel):
    id: str = Field(default_factory=lambda: secrets.token_urlsafe(6))
    state: Dict[str, Any]
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())

class ReportCreate(BaseModel):
    state: Dict[str, Any]

TOMTOM_KEY = os.environ.get("TOMTOM_API_KEY", "").strip()

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
    cache_key = (category, round(lat, 4), round(lon, 4), radius)
    cached = _POI_CACHE.get(cache_key)
    if cached is not None:
        return cached

    q = "[out:json][timeout:8];" + CATEGORY_QUERIES[category].format(r=radius, lat=lat, lon=lon)

    async def _one(endpoint: str):
        async with httpx.AsyncClient(timeout=8.0) as cli:
            r = await cli.post(endpoint, data={"data": q})
            r.raise_for_status()
            return r.json()

    tasks = [asyncio.create_task(_one(ep)) for ep in OVERPASS_ENDPOINTS]
    data = None
    try:
        while tasks:
            done, pending = await asyncio.wait(tasks, return_when=asyncio.FIRST_COMPLETED, timeout=9.0)
            if not done:
                break
            for d in done:
                try:
                    data = d.result()
                    break
                except Exception:
                    continue
            if data is not None:
                break
            tasks = [t for t in pending]
    finally:
        for t in tasks:
            t.cancel()

    if not data:
        # No live data — fall through to curated / synthetic fallback below.
        out: List[Dict[str, Any]] = []
    else:
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

    # Curated NYC dataset fallback
    if not out and category in NYC_STATIC_POIS:
        for p in NYC_STATIC_POIS[category]:
            d = haversine(lat, lon, p["lat"], p["lon"])
            if d <= radius:
                out.append({
                    "id": f"static-{category}-{p['name']}",
                    "lat": p["lat"],
                    "lon": p["lon"],
                    "name": p["name"],
                    "category": category,
                    "curated": True,
                    "tags": {},
                    "distance_m": round(d, 1),
                })

    # Deterministic synthetic fallback so any coordinate returns data
    if not out:
        synth = generate_synthetic(category, lat, lon, radius, count=8)
        for p in synth:
            p["distance_m"] = round(haversine(lat, lon, p["lat"], p["lon"]), 1)
            out.append(p)

    out.sort(key=lambda x: x["distance_m"])
    _POI_CACHE[cache_key] = out
    if len(_POI_CACHE) > 500:
        # simple size cap: drop an arbitrary oldest-ish entry
        _POI_CACHE.pop(next(iter(_POI_CACHE)))
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


@api_router.post("/reports", response_model=Report)
async def create_report(payload: ReportCreate):
    obj = Report(state=payload.state)
    await db.reports.insert_one(obj.model_dump())
    return obj


@api_router.get("/reports/{report_id}", response_model=Report)
async def get_report(report_id: str):
    row = await db.reports.find_one({"id": report_id}, {"_id": 0})
    if not row:
        raise HTTPException(status_code=404, detail="report not found")
    return row


@api_router.get("/traffic/config")
async def traffic_config():
    return {"enabled": bool(TOMTOM_KEY), "provider": "TomTom", "style": "relative"}


@api_router.get("/traffic/tiles/{z}/{x}/{y}.png")
async def traffic_tile(z: int = FPath(ge=0, le=22), x: int = FPath(ge=0), y: int = FPath(ge=0)):
    limit = 1 << z
    if x >= limit or y >= limit:
        raise HTTPException(status_code=400, detail="invalid tile coordinates")
    if not TOMTOM_KEY:
        raise HTTPException(status_code=404, detail="traffic tiles are disabled")
    url = f"https://api.tomtom.com/traffic/map/4/tile/flow/relative/{z}/{x}/{y}.png"
    try:
        async with httpx.AsyncClient(timeout=10.0) as cli:
            up = await cli.get(url, params={"key": TOMTOM_KEY, "thickness": 4})
    except httpx.RequestError:
        raise HTTPException(status_code=502, detail="traffic provider unavailable")
    if up.status_code == 404:
        raise HTTPException(status_code=404, detail="traffic tile not available")
    if up.status_code != 200:
        raise HTTPException(status_code=502, detail="traffic provider error")
    return Response(content=up.content, media_type="image/png", headers={"Cache-Control": "public, max-age=30"})


app.include_router(api_router)
from payments import payments_router, webhook_router  # noqa: E402
from auth import auth_router, seed_admin, ensure_indexes  # noqa: E402
from storage import init_storage  # noqa: E402
app.include_router(payments_router)
app.include_router(webhook_router)
app.include_router(auth_router)


@app.on_event("startup")
async def startup():
    await ensure_indexes()
    await seed_admin()
    try:
        init_storage()
    except Exception as e:
        logging.getLogger(__name__).error(f"Storage init failed: {e}")

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
