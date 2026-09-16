import axios from "axios";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
export const API = `${BACKEND_URL}/api`;

export const api = axios.create({ baseURL: API, timeout: 40000 });

export async function geocode(q) {
  const { data } = await api.get("/geocode", { params: { q } });
  return data.results || [];
}

export async function fetchPOIs({ lat, lon, radius, categories }) {
  const { data } = await api.get("/pois", {
    params: { lat, lon, radius, categories: categories.join(",") },
  });
  return data;
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
