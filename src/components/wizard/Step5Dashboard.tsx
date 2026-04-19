/**
 * LOCWISE — Step 5: Data Dashboard
 *
 * AI Acknowledgement:
 * This file was developed with AI assistance (Claude by Anthropic) for:
 *  - Fixing the conflict matrix showing all zeroes: BACKEND_LABEL_TO_KEY had wrong
 *    label strings ("Office Buildings" vs actual "Office Towers") — all null lookups
 *  - Fixing "+120 pts" inflated scores: raw backend counts (e.g. 65 transit stops)
 *    were multiplied directly by rule weights. Fix: normalize by verdict
 *    (PROCEED → 5, NEUTRAL → 2, WEAK → 1) before applying score multiplier
 *  - Adding the competitor row to the live signal matrix using closeCompetitorCount
 *  - Sorting signals by score ascending so most harmful signals appear first
 *  - Wiring transit count from the live signalMatrix rather than neighborCounts
 *
 * How it works:
 *  - When dataSource === "live", builds Signal[] from backend signalMatrix + closeCompetitorCount
 *  - When dataSource === "mock", falls back to scoreNeighbors() from conflictMatrix.ts
 *  - The grade dial uses snapshot.liveScore (0–100 from backend), not the frontend matrix sum
 *  - BACKEND_LABEL_TO_KEY maps exact backend SIGNAL_BUCKETS labels → RULES_BY_CATEGORY keys
 */

import { MarketSnapshot } from "@/data/mockMarket";
import { BusinessType } from "@/data/businessTypes";
import {
  scoreNeighbors,
  overallScore,
  RULES_BY_CATEGORY,
  verdictLabel,
  verdictTone,
  Verdict,
  Signal,
} from "@/data/conflictMatrix";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

interface Step5Props {
  type: BusinessType;
  subtypeId: string;
  snapshot: MarketSnapshot;
  pin: { lat: number; lng: number };
  cityLabel: string;
}

const Metric = ({
  label,
  value,
  unit,
  hint,
  delay = 0,
}: {
  label: string;
  value: string;
  unit?: string;
  hint?: string;
  delay?: number;
}) => (
  <motion.div
    initial={{ opacity: 0, y: 12 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ delay }}
    className="data-card"
  >
    <div className="data-tag">{label}</div>
    <div className="mt-2 flex items-baseline gap-1 flex-wrap">
      <span className="display-num text-4xl md:text-5xl text-ink">{value}</span>
      {unit && <span className="font-mono text-xs text-muted-foreground">{unit}</span>}
    </div>
    {hint && <div className="text-xs text-muted-foreground mt-2">{hint}</div>}
  </motion.div>
);

const ScoreDial = ({
  score,
  grade,
  verdict,
  liveScore,
  liveGrade,
}: {
  score: number;
  grade: string;
  verdict: Verdict;
  liveScore?: number;
  liveGrade?: string;
}) => {
  // Prefer live backend score (0–100 scale); fall back to client conflict-matrix score
  const displayScore = liveScore ?? Math.max(0, Math.min(100, (score + 100) / 2));
  const displayGrade = liveGrade ?? grade;
  const pct          = liveScore !== undefined ? liveScore : Math.max(0, Math.min(100, (score + 100) / 2));

  return (
    <div className="data-card relative overflow-hidden">
      <div className="data-tag">LOCWISE SCORE</div>
      <div className="mt-3 flex items-end gap-4">
        <div className="display-num text-7xl text-ink leading-none">{displayGrade}</div>
        <div className="pb-2">
          <div className="font-mono text-xs tabular-nums text-muted-foreground">
            {displayScore} / 100
          </div>
          <div className={cn("stamp mt-1", verdictTone(verdict))}>
            ◉ {verdictLabel(verdict)}
          </div>
        </div>
      </div>
      <div className="mt-5 h-1.5 bg-paper-deep relative overflow-hidden">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 1.2, ease: "easeOut" }}
          className="h-full bg-gradient-signal"
        />
        <div className="absolute top-0 bottom-0 left-1/2 w-px bg-ink/40" />
      </div>
      <div className="mt-1 flex justify-between font-mono text-[9px] text-muted-foreground">
        <span>AVOID</span><span>NEUTRAL</span><span>GREAT</span>
      </div>
    </div>
  );
};

export const Step5Dashboard = ({
  type,
  subtypeId,
  snapshot,
  pin,
  cityLabel,
}: Step5Props) => {
  const subtype = type.subtypes.find((s) => s.id === subtypeId)!;

  // Backend label → frontend neighborCounts key mapping (matches server.py SIGNAL_BUCKETS exactly)
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

  const categoryRules = RULES_BY_CATEGORY[type.id] ?? RULES_BY_CATEGORY.restaurant;

  // Build display-ready signals from real backend matrix when live,
  // using backend verdict to normalise the score (not raw counts which cause +120pt nonsense)
  const clientSignals: Signal[] = snapshot.dataSource === "live" && snapshot.signalMatrix.length > 0
    ? [
        // Map each backend signal row into a display Signal
        ...snapshot.signalMatrix.map((row) => {
          const key  = BACKEND_LABEL_TO_KEY[row.label] ?? null;
          const rule = key ? categoryRules[key] : null;
          // Normalise: PROCEED = strong (×5), NEUTRAL = moderate (×2), WEAK = minor (×1)
          const normCount = row.verdict === "PROCEED" ? 5 : row.verdict === "NEUTRAL" ? 2 : 1;
          const pts  = rule ? rule.score * normCount : 0;
          return {
            id:      key ?? row.label,
            label:   rule?.label ?? row.label,
            count:   row.count,   // show real POI count from DB
            score:   pts,
            verdict: (pts >= 15 ? "great" : pts >= 0 ? "proceed" : pts >= -15 ? "caution" : "avoid") as Verdict,
            reason:  rule?.reason ?? "",
            impact:  `${pts > 0 ? "+" : ""}${pts} pts`,
          };
        }),
        // Competitor row using real close-competitor count from DB
        {
          id:      "competitor",
          label:   categoryRules.competitor?.label ?? "Direct Competitors",
          count:   snapshot.closeCompetitorCount,
          score:   Math.max(-60, categoryRules.competitor?.score ?? -16) *
                   (snapshot.closeCompetitorCount >= 10 ? 5 : snapshot.closeCompetitorCount >= 3 ? 3 : 1),
          verdict: snapshot.closeCompetitorCount >= 10 ? "avoid" : snapshot.closeCompetitorCount >= 3 ? "caution" : "proceed" as Verdict,
          reason:  categoryRules.competitor?.reason ?? "Direct rivals nearby split your customer base.",
          impact:  "",
        },
      ].map(s => ({ ...s, impact: `${s.score > 0 ? "+" : ""}${s.score} pts` }))
      .sort((a, b) => a.score - b.score)
    : scoreNeighbors(type.id, subtypeId, snapshot.neighborCounts);

  const overall = overallScore(clientSignals);

  // Transit count — from live signal matrix or mock
  const transitCount = snapshot.dataSource === "live"
    ? (snapshot.signalMatrix.find(r => r.label === "Transit / Commuter")?.count ?? 0)
    : (snapshot.neighborCounts.transit ?? 0);
  const transitProximity =
    transitCount >= 3 ? "Excellent" : transitCount === 2 ? "Strong" : transitCount === 1 ? "Moderate" : "Limited";
  const transitDistance =
    transitCount >= 3 ? "< 100m" : transitCount === 2 ? "~ 200m" : transitCount === 1 ? "~ 400m" : "> 600m";
  const transitUplift =
    transitCount >= 3 ? "+18–24%" : transitCount === 2 ? "+10–15%" : transitCount === 1 ? "+4–7%" : "—";

  const isLive = snapshot.dataSource === "live";

  return (
    <div className="space-y-8">
      {/* Header strip */}
      <div className="border border-border-strong bg-ink text-background p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="font-mono text-[10px] uppercase tracking-widest text-background/60">
            Intelligence Report
          </div>
          <div className="font-display text-2xl md:text-3xl font-semibold mt-1">
            {subtype.label} · {type.label}
          </div>
          <div className="font-mono text-xs text-background/70 mt-1 tabular-nums">
            {cityLabel} · {pin.lat.toFixed(4)}°, {pin.lng.toFixed(4)}°
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className={`size-2 rounded-full animate-blink ${isLive ? "bg-signal-green" : "bg-signal-amber"}`} />
          <span className="font-mono text-[10px] uppercase tracking-widest text-background/80">
            {isLive ? "Live · 267K Sydney POIs" : "Estimated · Sydney benchmarks"}
          </span>
        </div>
      </div>

      {/* Score + key metrics — Section 01 */}
      <div>
        <div className="data-tag mb-3">Section 01 — Location Score</div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <ScoreDial
            score={overall.score}
            grade={overall.grade}
            verdict={overall.verdict}
            liveScore={snapshot.liveScore}
            liveGrade={snapshot.liveGrade}
          />
          <div className="grid grid-cols-2 gap-4">
            <Metric
              label="Competitors (1km)"
              value={String(snapshot.competitorCount)}
              unit="businesses"
              delay={0.1}
            />
            <Metric
              label="Closest rivals (300m)"
              value={String(snapshot.closeCompetitorCount)}
              unit="businesses"
              delay={0.15}
            />
            <Metric
              label="2-Year Survival"
              value={`${snapshot.successRate2yr}%`}
              hint={`${type.label.toLowerCase()} category — Sydney CSV data`}
              delay={0.2}
            />
            <Metric
              label="Foot Traffic"
              value={snapshot.footTraffic}
              hint={isLive ? `${snapshot.poiCount500m} POIs within 500m` : "estimated"}
              delay={0.25}
            />
          </div>
        </div>
      </div>

      {/* Revenue projection — Section 02 */}
      <div>
        <div className="data-tag mb-3">Section 02 — Revenue Projection</div>
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="border border-border-strong bg-card relative overflow-hidden"
        >
          <div className="absolute inset-0 bg-gradient-signal opacity-[0.04] pointer-events-none" />
          <div className="grid grid-cols-1 md:grid-cols-[1.4fr_1fr] gap-px bg-border-strong">
            <div className="bg-card p-6 md:p-8 relative">
              <div className="flex items-center justify-between">
                <div className="data-tag">Projected Monthly Revenue</div>
                <span className="stamp text-ink">◉ AUD · MODEL v0.1</span>
              </div>
              <div className="mt-4 flex items-baseline gap-3 flex-wrap">
                <span className="display-num text-5xl md:text-6xl text-ink leading-none tabular-nums">
                  A${(snapshot.expectedRevenueMin / 1000).toFixed(0)}K
                </span>
                <span className="font-display text-3xl text-muted-foreground leading-none">—</span>
                <span className="display-num text-5xl md:text-6xl text-ink leading-none tabular-nums">
                  A${(snapshot.expectedRevenueMax / 1000).toFixed(0)}K
                </span>
                <span className="font-mono text-xs text-muted-foreground self-end pb-2">/mo</span>
              </div>
              <div className="mt-3 text-xs text-muted-foreground">
                Modelled from Sydney category benchmarks · foot traffic · competitor density.
                Survival rate ({snapshot.successRate2yr}%) sourced from sydney_with_clean_categories.csv.
              </div>
              <div className="mt-6">
                <div className="flex justify-between font-mono text-[10px] uppercase tracking-widest text-muted-foreground mb-1.5">
                  <span>Conservative</span>
                  <span>Optimistic</span>
                </div>
                <div className="h-2 bg-paper-deep relative">
                  <motion.div
                    initial={{ scaleX: 0 }}
                    animate={{ scaleX: 1 }}
                    transition={{ duration: 1, ease: "easeOut", delay: 0.4 }}
                    style={{ originX: 0 }}
                    className="absolute inset-y-0 left-[15%] right-[15%] bg-ink"
                  />
                  <div className="absolute top-1/2 -translate-y-1/2 left-[15%] size-3 bg-ink border-2 border-paper" />
                  <div className="absolute top-1/2 -translate-y-1/2 right-[15%] size-3 bg-ink border-2 border-paper" />
                </div>
              </div>
            </div>
            <div className="bg-paper p-6 md:p-8 grid grid-cols-2 md:grid-cols-1 gap-4 content-between">
              <div>
                <div className="data-tag">Annual Midpoint</div>
                <div className="display-num text-3xl text-ink mt-1 tabular-nums">
                  A${(((snapshot.expectedRevenueMin + snapshot.expectedRevenueMax) / 2 * 12) / 1000).toFixed(0)}K
                </div>
                <div className="font-mono text-[10px] text-muted-foreground mt-1">/yr · gross</div>
              </div>
              <div>
                <div className="data-tag">Avg Rent</div>
                <div className="display-num text-3xl text-ink mt-1 tabular-nums">
                  A${snapshot.avgRentPerSqm}
                </div>
                <div className="font-mono text-[10px] text-muted-foreground mt-1">/sqm/mo · estimated</div>
              </div>
            </div>
          </div>
        </motion.div>
      </div>

      {/* Demographic strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-px bg-border-strong border border-border-strong">
        {[
          { l: "MEDIAN INCOME", v: `A$${snapshot.medianIncome.toLocaleString()}` },
          { l: "POP DENSITY", v: `${snapshot.populationDensity.toLocaleString()}/km²` },
          { l: "SAFETY INDEX", v: `${snapshot.safetyScore}/100` },
          { l: "POIs (500m)", v: isLive ? snapshot.poiCount500m.toLocaleString() : "~" + snapshot.poiCount500m },
        ].map((s) => (
          <div key={s.l} className="bg-paper px-4 py-3">
            <div className="data-tag">{s.l}</div>
            <div className="font-display font-semibold text-ink mt-0.5">{s.v}</div>
          </div>
        ))}
      </div>

      {/* Transit callout */}
      {transitCount > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.35 }}
          className="border border-border-strong bg-card relative overflow-hidden"
        >
          <div className="absolute inset-y-0 left-0 w-1.5 bg-accent" />
          <div className="grid grid-cols-1 md:grid-cols-[1.3fr_1fr] gap-px bg-border-strong">
            <div className="bg-card p-6 md:p-7 pl-7 md:pl-8">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div className="data-tag text-accent">Transit Advantage</div>
                <span className="stamp border-accent text-accent">◉ {transitProximity.toUpperCase()}</span>
              </div>
              <h3 className="font-display text-xl md:text-2xl font-semibold text-ink mt-2">
                {transitCount} transit {transitCount === 1 ? "stop" : "stops"} within walking distance
              </h3>
              <ul className="mt-4 space-y-1.5 text-sm text-ink">
                <li className="flex gap-2"><span className="text-accent font-mono">→</span>Lower customer acquisition cost — discovery is free.</li>
                <li className="flex gap-2"><span className="text-accent font-mono">→</span>Wider catchment without depending on parking.</li>
                <li className="flex gap-2"><span className="text-accent font-mono">→</span>Stronger weekday lunch + after-work demand.</li>
              </ul>
            </div>
            <div className="bg-paper p-6 md:p-7 grid grid-cols-2 md:grid-cols-1 gap-4 content-between">
              <div>
                <div className="data-tag">Nearest Stop</div>
                <div className="display-num text-2xl text-ink mt-1 tabular-nums">{transitDistance}</div>
                <div className="font-mono text-[10px] text-muted-foreground mt-1">walking</div>
              </div>
              <div>
                <div className="data-tag">Revenue Uplift</div>
                <div className="display-num text-2xl text-accent mt-1 tabular-nums">{transitUplift}</div>
                <div className="font-mono text-[10px] text-muted-foreground mt-1">vs. car-only sites</div>
              </div>
            </div>
          </div>
        </motion.div>
      )}

      {/* Advanced Analytics — Section 02b */}
      <div>
        <div className="data-tag mb-3">Section 02b — Market Analytics</div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-px bg-border-strong border border-border-strong">
          {[
            {
              l: "MARKET SATURATION",
              v: snapshot.marketSaturationIndex.toFixed(2) + "×",
              hint: snapshot.marketSaturationIndex < 0.7
                ? "Undersaturated — opportunity"
                : snapshot.marketSaturationIndex > 1.3
                ? "Oversaturated — risky"
                : "Normal competitive density",
            },
            {
              l: "COMPETITIVE MOAT",
              v: `${snapshot.competitiveMoatScore}/100`,
              hint: snapshot.competitiveMoatScore >= 70
                ? "Strong moat — few nearby rivals"
                : snapshot.competitiveMoatScore >= 40
                ? "Moderate moat"
                : "Weak moat — crowded area",
            },
            {
              l: "BREAK-EVEN",
              v: snapshot.breakevenMonths >= 999
                ? "N/A"
                : `${snapshot.breakevenMonths} mo`,
              hint: snapshot.breakevenMonths >= 999
                ? "Review revenue assumptions"
                : "Est. months to recover setup cost",
            },
            {
              l: "ANNUAL MIDPOINT",
              v: `A$${Math.round(snapshot.annualRevenueMidpoint / 1000)}K`,
              hint: "Gross revenue midpoint / year",
            },
          ].map((s) => (
            <motion.div
              key={s.l}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.28 }}
              className="bg-paper px-4 py-4"
            >
              <div className="data-tag">{s.l}</div>
              <div className="font-display font-semibold text-ink mt-0.5 text-xl">{s.v}</div>
              {s.hint && <div className="text-[10px] text-muted-foreground mt-1 font-mono">{s.hint}</div>}
            </motion.div>
          ))}
        </div>
      </div>

      {/* Conflict & Synergy Matrix — Section 03 */}
      <div>
        <div className="flex items-baseline justify-between mb-4">
          <div>
            <div className="data-tag">Section 03</div>
            <h2 className="font-display text-2xl font-semibold text-ink mt-1">
              Conflict & Synergy Matrix
            </h2>
          </div>
          <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
            Scoring against {subtype.label} profile
          </div>
        </div>
        <div className="border border-border-strong">
          <div className="grid grid-cols-[1fr_60px_80px_100px] gap-4 px-4 py-2 bg-ink text-background font-mono text-[10px] uppercase tracking-widest">
            <span>Nearby Signal</span>
            <span className="text-right">Count</span>
            <span className="text-right">Impact</span>
            <span className="text-right">Verdict</span>
          </div>
          {clientSignals.map((s, i) => (
            <motion.div
              key={s.id}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.3 + i * 0.04 }}
              className="grid grid-cols-[1fr_60px_80px_100px] gap-4 px-4 py-3 border-t border-border bg-card hover:bg-paper-deep/30 transition-colors"
            >
              <div>
                <div className="font-display font-semibold text-ink">{s.label}</div>
                <div className="text-xs text-muted-foreground mt-0.5">{s.reason}</div>
              </div>
              <div className="text-right font-mono tabular-nums text-ink self-center">{s.count}</div>
              <div className={cn(
                "text-right font-mono tabular-nums text-sm font-semibold self-center",
                s.score > 0 ? "text-signal-green" : s.score < 0 ? "text-signal-red" : "text-muted-foreground"
              )}>{s.impact}</div>
              <div className="text-right self-center">
                <span className={cn("stamp", verdictTone(s.verdict))}>{verdictLabel(s.verdict)}</span>
              </div>
            </motion.div>
          ))}
        </div>
      </div>

      {/* Nearest Competitors — Section 04 (live backend only) */}
      {isLive && snapshot.nearestCompetitors.length > 0 && (
        <div>
          <div className="flex items-baseline justify-between mb-4">
            <div>
              <div className="data-tag">Section 04 · Live CSV Data</div>
              <h2 className="font-display text-2xl font-semibold text-ink mt-1">
                Nearest Competitors
              </h2>
            </div>
            <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
              Real businesses from sydney_with_clean_categories.csv
            </div>
          </div>
          <div className="border border-border-strong">
            <div className="grid grid-cols-[auto_1fr_auto] gap-4 px-4 py-2 bg-ink text-background font-mono text-[10px] uppercase tracking-widest">
              <span>Distance</span>
              <span>Business</span>
              <span className="text-right">Locality</span>
            </div>
            {snapshot.nearestCompetitors.slice(0, 8).map((c, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.3 + i * 0.05 }}
                className="grid grid-cols-[auto_1fr_auto] gap-4 px-4 py-3 border-t border-border bg-card hover:bg-paper-deep/30 transition-colors"
              >
                <div className="font-mono text-sm tabular-nums text-accent font-semibold self-center">
                  {c.distance_m}m
                </div>
                <div>
                  <div className="font-display font-semibold text-ink">{c.name}</div>
                  <div className="text-xs text-muted-foreground mt-0.5 truncate max-w-xs">
                    {c.category_text.split(" | ")[0]}
                  </div>
                </div>
                <div className="text-right self-center font-mono text-xs text-muted-foreground">
                  {c.locality || "Sydney"}
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
