# GeoPulse Studio — PRD

## Original problem statement
> i need an app about maps that can be over layed by any additional parameter

## Product summary
GeoPulse Studio is a dark, cartographer-grade single-page map workstation.
Users pan/zoom a Leaflet basemap, toggle any combination of overlay layers,
drop a pin (or search an address), and see everything within an adjustable
buffer radius grouped by category with per-item distance.

## User personas
- **Property scout / owner** — profiles a parcel by nearby amenities.
- **Data explorer** — layers custom GeoJSON/CSV data on a live basemap.
- **Casual curious user** — clicks the map to explore weather / AQI / elevation.

## Core requirements (static)
- Leaflet + OpenStreetMap (dark-filtered), free — no keys.
- Multiple built-in POI layers (parks, schools, daycares, gas stations,
  hospitals, restaurants, supermarkets, EV chargers).
- Environmental overlays: live weather, US AQI, elevation (Open-Meteo).
- Address search (Nominatim) + drop-a-pin.
- Adjustable buffer radius (100 m – 10 km).
- Per-layer visibility toggle + opacity slider.
- Custom GeoJSON / CSV upload → live overlay stored in MongoDB.
- Single-user, no auth.

## What's been implemented (2026-02-15)
- FastAPI backend (`/app/backend/server.py`) with:
  - `/api/pois` — Overpass with curated NYC + deterministic synthetic fallback
  - `/api/geocode` (Nominatim proxy)
  - `/api/weather`, `/api/air-quality`, `/api/elevation` (Open-Meteo)
  - Custom layers CRUD (Mongo `custom_layers`)
- React frontend with three-pane workstation layout:
  - Left: Layer Control (POIs, Environment, Urban, Custom)
  - Center: Leaflet map w/ dark filter, click-to-drop pin, buffer circle
  - Right: Proximity Analysis (search, radius, live env stats, POI distance list)
- Custom upload modal supporting GeoJSON, JSON, CSV (lat/lon columns).
- Basemap swap: Dark Matter, Minimal Light, Satellite.
- 100% test-agent coverage across backend + e2e frontend flows.

## Design system
See `/app/design_guidelines.json` — Outfit / Manrope / IBM Plex Mono type,
`#0B0F17` obsidian base + tactical signal accent (`#38BDF8`, `#F59E0B`,
`#10B981`, `#EF4444`), glass-morphism panels, no purple gradients, no
generic AI-slop palette.

## Prioritized backlog
### P1
- Property polygon input (draw or upload) so the buffer expands **from the
  actual property lines** rather than a single center point.
- More live overlays: real traffic (TomTom/HERE), population heatmap.
- Save / share proximity reports via a shareable URL.

### P2
- Time-slider for weather / AQI trends.
- Measure-distance and area tools on the map.
- Export the current view as a PNG report.

## Known constraints
- Overpass / Nominatim can be flaky from headless environments; the app
  gracefully falls back to curated + synthetic data so demos always render.
- React StrictMode disabled intentionally (`/app/frontend/src/index.js`) so
  react-leaflet@4.2.1 doesn't throw "Map container is already initialized".
