import { API } from "@/lib/api";
import { LAYER_BY_ID } from "@/lib/mapConfig";
import { propertyArea } from "@/lib/geo";

const SESSION_KEY = "geopulse_ai_session";
const FREE_KEY = "geopulse_ai_free_used";
export const FREE_QUESTIONS = 3;

export function getAISession() {
  let id = localStorage.getItem(SESSION_KEY);
  if (!id) {
    id = `ai-${crypto.randomUUID()}`;
    localStorage.setItem(SESSION_KEY, id);
  }
  return id;
}
export function resetAISession() {
  localStorage.removeItem(SESSION_KEY);
  return getAISession();
}
export const freeUsed = () => Number(localStorage.getItem(FREE_KEY) || 0);
export const bumpFreeUsed = () => localStorage.setItem(FREE_KEY, String(freeUsed() + 1));

const nearest = (data) =>
  Object.fromEntries(
    Object.entries(data?.categories || {})
      .filter(([, l]) => l.length)
      .map(([cat, l]) => [LAYER_BY_ID[cat]?.label || cat, l.slice(0, 3).map((p) => ({ name: p.name, distance_m: Math.round(p.distance_m) }))])
  );
const counts = (data) => Object.fromEntries(Object.entries(data?.counts || {}).map(([cat, n]) => [LAYER_BY_ID[cat]?.label || cat, n]));

// Compact snapshot of the current analysis for the model
export function buildAIContext({ pin, radius, property, propertyB, proximityData, dataB, env }) {
  if (!pin) return {};
  const w = env?.weather?.current;
  const a = env?.aqi?.current;
  return {
    pin: [Number(pin[0].toFixed(5)), Number(pin[1].toFixed(5))],
    radius_m: radius,
    mode: property ? "distances from property line" : "distances from center pin",
    property_a: property ? { vertices: property.length, area_m2: Math.round(propertyArea(property)) } : null,
    counts: counts(proximityData),
    total: proximityData?.total ?? 0,
    nearest: nearest(proximityData),
    env: {
      temp_c: w?.temperature_2m,
      humidity_pct: w?.relative_humidity_2m,
      wind_kmh: w?.wind_speed_10m,
      us_aqi: a?.us_aqi,
      pm2_5: a?.pm2_5,
      elevation_m: env?.elev?.elevation?.[0] != null ? Math.round(env.elev.elevation[0]) : undefined,
    },
    property_b: propertyB ? { vertices: propertyB.length, area_m2: Math.round(propertyArea(propertyB)), counts: counts(dataB), total: dataB?.total ?? 0, nearest: nearest(dataB) } : null,
  };
}

// POST + read an SSE stream; calls onDelta(text) per token, resolves with the full text
export async function streamAI(path, body, onDelta, signal) {
  const res = await fetch(`${API}${path}`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });
  if (!res.ok) {
    let detail = res.statusText;
    try {
      detail = (await res.json()).detail || detail;
    } catch {
      /* ignore */
    }
    throw new Error(typeof detail === "string" ? detail : "AI request failed");
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  let full = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const events = buf.split("\n\n");
    buf = events.pop();
    for (const ev of events) {
      const line = ev.split("\n").find((l) => l.startsWith("data: "));
      if (!line) continue;
      const msg = JSON.parse(line.slice(6));
      if (msg.error) throw new Error(msg.error);
      if (msg.delta) {
        full += msg.delta;
        onDelta(msg.delta, full);
      }
    }
  }
  return full;
}
