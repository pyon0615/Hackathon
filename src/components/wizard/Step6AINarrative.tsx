/**
 * LOCWISE — Step 6: AI Narrative & Verdict
 *
 * AI Acknowledgement:
 * This file was developed with AI assistance (Claude by Anthropic) for:
 *  - Rewriting buildFallbackNarrative() to produce rich structured analysis using all
 *    real database fields (competitor names, signal matrix, saturation index, moat score,
 *    breakeven) — original version produced only 2–3 generic sentences
 *  - Adding ━━ section headers (━━ MARKET OVERVIEW ━━ etc.) that ExportPDF.tsx parses
 *    and renders as bold section titles in the PDF report
 *  - Wiring the "Export Report (PDF)" button to triggerPDFExport()
 *  - Fixing the status label: was "Estimated verdict (AI offline)" even with live data;
 *    now shows "Data analysis · {cityLabel}" when using real DB fields
 *  - Hardcoding DEMO constants (Japanese restaurant, Chippendale) for the LayoutModal so
 *    "Build Your Business" always shows a coherent demo regardless of user selections
 *
 * How it works:
 *  - Tries /api/narrative (SSE stream) first — requires Claude API key in backend
 *  - Falls back to buildFallbackNarrative() using real snapshot fields from the DB
 *  - "Build Your Business" button opens LayoutModal with DEMO_* constants (not live state)
 *  - "Export Report (PDF)" opens a new tab with full HTML report and calls window.print()
 */

import { useEffect, useRef, useState } from "react";
import { MarketSnapshot } from "@/data/mockMarket";
import { BusinessType, getType } from "@/data/businessTypes";
import { overallScore, scoreNeighbors, verdictLabel } from "@/data/conflictMatrix";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { API_BASE } from "@/lib/api";
import { LayoutModal } from "./LayoutModal";
import { triggerPDFExport } from "./ExportPDF";

// ── Demo constants — hardcoded for Chippendale Japanese Restaurant ──────────────
const DEMO_PIN = { lat: -33.8929, lng: 151.1977 };
const DEMO_CITY = "Chippendale, Sydney";
const DEMO_TYPE = getType("restaurant");
const DEMO_SUBTYPE = "japanese";
const DEMO_SNAPSHOT: MarketSnapshot = {
  competitorCount: 8,
  closeCompetitorCount: 2,
  avgRentPerSqm: 142,
  successRate2yr: 62,
  footTraffic: "High",
  medianIncome: 82000,
  populationDensity: 8200,
  safetyScore: 78,
  expectedRevenueMin: 68000,
  expectedRevenueMax: 112000,
  annualRevenueMidpoint: 1080000,
  neighborCounts: {
    office_tower: 3,
    gym: 2,
    bar: 4,
    transit: 3,
    residential: 5,
    university: 1,
    fast_food: 2,
    cafe: 6,
  },
  nearestCompetitors: [
    { name: "Tsubu Ramen", category_text: "Japanese Restaurant", address: "142 Abercrombie St", locality: "Chippendale", distance_m: 210 },
    { name: "Miso Express Bar", category_text: "Japanese Restaurant", address: "88 Broadway", locality: "Chippendale", distance_m: 380 },
    { name: "Sakura Sushi", category_text: "Japanese Restaurant", address: "56 Cleveland St", locality: "Surry Hills", distance_m: 620 },
    { name: "Nori Kitchen", category_text: "Japanese Restaurant", address: "22 City Rd", locality: "Chippendale", distance_m: 840 },
    { name: "Aki Izakaya", category_text: "Japanese Restaurant", address: "310 George St", locality: "Sydney CBD", distance_m: 1180 },
  ],
  signalMatrix: [
    { label: "Office Towers", count: 3, verdict: "Positive" },
    { label: "Transit Hubs", count: 3, verdict: "Positive" },
    { label: "Universities / Campus", count: 1, verdict: "Positive" },
    { label: "Gyms & Fitness", count: 2, verdict: "Positive" },
    { label: "Bars & Nightlife", count: 4, verdict: "Neutral" },
    { label: "Cafés", count: 6, verdict: "Neutral" },
    { label: "Residential Density", count: 5, verdict: "Positive" },
    { label: "Japanese Restaurants", count: 4, verdict: "Negative" },
  ],
  poiCount500m: 142,
  dataSource: "live",
  marketSaturationIndex: 0.68,
  competitiveMoatScore: 72,
  breakevenMonths: 14,
  liveScore: 78,
  liveGrade: "B",
};

interface Step6Props {
  type: BusinessType;
  subtypeId: string;
  snapshot: MarketSnapshot;
  cityLabel: string;
  pin: { lat: number; lng: number };
  onRestart: () => void;
}

// Rich data-driven narrative — uses all real database fields
function buildFallbackNarrative(
  type: BusinessType,
  subtypeId: string,
  snapshot: MarketSnapshot,
  cityLabel: string,
  overall: ReturnType<typeof overallScore>,
  signals: ReturnType<typeof scoreNeighbors>,
): string {
  const subtype    = type.subtypes.find((s) => s.id === subtypeId)!;
  const score      = snapshot.liveScore  ?? Math.max(0, Math.min(100, (overall.score + 100) / 2));
  const grade      = snapshot.liveGrade  ?? overall.grade;
  const verdict    = score >= 70 ? "PROCEED" : score >= 40 ? "NEUTRAL" : "AVOID";
  const verdictAdj = score >= 70 ? "a strong" : score >= 40 ? "a marginal" : "a high-risk";

  const revLowK    = Math.round(snapshot.expectedRevenueMin  / 1000);
  const revHighK   = Math.round(snapshot.expectedRevenueMax  / 1000);
  const revAnnualK = Math.round(snapshot.annualRevenueMidpoint / 1000);

  // Signal matrix from real DB — positives and negatives
  const matrixPos = snapshot.signalMatrix.filter(r => r.verdict === "PROCEED" || r.verdict === "Positive").slice(0, 3);
  const matrixNeg = snapshot.signalMatrix.filter(r => r.verdict === "WEAK"    || r.verdict === "Negative").slice(0, 2);

  // Saturation read
  const msi       = snapshot.marketSaturationIndex;
  const msiLabel  = msi < 0.7 ? "undersaturated — a market gap exists"
                  : msi > 1.3 ? "oversaturated — elevated risk"
                  : "within normal competitive density";

  // Nearest real competitors
  const topRivals = snapshot.nearestCompetitors.slice(0, 3);
  const rivalsStr = topRivals.length
    ? topRivals.map(c => `  • ${c.name} (${c.distance_m}m away, ${c.locality})`).join("\n")
    : "  No direct rivals identified in the dataset.";

  // Signal upsides from real DB
  const signalUpsides = matrixPos.length
    ? matrixPos.map(r => `  • ${r.label}: ${r.count} nearby — ${
        r.count >= 12 ? "strong demand signal" : r.count >= 4 ? "moderate support" : "light but present"
      }`).join("\n")
    : "  No strong positive signals detected.";

  // Signal risks from real DB
  const signalRisks = matrixNeg.length
    ? matrixNeg.map(r => `  • ${r.label}: ${r.count} nearby — this is working against you`).join("\n")
    : "";

  // Moat read
  const moatRead = snapshot.competitiveMoatScore >= 70 ? "strong — few direct rivals nearby"
                 : snapshot.competitiveMoatScore >= 40 ? "moderate — differentiation required"
                 : "weak — heavy direct competition at close range";

  // Breakeven
  const breakevenStr = snapshot.breakevenMonths >= 999
    ? "not projected under current assumptions — review cost base"
    : `~${snapshot.breakevenMonths} months`;

  // Action steps tailored to verdict
  const actions = score >= 70
    ? `1. Visit the site at weekday lunch, weekday evening, and Saturday afternoon — foot traffic of "${snapshot.footTraffic}" needs to be confirmed in person.\n2. Negotiate rent below A$${snapshot.avgRentPerSqm}/sqm/mo — the market data supports your position.\n3. Your moat score is ${snapshot.competitiveMoatScore}/100 (${moatRead}). Build your point of difference before opening.\n4. Plan a 6-month ramp — the ${snapshot.successRate2yr}% survival rate reflects operators who cleared this window.`
    : score >= 40
    ? `1. Do not sign until you visit ${topRivals[0]?.name ?? "the nearest rival"} in person — understand why customers go there.\n2. At ${snapshot.competitorCount} competitors within 1km and a moat score of ${snapshot.competitiveMoatScore}/100, you need a tight concept, not a broad menu.\n3. Stress-test your numbers: can you survive on A$${revLowK}K/month (the conservative projection)?\n4. Compare 2–3 adjacent suburbs before committing — the saturation index here is ${msi.toFixed(2)}× (${msiLabel}).`
    : `1. Seriously consider adjacent suburbs — ${snapshot.competitorCount} direct competitors within 1km is very high for this category.\n2. The moat score of ${snapshot.competitiveMoatScore}/100 means ${snapshot.closeCompetitorCount} rivals are within 300m — foot traffic capture will be a daily fight.\n3. If you proceed anyway, specialise to a narrow niche that none of the ${topRivals.length > 0 ? topRivals[0].name : "existing players"} cover.\n4. Get a lease break clause at 12 months — the ${snapshot.successRate2yr}% 2-year survival rate means you need an exit option.`;

  return `Verdict: ${verdict} — Grade ${grade}, Score ${score}/100

This is ${verdictAdj} location for a ${subtype.label} ${type.label.toLowerCase()} in ${cityLabel}.

━━ Market Reality ━━
${snapshot.competitorCount} direct competitors within 1km, ${snapshot.closeCompetitorCount} within 300m.
Market Saturation Index: ${msi.toFixed(2)}× (${msiLabel}).
2-year survival rate for ${type.label.toLowerCase()}s in Sydney: ${snapshot.successRate2yr}%.
Foot traffic: ${snapshot.footTraffic} (${snapshot.poiCount500m} active businesses within 500m).

━━ Revenue Outlook ━━
Conservative: A$${revLowK}K/month · Optimistic: A$${revHighK}K/month
Annual midpoint: A$${revAnnualK}K · Avg rent: A$${snapshot.avgRentPerSqm}/sqm/mo
Estimated break-even: ${breakevenStr}
Competitive moat: ${snapshot.competitiveMoatScore}/100 — ${moatRead}

━━ What's Working For You ━━
${signalUpsides}
${signalRisks ? `\n━━ What's Working Against You ━━\n${signalRisks}` : ""}
━━ Nearest Direct Rivals (real data) ━━
${rivalsStr}

━━ Before You Sign ━━
${actions}`;
}

async function streamNarrative(
  payload: object,
  onChunk: (text: string) => void,
  signal: AbortSignal,
): Promise<void> {
  const res = await fetch(`${API_BASE}/api/narrative`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    signal,
  });
  if (!res.ok || !res.body) throw new Error("Backend unavailable");

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.startsWith("data: ")) continue;
      const raw = line.slice(6).trim();
      if (raw === "[DONE]") return;
      try {
        const parsed = JSON.parse(raw);
        if (parsed.error) throw new Error(parsed.error);
        if (parsed.text) onChunk(parsed.text);
      } catch (e) {
        if ((e as Error).message && !(e as Error).message.startsWith("Unexpected")) throw e;
      }
    }
  }
}

type FollowUpKey = "business_plan" | "startup_costs" | "competitor_analysis";

const FOLLOW_UPS: { key: FollowUpKey; label: string; desc: string; icon: string }[] = [
  { key: "business_plan",       label: "Generate Business Plan",  desc: "Full plan tailored to this location and concept.",        icon: "◰" },
  { key: "startup_costs",       label: "Estimate Startup Costs",  desc: "Build-out, equipment, working capital, runway.",          icon: "◇" },
  { key: "competitor_analysis", label: "Competitor Deep-Dive",    desc: "Detailed breakdown of every nearby player.",              icon: "◈" },
];

export const Step6AINarrative = ({
  type,
  subtypeId,
  snapshot,
  cityLabel,
  pin,
  onRestart,
}: Step6Props) => {
  const BACKEND_LABEL_TO_KEY: Record<string, string> = {
    "Office Towers":          "office_tower",
    "Gyms & Studios":         "gym",
    "Bars & Nightlife":       "bar",
    "Schools / Universities": "school",
    "Transit / Commuter":     "transit",
    "Cafés & Dining":         "cafe",
    "Health & Medical":       "hospital",
    "Retail Strip":           "luxury_retail",
  };
  const neighborCounts: Record<string, number> =
    snapshot.dataSource === "live" && snapshot.signalMatrix.length > 0
      ? {
          ...Object.fromEntries(
            snapshot.signalMatrix
              .map((r) => [BACKEND_LABEL_TO_KEY[r.label] ?? null, r.count])
              .filter(([k]) => k !== null)
          ),
          competitor: snapshot.closeCompetitorCount,
        }
      : snapshot.neighborCounts;

  const signals = scoreNeighbors(type.id, subtypeId, neighborCounts);
  const overall = overallScore(signals);

  const scoreVal  = snapshot.liveScore ?? Math.max(0, Math.min(100, (overall.score + 100) / 2));
  const gradeVal  = snapshot.liveGrade ?? overall.grade;
  const verdictStr = scoreVal >= 70 ? "PROCEED" : scoreVal >= 40 ? "NEUTRAL" : "AVOID";

  const basePayload = {
    category:                 type.id,
    subtype:                  subtypeId,
    city:                     cityLabel,
    lat:                      pin.lat,
    lng:                      pin.lng,
    score:                    scoreVal,
    grade:                    gradeVal,
    verdict:                  verdictStr,
    direct_competitors_1km:   snapshot.competitorCount,
    close_competitors_300m:   snapshot.closeCompetitorCount,
    survival_rate_2y:         snapshot.successRate2yr,
    foot_traffic:             snapshot.footTraffic,
    rev_min:                  snapshot.expectedRevenueMin,
    rev_max:                  snapshot.expectedRevenueMax,
    avg_rent:                 snapshot.avgRentPerSqm,
    market_saturation_index:  snapshot.marketSaturationIndex,
    competitive_moat_score:   snapshot.competitiveMoatScore,
    breakeven_months:         snapshot.breakevenMonths,
    poi_count_500m:           snapshot.poiCount500m,
    matrix:                   snapshot.signalMatrix,
    nearest_competitors:      snapshot.nearestCompetitors,
  };

  // ── Main narrative ──────────────────────────────────────────────────────────
  const [mainText, setMainText]       = useState("");
  const [mainStatus, setMainStatus]   = useState<"loading" | "streaming" | "done" | "fallback">("loading");

  useEffect(() => {
    const controller = new AbortController();

    (async () => {
      setMainText("");
      setMainStatus("loading");
      try {
        await streamNarrative(
          { ...basePayload, follow_up: null },
          (chunk) => {
            setMainText((prev) => prev + chunk);
            setMainStatus("streaming");
          },
          controller.signal,
        );
        setMainStatus("done");
      } catch (e) {
        if ((e as Error).name === "AbortError") return;
        // Fall back to client-side template narrative
        const fallback = buildFallbackNarrative(type, subtypeId, snapshot, cityLabel, overall, signals);
        setMainText(fallback);
        setMainStatus("fallback");
      }
    })();

    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Follow-up panels ────────────────────────────────────────────────────────
  const [activeFollowUp, setActiveFollowUp] = useState<FollowUpKey | null>(null);
  const [followUpText, setFollowUpText]     = useState("");
  const [followUpStatus, setFollowUpStatus] = useState<"idle" | "loading" | "streaming" | "done" | "error">("idle");
  const followUpController = useRef<AbortController | null>(null);

  const handleFollowUp = async (key: FollowUpKey) => {
    followUpController.current?.abort();
    const controller = new AbortController();
    followUpController.current = controller;

    setActiveFollowUp(key);
    setFollowUpText("");
    setFollowUpStatus("loading");

    try {
      await streamNarrative(
        { ...basePayload, follow_up: key },
        (chunk) => {
          setFollowUpText((prev) => prev + chunk);
          setFollowUpStatus("streaming");
        },
        controller.signal,
      );
      setFollowUpStatus("done");
    } catch (e) {
      if ((e as Error).name === "AbortError") return;
      setFollowUpText("Unable to generate — backend or AI unavailable.");
      setFollowUpStatus("error");
    }
  };

  const mainDone    = mainStatus === "done" || mainStatus === "fallback";
  const mainLoading = mainStatus === "loading";
  const isFallback  = mainStatus === "fallback";

  // ── Layout modal ────────────────────────────────────────────────────────────
  const [layoutOpen, setLayoutOpen] = useState(false);

  return (
    <div className="space-y-6">
      {/* Main narrative card */}
      <div className="border border-border-strong bg-card">
        <div className="flex items-center justify-between px-5 py-3 border-b border-border-strong bg-paper-deep/40">
          <div className="flex items-center gap-3">
            <div className="size-7 bg-ink text-background flex items-center justify-center font-display font-bold">
              ◉
            </div>
            <div>
              <div className="font-display font-semibold text-sm text-ink">
                LOCWISE · AI Recommendation
              </div>
              <div className="data-tag">
                {isFallback ? `Data analysis · ${cityLabel}` : `Claude analysis · ${cityLabel}`}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span
              className={cn(
                "size-2 rounded-full",
                mainDone  ? (isFallback ? "bg-signal-amber" : "bg-signal-green") : "bg-signal-amber animate-blink",
              )}
            />
            <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
              {mainLoading ? "Analysing…" : mainDone ? "Complete" : "Generating"}
            </span>
          </div>
        </div>

        <div className="p-6 md:p-8 min-h-[220px]">
          {mainLoading ? (
            <div className="flex items-center gap-3 text-muted-foreground">
              <span className="inline-block w-2 h-4 bg-ink/40 animate-blink" />
              <span className="font-mono text-xs">Claude is analysing your location data…</span>
            </div>
          ) : (
            <pre className="font-sans text-[15px] leading-relaxed text-ink whitespace-pre-wrap">
              {mainText}
              {mainStatus === "streaming" && (
                <span className="inline-block w-2 h-4 bg-ink ml-0.5 animate-blink" />
              )}
            </pre>
          )}
        </div>
      </div>

      {/* Follow-up panel */}
      {activeFollowUp && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="border border-border-strong bg-card"
        >
          <div className="flex items-center justify-between px-5 py-3 border-b border-border-strong bg-paper-deep/40">
            <div className="flex items-center gap-3">
              <div className="size-7 bg-ink text-background flex items-center justify-center font-display font-bold">
                {FOLLOW_UPS.find((f) => f.key === activeFollowUp)?.icon}
              </div>
              <div>
                <div className="font-display font-semibold text-sm text-ink">
                  {FOLLOW_UPS.find((f) => f.key === activeFollowUp)?.label}
                </div>
                <div className="data-tag">AI follow-up analysis</div>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <span
                  className={cn(
                    "size-2 rounded-full",
                    followUpStatus === "done" || followUpStatus === "error"
                      ? followUpStatus === "error" ? "bg-signal-red" : "bg-signal-green"
                      : "bg-signal-amber animate-blink",
                  )}
                />
                <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                  {followUpStatus === "loading" ? "Connecting…" : followUpStatus === "done" ? "Complete" : followUpStatus === "error" ? "Error" : "Generating"}
                </span>
              </div>
              <button
                onClick={() => { followUpController.current?.abort(); setActiveFollowUp(null); }}
                className="font-mono text-[10px] text-muted-foreground hover:text-ink transition-colors"
              >
                ✕
              </button>
            </div>
          </div>

          <div className="p-6 md:p-8 min-h-[160px]">
            {followUpStatus === "loading" ? (
              <div className="flex items-center gap-3 text-muted-foreground">
                <span className="inline-block w-2 h-4 bg-ink/40 animate-blink" />
                <span className="font-mono text-xs">Generating…</span>
              </div>
            ) : (
              <pre className="font-sans text-[15px] leading-relaxed text-ink whitespace-pre-wrap">
                {followUpText}
                {followUpStatus === "streaming" && (
                  <span className="inline-block w-2 h-4 bg-ink ml-0.5 animate-blink" />
                )}
              </pre>
            )}
          </div>
        </motion.div>
      )}

      {/* Follow-up buttons */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {FOLLOW_UPS.map((a) => (
          <motion.button
            key={a.key}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: mainDone ? 1 : 0.4, y: 0 }}
            transition={{ delay: 0.1 }}
            disabled={!mainDone || followUpStatus === "loading" || followUpStatus === "streaming"}
            onClick={() => handleFollowUp(a.key)}
            className={cn(
              "group text-left p-5 border bg-card hover:border-ink hover:shadow-elevated transition-all disabled:cursor-not-allowed",
              activeFollowUp === a.key ? "border-ink" : "border-border",
            )}
          >
            <div className="flex items-start justify-between mb-3">
              <span className="font-display text-2xl text-ink">{a.icon}</span>
              <span className="data-tag">ASK AI</span>
            </div>
            <div className="font-display font-semibold text-ink">{a.label}</div>
            <div className="text-xs text-muted-foreground mt-1">{a.desc}</div>
          </motion.button>
        ))}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between border-t border-border-strong pt-6 flex-wrap gap-3">
        <button
          onClick={onRestart}
          className="font-mono text-xs uppercase tracking-widest text-muted-foreground hover:text-ink transition-colors"
        >
          ← Run another analysis
        </button>
        <div className="flex items-center gap-3">
          <motion.button
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: mainDone ? 1 : 0.4, y: 0 }}
            disabled={!mainDone}
            onClick={() => setLayoutOpen(true)}
            className="h-11 px-6 rounded-none font-mono text-xs uppercase tracking-widest bg-accent hover:bg-accent/90 text-accent-foreground shadow-[0_6px_18px_hsl(var(--accent)/0.30)] disabled:shadow-none disabled:cursor-not-allowed transition-all flex items-center gap-2"
          >
            <span className="text-base leading-none">◫</span>
            Build Your Business
          </motion.button>
          <Button
            className="rounded-none font-mono text-xs uppercase tracking-widest bg-ink hover:bg-ink/90"
            onClick={() => triggerPDFExport({
              type, subtypeId, snapshot, cityLabel, pin, mainText,
            })}
          >
            Export Report (PDF)
          </Button>
        </div>
      </div>

      {/* 3D Layout Modal — always shows Chippendale Japanese Restaurant demo */}
      <LayoutModal
        open={layoutOpen}
        onClose={() => setLayoutOpen(false)}
        type={DEMO_TYPE}
        subtypeId={DEMO_SUBTYPE}
        snapshot={DEMO_SNAPSHOT}
        cityLabel={DEMO_CITY}
        pin={DEMO_PIN}
      />
    </div>
  );
};
