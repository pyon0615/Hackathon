"""
LOCWISE — Flask Backend API
267K+ Sydney POI dataset · Location intelligence engine

AI Acknowledgement:
This file was developed with AI assistance (Claude by Anthropic) for:
 - Diagnosing the CORS failure that blocked all frontend requests
   (root cause: Vite auto-incremented to port 8082, CORS only allowed 5173/8080)
   Fix: changed to CORS(app, resources={r"/api/*": {"origins": "*"}})
 - Designing the two-score system: frontend conflict matrix (−100…+100 pts) for
   the "why" table, backend live score (0–100) for the grade dial — both independent
 - Fixing SIGNAL_BUCKETS labels to exactly match what Step5Dashboard.tsx expects
   ("Office Towers" not "Office Buildings", "Gyms & Studios" not "Fitness", etc.)
 - Writing the math formulas for market_saturation_index, spatial_decay_score,
   competitive_moat_score, and breakeven_months
 - Structuring analyze_location() return shape to match AnalysisResponse type in api.ts

How it works:
 - Loads sydney_rich.parquet (267K rows) once at startup into a global DataFrame
 - /api/health — quick liveness check for the frontend's checkBackend()
 - /api/analyze — main endpoint: accepts lat/lng/category/subtype, runs spatial
   queries, computes all metrics, returns JSON matching AnalysisResponse shape
 - Haversine distance used throughout (no external geospatial libraries needed)
 - SIGNAL_BUCKETS groups nearby POIs into 8 named signals; each gets a count,
   a verdict (PROCEED/NEUTRAL/WEAK), and feeds the frontend conflict matrix
"""

import csv
import json
import math
import os
from pathlib import Path

import numpy as np
import pandas as pd
from flask import Flask, Response, jsonify, request, stream_with_context
from flask_cors import CORS

# ─── App & CORS ───────────────────────────────────────────────────────────────

app = Flask(__name__)

# ALLOWED_ORIGINS env var: comma-separated list of frontend URLs.
# Defaults to localhost origins for local dev.
# On Render/Railway/Fly.io set: ALLOWED_ORIGINS=https://your-app.vercel.app
_origins_env = os.environ.get("ALLOWED_ORIGINS", "")
ALLOWED_ORIGINS = (
    [o.strip() for o in _origins_env.split(",") if o.strip()]
    if _origins_env
    else [
        "http://localhost:5173",
        "http://localhost:8080",
        "http://localhost:8081",
        "http://localhost:8082",
        "http://localhost:8083",
        "http://localhost:8084",
        "http://localhost:8085",
        "https://spotigy.vercel.app",
    ]
)

CORS(app, resources={r"/api/*": {"origins": "*"}})

# ─── Paths ────────────────────────────────────────────────────────────────────

DATA_DIR     = Path("data")
MERGED_FILE  = DATA_DIR / "sydney_places.parquet"   # fast cache (may lack date_closed)
RICH_FILE    = DATA_DIR / "sydney_rich.parquet"     # rebuilt from ZIP with all columns
PARTS_DIR    = DATA_DIR / "parts"
CATEGORY_CSV = Path("../cleaned_categories.csv")    # FSQ category taxonomy
SOURCE_ZIP   = Path("../sydney_with_clean_categories.csv.zip")  # authoritative source

# ─── Sydney Boundaries ────────────────────────────────────────────────────────

SYDNEY_CENTER = {"lat": -33.8688, "lng": 151.2093}
SYDNEY_BBOX   = {
    "min_lat": -34.20, "max_lat": -33.20,
    "min_lng": 150.50, "max_lng": 151.40,
}

# ─── Category Taxonomy  (cleaned_categories.csv) ──────────────────────────────

def load_category_taxonomy(csv_path: Path) -> dict[str, set[str]]:
    """
    Reads cleaned_categories.csv and returns:
        level1_category_name (lower) → set of all descendant category_label strings (lower)

    This taxonomy drives count_by_fsq_level1(), which gives broader category counts
    than keyword matching alone — used for Market Saturation Index.
    """
    groups: dict[str, set[str]] = {}
    if not csv_path.exists():
        return groups
    with open(csv_path, newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            l1    = row["level1_category_name"].strip().lower()
            label = row["category_label"].strip().lower()
            groups.setdefault(l1, set()).add(label)
    return groups


CATEGORY_TAXONOMY: dict[str, set[str]] = load_category_taxonomy(CATEGORY_CSV)

# Our 12 business types → Foursquare level-1 category name
# These must match keys in CATEGORY_TAXONOMY (lowercased level1_category_name from CSV).
BUSINESS_TYPE_TO_FSQ_L1: dict[str, str] = {
    "restaurant":            "dining and drinking",
    "cafe":                  "dining and drinking",
    "bar":                   "dining and drinking",
    "gym":                   "sports and recreation",
    "clinic":                "health and medicine",
    "retail":                "retail",
    # Verified against parquet: beauty is nested under BPS > health and beauty service
    "beauty":                "business and professional services > health and beauty service",
    "coworking":             "business and professional services",
    # Verified against parquet: education is nested under community and government > education
    "education":             "community and government > education",
    "entertainment":         "arts and entertainment",
    "hotel":                 "travel and transportation",
    "professional_services": "business and professional services",
}

# ─── Subtype → FSQ Keyword Mappings ──────────────────────────────────────────

SUBTYPE_KEYWORDS: dict[str, list[str]] = {
    # Restaurant subtypes
    "thai":           ["restaurant"],
    "japanese":       ["restaurant", "sushi", "ramen"],
    "italian":        ["restaurant", "pizza"],
    "mexican":        ["restaurant", "taco"],
    "chinese":        ["restaurant", "dim sum"],
    "indian":         ["restaurant"],
    "korean":         ["restaurant"],
    "vietnamese":     ["restaurant", "pho"],
    "mediterranean":  ["restaurant"],
    "middle_eastern": ["restaurant", "kebab"],
    "american":       ["restaurant", "diner", "burger"],
    "french":         ["restaurant"],
    "greek":          ["restaurant"],
    "spanish":        ["restaurant"],
    "brazilian":      ["restaurant"],
    "african":        ["restaurant"],
    "seafood":        ["seafood", "restaurant"],
    "steakhouse":     ["steakhouse", "restaurant"],
    "vegan":          ["restaurant", "vegetarian"],
    "pizza":          ["pizza", "restaurant"],
    "burger":         ["burger", "restaurant"],
    "sushi":          ["sushi", "restaurant"],
    "bbq":            ["bbq", "restaurant"],
    "fast_casual":    ["fast casual", "restaurant"],
    "fast_food":      ["fast food", "restaurant"],
    "fine_dining":    ["restaurant"],
    "buffet":         ["buffet", "restaurant"],
    "diner":          ["diner", "restaurant"],
    "gastropub":      ["gastropub", "bar", "pub"],
    "food_truck":     ["food truck"],
    # Café subtypes
    "specialty_coffee": ["cafe", "coffee"],
    "brunch":           ["brunch", "breakfast", "cafe"],
    "boba":             ["bubble tea", "boba", "juice bar"],
    "bakery":           ["bakery"],
    "tea_room":         ["tea house", "cafe"],
    "juice_bar":        ["juice bar"],
    "dessert_cafe":     ["dessert", "ice cream", "donut"],
    "pet_cafe":         ["cafe"],
    # Bar subtypes
    "cocktail_bar": ["bar", "cocktail"],
    "sports_bar":   ["bar"],
    "wine_bar":     ["bar", "wine"],
    "dive_bar":     ["bar", "pub"],
    "rooftop_bar":  ["bar"],
    "pub":          ["pub", "bar"],
    "karaoke_bar":  ["karaoke", "bar"],
    "nightclub":    ["night club", "nightclub"],
    "beer_bar":     ["bar", "brewery", "beer garden"],
    "whisky_bar":   ["bar"],
    "lounge":       ["lounge", "bar"],
    "hookah_bar":   ["hookah", "bar"],
    # Gym subtypes
    "boutique":   ["gym", "studio", "pilates", "yoga", "fitness"],
    "crossfit":   ["gym", "crossfit", "fitness"],
    "bigbox":     ["gym", "fitness"],
    "martial":    ["martial arts", "dojo"],
    "yoga":       ["yoga", "studio"],
    "pilates":    ["pilates", "studio"],
    "boxing":     ["boxing", "gym"],
    "cycle":      ["cycling", "spin", "studio"],
    "dance":      ["dance studio", "dance"],
    "climbing":   ["climbing", "gym"],
    "swimming":   ["swim", "pool"],
    # Clinic subtypes
    "dental":          ["dentist", "dental"],
    "physio":          ["physical therapy", "physiotherapy"],
    "derma":           ["dermatologist"],
    "vet":             ["veterinary", "animal"],
    "gp":              ["physician", "medical center"],
    "mental_health":   ["mental health"],
    "optometrist":     ["optometrist", "optician"],
    "chiro":           ["chiropractor"],
    "acupuncture":     ["acupuncture", "alternative medicine"],
    "urgent_care":     ["urgent care", "medical center"],
    "pediatric":       ["pediatric"],
    "sports_medicine": ["physical therapy"],
    # Beauty subtypes
    "hair_salon": ["hair salon"],
    "barbershop": ["barbershop", "barber"],
    "nail_salon": ["nail salon", "nail"],
    "spa":        ["spa", "day spa"],
    "massage":    ["massage"],
    "tattoo":     ["tattoo"],
    "skin_care":  ["skin care"],
    "tanning":    ["tanning"],
    "eyebrow":    ["lash", "eyebrow"],
    "cosmetics":  ["cosmetics"],
    # Retail subtypes
    "fashion":       ["fashion retail", "clothing"],
    "books":         ["bookstore"],
    "grocery":       ["grocery", "food and beverage retail", "farmers market"],
    "electronics":   ["electronics", "computers and electronics"],
    "homeware":      ["furniture", "home store"],
    "toys":          ["toy", "hobby"],
    "sports_retail": ["sporting goods"],
    "jewelry":       ["jewelry"],
    "pet_supplies":  ["pet store", "pet supplies"],
    "florist":       ["florist", "flower"],
    "convenience":   ["convenience store"],
    "pharmacy":      ["pharmacy"],
    "vintage":       ["vintage", "thrift"],
    "art_gallery":   ["art gallery"],
    "music_store":   ["music store"],
    "gift_store":    ["gift", "souvenir"],
    "cannabis":      ["cannabis"],
    "supplement":    ["supplement", "vitamin"],
    "outdoor_gear":  ["outdoor", "camping", "sporting goods"],
    "furniture":     ["furniture", "home store"],
    # Education subtypes
    "language_school": ["language school"],
    "music_school":    ["music school"],
    "tutoring":        ["tutoring", "learning center"],
    "driving_school":  ["driving school"],
    "trade_school":    ["vocational", "trade school"],
    "coding_school":   ["coding", "tech school"],
    "art_school":      ["art school"],
    "culinary_school": ["culinary", "cooking school"],
    "preschool":       ["preschool", "child care"],
    "sports_academy":  ["sports", "academy"],
    # Entertainment subtypes
    "escape_room":   ["escape room"],
    "bowling":       ["bowling"],
    "arcade":        ["arcade"],
    "karaoke":       ["karaoke"],
    "movie_theater": ["movie theater", "cinema"],
    "gaming_cafe":   ["gaming", "cafe"],
    "vr_cafe":       ["virtual reality", "gaming"],
    "comedy_club":   ["comedy", "club"],
    "laser_tag":     ["laser tag"],
    "mini_golf":     ["mini golf", "golf"],
    "trampoline":    ["trampoline", "indoor play"],
    "indoor_play":   ["indoor play", "children"],
    # Hotel subtypes
    "boutique_hotel": ["hotel", "boutique hotel"],
    "budget_hotel":   ["hotel", "motel"],
    "hostel":         ["hostel"],
    "bnb":            ["bed and breakfast", "hotel"],
    "motel":          ["motel", "hotel"],
    "resort":         ["resort", "hotel"],
    "serviced_apt":   ["serviced apartment", "hotel"],
    # Co-working subtypes
    "open_desk":      ["coworking", "office"],
    "private_office": ["office", "coworking"],
    "creative":       ["studio", "coworking"],
    "tech_hub":       ["coworking", "office"],
    "meeting_rooms":  ["office", "coworking"],
    # Professional services subtypes
    "law_office":        ["legal service", "law"],
    "accounting":        ["financial service", "accounting"],
    "real_estate":       ["real estate"],
    "insurance":         ["financial service", "insurance"],
    "marketing":         ["advertising", "marketing"],
    "recruitment":       ["recruitment"],
    "architecture":      ["architecture"],
    "it_services":       ["technology business", "it"],
    "financial_planner": ["financial service"],
    "notary":            ["legal service"],
}

# Signal buckets: nearby POI clusters that affect the location score
SIGNAL_BUCKETS: dict[str, list[str]] = {
    "Office Towers":          ["business and professional services > office", "coworking", "corporate", "business center"],
    "Gyms & Studios":         ["gym and studio", "fitness", "pilates", "yoga", "martial arts", "dance studio"],
    "Bars & Nightlife":       ["dining and drinking > bar", "pub", "night club", "cocktail bar", "brewery"],
    "Schools / Universities": ["school", "college", "university", "education", "child care"],
    "Transit / Commuter":     ["train station", "bus station", "metro", "tram", "ferry", "transit", "travel and transportation"],
    "Cafés & Dining":         ["dining and drinking > cafe", "dining and drinking > restaurant", "dining and drinking > bakery", "coffee"],
    "Health & Medical":       ["health and medicine", "physician", "dentist", "pharmacy", "hospital"],
    "Retail Strip":           ["retail > fashion", "retail > food and beverage", "retail > pharmacy", "retail > computers", "retail > miscellaneous"],
}

# ─── Category Benchmarks (from Sydney CSV analysis) ──────────────────────────

# 2-year survival proxies: active / total POIs per top-level FSQ category
SURVIVAL_RATES: dict[str, int] = {
    "restaurant":            70,
    "cafe":                  70,
    "bar":                   70,
    "gym":                   93,
    "clinic":                95,
    "retail":                85,
    "beauty":                91,
    "coworking":             91,
    "education":             94,
    "entertainment":         68,
    "hotel":                 88,
    "professional_services": 91,
}

# Monthly revenue ranges in AUD (conservative, optimistic)
REVENUE_AUD: dict[str, tuple[int, int]] = {
    "restaurant":            (45_000,  220_000),
    "cafe":                  (25_000,   95_000),
    "bar":                   (40_000,  180_000),
    "gym":                   (30_000,  130_000),
    "clinic":                (60_000,  300_000),
    "retail":                (40_000,  200_000),
    "beauty":                (18_000,   85_000),
    "coworking":             (45_000,  180_000),
    "education":             (22_000,  110_000),
    "entertainment":         (55_000,  350_000),
    "hotel":                (150_000,  700_000),
    "professional_services": (30_000,  160_000),
}

# Rent in AUD/sqm/month (min, max) by category
RENT_AUD: dict[str, tuple[int, int]] = {
    "restaurant":            (8, 28),
    "cafe":                  (7, 22),
    "bar":                   (8, 25),
    "gym":                   (3, 14),
    "clinic":                (6, 20),
    "retail":                (10, 45),
    "beauty":                (5, 18),
    "coworking":             (5, 18),
    "education":             (4, 14),
    "entertainment":         (5, 22),
    "hotel":                 (15, 55),
    "professional_services": (5, 18),
}

# Expected fraction of 1km POIs that are competitors for this category
# Derived from cleaned_categories.csv subcategory counts per level-1 group
EXPECTED_COMPETITOR_SHARE: dict[str, float] = {
    "restaurant":            0.12,
    "cafe":                  0.06,
    "bar":                   0.05,
    "gym":                   0.025,
    "clinic":                0.04,
    "retail":                0.10,
    "beauty":                0.035,
    "coworking":             0.015,
    "education":             0.03,
    "entertainment":         0.025,
    "hotel":                 0.015,
    "professional_services": 0.05,
}

# Typical floor area (sqm) for rent estimation
TYPICAL_SQM: dict[str, float] = {
    "restaurant":            120.0,
    "cafe":                   80.0,
    "bar":                   150.0,
    "gym":                   400.0,
    "clinic":                 80.0,
    "retail":                100.0,
    "beauty":                 60.0,
    "coworking":             300.0,
    "education":             100.0,
    "entertainment":         300.0,
    "hotel":                 500.0,
    "professional_services":  80.0,
}

# One-time setup cost in AUD (fit-out + equipment + licences + deposits + working capital)
# Industry benchmarks for Sydney market — used for break-even calculation
SETUP_COST_AUD: dict[str, int] = {
    "restaurant":            200_000,
    "cafe":                  100_000,
    "bar":                   150_000,
    "gym":                   200_000,
    "clinic":                120_000,
    "retail":                 80_000,
    "beauty":                 50_000,
    "coworking":             300_000,
    "education":              80_000,
    "entertainment":         250_000,
    "hotel":               1_000_000,
    "professional_services":  30_000,
}

# Operating cost ratio (fraction of gross revenue consumed by opex)
OPEX_RATIO: dict[str, float] = {
    "restaurant":            0.72,
    "cafe":                  0.65,
    "bar":                   0.68,
    "gym":                   0.55,
    "clinic":                0.50,
    "retail":                0.60,
    "beauty":                0.55,
    "coworking":             0.65,
    "education":             0.55,
    "entertainment":         0.70,
    "hotel":                 0.65,
    "professional_services": 0.45,
}

# ─── Data Loading ─────────────────────────────────────────────────────────────

def _load_from_zip() -> pd.DataFrame:
    """
    Load the authoritative dataset from sydney_with_clean_categories.csv.zip.
    This CSV has all columns including date_closed, category_id, level1_category_name etc.
    Maps fsq_category_labels → category_text to match the rest of the codebase.
    """
    import zipfile
    with zipfile.ZipFile(SOURCE_ZIP) as z:
        csv_name = next(n for n in z.namelist() if n.endswith(".csv"))
        with z.open(csv_name) as f:
            df = pd.read_csv(f, low_memory=False)

    # Rename to match the codebase's expected column name
    df = df.rename(columns={"fsq_category_labels": "category_text"})
    return df


def load_places() -> pd.DataFrame:
    """
    Load Sydney POI data, preferring the richest available source:
      1. data/sydney_rich.parquet  — rebuilt from ZIP (has date_closed + full taxonomy)
      2. sydney_with_clean_categories.csv.zip  — authoritative source; saves to rich parquet
      3. data/sydney_places.parquet  — legacy parquet (no date_closed, used as last resort)
    """
    if RICH_FILE.exists():
        df = pd.read_parquet(RICH_FILE)
    elif SOURCE_ZIP.exists():
        print("Building sydney_rich.parquet from ZIP (first run only)…")
        df = _load_from_zip()
        # Save rich parquet so future startups are fast
        DATA_DIR.mkdir(exist_ok=True)
        keep = ["fsq_place_id", "name", "latitude", "longitude", "address",
                "locality", "region", "postcode", "country", "category_text",
                "date_closed", "level1_category_name", "category_label", "category_id"]
        df[keep].to_parquet(RICH_FILE, index=False)
        print(f"Saved {RICH_FILE} ({len(df):,} rows)")
    elif MERGED_FILE.exists():
        print("Warning: using legacy parquet — date_closed column is missing, closed businesses included.")
        df = pd.read_parquet(MERGED_FILE)
    else:
        part_files = sorted(PARTS_DIR.glob("sydney_*.parquet"))
        if not part_files:
            raise FileNotFoundError(
                "No Sydney data found. Need one of:\n"
                "  • ../sydney_with_clean_categories.csv.zip\n"
                "  • data/sydney_rich.parquet\n"
                "  • data/sydney_places.parquet"
            )
        df = pd.concat([pd.read_parquet(f) for f in part_files], ignore_index=True)

    df = df.copy()
    for col in ["name", "address", "locality", "region", "postcode", "category_text"]:
        if col in df.columns:
            df[col] = df[col].fillna("").astype(str)

    df["category_lc"] = df["category_text"].str.lower()
    df["name_lc"]     = df["name"].str.lower()

    df = df[df["country"] == "AU"].copy()
    df = df[
        df["latitude"].between(SYDNEY_BBOX["min_lat"], SYDNEY_BBOX["max_lat"]) &
        df["longitude"].between(SYDNEY_BBOX["min_lng"], SYDNEY_BBOX["max_lng"])
    ].copy()

    # Filter out closed businesses (only possible with rich data from ZIP)
    if "date_closed" in df.columns:
        df["is_closed"] = df["date_closed"].notna() & (df["date_closed"].astype(str).str.strip() != "")
    else:
        df["is_closed"] = False

    return df.reset_index(drop=True)


PLACES = load_places()

# ─── Core Math Functions ──────────────────────────────────────────────────────

def haversine_m(lat1: float, lon1: float, lat2, lon2) -> np.ndarray:
    """Vectorised Haversine distance in metres."""
    R = 6_371_000.0
    lat1, lon1, lat2, lon2 = map(np.radians, [lat1, lon1, lat2, lon2])
    dlat = lat2 - lat1
    dlon = lon2 - lon1
    a = np.sin(dlat / 2) ** 2 + np.cos(lat1) * np.cos(lat2) * np.sin(dlon / 2) ** 2
    return R * 2 * np.arcsin(np.sqrt(a))


def market_saturation_index(competitors_1km: int, poi_count_1km: int, category: str) -> float:
    """
    Competitor density relative to the expected share for this category.
    Formula: (competitors_1km / poi_count_1km) / expected_share

    Interpretation:
      < 0.7  — undersaturated (market opportunity)
      0.7–1.3 — normal competitive density
      > 1.3  — oversaturated (elevated risk)
    """
    if poi_count_1km == 0:
        return 0.0
    actual_share   = competitors_1km / poi_count_1km
    expected_share = EXPECTED_COMPETITOR_SHARE.get(category, 0.05)
    return round(actual_share / max(expected_share, 1e-6), 2)


def spatial_decay_score(distances_m: list[float], decay_radius: float = 300.0) -> float:
    """
    Distance-weighted competition pressure using exponential decay.
    Formula: Σ exp(-d / decay_radius) for each competitor distance d

    Weight at distance:
      0 m   → 1.00  (full pressure)
      150 m → 0.61
      300 m → 0.37
      600 m → 0.14

    A raw count treats a 50 m rival the same as a 900 m rival; this score does not.
    """
    return round(sum(math.exp(-d / decay_radius) for d in distances_m), 2)


def competitive_moat_score(close_count: int, total_count: int) -> int:
    """
    Score 0–100: how insulated this location is from direct competition.
    High score = few nearby rivals = strong moat.
    Formula: 100 − close_penalty − far_penalty
    """
    close_penalty = min(close_count * 18, 65)
    far_penalty   = min(total_count * 1.5, 25)
    return max(0, round(100 - close_penalty - far_penalty))


def estimate_breakeven_months(
    category: str, avg_rent_sqm: float, rev_min: int, rev_max: int
) -> int:
    """
    Estimated months until cumulative profit covers setup cost.

    Formula:
      setup_cost      = SETUP_COST_AUD (real Sydney industry benchmarks)
      monthly_rent    = avg_rent_sqm × TYPICAL_SQM
      ramp_revenue    = mid_revenue × 0.6  (new venues average 60% capacity in year 1)
      monthly_net     = ramp_revenue × (1 − opex_ratio) − monthly_rent
      breakeven       = setup_cost / monthly_net

    Returns 999 if the location is projected to never break even.
    """
    sqm          = TYPICAL_SQM.get(category, 100.0)
    monthly_rent = avg_rent_sqm * sqm
    setup_cost   = SETUP_COST_AUD.get(category, 100_000)

    mid_revenue  = (rev_min + rev_max) / 2
    ramp_revenue = mid_revenue * 0.6        # 60% ramp-up factor for new businesses
    op_ratio     = OPEX_RATIO.get(category, 0.60)
    monthly_net  = ramp_revenue * (1 - op_ratio) - monthly_rent

    if monthly_net <= 0:
        return 999
    return min(999, round(setup_cost / monthly_net))


def count_by_fsq_level1(df: pd.DataFrame, category: str) -> int:
    """
    Count active POIs in df whose category_text starts with the Foursquare
    level-1 category name for our business type.
    Uses BUSINESS_TYPE_TO_FSQ_L1 (derived from cleaned_categories.csv structure).
    """
    l1 = BUSINESS_TYPE_TO_FSQ_L1.get(category, "")
    if not l1:
        return 0
    return int(df["category_lc"].str.startswith(l1).sum())

# ─── Scoring Helpers ──────────────────────────────────────────────────────────

def grade_from_score(score: int) -> str:
    if score >= 70: return "A"
    if score >= 55: return "B"
    if score >= 40: return "C"
    if score >= 25: return "D"
    return "F"


def verdict_from_score(score: int) -> str:
    if score >= 70: return "PROCEED"
    if score >= 40: return "NEUTRAL"
    return "AVOID"


def foot_traffic_label(poi_count_500m: int) -> str:
    if poi_count_500m >= 180: return "High"
    if poi_count_500m >= 80:  return "Moderate"
    return "Low"


def keyword_mask(series: pd.Series, keywords: list[str]) -> pd.Series:
    mask = pd.Series(False, index=series.index)
    for kw in keywords:
        mask |= series.str.contains(kw, case=False, na=False, regex=False)
    return mask


def get_keywords(subtype: str) -> list[str]:
    return SUBTYPE_KEYWORDS.get(subtype, [subtype.lower().replace("_", " ")])

# ─── Location Analysis ────────────────────────────────────────────────────────

def analyze_location(lat: float, lng: float, category: str, subtype: str) -> dict:
    df = PLACES.copy()
    df["distance_m"] = haversine_m(lat, lng, df["latitude"].values, df["longitude"].values)

    active      = df[~df["is_closed"]].copy()
    nearby_500  = active[active["distance_m"] <= 500].copy()
    nearby_1000 = active[active["distance_m"] <= 1000].copy()

    # --- Competitor analysis ---
    keywords    = get_keywords(subtype)
    comp_mask   = keyword_mask(nearby_1000["category_lc"], keywords) | keyword_mask(nearby_1000["name_lc"], keywords)
    competitors = nearby_1000[comp_mask].sort_values("distance_m").copy()
    close_comps = competitors[competitors["distance_m"] <= 300]

    total_pois_500  = len(nearby_500)
    total_pois_1000 = len(nearby_1000)

    # --- Signal bucket scoring ---
    signal_rows         = []
    total_signal_points = 0
    for label, words in SIGNAL_BUCKETS.items():
        count = int(keyword_mask(nearby_500["category_lc"], words).sum())
        total_signal_points += count
        verdict = "PROCEED" if count >= 12 else "NEUTRAL" if count >= 4 else "WEAK"
        signal_rows.append({"label": label, "count": count, "verdict": verdict})

    # --- Location score (0–100) ---
    support_score       = min(total_signal_points * 1.2, 35)
    density_score       = min(total_pois_500 / 6, 25)
    competition_penalty = min(len(competitors) * 3.5 + len(close_comps) * 6, 55)
    raw_score           = 35 + support_score + density_score - competition_penalty
    final_score         = max(0, min(100, round(raw_score)))

    # --- Financial projections ---
    survival    = SURVIVAL_RATES.get(category, 75)
    rent_range  = RENT_AUD.get(category, (7, 25))
    avg_rent    = (rent_range[0] + rent_range[1]) // 2

    rev_range    = REVENUE_AUD.get(category, (30_000, 150_000))
    traffic_mult = 0.85 + (total_pois_500 / 500)        # 0.85–1.25 based on density
    comp_mult    = max(0.55, 1 - len(competitors) / 90)
    rev_min      = round(rev_range[0] * traffic_mult * comp_mult / 1_000) * 1_000
    rev_max      = round(rev_range[1] * traffic_mult * comp_mult / 1_000) * 1_000
    annual_mid   = round(((rev_min + rev_max) / 2) * 12 / 1_000) * 1_000

    # --- Advanced analytics ---

    # Market Saturation Index: actual competitor density vs. expected (from category taxonomy)
    msi = market_saturation_index(len(competitors), total_pois_1000, category)

    # Spatial decay score: exponential distance-weighted competition pressure
    comp_distances = competitors["distance_m"].tolist()
    decay          = spatial_decay_score(comp_distances)

    # Competitive moat: insulation from direct rivalry (0–100, higher = better)
    moat = competitive_moat_score(len(close_comps), len(competitors))

    # Break-even months: setup cost / monthly net profit
    breakeven = estimate_breakeven_months(category, avg_rent, rev_min, rev_max)

    # Broader category count using FSQ level-1 taxonomy from cleaned_categories.csv
    same_category_1km = count_by_fsq_level1(nearby_1000, category)

    # --- Nearest competitors list ---
    nearest_comps = (
        competitors.head(8)[["name", "category_text", "address", "locality", "distance_m"]]
        .assign(distance_m=lambda x: x["distance_m"].round().astype(int))
        .to_dict(orient="records")
    )

    summary = (
        f"{subtype.replace('_', ' ').title()} in Sydney: {verdict_from_score(final_score)} at this pin. "
        f"{len(competitors)} similar businesses within 1km ({len(close_comps)} very close <300m). "
        f"Market saturation {msi:.1f}× expected. "
        f"Foot traffic: {foot_traffic_label(total_pois_500).lower()} ({total_pois_500} POIs within 500m). "
        f"Estimated break-even: {breakeven} months. 2-year survival rate: {survival}%."
    )

    return {
        # Location
        "city":     "Sydney, AU",
        "lat":      lat,
        "lng":      lng,
        "category": category,
        "subtype":  subtype,
        # Core score
        "score":   final_score,
        "grade":   grade_from_score(final_score),
        "verdict": verdict_from_score(final_score),
        # Competitor metrics
        "direct_competitors_1km": int(len(competitors)),
        "close_competitors_300m": int(len(close_comps)),
        "same_category_1km":      int(same_category_1km),
        "nearest_competitors":    nearest_comps,
        # Foot traffic
        "poi_count_500m":     int(total_pois_500),
        "poi_count_1km":      int(total_pois_1000),
        "foot_traffic_proxy": foot_traffic_label(total_pois_500),
        # Signal matrix
        "signals_detected": int(total_signal_points),
        "matrix":           signal_rows,
        # Advanced analytics (CSV taxonomy + math formulas)
        "market_saturation_index": msi,      # < 0.7 = opportunity, > 1.3 = risky
        "spatial_decay_score":     decay,    # distance-weighted competition pressure
        "competitive_moat_score":  moat,     # 0–100
        "breakeven_months":        breakeven,
        # Financial projections
        "survival_rate_2y":            survival,
        "avg_rent_aud_per_sqm":        avg_rent,
        "projected_revenue_aud_min":   rev_min,
        "projected_revenue_aud_max":   rev_max,
        "annual_revenue_midpoint_aud": annual_mid,
        # Not in Foursquare dataset
        "median_income": None,
        "safety_index":  None,
        # Summary
        "plain_english_summary": summary,
    }

# ─── API Endpoints ────────────────────────────────────────────────────────────

@app.get("/api/health")
def health():
    has_closed = "date_closed" in PLACES.columns or "is_closed" in PLACES.columns
    closed_filtered = int(PLACES["is_closed"].sum()) if "is_closed" in PLACES.columns else 0
    return jsonify({
        "ok":                  True,
        "rows_loaded":         int(len(PLACES)),
        "open_only":           int((~PLACES["is_closed"]).sum()) if "is_closed" in PLACES.columns else int(len(PLACES)),
        "closed_filtered_out": closed_filtered,
        "date_closed_available": has_closed,
        "city":                "Sydney only",
        "taxonomy_categories": sum(len(v) for v in CATEGORY_TAXONOMY.values()),
        "data_source":         "rich" if RICH_FILE.exists() else ("zip" if SOURCE_ZIP.exists() else "legacy"),
    })


@app.get("/api/config")
def config():
    return jsonify({
        "city":       "Sydney, AU",
        "center":     SYDNEY_CENTER,
        "bbox":       SYDNEY_BBOX,
        "subtypes":   sorted(SUBTYPE_KEYWORDS.keys()),
        "categories": sorted(BUSINESS_TYPE_TO_FSQ_L1.keys()),
    })


@app.post("/api/analyze")
def analyze():
    data = request.get_json(force=True)

    category = data.get("category", "").strip()
    subtype  = data.get("subtype", "").strip()
    try:
        lat = float(data.get("lat"))
        lng = float(data.get("lng"))
    except (TypeError, ValueError):
        return jsonify({"error": "Invalid lat/lng — must be numeric"}), 400

    if not subtype:
        return jsonify({"error": "Missing subtype"}), 400

    in_bbox = (
        SYDNEY_BBOX["min_lat"] <= lat <= SYDNEY_BBOX["max_lat"] and
        SYDNEY_BBOX["min_lng"] <= lng <= SYDNEY_BBOX["max_lng"]
    )
    if not in_bbox:
        return jsonify({"error": "Pin must be inside Sydney"}), 400

    return jsonify(analyze_location(lat, lng, category, subtype))


@app.post("/api/narrative")
def narrative():
    try:
        import anthropic as _anthropic
    except ImportError:
        return jsonify({"error": "anthropic package not installed — pip install anthropic"}), 503

    api_key = os.environ.get("ANTHROPIC_API_KEY", "")
    if not api_key:
        return jsonify({"error": "ANTHROPIC_API_KEY not configured"}), 503

    data        = request.get_json(force=True)
    follow_up   = data.get("follow_up")          # None | "business_plan" | "startup_costs" | "competitor_analysis"
    category    = data.get("category", "business")
    subtype     = data.get("subtype", "")
    city        = data.get("city", "Sydney")
    score       = data.get("score", 50)
    grade       = data.get("grade", "C")
    verdict     = data.get("verdict", "NEUTRAL")
    competitors = data.get("direct_competitors_1km", 0)
    close_comp  = data.get("close_competitors_300m", 0)
    survival    = data.get("survival_rate_2y", 75)
    foot_traffic= data.get("foot_traffic", "Moderate")
    rev_min     = data.get("rev_min", 0)
    rev_max     = data.get("rev_max", 0)
    avg_rent    = data.get("avg_rent", 0)
    msi         = data.get("market_saturation_index", 1.0)
    moat        = data.get("competitive_moat_score", 50)
    breakeven   = data.get("breakeven_months", 24)
    poi_count   = data.get("poi_count_500m", 0)
    matrix      = data.get("matrix", [])
    nearest     = data.get("nearest_competitors", [])
    lat         = data.get("lat", 0.0)
    lng         = data.get("lng", 0.0)

    subtype_label = subtype.replace("_", " ").title()
    breakeven_str = f"{breakeven} months" if breakeven < 999 else "N/A — review revenue assumptions"
    msi_label     = "opportunity — undersaturated" if msi < 0.7 else "risky — oversaturated" if msi > 1.3 else "normal competitive density"

    context = f"""Location: {city} ({lat:.4f}°, {lng:.4f}°)
Business: {subtype_label} ({category.title()})
LOCWISE Score: {score}/100 (Grade {grade}) — {verdict}
Competitors within 1km: {competitors} ({close_comp} within 300m)
2-year survival rate (Sydney {category} category): {survival}%
Foot traffic: {foot_traffic} ({poi_count} POIs within 500m)
Monthly revenue projection: A${rev_min:,} – A${rev_max:,}
Avg commercial rent: A${avg_rent}/sqm/month
Market Saturation Index: {msi:.2f}× ({msi_label})
Competitive Moat Score: {moat}/100
Break-even estimate: {breakeven_str}

Signal Matrix (businesses within 500m):
{chr(10).join(f"  {row['label']}: {row['count']} nearby ({row['verdict']})" for row in matrix) if matrix else "  (no live signal data — mock mode)"}

Nearest Competitors:
{chr(10).join(f"  {c['name']} — {c.get('distance_m', '?')}m away" for c in nearest[:5]) if nearest else "  None identified"}"""

    if follow_up == "business_plan":
        prompt = f"""You are a Sydney business consultant. Write a focused 1-page business plan outline for this specific location. Use the numbers directly — no generic startup advice.

{context}

Structure exactly as follows:

**Executive Summary**
2 sentences — what this business is and why this location makes sense (or doesn't).

**Target Market**
Who is actually here based on the signal matrix and foot traffic data. Be specific.

**Revenue Model**
Reference the A${rev_min:,}–A${rev_max:,}/month projection. What drives the upside vs. the downside?

**Key Risks**
3 specific risks from the data — name the numbers (competition count, moat score, saturation index).

**90-Day Action Plan**
4 concrete steps numbered 1–4 before and after opening. Reference the break-even of {breakeven_str}.

Every point must reference actual numbers from the analysis."""

    elif follow_up == "startup_costs":
        prompt = f"""You are a Sydney business financial advisor. Provide a realistic startup cost breakdown for a {subtype_label} in {city}.

{context}

Break down in AUD with realistic Sydney ranges:

**Fit-out & Construction**
Range for this business type and typical footprint.

**Equipment & Fixtures**
Specific to {subtype_label} — list major items with cost ranges.

**Licenses, Permits & Legal**
Sydney-specific requirements for this business category.

**Security Deposit & Rent Advance**
Calculate based on A${avg_rent}/sqm rent for a typical {category} space footprint.

**Working Capital Reserve**
Link this to the {breakeven_str} break-even — how many months to fund.

**Contingency Buffer**
Recommended % and why, given the {survival}% 2-year survival rate.

**Total Range**
Conservative vs. optimistic total. Flag if the numbers look tight.

Be specific to Sydney market conditions in 2024–2025."""

    elif follow_up == "competitor_analysis":
        prompt = f"""You are a Sydney market intelligence analyst. Provide a deep competitor analysis for this {subtype_label} at this location.

{context}

Cover each section:

**Competitive Landscape**
What does {competitors} competitors within 1km actually mean for this business? Compare to category norms.

**The 300m Threat Zone**
Analyse the {close_comp} businesses within 300m — this is the critical proximity band for foot traffic capture.

**Market Saturation Read**
Interpret the {msi:.2f}× Market Saturation Index ({msi_label}). What does this mean to open now?

**Competitive Moat**
Score is {moat}/100. What specifically gives or removes defensibility at this address?

**Nearest Rivals Analysis**
For each listed competitor — likely price point, customer overlap, and exploitable weakness.

**Positioning Strategy**
Given the above, what is the one positioning move that makes this location viable? Or should they look elsewhere?

Be direct. If the competitive picture is bad, say so clearly."""

    else:
        prompt = f"""You are LOCWISE, an AI location intelligence advisor for entrepreneurs in Sydney. Write a sharp, direct verdict for this business location. Every sentence must reference the actual data. No generic startup advice — this person is deciding whether to sign a lease.

{context}

Write exactly in this structure:

**Verdict**
One sentence. Is this location viable, and why in one line.

**Market Reality**
2–3 sentences on the competition, foot traffic, and what the {survival}% 2-year survival rate means here specifically.

**Revenue Outlook**
2 sentences. Interpret A${rev_min:,}–A${rev_max:,}/month and the {breakeven_str} break-even. What has to go right?

**Why This Could Work**
• 2–3 bullet points — genuine positives from the signal matrix and location data

**Watch Out For**
• 2–3 bullet points — real risks from the numbers, not generic warnings

**Before You Sign**
1. Through 4. — specific actions for this exact location. Reference the data. Not generic advice.

Tone: honest, direct, like a trusted advisor who has actually seen the numbers."""

    def generate():
        try:
            client = _anthropic.Anthropic(api_key=api_key)
            with client.messages.stream(
                model="claude-sonnet-4-6",
                max_tokens=1200,
                messages=[{"role": "user", "content": prompt}],
            ) as stream:
                for text in stream.text_stream:
                    yield f"data: {json.dumps({'text': text})}\n\n"
            yield "data: [DONE]\n\n"
        except Exception as e:
            yield f"data: {json.dumps({'error': str(e)})}\n\n"
            yield "data: [DONE]\n\n"

    return Response(
        stream_with_context(generate()),
        content_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


if __name__ == "__main__":
    print(f"Loaded {len(PLACES):,} Sydney POIs")
    print(f"Taxonomy loaded: {sum(len(v) for v in CATEGORY_TAXONOMY.values())} category labels from cleaned_categories.csv")
    app.run(host="0.0.0.0", port=8000, debug=True)
