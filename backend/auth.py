import os
import uuid
import secrets
import hashlib
from html import escape
from datetime import datetime, timezone, timedelta
from typing import Optional

import bcrypt
import jwt
from fastapi import APIRouter, HTTPException, Request, Response, Depends, UploadFile, File
from pydantic import BaseModel, EmailStr, Field

from core import db
from storage import put_object, get_object, APP_NAME
from emailer import send_email, EMAIL_FROM_NAME

JWT_ALGORITHM = "HS256"
ACCESS_TTL = timedelta(minutes=15)
REFRESH_TTL = timedelta(days=7)
MAX_ATTEMPTS = 5
LOCKOUT = timedelta(minutes=15)
LOGO_MAX_BYTES = 2 * 1024 * 1024
LOGO_TYPES = {"image/png", "image/jpeg", "image/webp", "image/svg+xml"}

auth_router = APIRouter(prefix="/api/auth")


def _now():
    return datetime.now(timezone.utc)


def _secret():
    return os.environ["JWT_SECRET"]


def hash_password(pw: str) -> str:
    return bcrypt.hashpw(pw.encode(), bcrypt.gensalt()).decode()


def verify_password(pw: str, hashed: str) -> bool:
    return bcrypt.checkpw(pw.encode(), hashed.encode())


def _token(user_id: str, kind: str, ttl: timedelta, **extra):
    return jwt.encode({"sub": user_id, "type": kind, "exp": _now() + ttl, **extra}, _secret(), algorithm=JWT_ALGORITHM)


def _set_cookies(response: Response, user_id: str, email: str):
    response.set_cookie("access_token", _token(user_id, "access", ACCESS_TTL, email=email), httponly=True, secure=True, samesite="none", max_age=900, path="/")
    response.set_cookie("refresh_token", _token(user_id, "refresh", REFRESH_TTL), httponly=True, secure=True, samesite="none", max_age=604800, path="/")


def public_user(u: dict) -> dict:
    return {
        "id": u["id"],
        "email": u["email"],
        "name": u.get("name") or u["email"].split("@")[0],
        "role": u.get("role", "user"),
        "is_pro": bool(u.get("is_pro")),
        "pro_subscription_id": u.get("pro_subscription_id"),
        "pro_subscription_status": u.get("pro_subscription_status"),
        "branding": u.get("branding") or {},
    }


def _read_token(request: Request) -> Optional[str]:
    token = request.cookies.get("access_token")
    if not token:
        header = request.headers.get("Authorization", "")
        if header.startswith("Bearer "):
            token = header[7:]
    return token


async def get_optional_user(request: Request) -> Optional[dict]:
    token = _read_token(request)
    if not token:
        return None
    try:
        payload = jwt.decode(token, _secret(), algorithms=[JWT_ALGORITHM])
    except jwt.InvalidTokenError:
        return None
    if payload.get("type") != "access":
        return None
    return await db.users.find_one({"id": payload["sub"]}, {"_id": 0})


async def get_current_user(request: Request) -> dict:
    token = _read_token(request)
    if not token:
        raise HTTPException(401, "Not authenticated")
    try:
        payload = jwt.decode(token, _secret(), algorithms=[JWT_ALGORITHM])
    except jwt.ExpiredSignatureError:
        raise HTTPException(401, "Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(401, "Invalid token")
    if payload.get("type") != "access":
        raise HTTPException(401, "Invalid token type")
    user = await db.users.find_one({"id": payload["sub"]}, {"_id": 0})
    if not user:
        raise HTTPException(401, "User not found")
    return user


class RegisterIn(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    name: Optional[str] = Field(default=None, max_length=80)


class LoginIn(BaseModel):
    email: EmailStr
    password: str


class BrandingIn(BaseModel):
    company: Optional[str] = Field(default="", max_length=80)
    contact_name: Optional[str] = Field(default="", max_length=80)
    phone: Optional[str] = Field(default="", max_length=40)
    email: Optional[str] = Field(default="", max_length=120)
    website: Optional[str] = Field(default="", max_length=120)
    tagline: Optional[str] = Field(default="", max_length=120)


class ClaimIn(BaseModel):
    session_id: str


class ForgotIn(BaseModel):
    email: EmailStr


class ResetIn(BaseModel):
    token: str = Field(min_length=20, max_length=200)
    password: str = Field(min_length=8, max_length=128)


RESET_TTL = timedelta(hours=1)
RESET_MAX_PER_HOUR = 3


def _reset_email_html(name: str, link: str) -> str:
    n, l, brand = escape(name), escape(link, quote=True), escape(EMAIL_FROM_NAME)
    return (
        '<table role="presentation" width="100%" style="background:#0b0f17;padding:32px 0"><tr><td align="center">'
        '<table role="presentation" width="520" style="background:#111827;border-radius:12px;padding:32px;font-family:Arial,sans-serif;color:#e2e8f0">'
        f'<tr><td><p style="margin:0 0 8px;font-size:12px;letter-spacing:2px;color:#94a3b8">{brand}</p>'
        f'<h1 style="margin:0 0 16px;font-size:22px;color:#f8fafc">Reset your password</h1>'
        f'<p style="margin:0 0 20px;line-height:1.6">Hi {n}, we received a request to reset the password for your {brand} account. '
        'This link works once and expires in 1 hour.</p>'
        f'<p style="margin:0 0 24px"><a href="{l}" style="display:inline-block;background:#38bdf8;color:#0b0f17;font-weight:bold;'
        'padding:12px 20px;border-radius:8px;text-decoration:none">Choose a new password</a></p>'
        '<p style="margin:0 0 8px;font-size:13px;color:#94a3b8">If you did not request this, you can ignore this email — your password will not change.</p>'
        f'<p style="margin:16px 0 0;font-size:12px;color:#64748b">Sent by {brand}. We never ask for your password or payment details by email.</p>'
        '</td></tr></table></td></tr></table>'
    )


async def _lockout_check(identifier: str):
    row = await db.login_attempts.find_one({"identifier": identifier})
    if row and row.get("count", 0) >= MAX_ATTEMPTS and row.get("last_attempt") and _now() - row["last_attempt"].replace(tzinfo=timezone.utc) < LOCKOUT:
        raise HTTPException(429, "Too many failed attempts. Try again in 15 minutes.")


@auth_router.post("/register")
async def register(payload: RegisterIn, response: Response):
    email = payload.email.lower()
    if await db.users.find_one({"email": email}):
        raise HTTPException(400, "An account with this email already exists")
    user = {
        "id": str(uuid.uuid4()),
        "email": email,
        "name": payload.name or email.split("@")[0],
        "password_hash": hash_password(payload.password),
        "role": "user",
        "is_pro": False,
        "branding": {},
        "created_at": _now(),
    }
    await db.users.insert_one(user)
    _set_cookies(response, user["id"], email)
    return public_user(user)


@auth_router.post("/login")
async def login(payload: LoginIn, request: Request, response: Response):
    email = payload.email.lower()
    identifier = f"{request.client.host if request.client else 'unknown'}:{email}"
    await _lockout_check(identifier)
    user = await db.users.find_one({"email": email}, {"_id": 0})
    if not user or not verify_password(payload.password, user["password_hash"]):
        await db.login_attempts.update_one({"identifier": identifier}, {"$inc": {"count": 1}, "$set": {"last_attempt": _now()}}, upsert=True)
        raise HTTPException(401, "Invalid email or password")
    await db.login_attempts.delete_one({"identifier": identifier})
    _set_cookies(response, user["id"], email)
    return public_user(user)


@auth_router.post("/logout")
async def logout(response: Response):
    response.delete_cookie("access_token", path="/")
    response.delete_cookie("refresh_token", path="/")
    return {"ok": True}


@auth_router.post("/refresh")
async def refresh(request: Request, response: Response):
    token = request.cookies.get("refresh_token")
    if not token:
        raise HTTPException(401, "No refresh token")
    try:
        payload = jwt.decode(token, _secret(), algorithms=[JWT_ALGORITHM])
    except jwt.InvalidTokenError:
        raise HTTPException(401, "Invalid refresh token")
    if payload.get("type") != "refresh":
        raise HTTPException(401, "Invalid token type")
    user = await db.users.find_one({"id": payload["sub"]}, {"_id": 0})
    if not user:
        raise HTTPException(401, "User not found")
    response.set_cookie("access_token", _token(user["id"], "access", ACCESS_TTL, email=user["email"]), httponly=True, secure=True, samesite="none", max_age=900, path="/")
    return public_user(user)


@auth_router.get("/me")
async def me(user: dict = Depends(get_current_user)):
    return public_user(user)


@auth_router.post("/claim-license")
async def claim_license(payload: ClaimIn, user: dict = Depends(get_current_user)):
    tx = await db.payment_transactions.find_one({"session_id": payload.session_id})
    if not tx or tx.get("payment_status") != "paid":
        raise HTTPException(400, "This purchase is not confirmed as paid")
    # Preserve legacy lifetime one-time purchases, while requiring an active
    # subscription for new monthly Pro purchases.
    if tx.get("stripe_subscription_id") and tx.get("subscription_status") not in {"active", "trialing"}:
        raise HTTPException(400, "This Pro subscription is not active")
    if tx.get("user_id") and tx["user_id"] != user["id"]:
        raise HTTPException(409, "This purchase already belongs to another account")
    await db.payment_transactions.update_one({"session_id": payload.session_id}, {"$set": {"user_id": user["id"]}})
    fields = {"is_pro": True, "pro_session_id": payload.session_id}
    if tx.get("stripe_subscription_id"):
        fields.update({
            "pro_subscription_id": tx["stripe_subscription_id"],
            "pro_subscription_status": tx.get("subscription_status"),
        })
    await db.users.update_one({"id": user["id"]}, {"$set": fields})
    return {"is_pro": True}


@auth_router.post("/forgot-password")
async def forgot_password(payload: ForgotIn, request: Request):
    email = payload.email.lower()
    generic = {"ok": True, "message": "If an account exists for that email, a reset link is on its way."}
    user = await db.users.find_one({"email": email}, {"_id": 0})
    if not user:
        return generic
    since = _now() - timedelta(hours=1)
    recent = await db.password_reset_tokens.count_documents({"user_id": user["id"], "created_at": {"$gte": since}})
    if recent >= RESET_MAX_PER_HOUR:
        return generic
    token = secrets.token_urlsafe(32)
    await db.password_reset_tokens.insert_one({
        "token_hash": hashlib.sha256(token.encode()).hexdigest(),
        "user_id": user["id"],
        "used": False,
        "created_at": _now(),
        "expires_at": _now() + RESET_TTL,
    })
    origin = request.headers.get("origin") or f"{request.url.scheme}://{request.url.netloc}"
    if not origin.startswith("https://"):
        origin = "https://" + origin.split("://", 1)[-1]
    link = f"{origin}/reset-password?token={token}"
    await send_email(to=user["email"], subject=f"Reset your {EMAIL_FROM_NAME} password", html=_reset_email_html(user.get("name") or "there", link))
    return generic


@auth_router.post("/reset-password")
async def reset_password(payload: ResetIn, response: Response):
    row = await db.password_reset_tokens.find_one({"token_hash": hashlib.sha256(payload.token.encode()).hexdigest()})
    if not row or row.get("used") or row["expires_at"].replace(tzinfo=timezone.utc) < _now():
        raise HTTPException(400, "This reset link is invalid or has expired. Request a new one.")
    user = await db.users.find_one({"id": row["user_id"]}, {"_id": 0})
    if not user:
        raise HTTPException(400, "Account no longer exists")
    await db.users.update_one({"id": user["id"]}, {"$set": {"password_hash": hash_password(payload.password)}})
    await db.password_reset_tokens.update_one({"_id": row["_id"]}, {"$set": {"used": True}})
    await db.login_attempts.delete_many({"identifier": {"$regex": f":{user['email']}$"}})
    _set_cookies(response, user["id"], user["email"])
    return public_user(user)


@auth_router.put("/branding")
async def update_branding(payload: BrandingIn, user: dict = Depends(get_current_user)):
    branding = {**(user.get("branding") or {}), **payload.model_dump()}
    await db.users.update_one({"id": user["id"]}, {"$set": {"branding": branding}})
    return branding


@auth_router.post("/branding/logo")
async def upload_logo(file: UploadFile = File(...), user: dict = Depends(get_current_user)):
    if file.content_type not in LOGO_TYPES:
        raise HTTPException(400, "Logo must be PNG, JPG, WebP or SVG")
    data = await file.read()
    if len(data) > LOGO_MAX_BYTES:
        raise HTTPException(400, "Logo must be under 2 MB")
    ext = {"image/png": "png", "image/jpeg": "jpg", "image/webp": "webp", "image/svg+xml": "svg"}[file.content_type]
    path = f"{APP_NAME}/logos/{user['id']}/{uuid.uuid4()}.{ext}"
    try:
        result = put_object(path, data, file.content_type)
    except Exception:
        raise HTTPException(502, "Logo storage is unavailable right now")
    branding = {**(user.get("branding") or {}), "logo_path": result["path"], "logo_type": file.content_type, "logo_version": uuid.uuid4().hex[:8]}
    await db.users.update_one({"id": user["id"]}, {"$set": {"branding": branding}})
    return branding


@auth_router.delete("/branding/logo")
async def remove_logo(user: dict = Depends(get_current_user)):
    branding = {k: v for k, v in (user.get("branding") or {}).items() if not k.startswith("logo_")}
    await db.users.update_one({"id": user["id"]}, {"$set": {"branding": branding}})
    return branding


@auth_router.get("/branding/logo")
async def get_logo(user: dict = Depends(get_current_user)):
    path = (user.get("branding") or {}).get("logo_path")
    if not path:
        raise HTTPException(404, "No logo")
    try:
        data, ctype = get_object(path)
    except Exception:
        raise HTTPException(502, "Logo storage is unavailable right now")
    return Response(content=data, media_type=(user["branding"].get("logo_type") or ctype), headers={"Cache-Control": "private, max-age=3600"})


async def seed_admin():
    email = os.environ.get("ADMIN_EMAIL", "").lower()
    password = os.environ.get("ADMIN_PASSWORD", "")
    if not email or not password:
        return
    existing = await db.users.find_one({"email": email})
    if existing is None:
        await db.users.insert_one({"id": str(uuid.uuid4()), "email": email, "name": "Admin", "password_hash": hash_password(password), "role": "admin", "is_pro": True, "branding": {}, "created_at": _now()})
    elif not verify_password(password, existing["password_hash"]):
        await db.users.update_one({"email": email}, {"$set": {"password_hash": hash_password(password)}})


async def ensure_indexes():
    await db.users.create_index("email", unique=True)
    await db.users.create_index("id", unique=True)
    await db.login_attempts.create_index("identifier")
    await db.password_reset_tokens.create_index("expires_at", expireAfterSeconds=0)
    await db.password_reset_tokens.create_index("token_hash")
