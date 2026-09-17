import axios from "axios";
import { queryPOIs, geocodeClient } from "@/lib/overpass";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
export const API = `${BACKEND_URL}/api`;

export const api = axios.create({ baseURL: API, timeout: 40000 });

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
  // Overpass calls happen directly from the browser to avoid the server IP
  // being rate-limited / blocked. Backend has a /api/pois fallback but it is
  // unreliable from this network environment.
  return queryPOIs({ lat, lon, radius, categories });
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
export async function paymentStatus(sessionId) {
  const { data } = await api.get(`/payments/status/${sessionId}`);
  return data;
}
