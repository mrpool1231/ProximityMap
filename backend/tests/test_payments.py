"""GeoPulse Studio payments API tests - iteration 4 (Stripe)."""
import os
import pytest
import requests

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')
try:
    with open('/app/frontend/.env') as fh:
        for line in fh:
            if line.startswith('REACT_APP_BACKEND_URL='):
                BASE_URL = line.split('=', 1)[1].strip().rstrip('/')
                break
except Exception:
    pass


@pytest.fixture(scope="module")
def s():
    sess = requests.Session()
    sess.headers.update({"Content-Type": "application/json"})
    return sess


def test_products_lists_geopulse_pro(s):
    r = s.get(f"{BASE_URL}/api/payments/products", timeout=20)
    assert r.status_code == 200, r.text
    products = r.json().get("products", [])
    assert len(products) >= 1
    pro = next((p for p in products if p["lookup_key"] == "geopulse_pro_monthly"), None)
    assert pro is not None, f"geopulse_pro_monthly missing: {products}"
    assert pro["amount"] == 4.99
    assert pro["currency"] == "usd"
    assert pro.get("recurring") is True
    assert pro.get("interval") == "month"


def test_checkout_unknown_lookup_key_returns_400(s):
    r = s.post(f"{BASE_URL}/api/payments/checkout",
               json={"lookup_key": "does_not_exist_xyz", "origin_url": BASE_URL},
               timeout=20)
    assert r.status_code == 400, r.text


def test_checkout_creates_session_and_status_initiated(s):
    r = s.post(f"{BASE_URL}/api/payments/checkout",
               json={"lookup_key": "geopulse_pro_monthly", "origin_url": BASE_URL},
               timeout=30)
    assert r.status_code == 200, r.text
    body = r.json()
    assert "checkout_url" in body and "checkout.stripe.com" in body["checkout_url"]
    assert "session_id" in body and body["session_id"].startswith("cs_")

    sid = body["session_id"]
    st = s.get(f"{BASE_URL}/api/payments/status/{sid}", timeout=20)
    assert st.status_code == 200, st.text
    sj = st.json()
    assert sj["session_id"] == sid
    assert sj["status"] == "initiated"
    assert sj["payment_status"] == "pending"
    assert sj["lookup_key"] == "geopulse_pro_monthly"


def test_status_unknown_returns_404(s):
    r = s.get(f"{BASE_URL}/api/payments/status/bogus_session_xyz", timeout=15)
    assert r.status_code == 404


def test_stripe_webhook_bad_signature_returns_400(s):
    r = s.post(f"{BASE_URL}/api/stripe/webhook",
               data=b'{"type":"checkout.session.completed"}',
               headers={"Content-Type": "application/json", "stripe-signature": "t=1,v1=deadbeef"},
               timeout=15)
    assert r.status_code == 400
