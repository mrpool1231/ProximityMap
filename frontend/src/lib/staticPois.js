// Curated static POI dataset around New York City (Manhattan + nearby) plus a
// deterministic synthetic fallback generator. This keeps the app fully
// interactive when live Overpass/Nominatim endpoints are unreachable from the
// current network.

export const NYC_STATIC_POIS = {
  parks: [
    { name: "Central Park", lat: 40.7829, lon: -73.9654 },
    { name: "Bryant Park", lat: 40.7536, lon: -73.9832 },
    { name: "Madison Square Park", lat: 40.7414, lon: -73.9880 },
    { name: "Washington Square Park", lat: 40.7308, lon: -73.9974 },
    { name: "Union Square Park", lat: 40.7359, lon: -73.9911 },
    { name: "Hudson River Park", lat: 40.7274, lon: -74.0116 },
    { name: "The High Line", lat: 40.7480, lon: -74.0048 },
    { name: "Herald Square", lat: 40.7505, lon: -73.9878 },
    { name: "Riverside Park", lat: 40.7912, lon: -73.9722 },
    { name: "Battery Park", lat: 40.7033, lon: -74.0170 },
    { name: "DeWitt Clinton Park", lat: 40.7683, lon: -73.9946 },
    { name: "Hell's Kitchen Park", lat: 40.7644, lon: -73.9928 },
    { name: "Prospect Park", lat: 40.6602, lon: -73.9690 },
    { name: "Fort Tryon Park", lat: 40.8611, lon: -73.9319 },
  ],
  schools: [
    { name: "Stuyvesant High School", lat: 40.7178, lon: -74.0139 },
    { name: "The Chapin School", lat: 40.7735, lon: -73.9502 },
    { name: "Trinity School", lat: 40.7889, lon: -73.9755 },
    { name: "Beacon High School", lat: 40.7686, lon: -73.9927 },
    { name: "PS 41 Greenwich Village", lat: 40.7343, lon: -74.0018 },
    { name: "NYU Stern", lat: 40.7295, lon: -73.9965 },
    { name: "Columbia University", lat: 40.8075, lon: -73.9626 },
    { name: "Baruch College", lat: 40.7402, lon: -73.9836 },
    { name: "The Dalton School", lat: 40.7794, lon: -73.9587 },
    { name: "Hunter College High School", lat: 40.7799, lon: -73.9532 },
    { name: "Fashion Institute of Technology", lat: 40.7466, lon: -73.9948 },
  ],
  daycares: [
    { name: "Bright Horizons Midtown", lat: 40.7549, lon: -73.9803 },
    { name: "Kindercare Hell's Kitchen", lat: 40.7621, lon: -73.9917 },
    { name: "Little Missionary's Day Nursery", lat: 40.7288, lon: -73.9871 },
    { name: "Basil Kindergarten Chelsea", lat: 40.7466, lon: -74.0021 },
    { name: "The Learning Experience", lat: 40.7415, lon: -73.9787 },
    { name: "Rockefeller University Child Center", lat: 40.7627, lon: -73.9530 },
    { name: "Downtown Little School", lat: 40.7134, lon: -74.0090 },
  ],
  gas_stations: [
    { name: "Mobil - 10th Ave", lat: 40.7593, lon: -73.9990 },
    { name: "BP - Amsterdam Ave", lat: 40.7889, lon: -73.9727 },
    { name: "Shell - Houston St", lat: 40.7256, lon: -74.0038 },
    { name: "Speedway - FDR Drive", lat: 40.7405, lon: -73.9750 },
    { name: "Exxon - 11th Ave", lat: 40.7623, lon: -73.9975 },
    { name: "Sunoco - Bowery", lat: 40.7239, lon: -73.9931 },
  ],
  hospitals: [
    { name: "Mount Sinai West", lat: 40.7695, lon: -73.9887 },
    { name: "NYU Langone", lat: 40.7422, lon: -73.9739 },
    { name: "Bellevue Hospital", lat: 40.7395, lon: -73.9757 },
    { name: "Lenox Hill Hospital", lat: 40.7719, lon: -73.9615 },
    { name: "Mount Sinai Beth Israel", lat: 40.7328, lon: -73.9820 },
    { name: "New York-Presbyterian", lat: 40.8408, lon: -73.9425 },
  ],
  restaurants: [
    { name: "Katz's Delicatessen", lat: 40.7223, lon: -73.9873 },
    { name: "Le Bernardin", lat: 40.7614, lon: -73.9819 },
    { name: "Joe's Pizza", lat: 40.7305, lon: -74.0022 },
    { name: "Levain Bakery", lat: 40.7853, lon: -73.9808 },
    { name: "Shake Shack Madison Sq", lat: 40.7414, lon: -73.9881 },
    { name: "Peter Luger Steak House", lat: 40.7096, lon: -73.9622 },
    { name: "Balthazar", lat: 40.7229, lon: -73.9979 },
    { name: "The Halal Guys", lat: 40.7615, lon: -73.9791 },
    { name: "Russ & Daughters Cafe", lat: 40.7223, lon: -73.9880 },
  ],
  supermarkets: [
    { name: "Whole Foods Bryant Park", lat: 40.7541, lon: -73.9836 },
    { name: "Trader Joe's Chelsea", lat: 40.7455, lon: -74.0011 },
    { name: "Fairway Market UWS", lat: 40.7889, lon: -73.9781 },
    { name: "Morton Williams", lat: 40.7413, lon: -73.9954 },
    { name: "Gristedes Midtown", lat: 40.7593, lon: -73.9843 },
  ],
  ev_chargers: [
    { name: "Tesla Supercharger Meatpacking", lat: 40.7412, lon: -74.0057 },
    { name: "EVgo Midtown Garage", lat: 40.7574, lon: -73.9836 },
    { name: "ChargePoint 34th St", lat: 40.7484, lon: -73.9857 },
    { name: "Blink SoHo Garage", lat: 40.7228, lon: -74.0021 },
  ],
};

const SEED_MULT = 1103515245;
const SEED_INC = 12345;
function mulberry32(a) {
  return function () {
    let t = (a = (a + 0x6d2b79f5) | 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Deterministic pseudo-random POI generator around a pin. Used when live
// providers return empty (dev environments, remote locations, offline).
export function generateSyntheticPOIs({ category, lat, lon, radius, count = 10 }) {
  const seed = Math.floor((lat * 1e4 + lon * 1e4 + radius) * 1000) >>> 0;
  const rand = mulberry32(seed ^ category.length * SEED_MULT + SEED_INC);
  const out = [];
  for (let i = 0; i < count; i++) {
    const bearing = rand() * Math.PI * 2;
    const dist = rand() * radius * 0.9 + radius * 0.05;
    // Approx: 1 deg lat ~ 111km
    const dLat = (dist / 111000) * Math.cos(bearing);
    const dLon = (dist / (111000 * Math.cos((lat * Math.PI) / 180))) * Math.sin(bearing);
    const plat = lat + dLat;
    const plon = lon + dLon;
    const label = category.replace("_", " ").replace(/\b\w/g, (c) => c.toUpperCase());
    out.push({
      id: `synth-${category}-${i}`,
      lat: plat,
      lon: plon,
      name: `${label} #${i + 1}`,
      category,
      synthetic: true,
      tags: {},
    });
  }
  return out;
}
