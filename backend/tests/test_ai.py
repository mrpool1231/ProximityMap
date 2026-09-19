"""AI endpoint tests (SSE streaming, history, validation)."""
import json
import os
import uuid
import requests
import pytest
from pathlib import Path


def _load_backend_url():
    url = os.environ.get("REACT_APP_BACKEND_URL")
    if url:
        return url.rstrip("/")
    env = Path("/app/frontend/.env").read_text()
    for line in env.splitlines():
        if line.startswith("REACT_APP_BACKEND_URL="):
            return line.split("=", 1)[1].strip().rstrip("/")
    raise RuntimeError("REACT_APP_BACKEND_URL not set")


BASE_URL = _load_backend_url()


def _sid():
    return f"qa-{uuid.uuid4().hex[:16]}"


def _read_stream(resp):
    """Parse SSE stream -> list of parsed json events + concatenated text."""
    events, full = [], ""
    for raw in resp.iter_lines(decode_unicode=True):
        if not raw or not raw.startswith("data: "):
            continue
        msg = json.loads(raw[6:])
        events.append(msg)
        if msg.get("delta"):
            full += msg["delta"]
    return events, full


def test_ai_config():
    r = requests.get(f"{BASE_URL}/api/ai/config", timeout=10)
    assert r.status_code == 200
    d = r.json()
    assert d["enabled"] is True
    assert d["provider"] == "openai"
    assert d["model"] == "gpt-5.4"


CTX = {
    "pin": [40.75, -73.99],
    "radius_m": 1500,
    "counts": {"Parks & Open Spaces": 8},
    "nearest": {"Parks & Open Spaces": [{"name": "Hudson River Park", "distance_m": 0}]},
}


@pytest.fixture(scope="module")
def chat_session():
    sid = _sid()
    yield sid
    # cleanup
    requests.delete(f"{BASE_URL}/api/ai/history/{sid}", timeout=10)


def test_chat_stream_and_history(chat_session):
    with requests.post(
        f"{BASE_URL}/api/ai/chat",
        json={"session_id": chat_session, "message": "How many parks?", "context": CTX},
        stream=True,
        timeout=60,
    ) as r:
        assert r.status_code == 200
        assert "text/event-stream" in r.headers.get("content-type", "")
        events, full = _read_stream(r)
    assert any(e.get("done") for e in events), f"no done event: {events[-3:]}"
    assert len(full) > 20, f"stream too short: {full!r}"

    # history has user + assistant
    h = requests.get(f"{BASE_URL}/api/ai/history/{chat_session}", timeout=10).json()
    roles = [m["role"] for m in h["messages"]]
    assert "user" in roles and "assistant" in roles
    assert h["messages"][-1]["content"] == full


def test_chat_followup_uses_context(chat_session):
    with requests.post(
        f"{BASE_URL}/api/ai/chat",
        json={"session_id": chat_session, "message": "Which is closest?", "context": CTX},
        stream=True,
        timeout=60,
    ) as r:
        assert r.status_code == 200
        _, full = _read_stream(r)
    assert "hudson" in full.lower(), f"expected reference to Hudson River Park: {full!r}"


def test_chat_delete_history(chat_session):
    r = requests.delete(f"{BASE_URL}/api/ai/history/{chat_session}", timeout=10)
    assert r.status_code == 200
    assert r.json().get("deleted", 0) >= 2
    h = requests.get(f"{BASE_URL}/api/ai/history/{chat_session}", timeout=10).json()
    assert h["messages"] == []


def test_chat_validation_empty_message():
    r = requests.post(
        f"{BASE_URL}/api/ai/chat",
        json={"session_id": _sid(), "message": "", "context": {}},
        timeout=10,
    )
    assert r.status_code == 422


def test_chat_validation_short_session_id():
    r = requests.post(
        f"{BASE_URL}/api/ai/chat",
        json={"session_id": "abc", "message": "hi", "context": {}},
        timeout=10,
    )
    assert r.status_code == 422


def test_summary_missing_pin():
    r = requests.post(f"{BASE_URL}/api/ai/summary", json={"context": {}}, timeout=10)
    assert r.status_code == 400


def test_summary_streamed():
    with requests.post(
        f"{BASE_URL}/api/ai/summary",
        json={"context": CTX},
        stream=True,
        timeout=90,
    ) as r:
        assert r.status_code == 200
        events, full = _read_stream(r)
    assert any(e.get("done") for e in events)
    assert len(full) > 100, f"summary too short: {full!r}"
