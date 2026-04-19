/**
 * LOCWISE — PDF Export
 *
 * AI Acknowledgement:
 * This file was developed with AI assistance (Claude by Anthropic) for:
 *  - Designing the print-to-PDF approach: generates complete HTML in a new tab,
 *    then calls window.print() — no server-side PDF library needed
 *  - Applying the same BACKEND_LABEL_TO_KEY normalization as Step5Dashboard so the
 *    matrix table in the PDF matches what the user saw on screen (no discrepancies)
 *  - Writing the @media print CSS in index.css to force background colors to print
 *    and set A4 page margins
 *  - Parsing ━━ section headers from the narrative text and converting them to
 *    bold uppercase headings in the HTML output
 *
 * How it works:
 *  - triggerPDFExport() receives all display data (snapshot, type, narrative text)
 *  - Builds a self-contained HTML string with inline styles (no external CSS)
 *  - Opens it in a new tab (requires pop-ups allowed), then triggers print dialog
 *  - Report includes: header, 8 key metrics, 3 advanced analytics, conflict matrix
 *    table, nearest competitors table, and the full narrative text
 */

import { MarketSnapshot } from "@/data/mockMarket";
import { BusinessType } from "@/data/businessTypes";
import { overallScore, scoreNeighbors, RULES_BY_CATEGORY } from "@/data/conflictMatrix";

interface ExportProps {
  type: BusinessType;
  subtypeId: string;
  snapshot: MarketSnapshot;
  cityLabel: string;
  pin: { lat: number; lng: number };
  mainText: string;
}

export function triggerPDFExport({
  type, subtypeId, snapshot, cityLabel, pin, mainText,
}: ExportProps) {
  const subtype   = type.subtypes.find(s => s.id === subtypeId)!;
  const score     = snapshot.liveScore ?? 50;
  const grade     = snapshot.liveGrade ?? "C";
  const verdict   = score >= 70 ? "PROCEED" : score >= 40 ? "NEUTRAL" : "AVOID";
  const verdictColor = score >= 70 ? "#16a34a" : score >= 40 ? "#d97706" : "#dc2626";
  const revLowK   = Math.round(snapshot.expectedRevenueMin / 1000);
  const revHighK  = Math.round(snapshot.expectedRevenueMax / 1000);
  const revAnnualK = Math.round(snapshot.annualRevenueMidpoint / 1000);
  const today     = new Date().toLocaleDateString("en-AU", { day: "numeric", month: "long", year: "numeric" });

  const BACKEND_LABEL_TO_KEY: Record<string, string> = {
    "Office Towers": "office_tower", "Gyms & Studios": "gym",
    "Bars & Nightlife": "bar", "Schools / Universities": "school",
    "Transit / Commuter": "transit", "Cafés & Dining": "cafe",
    "Health & Medical": "hospital", "Retail Strip": "luxury_retail",
  };

  const categoryRules = RULES_BY_CATEGORY[type.id] ?? RULES_BY_CATEGORY.restaurant;

  const matrixRows = snapshot.dataSource === "live" && snapshot.signalMatrix.length > 0
    ? [
        ...snapshot.signalMatrix.map(row => {
          const key  = BACKEND_LABEL_TO_KEY[row.label] ?? null;
          const rule = key ? categoryRules[key] : null;
          const norm = row.verdict === "PROCEED" ? 5 : row.verdict === "NEUTRAL" ? 2 : 1;
          const pts  = rule ? rule.score * norm : 0;
          return { label: rule?.label ?? row.label, count: row.count, pts, verdict: row.verdict };
        }),
        {
          label: categoryRules.competitor?.label ?? "Direct Competitors",
          count: snapshot.closeCompetitorCount,
          pts: Math.max(-60, (categoryRules.competitor?.score ?? -16) *
            (snapshot.closeCompetitorCount >= 10 ? 5 : snapshot.closeCompetitorCount >= 3 ? 3 : 1)),
          verdict: snapshot.closeCompetitorCount >= 10 ? "AVOID" : snapshot.closeCompetitorCount >= 3 ? "NEUTRAL" : "PROCEED",
        },
      ]
    : scoreNeighbors(type.id, subtypeId, snapshot.neighborCounts).map(s => ({
        label: s.label, count: s.count, pts: s.score,
        verdict: s.score > 0 ? "PROCEED" : s.score < 0 ? "AVOID" : "NEUTRAL",
      }));

  const matrixHtml = matrixRows.map(r => `
    <tr style="border-bottom:1px solid #e5e7eb;">
      <td style="padding:7px 10px;font-size:12px;">${r.label}</td>
      <td style="padding:7px 10px;font-size:12px;text-align:right;">${r.count}</td>
      <td style="padding:7px 10px;font-size:12px;text-align:right;font-weight:600;color:${r.pts > 0 ? "#16a34a" : r.pts < 0 ? "#dc2626" : "#6b7280"};">
        ${r.pts > 0 ? "+" : ""}${r.pts} pts
      </td>
      <td style="padding:7px 10px;font-size:11px;text-align:right;color:${r.verdict === "PROCEED" ? "#16a34a" : r.verdict === "NEUTRAL" ? "#d97706" : "#dc2626"};">
        ${r.verdict}
      </td>
    </tr>`).join("");

  const competitorsHtml = snapshot.nearestCompetitors.slice(0, 6).map(c => `
    <tr style="border-bottom:1px solid #e5e7eb;">
      <td style="padding:7px 10px;font-size:12px;color:#d97706;font-weight:600;">${c.distance_m}m</td>
      <td style="padding:7px 10px;font-size:12px;font-weight:600;">${c.name}</td>
      <td style="padding:7px 10px;font-size:11px;color:#6b7280;">${c.locality || "Sydney"}</td>
    </tr>`).join("");

  const narrativeHtml = mainText
    .replace(/━━[^━]+━━/g, m => `<div style="font-weight:700;font-size:11px;letter-spacing:.08em;text-transform:uppercase;margin:14px 0 4px;color:#374151;">${m.replace(/━━/g,"").trim()}</div>`)
    .replace(/\n/g, "<br>");

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8"/>
  <title>LOCWISE Report — ${subtype.label} · ${cityLabel}</title>
  <style>
    body { margin:0; padding:0; font-family:Inter,Helvetica,sans-serif; color:#0a0a0f; background:#fff; }
    table { width:100%; border-collapse:collapse; }
    th { background:#0a0a0f; color:#fff; padding:8px 10px; font-size:10px; text-transform:uppercase; letter-spacing:.08em; text-align:left; }
    .metric { background:#f9fafb; border:1px solid #e5e7eb; padding:10px 14px; border-radius:2px; }
    .metric-label { font-size:9px; text-transform:uppercase; letter-spacing:.1em; color:#6b7280; }
    .metric-value { font-size:22px; font-weight:700; color:#0a0a0f; margin-top:2px; }
    .section-title { font-size:10px; text-transform:uppercase; letter-spacing:.1em; color:#6b7280; margin:20px 0 8px; border-bottom:1px solid #e5e7eb; padding-bottom:4px; }
    @media print { @page { size:A4; margin:16mm 14mm; } * { -webkit-print-color-adjust:exact; print-color-adjust:exact; } }
  </style>
</head>
<body>
  <!-- Header -->
  <div style="background:#0a0a0f;color:#fff;padding:18px 24px;display:flex;justify-content:space-between;align-items:center;">
    <div>
      <div style="font-size:10px;letter-spacing:.12em;text-transform:uppercase;opacity:.5;">LOCWISE · Location Intelligence Report</div>
      <div style="font-size:22px;font-weight:700;margin-top:4px;">${subtype.label} ${type.label} · ${cityLabel}</div>
      <div style="font-size:10px;opacity:.5;margin-top:3px;">${pin.lat.toFixed(4)}°, ${pin.lng.toFixed(4)}° · Generated ${today}</div>
    </div>
    <div style="text-align:right;">
      <div style="font-size:10px;opacity:.5;text-transform:uppercase;letter-spacing:.08em;">Location Score</div>
      <div style="font-size:48px;font-weight:800;line-height:1;color:${verdictColor};">${grade}</div>
      <div style="font-size:13px;opacity:.7;">${score}/100 · <span style="color:${verdictColor};font-weight:700;">${verdict}</span></div>
    </div>
  </div>

  <!-- Key Metrics -->
  <div class="section-title" style="margin-top:18px;">Key Metrics</div>
  <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px;">
    ${[
      { l: "Competitors (1km)", v: snapshot.competitorCount },
      { l: "Close rivals (300m)", v: snapshot.closeCompetitorCount },
      { l: "2yr Survival Rate", v: `${snapshot.successRate2yr}%` },
      { l: "Foot Traffic", v: snapshot.footTraffic },
      { l: "Revenue (min/mo)", v: `A$${revLowK}K` },
      { l: "Revenue (max/mo)", v: `A$${revHighK}K` },
      { l: "Annual Midpoint", v: `A$${revAnnualK}K` },
      { l: "Break-even", v: `${snapshot.breakevenMonths < 999 ? snapshot.breakevenMonths + " mo" : "N/A"}` },
    ].map(m => `<div class="metric"><div class="metric-label">${m.l}</div><div class="metric-value">${m.v}</div></div>`).join("")}
  </div>

  <!-- Advanced Analytics -->
  <div class="section-title">Advanced Analytics</div>
  <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;">
    ${[
      { l: "Market Saturation", v: `${snapshot.marketSaturationIndex.toFixed(2)}×`, hint: snapshot.marketSaturationIndex < 0.7 ? "Undersaturated" : snapshot.marketSaturationIndex > 1.3 ? "Oversaturated" : "Normal" },
      { l: "Competitive Moat", v: `${snapshot.competitiveMoatScore}/100`, hint: snapshot.competitiveMoatScore >= 70 ? "Strong" : snapshot.competitiveMoatScore >= 40 ? "Moderate" : "Weak" },
      { l: "POIs within 500m", v: snapshot.poiCount500m, hint: "Active businesses" },
    ].map(m => `<div class="metric"><div class="metric-label">${m.l}</div><div class="metric-value">${m.v}</div><div style="font-size:10px;color:#6b7280;margin-top:2px;">${m.hint}</div></div>`).join("")}
  </div>

  <!-- Conflict Matrix -->
  <div class="section-title">Conflict & Synergy Matrix</div>
  <table>
    <tr><th>Nearby Signal</th><th style="text-align:right;">Count</th><th style="text-align:right;">Impact</th><th style="text-align:right;">Verdict</th></tr>
    ${matrixHtml}
  </table>

  ${snapshot.nearestCompetitors.length > 0 ? `
  <!-- Nearest Competitors -->
  <div class="section-title">Nearest Direct Competitors</div>
  <table>
    <tr><th>Distance</th><th>Business</th><th>Locality</th></tr>
    ${competitorsHtml}
  </table>` : ""}

  <!-- AI Narrative -->
  <div class="section-title">Analysis & Recommendation</div>
  <div style="background:#f9fafb;border:1px solid #e5e7eb;padding:16px;font-size:13px;line-height:1.7;border-radius:2px;">
    ${narrativeHtml}
  </div>

  <!-- Footer -->
  <div style="margin-top:24px;padding-top:10px;border-top:1px solid #e5e7eb;display:flex;justify-content:space-between;font-size:9px;color:#9ca3af;text-transform:uppercase;letter-spacing:.08em;">
    <span>© LOCWISE · Sydney Location Intelligence · v0.1</span>
    <span>Data: 267K+ Sydney POIs · Foursquare Taxonomy</span>
    <span>Not financial or legal advice</span>
  </div>
</body>
</html>`;

  // Open in a new tab and trigger print dialog
  const win = window.open("", "_blank");
  if (!win) { alert("Please allow pop-ups to export the PDF."); return; }
  win.document.write(html);
  win.document.close();
  win.focus();
  setTimeout(() => { win.print(); }, 600);
}
