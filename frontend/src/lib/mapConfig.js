import {
  Trees,
  GraduationCap,
  Baby,
  Fuel,
  Hospital,
  UtensilsCrossed,
  ShoppingCart,
  Zap,
  CloudRain,
  Wind,
  Mountain,
  Car,
} from "lucide-react";

// POI categories powered by Overpass on the backend
export const POI_LAYERS = [
  { id: "parks", label: "Parks & Open Spaces", color: "#10B981", icon: Trees, group: "Amenities" },
  { id: "schools", label: "Schools & Universities", color: "#38BDF8", icon: GraduationCap, group: "Amenities" },
  { id: "daycares", label: "Daycares & Kindergartens", color: "#F59E0B", icon: Baby, group: "Amenities" },
  { id: "gas_stations", label: "Gas Stations", color: "#EF4444", icon: Fuel, group: "Amenities" },
  { id: "hospitals", label: "Hospitals & Clinics", color: "#F472B6", icon: Hospital, group: "Amenities" },
  { id: "restaurants", label: "Restaurants", color: "#FB923C", icon: UtensilsCrossed, group: "Amenities" },
  { id: "supermarkets", label: "Supermarkets", color: "#A3E635", icon: ShoppingCart, group: "Amenities" },
  { id: "ev_chargers", label: "EV Chargers", color: "#22D3EE", icon: Zap, group: "Amenities" },
];

// Environmental data panels backed by Open-Meteo. These are not map overlays.
export const ENV_LAYERS = [
  { id: "weather", label: "Live Weather", color: "#8B5CF6", icon: CloudRain, group: "Environment" },
  { id: "air_quality", label: "Air Quality (AQI)", color: "#06B6D4", icon: Wind, group: "Environment" },
  { id: "elevation", label: "Elevation", color: "#84CC16", icon: Mountain, group: "Environment" },
];

// Live map overlays backed by a provider. Keep only overlays that are actually rendered.
export const CONCEPT_LAYERS = [
  { id: "traffic", label: "Traffic Congestion", color: "#F97316", icon: Car, group: "Traffic", note: "Live flow · TomTom" },
];

export const LAYER_BY_ID = Object.fromEntries(
  [...POI_LAYERS, ...ENV_LAYERS, ...CONCEPT_LAYERS].map((l) => [l.id, l])
);

const TILES = `${process.env.REACT_APP_BACKEND_URL}/api/basemap`;
const TOMTOM_ATTR = '&copy; <a href="https://www.tomtom.com/">TomTom</a>';

// Commercial TomTom basemaps proxied through the backend (key stays server-side)
export const BASEMAPS = {
  dark: { label: "Dark Matter", url: `${TILES}/night/{z}/{x}/{y}`, attribution: TOMTOM_ATTR, className: "" },
  positron: { label: "Minimal Light", url: `${TILES}/main/{z}/{x}/{y}`, attribution: TOMTOM_ATTR, className: "" },
  satellite: { label: "Satellite", url: `${TILES}/sat/{z}/{x}/{y}`, overlay: `${TILES}/hybrid/{z}/{x}/{y}`, attribution: TOMTOM_ATTR, className: "" },
};

export const DEFAULT_CENTER = [40.7484, -73.9857]; // Empire State Building
export const DEFAULT_ZOOM = 13;
