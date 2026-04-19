/**
 * LOCWISE — Main Wizard Controller
 *
 * AI Acknowledgement:
 * This file was developed with AI assistance (Claude by Anthropic) for:
 *  - Debugging the two-score system (frontend conflict matrix vs. backend live score)
 *  - Fixing the auto-advance flow after address search (autoAdvance flag)
 *  - Mapping backend AnalysisResponse fields to the MarketSnapshot shape
 *  - Resolving CORS issues between the Vite dev server (port 8082) and Flask (port 8000)
 *
 * Architecture:
 *  - 6-step wizard controlled entirely here via React useState
 *  - mockSnapshot is always computed as a fallback (deterministic hash of lat/lng/subtype)
 *  - liveSnapshot is populated from the Flask backend when available; merged on top of mock
 *  - The displayed snapshot 
 */
import { useMemo, useState } from "react";
import { AnimatePresence } from "framer-motion";
import { StepHeader } from "@/components/StepHeader";
import { StepShell } from "@/components/StepShell";
import { Step1Category } from "@/components/wizard/Step1Category";
import { Step2Subtype } from "@/components/wizard/Step2Subtype";
import { Step3City } from "@/components/wizard/Step3City";
import { Step4Map } from "@/components/wizard/Step4Map";
import { Step5Dashboard } from "@/components/wizard/Step5Dashboard";
import { Step6AINarrative } from "@/components/wizard/Step6AINarrative";
import { BusinessCategory, getType } from "@/data/businessTypes";
import { getMarketSnapshot } from "@/data/mockMarket";
import { analyzeLocation } from "@/lib/api";
import { Button } from "@/components/ui/button";

const STEPS = [
  { id: 1, label: "Category" },
  { id: 2, label: "Subtype" },
  { id: 3, label: "City" },
  { id: 4, label: "Pin" },
  { id: 5, label: "Dashboard" },
  { id: 6, label: "Verdict" },
];

const Hero = ({ onStart }: { onStart: () => void }) => (
  <section className="relative overflow-hidden border-b border-border-strong">
    <div className="absolute inset-0 contour-bg pointer-events-none" />
    <div className="container relative py-20 md:py-28">
      <div className="max-w-4xl">
        <div className="flex items-center gap-3 mb-6">
          <span className="stamp text-ink">◎ LOCWISE · V0.1</span>
          <span className="data-tag">Location intelligence for entrepreneurs</span>
        </div>
        <h1 className="font-display text-5xl md:text-7xl lg:text-8xl font-semibold tracking-tight text-ink leading-[0.95]">
          Should you open <em className="text-primary not-italic">here</em> —
          and will you <em className="text-primary not-italic">survive</em>?
        </h1>
        <p className="mt-8 md:text-xl text-ink-soft max-w-2xl leading-relaxed my-[35px] text-xl">
          The location intelligence that McDonald's spends millions on — now available to any entrepreneur in 6 steps, under 5 minutes, before you sign a lease.
        </p>
        <div className="mt-10 flex flex-col sm:flex-row gap-3">
          <Button
            onClick={onStart}
            className="h-14 px-8 rounded-none font-mono text-xs uppercase tracking-widest bg-accent hover:bg-accent/90 text-accent-foreground shadow-[0_8px_24px_hsl(var(--accent)/0.35)]"
          >
            Begin Analysis →
          </Button>
          <a
            href="#how"
            className="h-14 px-8 inline-flex items-center font-mono text-xs uppercase tracking-widest border border-border-strong text-ink hover:bg-paper-deep transition-colors"
          >
            How it works
          </a>
        </div>

        <div className="mt-16 grid grid-cols-2 md:grid-cols-4 gap-px bg-border-strong border border-border-strong max-w-3xl">
          {[
            { l: "BUSINESS TYPES", v: "12 categories" },
            { l: "SUBTYPES", v: "100+" },
            { l: "SYDNEY POIs", v: "267K+" },
            { l: "VERDICT TIME", v: "< 5 min" },
          ].map((s) => (
            <div key={s.l} className="bg-paper px-4 py-4">
              <div className="data-tag">{s.l}</div>
              <div className="font-display font-semibold text-ink mt-1">{s.v}</div>
            </div>
          ))}
        </div>
      </div>
    </div>

    <div id="how" className="container relative pb-20 md:pb-28">
      <div className="border-t border-border-strong pt-12 grid grid-cols-1 md:grid-cols-3 gap-px bg-border-strong border border-border-strong">
        {[
          {
            n: "01",
            t: "Specificity, not generic.",
            d: "Your exact business type changes everything. Thai restaurant vs. Italian. Boutique gym vs. big-box. The verdict is specific to your concept.",
          },
          {
            n: "02",
            t: "The conflict matrix.",
            d: "Who's around you matters as much as where you are. Gyms near fast food, offices near cafés — the matrix scores every signal.",
          },
          {
            n: "03",
            t: "Real Sydney data.",
            d: "267K+ businesses across Greater Sydney. Survival rates, competitor density, and nearest rivals — all from live location data.",
          },
        ].map((c) => (
          <div key={c.n} className="bg-paper p-8">
            <div className="font-mono text-xs text-muted-foreground tabular-nums mb-4">{c.n}</div>
            <h3 className="font-display text-2xl font-semibold text-ink leading-tight">{c.t}</h3>
            <p className="mt-3 text-sm text-ink-soft leading-relaxed">{c.d}</p>
          </div>
        ))}
      </div>
    </div>
  </section>
);

const Index = () => {
  const [showHero, setShowHero] = useState(true);
  const [step, setStep] = useState(1);
  const [category, setCategory] = useState<BusinessCategory | null>(null);
  const [subtype, setSubtype] = useState<string | null>(null);
  const [cityLabel, setCityLabel] = useState("Sydney, AU");
  // Default map center: Sydney CBD (-33.8688, 151.2093)
  const [center, setCenter] = useState<{ lat: number; lng: number }>({
    lat: -33.8688,
    lng: 151.2093,
  });
  const [pin, setPin] = useState<{ lat: number; lng: number } | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [backendError, setBackendError] = useState<string | null>(null);

  const type = category ? getType(category) : null;

  // Mock snapshot — always computed, used as fallback when backend unavailable
  const mockSnapshot = useMemo(
    () =>
      pin && category && subtype
        ? getMarketSnapshot(pin.lat, pin.lng, category, subtype)
        : null,
    [pin, category, subtype]
  );

  // Live snapshot — populated from backend API (real CSV data) when available
  const [liveSnapshot, setLiveSnapshot] = useState<ReturnType<typeof getMarketSnapshot> | null>(null);

  // Use live data if available, otherwise fall back to mock
  const snapshot = liveSnapshot ?? mockSnapshot;

  const handleCityConfirm = (label: string, lat: number, lng: number) => {
    setCityLabel(label);
    setCenter({ lat, lng });
    setStep(4);
  };

  const handlePinAndAnalyze = async (pos: { lat: number; lng: number }, autoAdvance = false) => {
    if (!category || !subtype) return;

    setPin(pos);
    setBackendError(null);
    setLiveSnapshot(null);
    setIsAnalyzing(true);

    try {
      const result = await analyzeLocation({
        category,
        subtype,
        lat: pos.lat,
        lng: pos.lng,
      });

      // Map backend AnalysisResponse → MarketSnapshot shape
      const mock = getMarketSnapshot(pos.lat, pos.lng, category, subtype);
      setLiveSnapshot({
        ...mock,
        competitorCount:       result.direct_competitors_1km,
        closeCompetitorCount:  result.close_competitors_300m,
        successRate2yr:        result.survival_rate_2y,
        footTraffic:           result.foot_traffic_proxy as "Low" | "Moderate" | "High" | "Very High",
        avgRentPerSqm:         result.avg_rent_aud_per_sqm,
        expectedRevenueMin:    result.projected_revenue_aud_min,
        expectedRevenueMax:    result.projected_revenue_aud_max,
        annualRevenueMidpoint: result.annual_revenue_midpoint_aud,
        poiCount500m:          result.poi_count_500m,
        nearestCompetitors:    result.nearest_competitors,
        signalMatrix:          result.matrix,
        dataSource:            "live" as const,
        // Advanced analytics from math formulas
        marketSaturationIndex: result.market_saturation_index,
        competitiveMoatScore:  result.competitive_moat_score,
        breakevenMonths:       result.breakeven_months,
        liveScore:             result.score,
        liveGrade:             result.grade,
      });
    } catch {
      // Backend unavailable — silently use mock data
      setBackendError("Backend offline — showing estimated data");
    }

    setIsAnalyzing(false);
    if (autoAdvance) setStep(5);
  };

  const handleRestart = () => {
    setStep(1);
    setCategory(null);
    setSubtype(null);
    setCityLabel("Sydney, AU");
    setCenter({ lat: -33.8688, lng: 151.2093 });
    setPin(null);
    setLiveSnapshot(null);
    setBackendError(null);
    setIsAnalyzing(false);
    setShowHero(true);
  };

  const navFooter = (canNext: boolean, onNext: () => void, onBack?: () => void) => (
    <>
      <button
        onClick={onBack ?? (() => setStep((s) => s - 1))}
        className="font-mono text-xs uppercase tracking-widest text-muted-foreground hover:text-ink transition-colors"
      >
        ← Back
      </button>
      <Button
        onClick={onNext}
        disabled={!canNext || isAnalyzing}
        className="rounded-none font-mono text-xs uppercase tracking-widest bg-accent hover:bg-accent/90 text-accent-foreground px-6 h-11 shadow-[0_6px_18px_hsl(var(--accent)/0.30)] disabled:shadow-none"
      >
        {isAnalyzing ? "Analysing…" : "Continue →"}
      </Button>
    </>
  );

  if (showHero) {
    return (
      <main className="min-h-screen bg-background">
        <StepHeader steps={STEPS} current={0} />
        <Hero onStart={() => setShowHero(false)} />
        <footer className="container py-10 flex items-center justify-between border-t border-border">
          <div className="data-tag">© LOCWISE</div>
          <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
            Sydney · 267K+ POIs · v0.1
          </div>
        </footer>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-background">
      <StepHeader steps={STEPS} current={step} />
      <AnimatePresence mode="wait">
        {step === 1 && (
          <StepShell
            key="s1"
            stepNumber={1}
            totalSteps={6}
            eyebrow="Choose your category"
            title="What kind of business are you opening?"
            description="Pick the broad category. We'll ask for the specifics next — the more precise you are, the sharper the verdict."
            footer={navFooter(!!category, () => setStep(2), () => setShowHero(true))}
          >
            <Step1Category selected={category} onSelect={setCategory} />
          </StepShell>
        )}

        {step === 2 && type && (
          <StepShell
            key="s2"
            stepNumber={2}
            totalSteps={6}
            eyebrow="Get specific"
            title={`What kind of ${type.label.toLowerCase()}, exactly?`}
            description="The more specific you are, the sharper your verdict."
            footer={navFooter(!!subtype, () => setStep(3))}
          >
            <Step2Subtype type={type} selected={subtype} onSelect={setSubtype} />
          </StepShell>
        )}

        {step === 3 && (
          <StepShell
            key="s3"
            stepNumber={3}
            totalSteps={6}
            eyebrow="Pick a market"
            title="Which suburb are you targeting?"
            description="Search any Sydney suburb or address. You'll drop a precise pin on the map next."
            footer={navFooter(false, () => {}, () => setStep(2))}
          >
            <Step3City defaultCity={cityLabel} onConfirm={handleCityConfirm} />
          </StepShell>
        )}

        {step === 4 && (
          <StepShell
            key="s4"
            stepNumber={4}
            totalSteps={6}
            eyebrow="Drop your pin"
            title="Pin the exact location."
            description="Click anywhere on the map. Be specific — different blocks, different verdicts."
            footer={navFooter(!!pin && !isAnalyzing, () => setStep(5))}
          >
            <Step4Map
              initialCenter={center}
              pin={pin}
              onPin={handlePinAndAnalyze}
            />
            {backendError && (
              <p className="mt-2 font-mono text-[10px] text-signal-amber uppercase tracking-widest">
                ⚠ {backendError}
              </p>
            )}
          </StepShell>
        )}

        {step === 5 && type && subtype && pin && snapshot && (
          <StepShell
            key="s5"
            stepNumber={5}
            totalSteps={6}
            eyebrow="LOCWISE"
            title="The numbers, the signals, the matrix."
            description="Competitor density, survival rates, and the conflict matrix — scored against your exact concept."
            footer={navFooter(true, () => setStep(6))}
          >
            <Step5Dashboard
              type={type}
              subtypeId={subtype}
              snapshot={snapshot}
              pin={pin}
              cityLabel={cityLabel || "Selected location"}
            />
          </StepShell>
        )}

        {step === 6 && type && subtype && snapshot && pin && (
          <StepShell
            key="s6"
            stepNumber={6}
            totalSteps={6}
            eyebrow="The verdict"
            title="Should you open here?"
            description="A plain-English recommendation built from your numbers and the conflict matrix."
          >
            <Step6AINarrative
              type={type}
              subtypeId={subtype}
              snapshot={snapshot}
              cityLabel={cityLabel || "this location"}
              pin={pin}
              onRestart={handleRestart}
            />
          </StepShell>
        )}
      </AnimatePresence>

      <footer className="container py-10 flex items-center justify-between border-t border-border mt-8">
        <div className="data-tag">© LOCWISE · FIELD EDITION</div>
        <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
          Sydney · 267K+ POIs · v0.1
        </div>
      </footer>
    </main>
  );
};

export default Index;
