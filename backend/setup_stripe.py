import os
import stripe
from dotenv import load_dotenv
from pathlib import Path

load_dotenv(Path(__file__).parent / ".env")
stripe.api_key = os.environ.get("STRIPE_SECRET_KEY") or "sk_test_emergent"

CATALOG = [
    {
        "emergent_product_id": "geopulse_pro",
        "name": "ProximityMap Pro — Monthly",
        "description": "Unlocks printable PDF property briefs, shareable report links and unlimited AI Analyst questions for $4.99/month.",
        "tax_code": "txcd_10000000",
        "prices": [
            {"lookup_key": "geopulse_pro_monthly", "amount": 499, "currency": "usd", "interval": "month"},
        ],
    },
]


def ensure_tax_settings():
    s = stripe.tax.Settings.retrieve()
    if s.head_office and getattr(s.head_office, "address", None):
        return
    stripe.tax.Settings.modify(
        head_office={"address": {"country": "US", "line1": "1 Market St", "city": "San Francisco", "state": "CA", "postal_code": "94105"}},
        defaults={"tax_behavior": "exclusive"},
    )


def get_or_create_product(entry):
    for p in stripe.Product.list(active=True).auto_paging_iter():
        if p.to_dict().get("metadata", {}).get("emergent_product_id") == entry["emergent_product_id"]:
            return p
    return stripe.Product.create(
        name=entry["name"],
        description=entry.get("description"),
        tax_code=entry.get("tax_code"),
        metadata={"managed_by": "emergent", "emergent_product_id": entry["emergent_product_id"]},
    )


def sync():
    try:
        ensure_tax_settings()
    except stripe.error.StripeError as e:
        print("tax settings skipped:", e)

    for entry in CATALOG:
        product = get_or_create_product(entry)

        # Retire the old one-time price from new checkout. Existing one-time
        # purchases remain valid in the application/database.
        try:
            old = stripe.Price.list(lookup_keys=["geopulse_pro_onetime"], active=True, limit=1).data
            if old:
                stripe.Price.modify(old[0].id, active=False)
                print("deactivated old one-time price", old[0].id)
        except stripe.error.StripeError as e:
            print("old price cleanup skipped:", e)

        for p in entry["prices"]:
            existing = stripe.Price.list(lookup_keys=[p["lookup_key"]], active=True, limit=1).data
            needs_new = (
                not existing
                or existing[0].unit_amount != p["amount"]
                or existing[0].currency != p["currency"]
                or not existing[0].recurring
                or existing[0].recurring.interval != p["interval"]
            )
            if existing and needs_new:
                stripe.Price.modify(existing[0].id, active=False)
                existing = []
            if not existing:
                price = stripe.Price.create(
                    product=product.id,
                    unit_amount=p["amount"],
                    currency=p["currency"],
                    lookup_key=p["lookup_key"],
                    transfer_lookup_key=True,
                    recurring={"interval": p["interval"]},
                )
                print("created price", p["lookup_key"], price.id)
            else:
                print("price ok", p["lookup_key"], existing[0].id)


if __name__ == "__main__":
    sync()
