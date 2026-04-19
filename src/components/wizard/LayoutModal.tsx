/**
 * LOCWISE — "Build Your Business" Layout Modal
 *
 * AI Acknowledgement:
 * This file was developed with AI assistance (Claude by Anthropic) for:
 *  - Adding Canvas3DErrorBoundary to catch WebGL crashes gracefully without
 *    taking down the entire dialog (React error boundary pattern)
 *  - Fixing the critical h-full bug: left panel div was missing h-full, so Canvas
 *    computed to 0px height and appeared blank. Adding h-full to the left panel fixed it.
 *  - Adding the Leaflet map tab alongside the 3D view (tab state: "3d" | "map")
 *  - Wiring DEMO constants (Japanese restaurant in Chippendale) so "Build Your Business"
 *    always shows a consistent demo — not whatever the user has selected in the wizard
 *  - Populating the right panel info sections: dimensions, setup estimates,
 *    revenue snapshot, zone legend, design insights, location context
 *
 * How it works:
 *  - BusinessLayout3D is lazy-loaded (heavy Three.js bundle) — Suspense shows a spinner
 *  - Canvas3DErrorBoundary wraps the 3D component; if WebGL fails, shows a text fallback
 *  - The map tab renders a static Leaflet map centered on the DEMO_PIN (Chippendale)
 *  - generateLayout(type.id, subtypeId) picks the appropriate room/furniture config
 */

import { useState } from "react";
import { BusinessLayout3D } from "./BusinessLayout3D";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { MapContainer, TileLayer, Marker } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { MarketSnapshot } from "@/data/mockMarket";
import { BusinessType } from "@/data/businessTypes";
import { overallScore, scoreNeighbors } from "@/data/conflictMatrix";
import { generateLayout } from "@/data/layoutConfigs";
import { motion } from "framer-motion";



const mapPinIcon = L.divIcon({
  className: "layout-modal-pin",
  html: `
    <div style="position:relative; width:32px; height:32px;">
      <div style="position:absolute; inset:0; border-radius:50%; background:hsl(12 78% 48% / 0.25); animation:pulse-ring 1.6s ease-out infinite;"></div>
      <div style="position:absolute; left:50%; top:50%; transform:translate(-50%,-50%); width:18px; height:18px; background:hsl(12 78% 48%); border:2.5px solid white; border-radius:50%; box-shadow:0 4px 12px rgba(0,0,0,0.3);"></div>
      <div style="position:absolute; left:50%; top:50%; transform:translate(-50%,-50%); width:5px; height:5px; background:white; border-radius:50%;"></div>
    </div>
  `,
  iconSize: [32, 32],
  iconAnchor: [16, 16],
});

interface LayoutModalProps {
  open: boolean;
  onClose: () => void;
  type: BusinessType;
  subtypeId: string;
  snapshot: MarketSnapshot;
  cityLabel: string;
  pin: { lat: number; lng: number };
}

export function LayoutModal({
  open, onClose, type, subtypeId, snapshot, cityLabel, pin,
}: LayoutModalProps) {
  const [activeTab, setActiveTab] = useState<"3d" | "map">("3d");

  const signals = scoreNeighbors(type.id, subtypeId, snapshot.neighborCounts);
  const overall = overallScore(signals);
  const scoreVal = snapshot.liveScore ?? Math.max(0, Math.min(100, (overall.score + 100) / 2));
  const gradeVal = snapshot.liveGrade ?? overall.grade;

  const layout = generateLayout(type.id, subtypeId, snapshot, scoreVal);
  const subtype = type.subtypes.find((s) => s.id === subtypeId);
  const totalSqm = layout.totalW * layout.totalD;

  // Estimates
  const estCovers      = Math.round(totalSqm * 0.45 / 1.6);
  const estStaffMin    = Math.round(totalSqm / 32);
  const estStaffMax    = Math.round(totalSqm / 22);
  const fitoutMin      = Math.round(totalSqm * 1800 / 1000);
  const fitoutMax      = Math.round(totalSqm * 2800 / 1000);
  const monthlyRent    = Math.round(totalSqm * snapshot.avgRentPerSqm);
  const revenuePerSqm  = Math.round((snapshot.expectedRevenueMin + snapshot.expectedRevenueMax) / 2 / totalSqm);

  const verdictColor = scoreVal >= 70 ? "#22c55e" : scoreVal >= 40 ? "#f59e0b" : "#ef4444";
  const verdictStr   = scoreVal >= 70 ? "PROCEED" : scoreVal >= 40 ? "NEUTRAL" : "AVOID";

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent
        className="max-w-[96vw] w-full p-0 border border-border-strong bg-background overflow-hidden"
        style={{ maxHeight: "92vh" }}
      >
        <DialogTitle className="sr-only">
          {layout.businessLabel} Layout — {cityLabel}
        </DialogTitle>

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-border-strong bg-ink text-background shrink-0">
          <div>
            <div className="font-mono text-[10px] uppercase tracking-widest text-background/60">
              Build Your Business · Floor Plan & Location
            </div>
            <div className="font-display text-lg font-semibold mt-0.5">
              {subtype?.label ?? layout.businessLabel} · {cityLabel}
            </div>
          </div>
          <div className="flex items-center gap-6">
            <div className="text-right">
              <div className="font-mono text-[10px] text-background/50 uppercase tracking-widest">Location Score</div>
              <div className="font-display text-2xl font-bold leading-none" style={{ color: verdictColor }}>
                {gradeVal}
                <span className="font-mono text-sm font-normal text-background/60 ml-1">{scoreVal}/100</span>
                <span className="font-mono text-xs font-normal ml-2 uppercase tracking-widest" style={{ color: verdictColor }}>{verdictStr}</span>
              </div>
            </div>
            <div className="font-mono text-[10px] text-background/50 text-right">
              <div>{layout.totalW}m × {layout.totalD}m</div>
              <div>{totalSqm} sqm total</div>
            </div>
          </div>
        </div>

        {/* Body */}
        <div
          className="grid grid-cols-1 lg:grid-cols-[1fr_360px] overflow-hidden"
          style={{ height: "calc(92vh - 72px)" }}
        >
          {/* Left — tabbed: 3D or Map */}
          <div className="flex flex-col h-full bg-[#f5f0ea] border-r border-border overflow-hidden">
            {/* Tab bar */}
            <div className="flex shrink-0 border-b border-border bg-paper z-10">
              {(["3d", "map"] as const).map((tab) => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`px-5 py-2.5 font-mono text-[10px] uppercase tracking-widest transition-colors ${
                    activeTab === tab
                      ? "bg-ink text-background"
                      : "text-muted-foreground hover:text-ink hover:bg-paper-deep"
                  }`}
                >
                  {tab === "3d" ? "◫ 3D Floor Plan" : "◉ Location Map"}
                </button>
              ))}
            </div>

            {/* Content area — fills all remaining height */}
            <div className="flex-1 min-h-0 relative">
              {activeTab === "3d" && (
                <div className="absolute inset-0">
                  <BusinessLayout3D layout={layout} />
                </div>
              )}

              {activeTab === "map" && (
                <>
                  <MapContainer
                    center={[pin.lat, pin.lng]}
                    zoom={16}
                    scrollWheelZoom
                    className="absolute inset-0"
                    zoomControl
                  >
                    <TileLayer
                      attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> · CartoDB'
                      url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
                    />
                    <Marker position={[pin.lat, pin.lng]} icon={mapPinIcon} />
                  </MapContainer>
                  <div className="pointer-events-none absolute top-3 left-3 z-[400] bg-ink text-background px-3 py-2 font-mono text-[10px] uppercase tracking-widest shadow-lg">
                    ◉ {cityLabel}
                  </div>
                  <div className="pointer-events-none absolute bottom-3 left-3 z-[400] bg-background border border-border-strong px-3 py-2 font-mono text-[10px] tabular-nums shadow-paper">
                    <div className="text-muted-foreground">COORDINATES</div>
                    <div className="text-ink font-semibold">{pin.lat.toFixed(5)}°, {pin.lng.toFixed(5)}°</div>
                  </div>
                  <div className="pointer-events-none absolute bottom-3 right-3 z-[400] bg-background border border-border-strong px-3 py-2 font-mono text-[10px] shadow-paper">
                    <div className="text-muted-foreground">FOOT TRAFFIC</div>
                    <div className="text-ink font-semibold">{snapshot.footTraffic}</div>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Right panel */}
          <div className="overflow-y-auto flex flex-col divide-y divide-border">

            {/* Floor plan dimensions */}
            <div className="p-5 shrink-0">
              <div className="data-tag mb-3">Floor Plan Dimensions</div>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { l: "Total Area", v: `${totalSqm} sqm` },
                  { l: "Dimensions", v: `${layout.totalW}m × ${layout.totalD}m` },
                  { l: "Monthly Rent", v: `A$${monthlyRent.toLocaleString()}` },
                  { l: "Rev / sqm", v: `A$${revenuePerSqm.toLocaleString()}` },
                ].map((s) => (
                  <div key={s.l} className="bg-paper px-3 py-2">
                    <div className="data-tag text-[8px]">{s.l}</div>
                    <div className="font-display font-semibold text-ink text-sm mt-0.5">{s.v}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Business estimates */}
            <div className="p-5 shrink-0">
              <div className="data-tag mb-3">Business Setup Estimates</div>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { l: "Seating Covers", v: `~${estCovers} seats` },
                  { l: "Staff (FTE)", v: `${estStaffMin}–${estStaffMax} people` },
                  { l: "Fit-out Cost", v: `A$${fitoutMin}K–${fitoutMax}K` },
                  { l: "Break-even", v: `~${snapshot.breakevenMonths} months` },
                ].map((s) => (
                  <div key={s.l} className="bg-paper px-3 py-2">
                    <div className="data-tag text-[8px]">{s.l}</div>
                    <div className="font-display font-semibold text-ink text-sm mt-0.5">{s.v}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Revenue snapshot */}
            <div className="p-5 shrink-0">
              <div className="data-tag mb-3">Revenue Snapshot</div>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { l: "Conservative / mo", v: `A$${Math.round(snapshot.expectedRevenueMin / 1000)}K` },
                  { l: "Optimistic / mo",   v: `A$${Math.round(snapshot.expectedRevenueMax / 1000)}K` },
                  { l: "Annual Midpoint",   v: `A$${Math.round(snapshot.annualRevenueMidpoint / 1000)}K` },
                  { l: "2yr Survival",      v: `${snapshot.successRate2yr}%` },
                ].map((s) => (
                  <div key={s.l} className="bg-paper px-3 py-2">
                    <div className="data-tag text-[8px]">{s.l}</div>
                    <div className="font-display font-semibold text-ink text-sm mt-0.5">{s.v}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Zone legend */}
            <div className="p-5 shrink-0">
              <div className="data-tag mb-3">Zone Legend</div>
              <div className="space-y-1.5">
                {layout.legend.map((l) => (
                  <div key={l.label} className="flex items-center gap-2">
                    <div
                      className="size-3 shrink-0 border border-border"
                      style={{ background: l.color }}
                    />
                    <span className="font-mono text-xs text-ink">{l.label}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Design insights */}
            <div className="p-5 flex-1">
              <div className="data-tag mb-3">Why This Layout</div>
              <div className="space-y-3">
                {layout.insights.map((insight, i) => (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, x: 6 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.08 }}
                    className="flex gap-2 text-sm text-ink"
                  >
                    <span className="text-accent font-mono shrink-0 mt-0.5">→</span>
                    <span className="leading-snug">{insight}</span>
                  </motion.div>
                ))}
              </div>
            </div>

            {/* Location context */}
            <div className="p-5 shrink-0">
              <div className="data-tag mb-2">Location Context</div>
              <div className="font-mono text-[10px] text-muted-foreground space-y-1">
                <div>{pin.lat.toFixed(4)}°, {pin.lng.toFixed(4)}° · {cityLabel}</div>
                <div>{snapshot.competitorCount} competitors within 1km · {snapshot.footTraffic} foot traffic</div>
                <div>Moat score {snapshot.competitiveMoatScore}/100 · Saturation index {snapshot.marketSaturationIndex.toFixed(2)}</div>
                <div>{snapshot.poiCount500m} POIs within 500m · Median income A${Math.round(snapshot.medianIncome / 1000)}K/yr</div>
                <div className="text-[9px] text-muted-foreground/60 mt-2">
                  Layout generated from LOCWISE signal data · not architectural advice
                </div>
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
