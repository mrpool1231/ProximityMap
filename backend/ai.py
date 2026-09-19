import os
import json
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from emergentintegrations.llm.chat import LlmChat, UserMessage, TextDelta, StreamDone

from core import db

EMERGENT_LLM_KEY = os.environ.get("EMERGENT_LLM_KEY", "")
AI_PROVIDER, AI_MODEL = "openai", "gpt-5.4"
HISTORY_TURNS = 12

ai_router = APIRouter(prefix="/api/ai")

PERSONA = (
    "You are GeoPulse Analyst, a concise location-intelligence assistant inside a mapping app. "
    "You answer questions about the user's current analysis area using ONLY the context provided "
    "(amenities within the buffer, distances, weather, air quality, elevation, property comparison). "
    "Distances are straight-line metres from the property line (or the pin). Be specific, cite counts and "
    "distances, and say plainly when the data cannot answer something. Keep answers under 150 words unless "
    "asked for detail. Use plain text, short paragraphs or dashes for lists; no markdown headings."
)

SUMMARY_PROMPT = (
    "Write a neighbourhood summary for a printed property brief based on the context. 3 short paragraphs, "
    "120-170 words total: (1) overall character and standout amenities with counts and nearest distances, "
    "(2) daily-life practicalities (schools, groceries, fuel, health) and environment (air, elevation, weather), "
    "(3) if a Property B exists, a balanced one-paragraph comparison and which property leads on amenities. "
    "Professional, factual tone; no bullet points, no markdown, no headings."
)


class ChatIn(BaseModel):
    session_id: str = Field(min_length=6, max_length=80)
    message: str = Field(min_length=1, max_length=2000)
    context: Dict[str, Any] = Field(default_factory=dict)


class SummaryIn(BaseModel):
    context: Dict[str, Any] = Field(default_factory=dict)


def _now():
    return datetime.now(timezone.utc)


def _context_block(ctx: Dict[str, Any]) -> str:
    if not ctx or not ctx.get("pin"):
        return "No analysis area is set yet. Ask the user to drop a pin, search an address or draw a property outline."
    return "CURRENT ANALYSIS CONTEXT (JSON):\n" + json.dumps(ctx, ensure_ascii=False)


def _history_block(rows: List[dict]) -> str:
    if not rows:
        return ""
    lines = [f"{'User' if r['role'] == 'user' else 'Analyst'}: {r['content']}" for r in rows]
    return "CONVERSATION SO FAR:\n" + "\n".join(lines)


def _chat(session_id: str, system: str) -> LlmChat:
    if not EMERGENT_LLM_KEY:
        raise HTTPException(503, "AI is not configured (missing EMERGENT_LLM_KEY)")
    return LlmChat(api_key=EMERGENT_LLM_KEY, session_id=session_id, system_message=system).with_model(AI_PROVIDER, AI_MODEL)


def _sse(payload: dict) -> str:
    return f"data: {json.dumps(payload, ensure_ascii=False)}\n\n"


async def _stream(chat: LlmChat, text: str, on_done=None):
    full = []
    try:
        async for ev in chat.stream_message(UserMessage(text=text)):
            if isinstance(ev, TextDelta):
                full.append(ev.content)
                yield _sse({"delta": ev.content})
            elif isinstance(ev, StreamDone):
                break
    except Exception as e:  # provider / network failure mid-stream
        yield _sse({"error": f"AI request failed: {str(e)[:160]}"})
        return
    content = "".join(full)
    if on_done:
        await on_done(content)
    yield _sse({"done": True, "content": content})


@ai_router.post("/chat")
async def ai_chat(payload: ChatIn):
    history = await db.ai_messages.find({"session_id": payload.session_id}, {"_id": 0}).sort("created_at", 1).to_list(HISTORY_TURNS * 2)
    system = "\n\n".join(filter(None, [PERSONA, _context_block(payload.context), _history_block(history)]))
    chat = _chat(payload.session_id, system)
    await db.ai_messages.insert_one({"id": str(uuid.uuid4()), "session_id": payload.session_id, "role": "user", "content": payload.message, "created_at": _now()})

    async def persist(content: str):
        if content:
            await db.ai_messages.insert_one({"id": str(uuid.uuid4()), "session_id": payload.session_id, "role": "assistant", "content": content, "created_at": _now()})

    return StreamingResponse(_stream(chat, payload.message, persist), media_type="text/event-stream", headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})


@ai_router.get("/history/{session_id}")
async def ai_history(session_id: str):
    rows = await db.ai_messages.find({"session_id": session_id}, {"_id": 0, "role": 1, "content": 1, "created_at": 1}).sort("created_at", 1).to_list(200)
    return {"messages": [{"role": r["role"], "content": r["content"]} for r in rows]}


@ai_router.delete("/history/{session_id}")
async def ai_clear(session_id: str):
    res = await db.ai_messages.delete_many({"session_id": session_id})
    return {"deleted": res.deleted_count}


@ai_router.post("/summary")
async def ai_summary(payload: SummaryIn):
    if not payload.context.get("pin"):
        raise HTTPException(400, "Set an analysis area first")
    chat = _chat(f"summary-{uuid.uuid4()}", PERSONA + "\n\n" + _context_block(payload.context))
    return StreamingResponse(_stream(chat, SUMMARY_PROMPT), media_type="text/event-stream", headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})


@ai_router.get("/config")
async def ai_config():
    return {"enabled": bool(EMERGENT_LLM_KEY), "provider": AI_PROVIDER, "model": AI_MODEL}
