"""Iteration 7 - POI location accuracy tests (live OSM only, no fabrication)."""
import os
import re
import math
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
if not BASE_URL:
    try:
        with open("/app/frontend/.env") as fh:
            for line in fh:
                if line.startswith("REACT_APP_BACKEND_URL="):
                    BASE_URL = line.split("=", 1)[1].strip().rstrip("/")
                    break
    except Exception:
        pass
API = f"{BASE_URL}/api"

OSM_ID_RE = re.compile(r"^(node|way|relation)/\d+$")


def _haversine(lat1, lon1, lat2, lon2):
    R = 6371000.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dl = math.radians(lon2 - lon1)
    a = math.sin(dphi / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * R * math.asin(math.sqrt(a))


# --- Branding ---
def test_root_service_name():
    r = requests.get(f"{API}/", timeout=30)
    assert r.status_code == 200
    data = r.json()
    assert data.get("service") == "MapApp API"


def test_payments_products_name():
    r = requests.get(f"{API}/payments/products", timeout=30)
    assert r.status_code == 200
    data = r.json()
    # Locate product 'MapApp Pro'
    items = data if isinstance(data, list) else data.get("products", data)
    names = []
    if isinstance(items, list):
        names = [p.get("name") for p in items if isinstance(p, dict)]
    elif isinstance(items, dict):
        names = [v.get("name") for v in items.values() if isinstance(v, dict)]
    assert "MapApp Pro" in names, f"products response: {data}"


# --- POI validation ---
def test_pois_invalid_lat_returns_422():
    r = requests.get(f"{API}/pois", params={"lat": 99, "lon": -74, "radius": 500, "categories": "parks"}, timeout=30)
    assert r.status_code == 422


def test_pois_nyc_real_osm_only():
    lat, lon, radius = 40.7328, -74.0115, 1500
    r = requests.get(
        f"{API}/pois",
        params={"lat": lat, "lon": lon, "radius": radius, "categories": "parks,schools"},
        timeout=70,
    )
    # 503 acceptable ONLY if truly unavailable; retry once
    if r.status_code == 503:
        pytest.skip(f"Overpass unavailable from pod: {r.text}")
    assert r.status_code == 200, r.text
    data = r.json()
    assert data.get("source") == "osm"
    assert "unavailable" in data and isinstance(data["unavailable"], list)
    cats = data.get("categories", {})
    total_items = 0
    for cat, items in cats.items():
        for item in items:
            total_items += 1
            iid = item.get("id", "")
            assert OSM_ID_RE.match(iid), f"non-OSM id: {iid}"
            assert not iid.startswith("static-"), iid
            assert not iid.startswith("synth-"), iid
            assert not item.get("synthetic"), item
            assert not item.get("curated"), item
            # Distance accuracy within 2 m
            calc = _haversine(lat, lon, item["lat"], item["lon"])
            assert abs(calc - item["distance_m"]) <= 2.0, (calc, item)
            assert item["distance_m"] <= radius + 2, item
    # Should have at least one real POI in NYC parks/schools OR both cats unavailable
    if not data["unavailable"]:
        assert total_items > 0


def test_pois_remote_ocean_no_fabrication():
    r = requests.get(
        f"{API}/pois",
        params={"lat": 0, "lon": -30, "radius": 1000, "categories": "gas_stations"},
        timeout=70,
    )
    if r.status_code == 503:
        pytest.skip("Overpass unavailable from pod")
    assert r.status_code == 200, r.text
    data = r.json()
    if "gas_stations" in data.get("unavailable", []):
        pytest.skip("gas_stations unavailable from pod")
    assert data.get("counts", {}).get("gas_stations", 0) == 0
    assert data.get("categories", {}).get("gas_stations", []) == []
