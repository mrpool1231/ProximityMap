import os
from datetime import datetime, timezone
from typing import Optional

import stripe
from fastapi import APIRouter, HTTPException, Request, Depends
from pydantic import BaseModel, Field

from core import db
from auth import get_optional_user

stripe.api_key = os.environ.get("STRIPE_SECRET_KEY") or "sk_test_emergent"
STRIPE_WEBHOOK_SECRET = os.environ.get("STRIPE_WEBHOOK_SECRET", "")
TAX_MODE = "full"

payment_transactions = db["payment_transactions"]

payments_router = APIRouter(prefix="/api/payments")

PRODUCTS = {
    "geopulse_pro_onetime": {
        "name": "GeoPulse Pro",
        "tagline": "Property Brief Pass",
        "features": ["Print-ready PDF property briefs", "Shareable report links", "Lifetime access — one-time payment"],
    },
}


class CheckoutRequest(BaseModel):
    lookup_key: str
    quantity: int = Field(1, ge=1, le=100)
    origin_url: str
    user_id: Optional[str] = None


def _now():
    return datetime.now(timezone.utc)


async def _mark_paid(session_id: str, fields: dict):
    await payment_transactions.update_one({"session_id": session_id, "payment_status": {"$ne": "paid"}}, {"$set": {"status": "completed", "payment_status": "paid", **fields, "updated_at": _now()}})
    tx = await payment_transactions.find_one({"session_id": session_id})
    if tx and tx.get("user_id"):
        await db.users.update_one({"id": tx["user_id"]}, {"$set": {"is_pro": True, "pro_session_id": session_id}})


@payments_router.get("/products")
async def list_products():
    out = []
    for lookup_key, meta in PRODUCTS.items():
        prices = stripe.Price.list(lookup_keys=[lookup_key], active=True, limit=1).data
        if not prices:
            continue
        p = prices[0]
        out.append({**meta, "lookup_key": lookup_key, "amount": (p.unit_amount or 0) / 100.0, "currency": p.currency, "recurring": bool(p.recurring)})
    return {"products": out}


@payments_router.post("/checkout")
async def create_checkout(req: CheckoutRequest, user: Optional[dict] = Depends(get_optional_user)):
    if req.lookup_key not in PRODUCTS:
        raise HTTPException(400, "unknown product")
    user_id = user["id"] if user else req.user_id
    prices = stripe.Price.list(lookup_keys=[req.lookup_key], active=True, limit=1).data
    if not prices:
        raise HTTPException(500, f"Price not found: {req.lookup_key}")
    price = prices[0]
    kwargs = dict(
        line_items=[{"price": price.id, "quantity": req.quantity}],
        mode="subscription" if price.recurring else "payment",
        success_url=f"{req.origin_url}/payment/success?session_id={{CHECKOUT_SESSION_ID}}",
        cancel_url=f"{req.origin_url}/payment/cancel",
        metadata={"user_id": user_id or "", "lookup_key": req.lookup_key},
    )
    try:
        if TAX_MODE == "full":
            try:
                session = stripe.checkout.Session.create(**kwargs, managed_payments={"enabled": True})
            except stripe.error.InvalidRequestError as e:
                msg = (e.user_message or "").lower()
                if "managed payments" in msg or "ineligible" in msg:
                    session = stripe.checkout.Session.create(**kwargs, automatic_tax={"enabled": True}, billing_address_collection="required")
                else:
                    raise
        else:
            session = stripe.checkout.Session.create(**kwargs)
    except stripe.error.StripeError as e:
        raise HTTPException(502, f"stripe error: {e.user_message or str(e)}")

    await payment_transactions.insert_one({
        "session_id": session.id,
        "user_id": user_id,
        "lookup_key": req.lookup_key,
        "amount": (price.unit_amount or 0) * req.quantity,
        "currency": price.currency,
        "status": "initiated",
        "payment_status": "pending",
        "created_at": _now(),
        "updated_at": _now(),
    })
    return {"checkout_url": session.url, "session_id": session.id}


@payments_router.get("/status/{session_id}")
async def get_status(session_id: str):
    record = await payment_transactions.find_one({"session_id": session_id})
    if not record:
        raise HTTPException(404, "Transaction not found")
    if record.get("payment_status") != "paid":
        try:
            s = stripe.checkout.Session.retrieve(session_id)
            if s.payment_status == "paid" or s.status == "complete":
                await _mark_paid(session_id, {"stripe_subscription_id": s.subscription, "stripe_payment_intent_id": s.payment_intent})
                record = await payment_transactions.find_one({"session_id": session_id})
        except stripe.error.StripeError:
            pass
    return {"session_id": record["session_id"], "status": record["status"], "payment_status": record["payment_status"], "lookup_key": record.get("lookup_key")}


webhook_router = APIRouter(prefix="/api")


@webhook_router.post("/stripe/webhook")
async def stripe_webhook(request: Request):
    payload = await request.body()
    sig = request.headers.get("stripe-signature", "")
    try:
        event = stripe.Webhook.construct_event(payload, sig, STRIPE_WEBHOOK_SECRET)
    except (stripe.error.SignatureVerificationError, ValueError):
        raise HTTPException(400, "Invalid signature")
    obj, t = event["data"]["object"], event["type"]
    if t == "checkout.session.completed":
        await _mark_paid(obj["id"], {"stripe_subscription_id": obj.get("subscription"), "stripe_payment_intent_id": obj.get("payment_intent")})
    elif t == "checkout.session.async_payment_succeeded":
        await _mark_paid(obj["id"], {})
    elif t == "checkout.session.async_payment_failed":
        await payment_transactions.update_one({"session_id": obj["id"]}, {"$set": {"status": "failed", "payment_status": "failed", "updated_at": _now()}})
    elif t == "checkout.session.expired":
        await payment_transactions.update_one({"session_id": obj["id"]}, {"$set": {"status": "expired", "payment_status": "expired", "updated_at": _now()}})
    elif t == "charge.refunded":
        await payment_transactions.update_one({"stripe_payment_intent_id": obj.get("payment_intent")}, {"$set": {"status": "refunded", "payment_status": "refunded", "updated_at": _now()}})
    return {"status": "ok"}
