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
  Users,
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

// Point-of-interest-style environmental layers, backed by Open-Meteo
export const ENV_LAYERS = [
  { id: "weather", label: "Live Weather", color: "#8B5CF6", icon: CloudRain, group: "Environment" },
  { id: "air_quality", label: "Air Quality (AQI)", color: "#06B6D4", icon: Wind, group: "Environment" },
  { id: "elevation", label: "Elevation", color: "#84CC16", icon: Mountain, group: "Environment" },
];

// Placeholder / conceptual overlays not backed by a live API
export const CONCEPT_LAYERS = [
  { id: "population", label: "Population Density", color: "#EC4899", icon: Users, group: "Urban", note: "Heat blur visualisation" },
  { id: "traffic", label: "Traffic Congestion", color: "#F97316", icon: Car, group: "Urban", note: "Mock congestion arcs" },
];

export const LAYER_BY_ID = Object.fromEntries(
  [...POI_LAYERS, ...ENV_LAYERS, ...CONCEPT_LAYERS].map((l) => [l.id, l])
);

export const BASEMAPS = {
  dark: {
    label: "Dark Matter",
    url: "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    className: "map-tiles-dark",
  },
  positron: {
    label: "Minimal Light",
    url: "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    className: "map-tiles-light",
  },
  satellite: {
    label: "Satellite",
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    attribution: "Tiles &copy; Esri",
    className: "",
  },
};

export const DEFAULT_CENTER = [40.7484, -73.9857]; // Empire State Building
export const DEFAULT_ZOOM = 13;
