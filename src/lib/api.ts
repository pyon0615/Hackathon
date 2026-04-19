/**
 * LOCWISE — Backend API Client
 *
 * AI Acknowledgement:
 * This file was developed with AI assistance (Claude by Anthropic) for:
 *  - Diagnosing why the frontend showed mock data even when Flask was running
 *    (root cause: CORS only allowed ports 5173/8080, Vite was on 8082)
 *  - Typing the full AnalysisResponse to match server.py's analyze_location() output
 *  - Adding the checkBackend() health-check helper
 *
 * How it works:
 *  - API_BASE reads VITE_API_URL env var first (for production deployments),
 *    then falls back to localhost:8000 for local development
 *  - analyzeLocation() POSTs lat/lng/category/subtype and returns real CSV-derived metrics
 *  - If the backend is unreachable, Index.tsx catches the error and uses mockMarket.ts instead
 */
export const API_BASE = import.meta.env.VITE_API_URL ?? "http://127.0.0.1:8000";

export type MatrixRow = {
  label: string;
  count: number;
  verdict: string; // "PROCEED" | "NEUTRAL" | "WEAK"
};

export type CompetitorRow = {
  name: string;
  category_text: string;
  address: string;
  locality: string;
  distance_m: number;
};

// Matches server.py analyze_location() return shape exactly
export type AnalysisResponse = {
  city: string;
  lat: number;
  lng: number;
  category: string;
  subtype: string;
  // Core score
  score: number;
  grade: string;
  verdict: string; // "PROCEED" | "NEUTRAL" | "AVOID"
  // Competitor metrics
  direct_competitors_1km: number;
  close_competitors_300m: number;
  same_category_1km: number;
  nearest_competitors: CompetitorRow[];
  // Foot traffic
  poi_count_500m: number;
  poi_count_1km: number;
  foot_traffic_proxy: string;
  // Signal matrix
  signals_detected: number;
  matrix: MatrixRow[];
  // Advanced analytics (CSV taxonomy + math formulas)
  market_saturation_index: number;   // < 0.7 = opportunity, > 1.3 = risky
  spatial_decay_score: number;       // distance-weighted competition pressure
  competitive_moat_score: number;    // 0–100
  breakeven_months: number;          // estimated months to break even
  // Financial projections
  survival_rate_2y: number;
  avg_rent_aud_per_sqm: number;
  projected_revenue_aud_min: number;
  projected_revenue_aud_max: number;
  annual_revenue_midpoint_aud: number;
  // Not in Foursquare dataset — null from backend
  median_income: number | null;
  safety_index: number | null;
  // Summary
  plain_english_summary: string;
};

export async function analyzeLocation(payload: {
  category: string;
  subtype: string;
  lat: number;
  lng: number;
}): Promise<AnalysisResponse> {
  const res = await fetch(`${API_BASE}/api/analyze`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { error?: string }).error ?? "Analysis failed");
  }

  return (await res.json()) as AnalysisResponse;
}

export async function checkBackend(): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE}/api/health`, { signal: AbortSignal.timeout(2000) });
    return res.ok;
  } catch {
    return false;
  }
}
