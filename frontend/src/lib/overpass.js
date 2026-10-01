// Client-side Overpass + Nominatim queries. Calling these from the browser
// avoids server-side IP blocks/rate-limits and takes advantage of Overpass'
// permissive CORS policy. Only real OpenStreetMap data is ever returned.

// Prefer the private.coffee instance because the public OSM instance asks
// applications not to run parallel queries and may return 429s under load.
const OVERPASS_ENDPOINTS = [
  "https://overpass.private.coffee/api/interpreter",
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
];

// nwr = nodes + ways + relations (multipolygon parks/campuses are relations)
const CATEGORY_FILTERS = {
  parks: ['["leisure"~"^(park|nature_reserve|recreation_ground|common)$"]'],
  schools: ['["amenity"~"^(school|university|college)$"]'],
  daycares: ['["amenity"~"^(kindergarten|childcare)$"]'],
  gas_stations: ['["amenity"="fuel"]'],
  hospitals: ['["amenity"~"^(hospital|clinic)$"]', '["healthcare"~"^(hospital|clinic)$"]'],
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
  let firstSuccessfulEmpty = null;

  // Overpass explicitly discourages parallel requests. Try mirrors one at a
  // time so one user's analysis does not trip the service rate limiter.
  for (const url of OVERPASS_ENDPOINTS) {
    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");

    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 12000);
    const onAbort = () => ctrl.abort();
    signal?.addEventListener("abort", onAbort, { once: true });

    try {
      let data;
      try {
        const post = await fetch(url, {
          method: "POST",
          body: new URLSearchParams({ data: query }),
          signal: ctrl.signal,
        });
        if (!post.ok) throw new Error(`overpass POST ${post.status}`);
        data = await post.json();
      } catch (postError) {
        // Some Overpass mirrors intermittently reject POST while GET works.
        // Use the same provider as a lightweight second chance.
        if (ctrl.signal.aborted) throw postError;
        const getUrl = `${url}?${new URLSearchParams({ data: query }).toString()}`;
        const get = await fetch(getUrl, { method: "GET", signal: ctrl.signal });
        if (!get.ok) throw new Error(`overpass GET ${get.status}`);
        data = await get.json();
      }

      // Do not let a temporarily empty mirror hide real data available from
      // another mirror. Keep the empty response only as a last resort.
      if (Array.isArray(data?.elements) && data.elements.length > 0) return data;
      if (firstSuccessfulEmpty == null) firstSuccessfulEmpty = data;
    } catch {
      // Try the next mirror. A 429/5xx/timeout should not make the category
      // permanently unavailable when another public mirror is healthy.
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
    }
  }

  if (firstSuccessfulEmpty) return firstSuccessfulEmpty;
  throw new Error("all Overpass endpoints failed");
}

export function normalizeElements(elements, category, lat, lon, radius = Infinity) {
  const out = [];
  const seenIds = new Set();
  for (const el of elements || []) {
    const elementId = `${el.type}/${el.id}`;
    if (seenIds.has(elementId)) continue;
    seenIds.add(elementId);
    const plat = el.type === "node" ? el.lat : el.center?.lat;
    const plon = el.type === "node" ? el.lon : el.center?.lon;
    if (plat == null || plon == null) continue;
    const distance_m = Math.round(haversine(lat, lon, plat, plon) * 10) / 10;
    if (distance_m > radius) continue; // ways touching the radius edge: keep centroid inside
    const tags = el.tags || {};
    out.push({
      id: elementId,
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
  const arr = [];
  // Keep category requests serial as well. Parallel category queries were the
  // main trigger for Overpass rate-limit failures when several layers are on.
  for (const category of categories) {
    arr.push(await queryCategory({ category, lat, lon, radius, signal }));
  }
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
