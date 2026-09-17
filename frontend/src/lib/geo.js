import * as turf from "@turf/turf";

function toRing(latlngs) {
  const ring = latlngs.map(([lat, lon]) => [lon, lat]);
  const [f0, f1] = ring[0];
  const [l0, l1] = ring[ring.length - 1];
  if (f0 !== l0 || f1 !== l1) ring.push([f0, f1]);
  return ring;
}

export const propertyPolygon = (latlngs) => turf.polygon([toRing(latlngs)]);

export function propertyCentroid(latlngs) {
  const c = turf.centroid(propertyPolygon(latlngs)).geometry.coordinates;
  return [c[1], c[0]];
}

export function propertyReach(latlngs) {
  const [clat, clon] = propertyCentroid(latlngs);
  return Math.max(...latlngs.map(([lat, lon]) => turf.distance([clon, clat], [lon, lat], { units: "meters" })));
}

export const propertyArea = (latlngs) => turf.area(propertyPolygon(latlngs));

export const propertyBuffer = (latlngs, meters) => turf.buffer(propertyPolygon(latlngs), meters, { units: "meters" });

export function distanceToProperty(latlngs, lat, lon) {
  const poly = propertyPolygon(latlngs);
  const pt = turf.point([lon, lat]);
  if (turf.booleanPointInPolygon(pt, poly)) return 0;
  return turf.pointToLineDistance(pt, turf.polygonToLine(poly), { units: "meters" });
}

export function bufferBounds(gj) {
  const [w, s, e, n] = turf.bbox(gj);
  return [
    [s, w],
    [n, e],
  ];
}

// Pull the first Polygon / MultiPolygon outer ring out of any GeoJSON → [[lat, lon], ...]
export function extractOutline(geojson) {
  const geoms = [];
  const walk = (g) => {
    if (!g) return;
    if (g.type === "FeatureCollection") (g.features || []).forEach(walk);
    else if (g.type === "Feature") walk(g.geometry);
    else geoms.push(g);
  };
  walk(geojson);
  for (const g of geoms) {
    if (g.type === "Polygon") return g.coordinates[0].map(([lon, lat]) => [lat, lon]);
    if (g.type === "MultiPolygon") return g.coordinates[0][0].map(([lon, lat]) => [lat, lon]);
  }
  return null;
}

// Re-measure POIs from the property boundary and drop anything beyond the buffer
export function applyPropertyDistances(data, latlngs, radius) {
  const categories = {};
  const counts = {};
  let total = 0;
  for (const [cat, list] of Object.entries(data.categories || {})) {
    const out = list
      .map((p) => ({ ...p, distance_m: Math.round(distanceToProperty(latlngs, p.lat, p.lon) * 10) / 10 }))
      .filter((p) => p.distance_m <= radius)
      .sort((a, b) => a.distance_m - b.distance_m);
    categories[cat] = out;
    counts[cat] = out.length;
    total += out.length;
  }
  return { ...data, categories, counts, total, fromProperty: true };
}
