// Client-side Overpass + Nominatim queries. Calling these from the browser
// avoids server-side IP blocks/rate-limits and takes advantage of Overpass'
// permissive CORS policy. Only real OpenStreetMap data is ever returned.

const OVERPASS_ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  "https://overpass.private.coffee/api/interpreter",
];

// nwr = nodes + ways + relations (multipolygon parks/campuses are relations)
const CATEGORY_FILTERS = {
  parks: ['["leisure"="park"]', '["leisure"="nature_reserve"]'],
  schools: ['["amenity"="school"]', '["amenity"="university"]', '["amenity"="college"]'],
  daycares: ['["amenity"~"^(kindergarten|childcare)$"]'],
  gas_stations: ['["amenity"="fuel"]'],
  hospitals: ['["amenity"~"^(hospital|clinic)$"]'],
  restaurants: ['["amenity"="restaurant"]'],
  supermarkets: ['["shop"="supermarket"]'],
  ev_chargers: ['["amenity"="charging_station"]'],
};

export const buildQuery = (category, r, lat, lon) =>
  `[out:json][timeout:20];(${CATEGORY_FILTERS[category].map((f) => `nwr${f}(around:${r},${lat},${lon});`).join("")});out center tags;`;

const _cache = new Map();
const _key = (cat, lat, lon, r) => `${cat}|${lat.toFixed(4)}|${lon.toFixed(4)}|${r}`;

export function haversine(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const toRad = (d) => (d * Math.PI) / 180;
  const p1 = toRad(lat1);
  const p2 = toRad(lat2);
  const dp = toRad(lat2 - lat1);
  const dl = toRad(lon2 - lon1);
  const a = Math.sin(dp / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

async function _postOverpass(query, signal) {
  const attempts = OVERPASS_ENDPOINTS.map((url) => {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 20000);
    if (signal) signal.addEventListener("abort", () => ctrl.abort(), { once: true });
    return fetch(url, { method: "POST", body: new URLSearchParams({ data: query }), signal: ctrl.signal })
      .then(async (r) => {
        clearTimeout(timer);
        if (!r.ok) throw new Error(`overpass ${r.status}`);
        return r.json();
      })
      .catch((e) => {
        clearTimeout(timer);
        throw e;
      });
  });
  return Promise.any(attempts);
}

export function normalizeElements(elements, category, lat, lon, radius = Infinity) {
  const out = [];
  for (const el of elements || []) {
    const plat = el.type === "node" ? el.lat : el.center?.lat;
    const plon = el.type === "node" ? el.lon : el.center?.lon;
    if (plat == null || plon == null) continue;
    const distance_m = Math.round(haversine(lat, lon, plat, plon) * 10) / 10;
    if (distance_m > radius) continue; // ways touching the radius edge: keep centroid inside
    const tags = el.tags || {};
    out.push({
      id: `${el.type}/${el.id}`,
      lat: plat,
      lon: plon,
      name: tags.name || tags.brand || tags.operator || `Unnamed ${category.replace("_", " ").replace(/s$/, "")}`,
      category,
      tags,
      distance_m,
    });
  }
  return out.sort((a, b) => a.distance_m - b.distance_m);
}

// Resolves to an array of real POIs (possibly empty) or null when every
// Overpass endpoint failed.
export async function queryCategory({ category, lat, lon, radius, signal }) {
  if (!CATEGORY_FILTERS[category]) return [];
  const k = _key(category, lat, lon, radius);
  if (_cache.has(k)) return _cache.get(k);
  let data;
  try {
    data = await _postOverpass(buildQuery(category, radius, lat, lon), signal);
  } catch {
    return null;
  }
  const out = normalizeElements(data.elements, category, lat, lon, radius);
  _cache.set(k, out);
  return out;
}

export async function queryPOIs({ lat, lon, radius, categories, signal }) {
  const arr = await Promise.all(categories.map((c) => queryCategory({ category: c, lat, lon, radius, signal })));
  const cats = {};
  const counts = {};
  const unavailable = [];
  let total = 0;
  categories.forEach((c, i) => {
    if (arr[i] === null) {
      unavailable.push(c);
      return;
    }
    cats[c] = arr[i];
    counts[c] = arr[i].length;
    total += arr[i].length;
  });
  return { center: { lat, lon }, radius, categories: cats, counts, total, unavailable, source: "osm" };
}

export async function geocodeClient(q) {
  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("q", q);
  url.searchParams.set("format", "json");
  url.searchParams.set("limit", "6");
  url.searchParams.set("addressdetails", "1");
  const r = await fetch(url.toString(), { headers: { Accept: "application/json" } });
  if (!r.ok) throw new Error(`nominatim ${r.status}`);
  const data = await r.json();
  return data.map((row) => ({ display_name: row.display_name, lat: parseFloat(row.lat), lon: parseFloat(row.lon), type: row.type, class: row.class }));
}
