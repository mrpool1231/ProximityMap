import os
from datetime import datetime, timezone
from typing import Optional

import stripe
from fastapi import APIRouter, HTTPException, Request, Depends
from pydantic import BaseModel, Field

from core import db
from auth import get_optional_user, get_current_user

stripe.api_key = os.environ.get("STRIPE_SECRET_KEY") or "sk_test_emergent"
STRIPE_WEBHOOK_SECRET = os.environ.get("STRIPE_WEBHOOK_SECRET", "")
TAX_MODE = "full"

payment_transactions = db["payment_transactions"]

PRODUCTS = {
    "geopulse_pro_monthly": {
        "name": "ProximityMap Pro",
        "tagline": "Monthly Pro subscription",
        "features": ["Print-ready PDF property briefs", "Shareable report links", "Unlimited AI Analyst questions"],
    },
}


class CheckoutRequest(BaseModel):
    lookup_key: str
    quantity: int = Field(1, ge=1, le=100)
    origin_url: str
    user_id: Optional[str] = None


class PortalRequest(BaseModel):
    origin_url: str


def _now():
    return datetime.now(timezone.utc)


def _active_subscription_status(status: Optional[str]) -> bool:
    return status in {"active", "trialing"}


async def _set_user_pro(user_id: Optional[str], is_pro: bool, session_id: Optional[str] = None, subscription_id: Optional[str] = None):
    if not user_id:
        return
    fields = {"is_pro": is_pro}
    if session_id:
        fields["pro_session_id"] = session_id
    if subscription_id:
        fields["pro_subscription_id"] = subscription_id
    await db.users.update_one({"id": user_id}, {"$set": fields})


async def _mark_paid(session_id: str, fields: dict):
    await payment_transactions.update_one(
        {"session_id": session_id, "payment_status": {"$ne": "paid"}},
        {"$set": {
            "status": "completed",
            "payment_status": "paid",
            **fields,
            "updated_at": _now(),
        }},
    )
    tx = await payment_transactions.find_one({"session_id": session_id})
    if tx:
        sub_id = tx.get("stripe_subscription_id") or fields.get("stripe_subscription_id")
        await _set_user_pro(tx.get("user_id"), True, session_id=session_id, subscription_id=sub_id)
        if tx.get("user_id") and sub_id:
            await db.users.update_one(
                {"id": tx["user_id"]},
                {"$set": {"pro_subscription_status": tx.get("subscription_status") or "active"}},
            )


async def _sync_subscription(subscription_id: str, status: str):
    tx = await payment_transactions.find_one({"stripe_subscription_id": subscription_id})
    if not tx:
        return
    active = _active_subscription_status(status)
    await payment_transactions.update_many(
        {"stripe_subscription_id": subscription_id},
        {"$set": {
            "subscription_status": status,
            "updated_at": _now(),
            "status": "completed" if active else status,
        }},
    )
    await _set_user_pro(tx.get("user_id"), active, subscription_id=subscription_id)
    if tx.get("user_id"):
        await db.users.update_one(
            {"id": tx["user_id"]},
            {"$set": {"pro_subscription_status": status}},
        )


payments_router = APIRouter(prefix="/api/payments")


@payments_router.get("/products")
async def list_products():
    out = []
    for lookup_key, meta in PRODUCTS.items():
        prices = stripe.Price.list(lookup_keys=[lookup_key], active=True, limit=1).data
        if not prices:
            continue
        p = prices[0]
        out.append({
            **meta,
            "lookup_key": lookup_key,
            "amount": (p.unit_amount or 0) / 100.0,
            "currency": p.currency,
            "recurring": bool(p.recurring),
            "interval": p.recurring.interval if p.recurring else None,
        })
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
    if not price.recurring or price.recurring.interval != "month":
        raise HTTPException(500, "ProximityMap Pro is not configured as a monthly subscription")

    kwargs = dict(
        line_items=[{"price": price.id, "quantity": req.quantity}],
        mode="subscription",
        success_url=f"{req.origin_url}/payment/success?session_id={{CHECKOUT_SESSION_ID}}",
        cancel_url=f"{req.origin_url}/payment/cancel",
        metadata={"user_id": user_id or "", "lookup_key": req.lookup_key},
        subscription_data={"metadata": {"user_id": user_id or "", "lookup_key": req.lookup_key}},
    )
    try:
        if TAX_MODE == "full":
            try:
                session = stripe.checkout.Session.create(**kwargs, managed_payments={"enabled": True})
            except stripe.error.InvalidRequestError as e:
                msg = (e.user_message or "").lower()
                if "managed payments" in msg or "ineligible" in msg:
                    session = stripe.checkout.Session.create(
                        **kwargs,
                        automatic_tax={"enabled": True},
                        billing_address_collection="required",
                    )
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
        "subscription_status": "incomplete",
        "stripe_subscription_id": session.subscription,
        "stripe_customer_id": session.customer,
        "created_at": _now(),
        "updated_at": _now(),
    })
    return {"checkout_url": session.url, "session_id": session.id}


@payments_router.get("/status/{session_id}")
async def get_status(session_id: str):
    record = await payment_transactions.find_one({"session_id": session_id})
    if not record:
        raise HTTPException(404, "Transaction not found")

    if record.get("stripe_subscription_id"):
        try:
            sub = stripe.Subscription.retrieve(record["stripe_subscription_id"])
            await _sync_subscription(record["stripe_subscription_id"], sub.status)
            record = await payment_transactions.find_one({"session_id": session_id})
        except stripe.error.StripeError:
            pass
    elif record.get("payment_status") != "paid":
        try:
            s = stripe.checkout.Session.retrieve(session_id)
            if s.payment_status == "paid" or s.status == "complete":
                await _mark_paid(
                    session_id,
                    {
                        "stripe_subscription_id": s.subscription,
                        "stripe_customer_id": s.customer,
                        "stripe_payment_intent_id": s.payment_intent,
                    },
                )
                record = await payment_transactions.find_one({"session_id": session_id})
        except stripe.error.StripeError:
            pass

    active = _active_subscription_status(record.get("subscription_status"))
    effective_paid = record.get("payment_status") == "paid" and (
        not record.get("stripe_subscription_id") or active
    )
    return {
        "session_id": record["session_id"],
        "status": record["status"],
        "payment_status": "paid" if effective_paid else record.get("payment_status"),
        "lookup_key": record.get("lookup_key"),
        "subscription_status": record.get("subscription_status"),
    }


@payments_router.post("/portal")
async def create_portal(req: PortalRequest, user: dict = Depends(get_current_user)):
    tx = await payment_transactions.find_one(
        {"user_id": user["id"], "stripe_subscription_id": {"$exists": True, "$ne": None}},
        sort=[("created_at", -1)],
    )
    if not tx or not tx.get("stripe_customer_id"):
        raise HTTPException(400, "No active ProximityMap Pro subscription found")
    try:
        session = stripe.billing_portal.Session.create(
            customer=tx["stripe_customer_id"],
            return_url=req.origin_url,
        )
    except stripe.error.StripeError as e:
        raise HTTPException(502, f"stripe error: {e.user_message or str(e)}")
    return {"portal_url": session.url}


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
        await _mark_paid(
            obj["id"],
            {
                "stripe_subscription_id": obj.get("subscription"),
                "stripe_customer_id": obj.get("customer"),
                "stripe_payment_intent_id": obj.get("payment_intent"),
                "subscription_status": "active" if obj.get("subscription") else None,
            },
        )
    elif t == "checkout.session.async_payment_succeeded":
        await _mark_paid(obj["id"], {})
    elif t == "checkout.session.async_payment_failed":
        await payment_transactions.update_one(
            {"session_id": obj["id"]},
            {"$set": {"status": "failed", "payment_status": "failed", "updated_at": _now()}},
        )
    elif t == "checkout.session.expired":
        await payment_transactions.update_one(
            {"session_id": obj["id"]},
            {"$set": {"status": "expired", "payment_status": "expired", "updated_at": _now()}},
        )
    elif t.startswith("customer.subscription."):
        sub_id = obj.get("id")
        if sub_id:
            await _sync_subscription(sub_id, obj.get("status"))
    elif t == "invoice.paid":
        sub_id = obj.get("subscription")
        if sub_id:
            tx = await payment_transactions.find_one({"stripe_subscription_id": sub_id})
            if tx:
                try:
                    sub = stripe.Subscription.retrieve(sub_id)
                    await _sync_subscription(sub_id, sub.status)
                except stripe.error.StripeError:
                    pass
    elif t == "invoice.payment_failed":
        sub_id = obj.get("subscription")
        if sub_id:
            tx = await payment_transactions.find_one({"stripe_subscription_id": sub_id})
            if tx:
                await payment_transactions.update_many(
                    {"stripe_subscription_id": sub_id},
                    {"$set": {"subscription_status": "past_due", "updated_at": _now()}},
                )
                await _set_user_pro(tx.get("user_id"), False, subscription_id=sub_id)
    elif t == "charge.refunded":
        await payment_transactions.update_one(
            {"stripe_payment_intent_id": obj.get("payment_intent")},
            {"$set": {"status": "refunded", "payment_status": "refunded", "updated_at": _now()}},
        )

    return {"status": "ok"}
