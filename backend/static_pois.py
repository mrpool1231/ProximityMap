"""Static NYC POI dataset + deterministic synthetic fallback (backend mirror
of frontend/src/lib/staticPois.js). Used when Overpass upstream fails from
the current network environment."""
from typing import Dict, List
import math

NYC_STATIC_POIS: Dict[str, List[dict]] = {
    "parks": [
        {"name": "Central Park", "lat": 40.7829, "lon": -73.9654},
        {"name": "Bryant Park", "lat": 40.7536, "lon": -73.9832},
        {"name": "Madison Square Park", "lat": 40.7414, "lon": -73.9880},
        {"name": "Washington Square Park", "lat": 40.7308, "lon": -73.9974},
        {"name": "Union Square Park", "lat": 40.7359, "lon": -73.9911},
        {"name": "Hudson River Park", "lat": 40.7274, "lon": -74.0116},
        {"name": "The High Line", "lat": 40.7480, "lon": -74.0048},
        {"name": "Herald Square", "lat": 40.7505, "lon": -73.9878},
        {"name": "Riverside Park", "lat": 40.7912, "lon": -73.9722},
        {"name": "Battery Park", "lat": 40.7033, "lon": -74.0170},
        {"name": "DeWitt Clinton Park", "lat": 40.7683, "lon": -73.9946},
        {"name": "Hell's Kitchen Park", "lat": 40.7644, "lon": -73.9928},
    ],
    "schools": [
        {"name": "Stuyvesant High School", "lat": 40.7178, "lon": -74.0139},
        {"name": "The Chapin School", "lat": 40.7735, "lon": -73.9502},
        {"name": "Trinity School", "lat": 40.7889, "lon": -73.9755},
        {"name": "Beacon High School", "lat": 40.7686, "lon": -73.9927},
        {"name": "PS 41 Greenwich Village", "lat": 40.7343, "lon": -74.0018},
        {"name": "NYU Stern", "lat": 40.7295, "lon": -73.9965},
        {"name": "Columbia University", "lat": 40.8075, "lon": -73.9626},
        {"name": "Baruch College", "lat": 40.7402, "lon": -73.9836},
        {"name": "Fashion Institute of Technology", "lat": 40.7466, "lon": -73.9948},
    ],
    "daycares": [
        {"name": "Bright Horizons Midtown", "lat": 40.7549, "lon": -73.9803},
        {"name": "Kindercare Hell's Kitchen", "lat": 40.7621, "lon": -73.9917},
        {"name": "Little Missionary's Day Nursery", "lat": 40.7288, "lon": -73.9871},
        {"name": "Basil Kindergarten Chelsea", "lat": 40.7466, "lon": -74.0021},
        {"name": "The Learning Experience", "lat": 40.7415, "lon": -73.9787},
    ],
    "gas_stations": [
        {"name": "Mobil - 10th Ave", "lat": 40.7593, "lon": -73.9990},
        {"name": "BP - Amsterdam Ave", "lat": 40.7889, "lon": -73.9727},
        {"name": "Shell - Houston St", "lat": 40.7256, "lon": -74.0038},
        {"name": "Speedway - FDR Drive", "lat": 40.7405, "lon": -73.9750},
        {"name": "Exxon - 11th Ave", "lat": 40.7623, "lon": -73.9975},
    ],
    "hospitals": [
        {"name": "Mount Sinai West", "lat": 40.7695, "lon": -73.9887},
        {"name": "NYU Langone", "lat": 40.7422, "lon": -73.9739},
        {"name": "Bellevue Hospital", "lat": 40.7395, "lon": -73.9757},
        {"name": "Lenox Hill Hospital", "lat": 40.7719, "lon": -73.9615},
    ],
    "restaurants": [
        {"name": "Katz's Delicatessen", "lat": 40.7223, "lon": -73.9873},
        {"name": "Le Bernardin", "lat": 40.7614, "lon": -73.9819},
        {"name": "Joe's Pizza", "lat": 40.7305, "lon": -74.0022},
        {"name": "Shake Shack Madison Sq", "lat": 40.7414, "lon": -73.9881},
        {"name": "Balthazar", "lat": 40.7229, "lon": -73.9979},
        {"name": "The Halal Guys", "lat": 40.7615, "lon": -73.9791},
    ],
    "supermarkets": [
        {"name": "Whole Foods Bryant Park", "lat": 40.7541, "lon": -73.9836},
        {"name": "Trader Joe's Chelsea", "lat": 40.7455, "lon": -74.0011},
        {"name": "Fairway Market UWS", "lat": 40.7889, "lon": -73.9781},
        {"name": "Gristedes Midtown", "lat": 40.7593, "lon": -73.9843},
    ],
    "ev_chargers": [
        {"name": "Tesla Supercharger Meatpacking", "lat": 40.7412, "lon": -74.0057},
        {"name": "EVgo Midtown Garage", "lat": 40.7574, "lon": -73.9836},
        {"name": "ChargePoint 34th St", "lat": 40.7484, "lon": -73.9857},
    ],
}


def _mulberry32(seed: int):
    a = seed & 0xFFFFFFFF

    def _next():
        nonlocal a
        a = (a + 0x6D2B79F5) & 0xFFFFFFFF
        t = a
        t ^= t >> 15
        t = (t * (t | 1)) & 0xFFFFFFFF
        t ^= (t + ((t ^ (t >> 7)) * (t | 61))) & 0xFFFFFFFF
        return (((t ^ (t >> 14)) & 0xFFFFFFFF) / 4294967296)

    return _next


def generate_synthetic(category: str, lat: float, lon: float, radius: int, count: int = 8):
    seed = int((lat * 1e4 + lon * 1e4 + radius) * 1000) & 0xFFFFFFFF
    rand = _mulberry32(seed ^ (len(category) * 1103515245 + 12345) & 0xFFFFFFFF)
    out = []
    label = category.replace("_", " ").title()
    for i in range(count):
        bearing = rand() * math.pi * 2
        dist = rand() * radius * 0.9 + radius * 0.05
        d_lat = (dist / 111000.0) * math.cos(bearing)
        d_lon = (dist / (111000.0 * math.cos(math.radians(lat)))) * math.sin(bearing)
        out.append({
            "id": f"synth-{category}-{i}",
            "lat": lat + d_lat,
            "lon": lon + d_lon,
            "name": f"{label} #{i + 1}",
            "category": category,
            "synthetic": True,
            "tags": {},
        })
    return out
