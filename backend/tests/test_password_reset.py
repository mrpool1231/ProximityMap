"""Iteration 9 — password reset by emailed link (forgot/reset endpoints + rate limit + Mongo token store).

Simulates the emailed token by inserting a doc into `password_reset_tokens` directly,
because outbound email cannot be inspected in this environment.
"""
import os
import uuid
import hashlib
import secrets
from datetime import datetime, timezone, timedelta

import pytest
import requests
from pymongo import MongoClient

# ---------- Config ----------
BASE_URL = None
try:
    with open("/app/frontend/.env") as fh:
        for line in fh:
            if line.startswith("REACT_APP_BACKEND_URL="):
                BASE_URL = line.split("=", 1)[1].strip().rstrip("/").strip('"')
                break
except Exception:
    pass
assert BASE_URL, "REACT_APP_BACKEND_URL missing"

MONGO_URL = None
DB_NAME = None
with open("/app/backend/.env") as fh:
    for line in fh:
        if line.startswith("MONGO_URL="):
            MONGO_URL = line.split("=", 1)[1].strip().strip('"')
        elif line.startswith("DB_NAME="):
            DB_NAME = line.split("=", 1)[1].strip().strip('"')

TEST_USER_EMAIL = "delivered@resend.dev"
TEST_USER_PASSWORD = "Tester#2026"

ADMIN_EMAIL = "admin@mapapp.app"
ADMIN_PASSWORD = "Ma-XjKTb93osTQxQhe1wD"


@pytest.fixture(scope="module")
def db():
    client = MongoClient(MONGO_URL)
    return client[DB_NAME]


@pytest.fixture(scope="module")
def api():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="module")
def ensure_delivered_user(api, db):
    """Ensure delivered@resend.dev exists with the known password (do not change permanently after)."""
    u = db.users.find_one({"email": TEST_USER_EMAIL})
    if not u:
        r = api.post(f"{BASE_URL}/api/auth/register", json={
            "email": TEST_USER_EMAIL, "password": TEST_USER_PASSWORD, "name": "Delivered Tester"
        })
        assert r.status_code == 200, r.text
        u = db.users.find_one({"email": TEST_USER_EMAIL})
    return u


@pytest.fixture()
def fresh_user(api, db):
    email = f"test_reset_{uuid.uuid4().hex[:10]}@example.com"
    r = api.post(f"{BASE_URL}/api/auth/register", json={
        "email": email, "password": "OldPass#1234", "name": "Reset Test"
    })
    assert r.status_code == 200, r.text
    user_doc = db.users.find_one({"email": email})
    yield {"email": email, "password": "OldPass#1234", "id": user_doc["id"]}
    # Cleanup
    db.users.delete_one({"email": email})
    db.password_reset_tokens.delete_many({"user_id": user_doc["id"]})
    db.login_attempts.delete_many({"identifier": {"$regex": f":{email}$"}})


# ---------- forgot-password ----------

class TestForgotPassword:
    def test_forgot_nonexistent_email_returns_generic_and_no_doc(self, api, db):
        email = f"nobody_{uuid.uuid4().hex[:8]}@example.com"
        before = db.password_reset_tokens.count_documents({})
        r = api.post(f"{BASE_URL}/api/auth/forgot-password", json={"email": email})
        assert r.status_code == 200, r.text
        data = r.json()
        assert data.get("ok") is True
        assert "reset link" in (data.get("message") or "").lower()
        after = db.password_reset_tokens.count_documents({})
        assert after == before  # no new doc created for unknown email

    def test_forgot_invalid_email_format(self, api):
        r = api.post(f"{BASE_URL}/api/auth/forgot-password", json={"email": "not-an-email"})
        assert r.status_code == 422, r.text

    def test_forgot_existing_user_creates_token_doc(self, api, db, ensure_delivered_user):
        user_id = ensure_delivered_user["id"]
        # Clean any prior tokens so we can count precisely (test-owned setup only)
        db.password_reset_tokens.delete_many({"user_id": user_id})
        r = api.post(f"{BASE_URL}/api/auth/forgot-password", json={"email": TEST_USER_EMAIL})
        assert r.status_code == 200, r.text
        assert r.json().get("ok") is True
        docs = list(db.password_reset_tokens.find({"user_id": user_id}))
        assert len(docs) == 1
        d = docs[0]
        assert d.get("used") is False
        assert isinstance(d.get("token_hash"), str) and len(d["token_hash"]) == 64
        assert d.get("expires_at") is not None
        # Cleanup
        db.password_reset_tokens.delete_many({"user_id": user_id})

    def test_forgot_rate_limit_max_3_per_hour(self, api, db, ensure_delivered_user):
        user_id = ensure_delivered_user["id"]
        db.password_reset_tokens.delete_many({"user_id": user_id})
        for _ in range(4):
            r = api.post(f"{BASE_URL}/api/auth/forgot-password", json={"email": TEST_USER_EMAIL})
            assert r.status_code == 200
            assert r.json().get("ok") is True
        count = db.password_reset_tokens.count_documents({"user_id": user_id})
        assert count == 3, f"Expected 3 tokens (rate-limited), got {count}"
        # Cleanup
        db.password_reset_tokens.delete_many({"user_id": user_id})


# ---------- reset-password E2E ----------

def _insert_token(db, user_id, expires_delta=timedelta(hours=1), used=False):
    token = secrets.token_urlsafe(32)
    now = datetime.now(timezone.utc)
    db.password_reset_tokens.insert_one({
        "token_hash": hashlib.sha256(token.encode()).hexdigest(),
        "user_id": user_id,
        "used": used,
        "created_at": now,
        "expires_at": now + expires_delta,
    })
    return token


class TestResetPasswordE2E:
    def test_reset_full_flow(self, db, fresh_user):
        token = _insert_token(db, fresh_user["id"])
        new_pw = "Fresh#Pass2026"

        s = requests.Session()
        r = s.post(f"{BASE_URL}/api/auth/reset-password", json={"token": token, "password": new_pw})
        assert r.status_code == 200, r.text
        # Response is user JSON
        data = r.json()
        assert data["email"] == fresh_user["email"]
        # Cookies set
        cookies = {c.name: c for c in s.cookies}
        assert "access_token" in cookies
        assert "refresh_token" in cookies

        # /auth/me works with the new session
        me = s.get(f"{BASE_URL}/api/auth/me")
        assert me.status_code == 200
        assert me.json()["email"] == fresh_user["email"]

        # Token marked used in DB
        h = hashlib.sha256(token.encode()).hexdigest()
        row = db.password_reset_tokens.find_one({"token_hash": h})
        assert row is not None and row.get("used") is True

        # Login with new password → 200
        s2 = requests.Session()
        r2 = s2.post(f"{BASE_URL}/api/auth/login", json={"email": fresh_user["email"], "password": new_pw})
        assert r2.status_code == 200

        # Login with old password → 401
        s3 = requests.Session()
        r3 = s3.post(f"{BASE_URL}/api/auth/login", json={"email": fresh_user["email"], "password": fresh_user["password"]})
        assert r3.status_code == 401

        # Reusing the same token → 400 "invalid or has expired"
        r4 = requests.post(f"{BASE_URL}/api/auth/reset-password", json={"token": token, "password": "AnotherPass#1"})
        assert r4.status_code == 400
        assert "invalid or has expired" in (r4.json().get("detail") or "").lower()

    def test_expired_token(self, db, fresh_user):
        token = _insert_token(db, fresh_user["id"], expires_delta=timedelta(hours=-1))
        r = requests.post(f"{BASE_URL}/api/auth/reset-password", json={"token": token, "password": "Something#2026"})
        assert r.status_code == 400
        assert "invalid or has expired" in (r.json().get("detail") or "").lower()

    def test_bogus_token(self):
        r = requests.post(f"{BASE_URL}/api/auth/reset-password",
                          json={"token": "a" * 40, "password": "Something#2026"})
        assert r.status_code == 400

    def test_short_password(self, db, fresh_user):
        token = _insert_token(db, fresh_user["id"])
        r = requests.post(f"{BASE_URL}/api/auth/reset-password", json={"token": token, "password": "short"})
        assert r.status_code == 422


# ---------- Regression: admin login still works ----------

class TestAdminLoginRegression:
    def test_admin_login(self):
        s = requests.Session()
        r = s.post(f"{BASE_URL}/api/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["email"] == ADMIN_EMAIL
        assert data.get("role") == "admin"
        assert data.get("is_pro") is True
