"""GeoPulse Studio backend API tests - iteration 2 (retest /api/pois fallback)."""
import os
import time
import uuid
import pytest
import requests

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://param-mapper.preview.emergentagent.com').rstrip('/')
# Load frontend .env for BASE_URL (mirrors what user sees).
try:
    with open('/app/frontend/.env') as fh:
        for line in fh:
            if line.startswith('REACT_APP_BACKEND_URL='):
                BASE_URL = line.split('=', 1)[1].strip().rstrip('/')
                break
except Exception:
    pass

TS_LAT, TS_LON = 40.7629, -73.9699  # Times Square-ish


@pytest.fixture(scope="module")
def s():
    sess = requests.Session()
    sess.headers.update({"Content-Type": "application/json"})
    return sess


# ---------- Root ----------
def test_root(s):
    r = s.get(f"{BASE_URL}/api/", timeout=15)
    assert r.status_code == 200
    assert r.json().get("status") == "ok"


# ---------- POIs (previously failing) ----------
def test_pois_fallback_returns_200_with_total_gt_zero(s):
    start = time.time()
    r = s.get(
        f"{BASE_URL}/api/pois",
        params={
            "lat": TS_LAT,
            "lon": TS_LON,
            "radius": 1500,
            "categories": "parks,schools,gas_stations,daycares",
        },
        timeout=20,
    )
    elapsed = time.time() - start
    assert r.status_code == 200, f"status={r.status_code} body={r.text[:400]}"
    data = r.json()
    assert data["total"] > 0
    counts = data["counts"]
    for cat in ("parks", "schools", "gas_stations", "daycares"):
        assert counts.get(cat, 0) > 0, f"category {cat} has 0 POIs -> {counts}"
    assert elapsed < 15.0, f"took {elapsed:.1f}s"


def test_pois_arbitrary_coord_still_returns_results(s):
    # Non-NYC coordinate should still fall back to synthetic
    r = s.get(
        f"{BASE_URL}/api/pois",
        params={"lat": 51.5074, "lon": -0.1278, "radius": 2000, "categories": "parks,schools"},
        timeout=20,
    )
    assert r.status_code == 200
    assert r.json()["total"] > 0


# ---------- Geocode ----------
def test_geocode(s):
    r = s.get(f"{BASE_URL}/api/geocode", params={"q": "Times Square NYC"}, timeout=20)
    assert r.status_code == 200
    results = r.json()["results"]
    assert isinstance(results, list) and len(results) > 0
    assert "lat" in results[0] and "lon" in results[0]


# ---------- Weather ----------
def test_weather(s):
    r = s.get(f"{BASE_URL}/api/weather", params={"lat": TS_LAT, "lon": TS_LON}, timeout=20)
    assert r.status_code == 200
    assert "current" in r.json()
    assert "temperature_2m" in r.json()["current"]


# ---------- Air quality ----------
def test_air_quality(s):
    r = s.get(f"{BASE_URL}/api/air-quality", params={"lat": TS_LAT, "lon": TS_LON}, timeout=20)
    assert r.status_code == 200
    assert "current" in r.json()


# ---------- Elevation ----------
def test_elevation(s):
    r = s.get(f"{BASE_URL}/api/elevation", params={"lat": TS_LAT, "lon": TS_LON}, timeout=20)
    assert r.status_code == 200
    assert "elevation" in r.json()


# ---------- Custom layers CRUD ----------
def test_custom_layers_crud(s):
    name = f"TEST_layer_{uuid.uuid4().hex[:8]}"
    payload = {
        "name": name,
        "color": "#FF00AA",
        "icon": "MapPin",
        "geojson": {"type": "FeatureCollection", "features": []},
    }
    cr = s.post(f"{BASE_URL}/api/custom-layers", json=payload, timeout=15)
    assert cr.status_code == 200
    created = cr.json()
    assert created["name"] == name
    layer_id = created["id"]

    # GET verify persistence
    lr = s.get(f"{BASE_URL}/api/custom-layers", timeout=15)
    assert lr.status_code == 200
    names = [x["name"] for x in lr.json()]
    assert name in names

    # DELETE
    dr = s.delete(f"{BASE_URL}/api/custom-layers/{layer_id}", timeout=15)
    assert dr.status_code == 200

    # Verify gone
    lr2 = s.get(f"{BASE_URL}/api/custom-layers", timeout=15)
    assert name not in [x["name"] for x in lr2.json()]


# ---------- Reports (new in iteration 3) ----------
def test_reports_create_get_and_404(s):
    state = {"pin": {"lat": TS_LAT, "lon": TS_LON}, "radius": 800, "layers": {"parks": True}}
    cr = s.post(f"{BASE_URL}/api/reports", json={"state": state}, timeout=15)
    assert cr.status_code == 200, cr.text
    body = cr.json()
    assert "id" in body and isinstance(body["id"], str) and len(body["id"]) > 0
    assert body["state"] == state
    assert "created_at" in body

    rid = body["id"]
    gr = s.get(f"{BASE_URL}/api/reports/{rid}", timeout=15)
    assert gr.status_code == 200
    assert gr.json()["state"] == state

    nf = s.get(f"{BASE_URL}/api/reports/does-not-exist-xyz", timeout=15)
    assert nf.status_code == 404


# ---------- Traffic config + tiles ----------
def test_traffic_config_disabled(s):
    r = s.get(f"{BASE_URL}/api/traffic/config", timeout=15)
    assert r.status_code == 200
    j = r.json()
    assert j.get("enabled") is False
    assert j.get("provider") == "TomTom"


def test_traffic_tile_disabled_returns_404(s):
    r = s.get(f"{BASE_URL}/api/traffic/tiles/12/1206/1539.png", timeout=15)
    assert r.status_code == 404


def test_traffic_tile_invalid_coords_returns_400(s):
    # z=2 → max index 3, so x=4 is invalid
    r = s.get(f"{BASE_URL}/api/traffic/tiles/2/4/0.png", timeout=15)
    assert r.status_code == 400

