"""Iteration 8: TomTom basemap tiles + geocoding + auth rotation tests."""
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
if not BASE_URL:
    # fallback to frontend/.env parsing
    with open("/app/frontend/.env") as f:
        for line in f:
            if line.startswith("REACT_APP_BACKEND_URL"):
                BASE_URL = line.split("=", 1)[1].strip().rstrip("/")


# ---------- Basemap tile proxy ----------
class TestBasemap:
    def test_basemap_config(self):
        r = requests.get(f"{BASE_URL}/api/basemap/config", timeout=15)
        assert r.status_code == 200
        data = r.json()
        assert data.get("provider") == "tomtom", data

    def test_basemap_night_png(self):
        r = requests.get(f"{BASE_URL}/api/basemap/night/14/4824/6156", timeout=20)
        assert r.status_code == 200, r.text
        assert r.headers.get("content-type", "").startswith("image/png")
        assert len(r.content) > 100

    def test_basemap_sat_jpeg(self):
        r = requests.get(f"{BASE_URL}/api/basemap/sat/14/4824/6156", timeout=20)
        assert r.status_code == 200, r.text
        assert r.headers.get("content-type", "").startswith("image/jpeg")
        assert len(r.content) > 100

    def test_basemap_hybrid_ok(self):
        r = requests.get(f"{BASE_URL}/api/basemap/hybrid/14/4824/6156", timeout=20)
        assert r.status_code == 200, r.text
        assert r.headers.get("content-type", "").startswith("image/")

    def test_basemap_main_ok(self):
        r = requests.get(f"{BASE_URL}/api/basemap/main/14/4824/6156", timeout=20)
        assert r.status_code == 200

    def test_basemap_invalid_style(self):
        r = requests.get(f"{BASE_URL}/api/basemap/osm/14/4824/6156", timeout=15)
        assert r.status_code == 400

    def test_basemap_out_of_range(self):
        # zoom=3 -> max index is 7 for x/y; 100 is out of range
        r = requests.get(f"{BASE_URL}/api/basemap/night/3/100/100", timeout=15)
        assert r.status_code == 400


# ---------- Geocode ----------
class TestGeocode:
    def test_geocode_empire_state(self):
        r = requests.get(f"{BASE_URL}/api/geocode", params={"q": "Empire State Building"}, timeout=25)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data.get("provider") == "tomtom", data
        results = data.get("results", [])
        assert len(results) > 0
        first = results[0]
        dn = (first.get("display_name") or "").lower()
        assert "empire state" in dn, first
        assert abs(float(first["lat"]) - 40.748) < 0.05, first
        assert abs(float(first["lon"]) - (-73.985)) < 0.05, first

    def test_geocode_downing_street(self):
        r = requests.get(f"{BASE_URL}/api/geocode", params={"q": "10 Downing Street London"}, timeout=25)
        assert r.status_code == 200, r.text
        data = r.json()
        results = data.get("results", [])
        assert len(results) > 0
        first = results[0]
        assert abs(float(first["lat"]) - 51.50) < 0.5, first


# ---------- Auth rotation ----------
class TestAuthRotation:
    def test_login_new_admin(self):
        r = requests.post(f"{BASE_URL}/api/auth/login",
                          json={"email": "admin@mapapp.app", "password": "Ma-XjKTb93osTQxQhe1wD"},
                          timeout=15)
        assert r.status_code == 200, r.text
        data = r.json()
        # response may nest user or return flat
        user = data.get("user", data)
        assert user.get("is_pro") is True, data

    def test_login_old_admin_removed(self):
        r = requests.post(f"{BASE_URL}/api/auth/login",
                          json={"email": "admin@geopulse.app", "password": "GeoPulse#2026"},
                          timeout=15)
        assert r.status_code == 401, r.text
