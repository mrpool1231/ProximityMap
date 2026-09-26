import axios from "axios";
import { queryCategory, geocodeClient } from "@/lib/overpass";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;

// Short-lived client cache prevents repeated POI requests while the user pans,
// toggles panels, or switches between nearby UI states. In-flight requests are
// shared so the same search is never fetched twice at once.
const poiCache = new Map();
const poiInFlight = new Map();
const POI_CACHE_MS = 30_000;
const poiKey = ({ lat, lon, radius, categories }) =>
  `${Number(lat).toFixed(4)}|${Number(lon).toFixed(4)}|${Math.round(radius)}|${[...categories].sort().join(",")}`;
export const API = `${BACKEND_URL}/api`;

export const api = axios.create({ baseURL: API, timeout: 40000, withCredentials: true });

// Silent access-token refresh on 401 (once per request)
api.interceptors.response.use(undefined, async (error) => {
  const cfg = error.config || {};
  const url = cfg.url || "";
  if (error.response?.status === 401 && !cfg._retried && !url.startsWith("/auth/")) {
    cfg._retried = true;
    try {
      await axios.post(`${API}/auth/refresh`, null, { withCredentials: true });
      return api(cfg);
    } catch {
      /* fall through */
    }
  }
  return Promise.reject(error);
});

export function formatApiError(detail, fallback = "Something went wrong") {
  if (detail == null) return fallback;
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) return detail.map((e) => (typeof e?.msg === "string" ? e.msg : JSON.stringify(e))).join(" ");
  if (typeof detail?.msg === "string") return detail.msg;
  return String(detail);
}

export const authApi = {
  me: () => api.get("/auth/me").then((r) => r.data),
  forgotPassword: (email) => api.post("/auth/forgot-password", { email }).then((r) => r.data),
  resetPassword: (token, password) => api.post("/auth/reset-password", { token, password }).then((r) => r.data),
  refresh: () => api.post("/auth/refresh").then((r) => r.data),
  login: (email, password) => api.post("/auth/login", { email, password }).then((r) => r.data),
  register: (email, password, name) => api.post("/auth/register", { email, password, name }).then((r) => r.data),
  logout: () => api.post("/auth/logout").then((r) => r.data),
  claimLicense: (session_id) => api.post("/auth/claim-license", { session_id }).then((r) => r.data),
  updateBranding: (branding) => api.put("/auth/branding", branding).then((r) => r.data),
  uploadLogo: (file) => {
    const fd = new FormData();
    fd.append("file", file);
    return api.post("/auth/branding/logo", fd).then((r) => r.data);
  },
  deleteLogo: () => api.delete("/auth/branding/logo").then((r) => r.data),
  logoUrl: (version) => `${API}/auth/branding/logo?v=${version || ""}`,
};

export async function geocode(q) {
  // Try backend proxy first (adds User-Agent, avoids browser 429 headers), fall
  // back to direct client call.
  try {
    const { data } = await api.get("/geocode", { params: { q }, timeout: 8000 });
    if (data.results?.length) return data.results;
  } catch {
    /* fall through */
  }
  return geocodeClient(q);
}

export async function fetchPOIs({ lat, lon, radius, categories }) {
  const key = poiKey({ lat, lon, radius, categories });
  const cached = poiCache.get(key);
  if (cached && Date.now() - cached.time < POI_CACHE_MS) return cached.data;
  if (poiInFlight.has(key)) return poiInFlight.get(key);
  const request = (async () => {
    // Prefer the backend for the normal path. Browser-side Overpass is kept as
    // a fallback only for categories the backend cannot provide or if the
    // backend request fails completely. This avoids racing duplicate requests
    // on every search while preserving the existing live-data fallback.
    const buildResult = () => ({
      center: { lat, lon },
      radius,
      categories: {},
      counts: {},
      total: 0,
      unavailable: [],
      source: "live",
    });

    try {
      const { data } = await api.get("/pois", {
        params: { lat, lon, radius, categories: categories.join(",") },
        timeout: 9000,
      });

      const result = buildResult();
      result.source = data.source || "live";
      const missing = [];

      categories.forEach((c) => {
        const items = data.categories?.[c];
        if (Array.isArray(items)) {
          result.categories[c] = items;
          result.counts[c] = items.length;
          result.total += items.length;
        } else {
          missing.push(c);
        }
      });

      if (missing.length) {
        const fallback = await Promise.all(
          missing.map((c) => queryCategory({ category: c, lat, lon, radius }))
        );
        missing.forEach((c, i) => {
          if (fallback[i] === null) {
            result.unavailable.push(c);
            return;
          }
          result.categories[c] = fallback[i];
          result.counts[c] = fallback[i].length;
          result.total += fallback[i].length;
        });
      }

      return result;
    } catch {
      // Complete backend failure: preserve the browser-side Overpass fallback.
      const settled = await Promise.all(
        categories.map((c) => queryCategory({ category: c, lat, lon, radius }))
      );
      const result = buildResult();

      categories.forEach((c, i) => {
        if (settled[i] === null) {
          result.unavailable.push(c);
          return;
        }
        result.categories[c] = settled[i];
        result.counts[c] = settled[i].length;
        result.total += settled[i].length;
      });

      return result;
    }
  }

    return null;
  })();
  poiInFlight.set(key, request);
  try {
    const data = await request;
    if (data) poiCache.set(key, { time: Date.now(), data });
    return data;
  } finally {
    poiInFlight.delete(key);
  }
}

export async function fetchWeather(lat, lon) {
  const { data } = await api.get("/weather", { params: { lat, lon } });
  return data;
}
export async function fetchAirQuality(lat, lon) {
  const { data } = await api.get("/air-quality", { params: { lat, lon } });
  return data;
}
export async function fetchElevation(lat, lon) {
  const { data } = await api.get("/elevation", { params: { lat, lon } });
  return data;
}

export async function saveCustomLayer(payload) {
  const { data } = await api.post("/custom-layers", payload);
  return data;
}
export async function listCustomLayers() {
  const { data } = await api.get("/custom-layers");
  return data;
}
export async function deleteCustomLayer(id) {
  const { data } = await api.delete(`/custom-layers/${id}`);
  return data;
}

export const TRAFFIC_TILE_URL = `${API}/traffic/tiles/{z}/{x}/{y}.png`;
export async function fetchTrafficConfig() {
  const { data } = await api.get("/traffic/config");
  return data;
}

export async function saveReport(state) {
  const { data } = await api.post("/reports", { state });
  return data;
}
export async function loadReport(id) {
  const { data } = await api.get(`/reports/${id}`);
  return data;
}

export async function fetchProducts() {
  const { data } = await api.get("/payments/products");
  return data.products;
}
export async function createCheckout(lookup_key) {
  const { data } = await api.post("/payments/checkout", { lookup_key, origin_url: window.location.origin });
  return data;
}
export async function createBillingPortal() {
  const { data } = await api.post("/payments/portal", { origin_url: window.location.origin });
  return data;
}
export async function paymentStatus(sessionId) {
  const { data } = await api.get(`/payments/status/${sessionId}`);
  return data;
}
