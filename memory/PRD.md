# GeoPulse Studio — PRD

## Original problem statement
> i need an app about maps that can be over layed by any additional parameter

## Product summary
GeoPulse Studio is a dark, cartographer-grade single-page map workstation.
Users pan/zoom a Leaflet basemap, toggle any combination of overlay layers,
drop a pin / search an address / draw or upload a property outline, and see
everything within an adjustable buffer grouped by category with per-item
distance measured from the property line. Pro features (PDF brief, share
links) are unlocked with a one-time Stripe payment.

## User personas
- **Property scout / owner** — profiles a parcel by nearby amenities.
- **Data explorer** — layers custom GeoJSON/CSV data on a live basemap.
- **Casual curious user** — clicks the map to explore weather / AQI / elevation.

## Core requirements (static)
- Leaflet + OpenStreetMap (dark-filtered), free — no keys.
- Built-in POI layers (parks, schools, daycares, gas stations, hospitals,
  restaurants, supermarkets, EV chargers).
- Environmental overlays: live weather, US AQI, elevation (Open-Meteo).
- Address search (Nominatim) + drop-a-pin + property outline (draw/upload).
- Adjustable buffer radius (100 m – 10 km) measured from property lines.
- Per-layer visibility toggle + opacity slider.
- Custom GeoJSON / CSV upload → live overlay stored in MongoDB.
- Single-user, no auth. Pro unlock via Stripe, license kept in localStorage.

## What's been implemented
### 2026-02-15 — MVP
- FastAPI backend: `/api/pois` (Overpass + curated NYC + synthetic fallback),
  `/api/geocode`, `/api/weather`, `/api/air-quality`, `/api/elevation`,
  custom layers CRUD.
- React three-pane workstation (Layer Control / Map / Proximity Analysis),
  upload modal, basemap swap, legend.

### 2026-09-17 — Property polygon, sharing, traffic, print, Stripe
- **Property outline**: draw on map (PropertyTools) or upload GeoJSON polygon;
  buffer = turf buffer of polygon; POI distances = distance to boundary (0 if
  inside). Pin snaps to centroid. `/app/frontend/src/lib/geo.js`.
- **Share links**: `POST/GET /api/reports/{id}` (Mongo `reports`), URL
  `/?report=<id>` restores pin/property/radius/layers/opacity/basemap.
- **Live traffic**: TomTom flow tiles proxied at
  `/api/traffic/tiles/{z}/{x}/{y}.png`; `/api/traffic/config` reports
  `enabled` (needs `TOMTOM_API_KEY` in backend/.env — currently EMPTY, layer
  shows a warning).
- **Print brief**: `PrintReport.jsx` portal overlay (light theme, static map,
  env stats, amenity tables) + `@media print` CSS → browser Save-as-PDF.
- **Stripe (Flow A claimable sandbox, tax mode "full")**: `payments.py` —
  `GET /api/payments/products`, `POST /api/payments/checkout`,
  `GET /api/payments/status/{id}` (polls Stripe as webhook fallback),
  `POST /api/stripe/webhook`. Catalog in `setup_stripe.py`
  (product `geopulse_pro`, price lookup_key `geopulse_pro_onetime`, $9 one-time,
  tax code txcd_10000000). Frontend: `UpgradeDialog`, `/payment/success`,
  `/payment/cancel`, `lib/license.js` (localStorage license + resume state).
  Share + Print are Pro-gated; TopBar shows "Go Pro" or "Pro" badge.
- Testing: iteration_3 (100% pass), iteration_4 (backend 100%; frontend all
  pass except automated Stripe UI completion which the agent couldn't drive;
  bogus-license bug fixed and self-verified).

## Design system
See `/app/design_guidelines.json` — Outfit / Manrope / IBM Plex Mono type,
`#0B0F17` obsidian base + tactical signal accent (`#38BDF8`, `#F59E0B`,
`#10B981`, `#EF4444`), glass-morphism panels.

## Prioritized backlog
### P1
- User accounts so a Pro purchase follows the user across devices (currently
  device-local license).
- Population density heatmap (real data source).
- Provide `TOMTOM_API_KEY` to turn on the traffic layer.
### P2
- Time-slider for weather / AQI trends.
- Measure-distance and area tools.
- Commercial tile provider before going live (OSM tile policy).

## Known constraints
- Overpass / Nominatim can be flaky from headless environments; app falls back
  to curated + synthetic data.
- React StrictMode disabled intentionally (react-leaflet 4.2.1).
- Stripe webhooks may not reach preview; status endpoint polls Stripe directly.
- Pro license is per-device (localStorage) since there is no auth.
