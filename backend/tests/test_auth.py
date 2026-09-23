"""GeoPulse Studio auth + branding + claim tests (iteration 5)."""
import os
import io
import uuid
import struct
import zlib
import pytest
import requests

BASE_URL = "https://param-mapper.preview.emergentagent.com"
try:
    with open('/app/frontend/.env') as fh:
        for line in fh:
            if line.startswith('REACT_APP_BACKEND_URL='):
                BASE_URL = line.split('=', 1)[1].strip().rstrip('/')
                break
except Exception:
    pass

ADMIN_EMAIL = "admin@geopulse.app"
ADMIN_PASSWORD = "GeoPulse#2026"


def _png_bytes(w=2, h=2):
    def chunk(t, d):
        return struct.pack(">I", len(d)) + t + d + struct.pack(">I", zlib.crc32(t + d) & 0xffffffff)
    sig = b"\x89PNG\r\n\x1a\n"
    ihdr = struct.pack(">IIBBBBB", w, h, 8, 2, 0, 0, 0)
    raw = b"".join(b"\x00" + b"\xff\x00\x00" * w for _ in range(h))
    idat = zlib.compress(raw)
    return sig + chunk(b"IHDR", ihdr) + chunk(b"IDAT", idat) + chunk(b"IEND", b"")


@pytest.fixture(scope="module")
def rand_user():
    email = f"tester+{uuid.uuid4().hex[:8]}@geopulse.app"
    return {"email": email, "password": "Passw0rd!x"}


@pytest.fixture(scope="module")
def user_session(rand_user):
    s = requests.Session()
    r = s.post(f"{BASE_URL}/api/auth/register", json={**rand_user, "name": "Tester"}, timeout=15)
    assert r.status_code == 200, r.text
    return s


@pytest.fixture(scope="module")
def admin_session():
    s = requests.Session()
    r = s.post(f"{BASE_URL}/api/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}, timeout=15)
    assert r.status_code == 200, r.text
    return s


# ---------- Register ----------
class TestRegister:
    def test_register_sets_cookies_and_returns_user(self, rand_user):
        r = requests.post(f"{BASE_URL}/api/auth/register", json={**rand_user, "name": "X"}, timeout=15)
        # Fixture already used it; do another random
        email = f"tester+{uuid.uuid4().hex[:8]}@geopulse.app"
        r = requests.post(f"{BASE_URL}/api/auth/register", json={"email": email, "password": "Passw0rd!x"}, timeout=15)
        assert r.status_code == 200
        j = r.json()
        assert j["email"] == email
        assert j["is_pro"] is False
        # cookies
        cookies = r.cookies
        assert "access_token" in cookies
        assert "refresh_token" in cookies

    def test_register_duplicate_email_400(self, rand_user):
        r = requests.post(f"{BASE_URL}/api/auth/register", json=rand_user, timeout=15)
        assert r.status_code == 400

    def test_register_short_password_422(self):
        r = requests.post(f"{BASE_URL}/api/auth/register", json={"email": f"x{uuid.uuid4().hex[:6]}@e.com", "password": "short"}, timeout=15)
        assert r.status_code == 422


# ---------- Login ----------
class TestLogin:
    def test_login_admin_is_pro(self):
        r = requests.post(f"{BASE_URL}/api/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}, timeout=15)
        assert r.status_code == 200
        j = r.json()
        assert j["is_pro"] is True
        assert "access_token" in r.cookies

    def test_login_wrong_password_401(self):
        r = requests.post(f"{BASE_URL}/api/auth/login", json={"email": ADMIN_EMAIL, "password": "definitely-wrong"}, timeout=15)
        assert r.status_code == 401

    def test_login_lockout_429(self):
        # Use a fresh random email that doesn't exist -> still increments attempts by identifier ip:email
        email = f"lock+{uuid.uuid4().hex[:8]}@geopulse.app"
        # Register first so real user exists (to avoid confusion), then hammer bad password
        requests.post(f"{BASE_URL}/api/auth/register", json={"email": email, "password": "Passw0rd!x"}, timeout=15)
        codes = []
        for _ in range(6):
            r = requests.post(f"{BASE_URL}/api/auth/login", json={"email": email, "password": "bad"}, timeout=15)
            codes.append(r.status_code)
        assert 429 in codes, f"expected 429 in {codes}"


# ---------- Me / refresh / logout ----------
class TestSessionEndpoints:
    def test_me_without_cookie_401(self):
        r = requests.get(f"{BASE_URL}/api/auth/me", timeout=15)
        assert r.status_code == 401

    def test_me_with_cookie_200(self, user_session, rand_user):
        r = user_session.get(f"{BASE_URL}/api/auth/me", timeout=15)
        assert r.status_code == 200
        assert r.json()["email"] == rand_user["email"]

    def test_refresh_issues_new_access(self, user_session):
        r = user_session.post(f"{BASE_URL}/api/auth/refresh", timeout=15)
        assert r.status_code == 200
        # new access cookie present in response
        assert any(c.name == "access_token" for c in r.cookies)

    def test_logout_clears_cookies(self, rand_user):
        s = requests.Session()
        s.post(f"{BASE_URL}/api/auth/login", json=rand_user, timeout=15)
        r = s.post(f"{BASE_URL}/api/auth/logout", timeout=15)
        assert r.status_code == 200
        # After logout /me should 401 on a fresh session with the returned cookie jar
        r2 = s.get(f"{BASE_URL}/api/auth/me", timeout=15)
        assert r2.status_code == 401


# ---------- Branding ----------
class TestBranding:
    def test_branding_requires_auth(self):
        r = requests.put(f"{BASE_URL}/api/auth/branding", json={"company": "x"}, timeout=15)
        assert r.status_code == 401

    def test_branding_update_and_me_reflects(self, user_session):
        payload = {"company": "TEST_Co", "contact_name": "Jane", "phone": "555-0100", "email": "j@t.co", "website": "https://t.co", "tagline": "Hi"}
        r = user_session.put(f"{BASE_URL}/api/auth/branding", json=payload, timeout=15)
        assert r.status_code == 200
        me = user_session.get(f"{BASE_URL}/api/auth/me", timeout=15).json()
        for k, v in payload.items():
            assert me["branding"].get(k) == v

    def test_logo_upload_get_delete(self, user_session):
        png = _png_bytes()
        r = user_session.post(f"{BASE_URL}/api/auth/branding/logo", files={"file": ("t.png", png, "image/png")}, timeout=20)
        assert r.status_code == 200, r.text
        assert r.json().get("logo_path")
        g = user_session.get(f"{BASE_URL}/api/auth/branding/logo", timeout=15)
        assert g.status_code == 200
        assert g.headers.get("content-type", "").startswith("image/")
        d = user_session.delete(f"{BASE_URL}/api/auth/branding/logo", timeout=15)
        assert d.status_code == 200
        assert "logo_path" not in d.json()

    def test_logo_rejects_text_file(self, user_session):
        r = user_session.post(f"{BASE_URL}/api/auth/branding/logo", files={"file": ("t.txt", b"hello", "text/plain")}, timeout=15)
        assert r.status_code == 400


# ---------- Claim / checkout user_id ----------
class TestClaim:
    def test_checkout_stores_user_id(self, admin_session):
        r = admin_session.post(f"{BASE_URL}/api/payments/checkout", json={"origin_url": BASE_URL, "lookup_key": "geopulse_pro_monthly"}, timeout=20)
        assert r.status_code == 200, r.text
        sid = r.json().get("session_id")
        assert sid
        # claim unpaid -> 400
        c = admin_session.post(f"{BASE_URL}/api/auth/claim-license", json={"session_id": sid}, timeout=15)
        assert c.status_code == 400

    def test_claim_requires_auth(self):
        r = requests.post(f"{BASE_URL}/api/auth/claim-license", json={"session_id": "cs_x"}, timeout=15)
        assert r.status_code == 401
