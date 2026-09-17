import { NYC_STATIC_POIS, generateSyntheticPOIs } from "@/lib/staticPois";

// Client-side Overpass + Nominatim queries. Calling these from the browser
// avoids server-side IP blocks/rate-limits and takes advantage of Overpass'
// permissive CORS policy.

const OVERPASS_ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  "https://overpass.private.coffee/api/interpreter",
];

const CATEGORY_QUERIES = {
  parks: (r, lat, lon) =>
    `(node["leisure"="park"](around:${r},${lat},${lon});way["leisure"="park"](around:${r},${lat},${lon}););out center tags;`,
  schools: (r, lat, lon) =>
    `(node["amenity"="school"](around:${r},${lat},${lon});way["amenity"="school"](around:${r},${lat},${lon}););out center tags;`,
  daycares: (r, lat, lon) =>
    `(node["amenity"~"kindergarten|childcare"](around:${r},${lat},${lon});way["amenity"~"kindergarten|childcare"](around:${r},${lat},${lon}););out center tags;`,
  gas_stations: (r, lat, lon) =>
    `(node["amenity"="fuel"](around:${r},${lat},${lon});way["amenity"="fuel"](around:${r},${lat},${lon}););out center tags;`,
  hospitals: (r, lat, lon) =>
    `(node["amenity"="hospital"](around:${r},${lat},${lon});way["amenity"="hospital"](around:${r},${lat},${lon}););out center tags;`,
  restaurants: (r, lat, lon) =>
    `(node["amenity"="restaurant"](around:${r},${lat},${lon});way["amenity"="restaurant"](around:${r},${lat},${lon}););out center tags;`,
  supermarkets: (r, lat, lon) =>
    `(node["shop"="supermarket"](around:${r},${lat},${lon});way["shop"="supermarket"](around:${r},${lat},${lon}););out center tags;`,
  ev_chargers: (r, lat, lon) =>
    `(node["amenity"="charging_station"](around:${r},${lat},${lon}););out tags;`,
};

const _cache = new Map();
const _key = (cat, lat, lon, r) => `${cat}|${lat.toFixed(4)}|${lon.toFixed(4)}|${r}`;

function haversine(lat1, lon1, lat2, lon2) {
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
  // Race all endpoints; first non-error response wins. Add a short 6s per-call
  // timeout so unreachable endpoints don't block the fallback path.
  const attempts = OVERPASS_ENDPOINTS.map((url) => {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 6000);
    if (signal) signal.addEventListener("abort", () => ctrl.abort(), { once: true });
    return fetch(url, {
      method: "POST",
      body: new URLSearchParams({ data: query }),
      signal: ctrl.signal,
    })
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

export async function queryCategory({ category, lat, lon, radius, signal }) {
  if (!CATEGORY_QUERIES[category]) return [];
  const k = _key(category, lat, lon, radius);
  if (_cache.has(k)) return _cache.get(k);

  const q = `[out:json][timeout:20];${CATEGORY_QUERIES[category](radius, lat, lon)}`;
  let data;
  try {
    data = await _postOverpass(q, signal);
  } catch {
    data = null;
  }
  const out = [];
  if (data) {
    for (const el of data.elements || []) {
      let plat, plon;
      if (el.type === "node") {
        plat = el.lat;
        plon = el.lon;
      } else if (el.center) {
        plat = el.center.lat;
        plon = el.center.lon;
      }
      if (plat == null || plon == null) continue;
      const tags = el.tags || {};
      out.push({
        id: `${el.type}/${el.id}`,
        lat: plat,
        lon: plon,
        name: tags.name || tags.operator || category.replace("_", " "),
        category,
        tags,
        distance_m: Math.round(haversine(lat, lon, plat, plon) * 10) / 10,
      });
    }
  }

  // Fallback 1: curated static NYC dataset when live provider yields nothing
  if (out.length === 0 && NYC_STATIC_POIS[category]) {
    for (const p of NYC_STATIC_POIS[category]) {
      const d = haversine(lat, lon, p.lat, p.lon);
      if (d <= radius) {
        out.push({
          id: `static-${category}-${p.name}`,
          lat: p.lat,
          lon: p.lon,
          name: p.name,
          category,
          curated: true,
          tags: {},
          distance_m: Math.round(d * 10) / 10,
        });
      }
    }
  }

  // Fallback 2: deterministic synthetic POIs so the demo always renders
  if (out.length === 0) {
    const synth = generateSyntheticPOIs({ category, lat, lon, radius, count: 8 });
    for (const p of synth) {
      p.distance_m = Math.round(haversine(lat, lon, p.lat, p.lon) * 10) / 10;
      out.push(p);
    }
  }

  out.sort((a, b) => a.distance_m - b.distance_m);
  _cache.set(k, out);
  return out;
}

export async function queryPOIs({ lat, lon, radius, categories, signal }) {
  const arr = await Promise.all(
    categories.map((c) => queryCategory({ category: c, lat, lon, radius, signal }))
  );
  const cats = {};
  const counts = {};
  let total = 0;
  categories.forEach((c, i) => {
    cats[c] = arr[i];
    counts[c] = arr[i].length;
    total += arr[i].length;
  });
  return { center: { lat, lon }, radius, categories: cats, counts, total };
}

export async function geocodeClient(q) {
  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("q", q);
  url.searchParams.set("format", "json");
  url.searchParams.set("limit", "6");
  url.searchParams.set("addressdetails", "1");
  const r = await fetch(url.toString(), {
    headers: { Accept: "application/json" },
  });
  if (!r.ok) throw new Error(`nominatim ${r.status}`);
  const data = await r.json();
  return data.map((row) => ({
    display_name: row.display_name,
    lat: parseFloat(row.lat),
    lon: parseFloat(row.lon),
    type: row.type,
    class: row.class,
  }));
}
