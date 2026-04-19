/**
 * LOCWISE — Mock Market Data Generator
 *
 * AI Acknowledgement:
 * This file was developed with AI assistance (Claude by Anthropic) for:
 *  - Designing the FNV-1a hash approach for deterministic but varied mock data
 *    (same lat/lng/subtype always produces the same numbers — no flickering on re-render)
 *  - Defining the MarketSnapshot type with fields that match what backend returns,
 *    so Index.tsx can spread mock and overwrite with live fields without type errors
 *  - Setting dataSource: "mock" | "live" flag so Step5Dashboard knows which scoring
 *    path to use (scoreNeighbors() for mock, backend signalMatrix for live)
 *
 * How it works:
 *  - hash() is FNV-1a (32-bit) — produces a stable seed from any string
 *  - rand(seed, min, max) uses Math.sin for pseudo-random floats in a range
 *  - getMarketSnapshot() is always called as a fallback; backend fields overwrite it
 *  - All monetary values in AUD; rent in AUD/sqm/month
 */

import { BusinessCategory } from "./businessTypes";

function hash(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

function rand(seed: number, min: number, max: number): number {
  const x = Math.sin(seed) * 10000;
  const f = x - Math.floor(x);
  return Math.round(min + f * (max - min));
}

export interface NearestCompetitor {
  name: string;
  category_text: string;
  address: string;
  locality: string;
  distance_m: number;
}

export interface SignalRow {
  label: string;
  count: number;
  verdict: string;
}

export interface MarketSnapshot {
  competitorCount: number;
  closeCompetitorCount: number; // within 300m
  avgRentPerSqm: number;        // AUD/sqm/month
  successRate2yr: number;        // % — from sydney_with_clean_categories.csv
  footTraffic: "Low" | "Moderate" | "High" | "Very High";
  medianIncome: number;          // AUD/year
  populationDensity: number;     // per km²
  safetyScore: number;           // 0–100
  expectedRevenueMin: number;    // AUD/month, conservative
  expectedRevenueMax: number;    // AUD/month, optimistic
  annualRevenueMidpoint: number; // AUD/year, midpoint
  neighborCounts: Record<string, number>;
  // Populated from backend (CSV data); empty when using mock
  nearestCompetitors: NearestCompetitor[];
  signalMatrix: SignalRow[];
  poiCount500m: number;
  dataSource: "mock" | "live";
  // Advanced analytics from backend math formulas
  marketSaturationIndex: number;  // < 0.7 = opportunity, > 1.3 = risky
  competitiveMoatScore: number;   // 0–100, higher = better moat
  breakevenMonths: number;        // estimated months to break even
  // Live backend score (when available)
  liveScore?: number;
  liveGrade?: string;
}

// Base survival rates derived from sydney_with_clean_categories.csv:
// Dining & Drinking: 70% | Retail: 85% | Health & Medicine: 95%
// Sports & Rec: 93% | Arts & Entertainment: 68% | Biz & Prof Services: 91%
// Travel & Transport: 88% | Community & Govt: 94%
const CATEGORY_BASE: Record<
  BusinessCategory,
  { rent: [number, number]; survivalBase: number; revenue: [number, number] }
> = {
  restaurant:            { rent: [8, 28],  survivalBase: 70, revenue: [45000,  220000] },
  cafe:                  { rent: [7, 22],  survivalBase: 70, revenue: [25000,   95000] },
  bar:                   { rent: [8, 25],  survivalBase: 70, revenue: [40000,  180000] },
  gym:                   { rent: [3, 14],  survivalBase: 93, revenue: [30000,  130000] },
  clinic:                { rent: [6, 20],  survivalBase: 95, revenue: [60000,  300000] },
  retail:                { rent: [10, 45], survivalBase: 85, revenue: [40000,  200000] },
  beauty:                { rent: [5, 18],  survivalBase: 91, revenue: [18000,   85000] },
  coworking:             { rent: [5, 18],  survivalBase: 91, revenue: [45000,  180000] },
  education:             { rent: [4, 14],  survivalBase: 94, revenue: [22000,  110000] },
  entertainment:         { rent: [5, 22],  survivalBase: 68, revenue: [55000,  350000] },
  hotel:                 { rent: [15, 55], survivalBase: 88, revenue: [150000, 700000] },
  professional_services: { rent: [5, 18],  survivalBase: 91, revenue: [30000,  160000] },
};

export function getMarketSnapshot(
  lat: number,
  lng: number,
  category: BusinessCategory,
  subtypeId: string
): MarketSnapshot {
  const seed = hash(`${lat.toFixed(3)}_${lng.toFixed(3)}_${subtypeId}`);
  const base = CATEGORY_BASE[category] ?? CATEGORY_BASE.restaurant;

  const rent = rand(seed + 1, base.rent[0], base.rent[1]);

  // Small location-based variance (±8 pp) around the category survival base
  const survivalVariance = rand(seed + 2, -8, 8);
  const success = Math.max(30, Math.min(98, base.survivalBase + survivalVariance));

  const competitorCount = rand(seed + 3, 2, 42);
  const closeCompetitorCount = rand(seed + 30, 0, Math.min(competitorCount, 8));
  const safety = rand(seed + 4, 40, 96);
  const income = rand(seed + 5, 48000, 165000);  // AUD median household income
  const density = rand(seed + 6, 1200, 22000);

  const trafficSeed = (seed + 7) % 4;
  const footTraffic = (["Low", "Moderate", "High", "Very High"] as const)[trafficSeed];

  const trafficMult = [0.55, 0.85, 1.1, 1.35][trafficSeed];
  const competitionMult = Math.max(0.55, 1 - competitorCount / 90);
  const revLow = Math.round((base.revenue[0] * trafficMult * competitionMult) / 1000) * 1000;
  const revHigh = Math.round((base.revenue[1] * trafficMult * competitionMult) / 1000) * 1000;

  const neighborCounts: Record<string, number> = {
    office_tower:  rand(seed + 10, 0, 6),
    gym:           rand(seed + 11, 0, 5),
    bar:           rand(seed + 12, 0, 8),
    school:        rand(seed + 13, 0, 4),
    hospital:      rand(seed + 14, 0, 3),
    hotel:         rand(seed + 15, 0, 4),
    competitor:    rand(seed + 16, 0, 7),
    cafe:          rand(seed + 17, 0, 9),
    fast_food:     rand(seed + 18, 0, 7),
    luxury_retail: rand(seed + 19, 0, 5),
    residential:   rand(seed + 20, 1, 9),
    park:          rand(seed + 21, 0, 3),
    transit:       rand(seed + 22, 0, 4),
  };

  const poiCount = rand(seed + 31, 40, 320);
  // Estimated MSI from mock competitor / poi counts
  const mockMsi = parseFloat(Math.max(0.1, Math.min(3, competitorCount / Math.max(poiCount * 0.08, 1))).toFixed(2));
  // Moat: inverse of close competitor count
  const mockMoat = Math.max(0, Math.min(100, 100 - closeCompetitorCount * 18 - Math.min(competitorCount * 1.5, 25)));
  // Breakeven: rough estimate based on rent and revenue midpoint
  const midRev = (revLow + revHigh) / 2;
  const monthlyRent = rent * (base.rent[1] > 20 ? 120 : 80);
  const monthlyNet = midRev * 0.38 - monthlyRent;
  const mockBreakeven = monthlyNet > 0 ? Math.min(999, Math.round((monthlyRent * 6) / monthlyNet)) : 999;

  return {
    competitorCount,
    closeCompetitorCount,
    avgRentPerSqm: rent,
    successRate2yr: success,
    footTraffic,
    medianIncome: income,
    populationDensity: density,
    safetyScore: safety,
    expectedRevenueMin: revLow,
    expectedRevenueMax: revHigh,
    annualRevenueMidpoint: Math.round(((revLow + revHigh) / 2) * 12 / 1000) * 1000,
    neighborCounts,
    nearestCompetitors: [],
    signalMatrix: [],
    poiCount500m: poiCount,
    dataSource: "mock" as const,
    marketSaturationIndex: mockMsi,
    competitiveMoatScore: Math.round(mockMoat),
    breakevenMonths: mockBreakeven,
  };
}
