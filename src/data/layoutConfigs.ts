import { MarketSnapshot, SignalRow } from "./mockMarket";

export interface RoomZone {
  id: string;
  label: string;
  x: number; z: number; w: number; d: number;
  color: string;
}

export interface FurniturePiece {
  x: number; z: number;
  w: number; d: number; h: number;
  color: string;
  label?: string;
}

export interface LayoutConfig {
  businessLabel: string;
  totalW: number;
  totalD: number;
  rooms: RoomZone[];
  furniture: FurniturePiece[];
  legend: { color: string; label: string }[];
  insights: string[];
}

function signalCount(matrix: SignalRow[], keyword: string): number {
  const row = matrix.find((r) => r.label.toLowerCase().includes(keyword.toLowerCase()));
  return row?.count ?? 0;
}

// ── Japanese Restaurant ────────────────────────────────────────────────────────
function japaneseLayout(snapshot: MarketSnapshot, score: number): LayoutConfig {
  const hasOffices  = signalCount(snapshot.signalMatrix, "office") >= 2;
  const hasTransit  = signalCount(snapshot.signalMatrix, "transit") >= 2;
  const premiumMoat = snapshot.competitiveMoatScore >= 60;

  const W = 16, D = 10;

  const rooms: RoomZone[] = [
    { id: "entry",    label: "Entry & Host",  x: 0,    z: 0, w: 2.5, d: D,   color: "#f5f0e8" },
    { id: "sushi",    label: "Sushi Bar",     x: 2.5,  z: 0, w: 9,   d: 3.2, color: "#fef3c7" },
    { id: "dining",   label: "Main Dining",   x: 2.5,  z: 3.2, w: 9, d: 4.3, color: "#fafaf8" },
    { id: "feature",  label: premiumMoat ? "Tatami Room" : hasOffices ? "Express Counter" : "Private Dining",
                                              x: 2.5,  z: 7.5, w: 9, d: 2.5, color: "#fde8c8" },
    { id: "kitchen",  label: "Kitchen",       x: 11.5, z: 0, w: 4.5, d: D,   color: "#e8ede8" },
  ];

  const furniture: FurniturePiece[] = [
    // Sushi counter
    { x: 3.2, z: 0.3, w: 7.5, d: 0.7, h: 0.9, color: "#92400e", label: "Sushi Counter" },
    // Bar stools (6)
    ...Array.from({ length: 6 }, (_, i) => ({
      x: 3.7 + i * 1.1, z: 1.2, w: 0.38, d: 0.38, h: 0.48, color: "#78716c",
    })),
    // Dining tables (2-person, 4-person mix)
    { x: 3.2,  z: 3.6, w: 0.8, d: 0.8, h: 0.72, color: "#d6d3d1" },
    { x: 4.5,  z: 3.6, w: 0.8, d: 0.8, h: 0.72, color: "#d6d3d1" },
    { x: 6.2,  z: 3.6, w: 1.2, d: 0.8, h: 0.72, color: "#c4c0bc" },
    { x: 8.2,  z: 3.6, w: 1.2, d: 0.8, h: 0.72, color: "#c4c0bc" },
    { x: 3.5,  z: 5.5, w: 1.2, d: 0.8, h: 0.72, color: "#c4c0bc" },
    { x: 6.0,  z: 5.5, w: 1.2, d: 0.8, h: 0.72, color: "#c4c0bc" },
    { x: 8.5,  z: 5.5, w: 0.8, d: 0.8, h: 0.72, color: "#d6d3d1" },
    // Feature zone furniture
    premiumMoat
      ? { x: 3.5, z: 7.8, w: 7, d: 1.8, h: 0.2, color: "#a16207", label: "Tatami Platform" }
      : { x: 3.2, z: 7.8, w: 8, d: 0.6, h: 0.85, color: "#92400e", label: "Express Counter" },
    // Kitchen
    { x: 12.0, z: 0.4, w: 3.2, d: 1.0, h: 0.9,  color: "#9ca3af", label: "Prep Station" },
    { x: 12.0, z: 2.0, w: 1.4, d: 1.4, h: 1.1,  color: "#6b7280", label: "Range" },
    { x: 13.8, z: 2.0, w: 1.4, d: 1.4, h: 0.9,  color: "#9ca3af" },
    { x: 12.0, z: 4.5, w: 3.2, d: 0.8, h: 0.85, color: "#9ca3af", label: "Cold Storage" },
    { x: 12.0, z: 8.0, w: 3.2, d: 1.5, h: 0.5,  color: "#d1d5db", label: "Dishwash" },
  ];

  const insights: string[] = [
    `Sushi bar faces entry — captures ${hasTransit ? "transit commuter" : "street"} walk-ins immediately`,
    premiumMoat
      ? `Tatami room unlocks premium pricing — your moat score of ${snapshot.competitiveMoatScore}/100 supports differentiation`
      : hasOffices
      ? "Express counter targets office lunch crowd from nearby towers — maximises midday covers"
      : "Private dining captures groups — supports higher spend per head",
    `Kitchen at 28% of floor — right-sized for Sydney commercial rents (A$${snapshot.avgRentPerSqm}/sqm)`,
    `${snapshot.competitorCount} competitors in 1km — open sushi counter is a visible point of difference`,
    score >= 70
      ? "Strong location score supports a full concept build — don't underinvest in fit-out"
      : score >= 45
      ? "Mid-tier score — prioritise the sushi bar as the hero element; keep dining simple"
      : "Competitive location — lean into authenticity and a tight, focused menu to justify rent",
  ];

  return {
    businessLabel: "Japanese Restaurant",
    totalW: W, totalD: D,
    rooms, furniture,
    legend: [
      { color: "#f5f0e8", label: "Entry & Host" },
      { color: "#fef3c7", label: "Sushi Bar" },
      { color: "#fafaf8", label: "Main Dining" },
      { color: "#fde8c8", label: premiumMoat ? "Tatami Room" : "Express / Private" },
      { color: "#e8ede8", label: "Kitchen" },
    ],
    insights,
  };
}

// ── Generic Café ───────────────────────────────────────────────────────────────
function cafeLayout(snapshot: MarketSnapshot, score: number): LayoutConfig {
  const hasOffices = signalCount(snapshot.signalMatrix, "office") >= 2;
  const W = 12, D = 8;

  const rooms: RoomZone[] = [
    { id: "counter", label: "Counter & Bar",    x: 0,  z: 0, w: 4,  d: D,   color: "#fef3c7" },
    { id: "seating", label: "Main Seating",     x: 4,  z: 0, w: 5,  d: 5.5, color: "#fafaf8" },
    { id: "window",  label: hasOffices ? "Work Zone" : "Lounge", x: 4, z: 5.5, w: 5, d: 2.5, color: "#f0fdf4" },
    { id: "kitchen", label: "Prep Kitchen",     x: 9,  z: 0, w: 3,  d: D,   color: "#e8ede8" },
  ];

  const furniture: FurniturePiece[] = [
    // espresso bar counter
    { x: 0.3, z: 0.3, w: 0.7, d: 7, h: 0.95, color: "#92400e", label: "Espresso Bar" },
    // pastry display
    { x: 1.3, z: 0.3, w: 1.5, d: 1.0, h: 1.0, color: "#d6c7a0" },
    // cafe tables
    { x: 4.5, z: 0.5, w: 0.7, d: 0.7, h: 0.72, color: "#d6d3d1" },
    { x: 5.7, z: 0.5, w: 0.7, d: 0.7, h: 0.72, color: "#d6d3d1" },
    { x: 4.5, z: 2.0, w: 0.7, d: 0.7, h: 0.72, color: "#d6d3d1" },
    { x: 5.7, z: 2.0, w: 0.7, d: 0.7, h: 0.72, color: "#d6d3d1" },
    { x: 7.2, z: 1.0, w: 1.2, d: 0.7, h: 0.72, color: "#c4c0bc" },
    { x: 7.2, z: 3.0, w: 1.2, d: 0.7, h: 0.72, color: "#c4c0bc" },
    // work zone
    { x: 4.3, z: 5.8, w: 4.5, d: 0.6, h: 0.75, color: "#b7c5a8", label: hasOffices ? "Laptop Bar" : "Window Bench" },
    // kitchen
    { x: 9.3, z: 0.4, w: 2.0, d: 1.0, h: 0.9, color: "#9ca3af" },
    { x: 9.3, z: 2.5, w: 1.2, d: 1.2, h: 1.1, color: "#6b7280" },
  ];

  return {
    businessLabel: "Café",
    totalW: W, totalD: D,
    rooms, furniture,
    legend: [
      { color: "#fef3c7", label: "Counter & Bar" },
      { color: "#fafaf8", label: "Main Seating" },
      { color: "#f0fdf4", label: hasOffices ? "Work Zone" : "Lounge" },
      { color: "#e8ede8", label: "Kitchen Prep" },
    ],
    insights: [
      "Counter visible from street — maximises impulse entry for walk-in traffic",
      hasOffices ? "Laptop bar captures office spillover for extended dwell time" : "Lounge zone increases avg visit length and spend",
      `Compact kitchen (25%) keeps rent-per-cover efficient at A$${snapshot.avgRentPerSqm}/sqm`,
      score >= 60 ? "Score supports full espresso + food menu — don't cut the kitchen" : "Focus on coffee excellence — reduce menu complexity to control labour",
    ],
  };
}

// ── Bar / Cocktail Bar ─────────────────────────────────────────────────────────
function barLayout(snapshot: MarketSnapshot, score: number): LayoutConfig {
  const W = 14, D = 9;
  const hasBars = signalCount(snapshot.signalMatrix, "bar") >= 3;

  const rooms: RoomZone[] = [
    { id: "bar",      label: "Bar Counter",    x: 0,    z: 0, w: 4,   d: D,   color: "#fef3c7" },
    { id: "main",     label: "Main Floor",     x: 4,    z: 0, w: 6.5, d: 6,   color: "#1c1917" },
    { id: "lounge",   label: "Lounge / Booth", x: 4,    z: 6, w: 6.5, d: 3,   color: "#292524" },
    { id: "backstage",label: "Storage & BOH",  x: 10.5, z: 0, w: 3.5, d: D,   color: "#e8ede8" },
  ];

  const furniture: FurniturePiece[] = [
    { x: 0.3,  z: 0.3, w: 0.7, d: 8,   h: 1.05, color: "#92400e", label: "Bar Counter" },
    { x: 1.5,  z: 0.3, w: 1.8, d: 8,   h: 0.35, color: "#57534e" }, // back bar shelf
    // bar stools
    ...Array.from({ length: 5 }, (_, i) => ({
      x: 3.5, z: 0.8 + i * 1.4, w: 0.4, d: 0.4, h: 0.5, color: "#44403c",
    })),
    // tables on main floor
    { x: 4.8, z: 0.6, w: 0.8, d: 0.8, h: 0.72, color: "#44403c" },
    { x: 6.5, z: 0.6, w: 0.8, d: 0.8, h: 0.72, color: "#44403c" },
    { x: 4.8, z: 2.8, w: 0.8, d: 0.8, h: 0.72, color: "#44403c" },
    { x: 6.5, z: 2.8, w: 0.8, d: 0.8, h: 0.72, color: "#44403c" },
    { x: 8.5, z: 1.5, w: 1.2, d: 1.2, h: 0.45, color: "#292524" },  // low cocktail table
    // booths
    { x: 4.5,  z: 6.3, w: 2,   d: 2,  h: 0.4,  color: "#292524", label: "Booth" },
    { x: 7.5,  z: 6.3, w: 2,   d: 2,  h: 0.4,  color: "#292524", label: "Booth" },
    // BOH
    { x: 10.8, z: 0.4, w: 2.8, d: 3,  h: 1.8,  color: "#9ca3af", label: "Cool Room" },
    { x: 10.8, z: 5,   w: 2.8, d: 3.5, h: 0.9, color: "#6b7280" },
  ];

  return {
    businessLabel: "Bar",
    totalW: W, totalD: D,
    rooms, furniture,
    legend: [
      { color: "#fef3c7", label: "Bar Counter" },
      { color: "#1c1917", label: "Main Floor" },
      { color: "#292524", label: "Lounge & Booths" },
      { color: "#e8ede8", label: "Storage & BOH" },
    ],
    insights: [
      "Bar counter along full wall — maximises service speed and visible bartending as theatre",
      hasBars ? `${signalCount(snapshot.signalMatrix, "bar")} bars nearby — booths and lounge create dwell time that high-volume rivals can't match` : "Bar-light area — position as the destination, not a convenience stop",
      "Dark palette and booth privacy justifies premium cocktail pricing",
      score >= 60 ? "Strong location — invest in bar fit-out quality, it's your strongest sales tool" : "Competitive area — tighter booth layout increases revenue per sqm",
    ],
  };
}

// ── Boutique Gym ───────────────────────────────────────────────────────────────
function gymLayout(snapshot: MarketSnapshot, score: number): LayoutConfig {
  const W = 20, D = 12;
  const hasResidential = signalCount(snapshot.signalMatrix, "residential") >= 3;

  const rooms: RoomZone[] = [
    { id: "reception", label: "Reception",       x: 0,  z: 0, w: 4,   d: 4,   color: "#f5f0e8" },
    { id: "locker",    label: "Change Rooms",     x: 0,  z: 4, w: 4,   d: 8,   color: "#e0f2fe" },
    { id: "open",      label: "Open Training",    x: 4,  z: 0, w: 9,   d: 8,   color: "#fafaf8" },
    { id: "studio",    label: hasResidential ? "Yoga Studio" : "Group Class", x: 4, z: 8, w: 9, d: 4, color: "#f0fdf4" },
    { id: "strength",  label: "Strength Zone",    x: 13, z: 0, w: 7,   d: 7,   color: "#fff7ed" },
    { id: "cardio",    label: "Cardio Strip",     x: 13, z: 7, w: 7,   d: 5,   color: "#fef2f2" },
  ];

  const furniture: FurniturePiece[] = [
    // reception desk
    { x: 0.5, z: 0.5, w: 3, d: 0.8, h: 0.95, color: "#1c1917", label: "Reception" },
    // lockers
    { x: 0.4, z: 4.3, w: 1.5, d: 7, h: 1.8, color: "#9ca3af", label: "Lockers" },
    { x: 2.2, z: 4.3, w: 1.5, d: 7, h: 1.8, color: "#9ca3af" },
    // free weights rack
    { x: 4.5, z: 0.5, w: 4, d: 0.6, h: 1.4, color: "#374151", label: "Free Weights" },
    // benches
    { x: 4.5, z: 2.0, w: 1.5, d: 0.4, h: 0.45, color: "#6b7280" },
    { x: 6.5, z: 2.0, w: 1.5, d: 0.4, h: 0.45, color: "#6b7280" },
    // functional training
    { x: 9.5, z: 0.5, w: 3, d: 6, h: 0.05, color: "#bbf7d0", label: "Functional Area" },
    // strength machines
    { x: 13.5, z: 0.5, w: 1.5, d: 1.5, h: 1.3, color: "#374151" },
    { x: 15.5, z: 0.5, w: 1.5, d: 1.5, h: 1.3, color: "#374151" },
    { x: 17.5, z: 0.5, w: 1.5, d: 1.5, h: 1.3, color: "#374151" },
    { x: 13.5, z: 2.5, w: 1.5, d: 1.5, h: 1.3, color: "#4b5563" },
    { x: 15.5, z: 2.5, w: 1.5, d: 1.5, h: 1.3, color: "#4b5563" },
    { x: 17.5, z: 2.5, w: 1.5, d: 1.5, h: 1.3, color: "#4b5563" },
    { x: 13.5, z: 5.0, w: 5.5, d: 1.5, h: 1.0, color: "#374151", label: "Cable Station" },
    // cardio strip
    ...Array.from({ length: 4 }, (_, i) => ({
      x: 13.5 + i * 1.6, z: 7.5, w: 1.3, d: 2.5, h: 1.4, color: "#6b7280", label: i === 0 ? "Treadmills" : undefined,
    })),
    ...Array.from({ length: 3 }, (_, i) => ({
      x: 13.5 + i * 1.9, z: 10.2, w: 1.6, d: 1.5, h: 1.1, color: "#9ca3af", label: i === 0 ? "Bikes" : undefined,
    })),
    // studio
    { x: 4.5, z: 8.3, w: 8, d: 3, h: 0.05, color: "#bbf7d0", label: hasResidential ? "Yoga Mats Zone" : "Class Floor" },
  ];

  return {
    businessLabel: "Boutique Gym",
    totalW: W, totalD: D,
    rooms, furniture,
    legend: [
      { color: "#f5f0e8", label: "Reception" },
      { color: "#e0f2fe", label: "Change Rooms" },
      { color: "#fafaf8", label: "Open Training" },
      { color: "#f0fdf4", label: hasResidential ? "Yoga Studio" : "Group Class" },
      { color: "#fff7ed", label: "Strength Zone" },
      { color: "#fef2f2", label: "Cardio Strip" },
    ],
    insights: [
      `Reception at entry creates accountability check-in — key for ${snapshot.successRate2yr}% survival-rate category`,
      hasResidential ? "Yoga studio targets residential catchment — daily return visits, predictable revenue" : "Group class studio drives membership retention through community",
      `Strength + cardio split matches boutique gym expectations at your ${score >= 65 ? "premium" : "competitive"} price point`,
      `${snapshot.competitiveMoatScore}/100 moat — ${snapshot.competitiveMoatScore >= 60 ? "premium positioning viable, invest in equipment quality" : "compete on community not kit — invest in coaching staff"}`,
      "Change rooms at 20% of floor — non-negotiable for member conversion, don't cut this",
    ],
  };
}

// ── Generic Retail ─────────────────────────────────────────────────────────────
function retailLayout(snapshot: MarketSnapshot, score: number): LayoutConfig {
  const W = 14, D = 9;

  const rooms: RoomZone[] = [
    { id: "window",  label: "Window Display",  x: 0,  z: 0,   w: 14, d: 1.5, color: "#fef9c3" },
    { id: "main",    label: "Main Floor",       x: 0,  z: 1.5, w: 9.5, d: 5,  color: "#fafaf8" },
    { id: "fitting", label: "Fitting Rooms",    x: 0,  z: 6.5, w: 4,   d: 2.5, color: "#f5f0e8" },
    { id: "checkout",label: "Checkout & POS",   x: 9.5,z: 1.5, w: 4.5, d: 3,  color: "#fef3c7" },
    { id: "stock",   label: "Stockroom",        x: 9.5,z: 4.5, w: 4.5, d: 5,  color: "#e8ede8" },
  ];

  const furniture: FurniturePiece[] = [
    // window display props
    { x: 1, z: 0.2, w: 2.5, d: 0.8, h: 1.0, color: "#d6d3d1", label: "Display" },
    { x: 7, z: 0.2, w: 2.5, d: 0.8, h: 1.0, color: "#d6d3d1" },
    // clothing racks / shelves on main floor
    { x: 0.4, z: 2.0, w: 0.4, d: 4, h: 1.6, color: "#9ca3af", label: "Rack" },
    { x: 1.6, z: 2.0, w: 0.4, d: 4, h: 1.6, color: "#9ca3af" },
    { x: 3.5, z: 2.0, w: 0.4, d: 4, h: 1.6, color: "#9ca3af" },
    { x: 4.7, z: 2.0, w: 0.4, d: 4, h: 1.6, color: "#9ca3af" },
    { x: 6.5, z: 2.5, w: 2.5, d: 1.5, h: 1.0, color: "#d6d3d1", label: "Display Table" },
    // fitting rooms
    { x: 0.4, z: 6.8, w: 1.5, d: 2, h: 2.2, color: "#c4c0bc", label: "Fitting 1" },
    { x: 2.2, z: 6.8, w: 1.5, d: 2, h: 2.2, color: "#c4c0bc", label: "Fitting 2" },
    // checkout counter
    { x: 9.8, z: 1.8, w: 3.5, d: 0.8, h: 0.95, color: "#92400e", label: "POS Counter" },
    // stockroom shelves
    { x: 9.8, z: 5.0, w: 3.8, d: 0.5, h: 1.8, color: "#9ca3af", label: "Shelving" },
    { x: 9.8, z: 6.5, w: 3.8, d: 0.5, h: 1.8, color: "#9ca3af" },
    { x: 9.8, z: 8.0, w: 3.8, d: 0.5, h: 1.8, color: "#9ca3af" },
  ];

  return {
    businessLabel: "Retail",
    totalW: W, totalD: D,
    rooms, furniture,
    legend: [
      { color: "#fef9c3", label: "Window Display" },
      { color: "#fafaf8", label: "Main Floor" },
      { color: "#f5f0e8", label: "Fitting Rooms" },
      { color: "#fef3c7", label: "Checkout" },
      { color: "#e8ede8", label: "Stockroom" },
    ],
    insights: [
      "Window display at full width — maximises street visibility in high foot-traffic location",
      "POS counter positioned at far wall — draws customers through entire floor",
      `Stockroom at 28% — calibrated for A$${snapshot.avgRentPerSqm}/sqm Sydney rent (don't sacrifice floor for stock)`,
      score >= 65 ? "Strong score — invest in window display quality, it's your cheapest marketing" : "Competitive zone — curate tightly, reduce SKUs, increase margin per unit",
    ],
  };
}

// ── Clinic ─────────────────────────────────────────────────────────────────────
function clinicLayout(snapshot: MarketSnapshot, score: number): LayoutConfig {
  const W = 16, D = 10;

  const rooms: RoomZone[] = [
    { id: "reception", label: "Reception",         x: 0, z: 0,   w: 5, d: 4,   color: "#f5f0e8" },
    { id: "waiting",   label: "Waiting Area",      x: 0, z: 4,   w: 5, d: 6,   color: "#eff6ff" },
    { id: "consult1",  label: "Consult Room 1",    x: 5, z: 0,   w: 4, d: 5,   color: "#fafaf8" },
    { id: "consult2",  label: "Consult Room 2",    x: 9, z: 0,   w: 4, d: 5,   color: "#fafaf8" },
    { id: "treatment", label: "Treatment Room",    x: 5, z: 5,   w: 6, d: 5,   color: "#f0fdf4" },
    { id: "utility",   label: "Utility & Storage", x: 11,z: 5,   w: 2, d: 5,   color: "#e8ede8" },
    { id: "consult3",  label: "Consult Room 3",    x: 13,z: 0,   w: 3, d: 10,  color: "#fafaf8" },
  ];

  const furniture: FurniturePiece[] = [
    { x: 0.4, z: 0.4, w: 3.5, d: 0.8, h: 0.95, color: "#1c1917", label: "Reception Desk" },
    // waiting chairs
    ...Array.from({ length: 4 }, (_, i) => ({
      x: 0.5 + (i % 2) * 2.0, z: 4.5 + Math.floor(i / 2) * 1.6, w: 0.6, d: 0.6, h: 0.45, color: "#d6d3d1",
    })),
    { x: 0.5, z: 8.5, w: 3.5, d: 0.8, h: 0.4, color: "#d6d3d1", label: "Coffee Table" },
    // consult rooms
    { x: 5.5, z: 0.5, w: 1.4, d: 0.7, h: 0.75, color: "#9ca3af", label: "Desk" },
    { x: 5.5, z: 2.5, w: 1.8, d: 0.7, h: 0.45, color: "#e0f2fe", label: "Patient Bed" },
    { x: 9.5, z: 0.5, w: 1.4, d: 0.7, h: 0.75, color: "#9ca3af" },
    { x: 9.5, z: 2.5, w: 1.8, d: 0.7, h: 0.45, color: "#e0f2fe" },
    { x: 13.5, z: 0.5, w: 1.4, d: 0.7, h: 0.75, color: "#9ca3af" },
    { x: 13.5, z: 2.5, w: 1.8, d: 0.7, h: 0.45, color: "#e0f2fe" },
    // treatment
    { x: 5.5, z: 5.5, w: 2.0, d: 1.0, h: 0.6, color: "#bbf7d0", label: "Treatment Table" },
    { x: 5.5, z: 7.5, w: 2.0, d: 1.0, h: 0.6, color: "#bbf7d0" },
    { x: 8.5, z: 5.5, w: 2.0, d: 3.5, h: 1.0, color: "#9ca3af", label: "Equipment" },
    // utility
    { x: 11.2, z: 5.2, w: 1.5, d: 4.5, h: 1.8, color: "#9ca3af", label: "Storage" },
  ];

  return {
    businessLabel: "Medical Clinic",
    totalW: W, totalD: D,
    rooms, furniture,
    legend: [
      { color: "#f5f0e8", label: "Reception" },
      { color: "#eff6ff", label: "Waiting Area" },
      { color: "#fafaf8", label: "Consult Rooms (×3)" },
      { color: "#f0fdf4", label: "Treatment Room" },
      { color: "#e8ede8", label: "Utility" },
    ],
    insights: [
      `3 consult rooms + 1 treatment — optimal for A$${snapshot.avgRentPerSqm}/sqm at ${snapshot.successRate2yr}% category survival rate`,
      "Reception sight-lines cover waiting area — critical for patient experience and privacy",
      "Treatment room positioned away from street — noise and privacy management",
      score >= 70 ? "Strong location — bulk-billing + specialist split maximises your revenue range" : "Competitive — multi-practitioner hot-desk model reduces fixed cost exposure",
    ],
  };
}

// ── Coworking ──────────────────────────────────────────────────────────────────
function coworkingLayout(snapshot: MarketSnapshot, score: number): LayoutConfig {
  const W = 20, D = 12;

  const rooms: RoomZone[] = [
    { id: "reception", label: "Reception & Lounge", x: 0,   z: 0, w: 5,  d: 5,  color: "#f5f0e8" },
    { id: "open",      label: "Open Desks",         x: 0,   z: 5, w: 12, d: 7,  color: "#fafaf8" },
    { id: "phone",     label: "Phone Booths",       x: 5,   z: 0, w: 3,  d: 5,  color: "#f5f0e8" },
    { id: "meeting1",  label: "Meeting Room A",     x: 8,   z: 0, w: 4,  d: 5,  color: "#eff6ff" },
    { id: "meeting2",  label: "Meeting Room B",     x: 12,  z: 0, w: 4,  d: 5,  color: "#eff6ff" },
    { id: "private",   label: "Private Offices",    x: 16,  z: 0, w: 4,  d: 12, color: "#f0fdf4" },
    { id: "kitchen",   label: "Kitchen & Break",    x: 12,  z: 5, w: 4,  d: 7,  color: "#fef3c7" },
  ];

  const furniture: FurniturePiece[] = [
    // reception
    { x: 0.4, z: 0.4, w: 3, d: 0.8, h: 0.95, color: "#1c1917", label: "Reception" },
    { x: 0.4, z: 2.5, w: 4, d: 2,   h: 0.4,  color: "#d6d3d1", label: "Lounge" },
    // phone booths
    { x: 5.3, z: 0.3, w: 1.2, d: 1.5, h: 2.1, color: "#e5e7eb", label: "Booth" },
    { x: 6.8, z: 0.3, w: 1.2, d: 1.5, h: 2.1, color: "#e5e7eb" },
    { x: 5.3, z: 2.2, w: 1.2, d: 1.5, h: 2.1, color: "#e5e7eb" },
    { x: 6.8, z: 2.2, w: 1.2, d: 1.5, h: 2.1, color: "#e5e7eb" },
    // meeting rooms
    { x: 8.4, z: 0.5, w: 3, d: 1.2, h: 0.75, color: "#9ca3af", label: "Conference Table" },
    { x: 12.4, z: 0.5, w: 3, d: 1.2, h: 0.75, color: "#9ca3af" },
    // open desks — rows
    ...Array.from({ length: 4 }, (_, col) =>
      Array.from({ length: 4 }, (_, row) => ({
        x: 0.5 + col * 3.0, z: 5.5 + row * 1.5, w: 1.4, d: 0.65, h: 0.72, color: "#d6d3d1",
        label: col === 0 && row === 0 ? "Hot Desk" : undefined,
      }))
    ).flat(),
    // private offices
    { x: 16.3, z: 0.4, w: 3.2, d: 5, h: 2.2, color: "#e5e7eb", label: "Office A" },
    { x: 16.3, z: 6.4, w: 3.2, d: 5, h: 2.2, color: "#e5e7eb", label: "Office B" },
    // kitchen
    { x: 12.3, z: 5.3, w: 3, d: 0.7, h: 0.9, color: "#9ca3af", label: "Kitchen Counter" },
    { x: 12.3, z: 7.5, w: 3.2, d: 1.5, h: 0.75, color: "#d6d3d1", label: "Break Table" },
  ];

  return {
    businessLabel: "Coworking Space",
    totalW: W, totalD: D,
    rooms, furniture,
    legend: [
      { color: "#f5f0e8", label: "Reception & Lounge" },
      { color: "#fafaf8", label: "Open Desks" },
      { color: "#eff6ff", label: "Meeting Rooms" },
      { color: "#f0fdf4", label: "Private Offices" },
      { color: "#fef3c7", label: "Kitchen & Break" },
    ],
    insights: [
      "Private offices at 20% of floor — highest margin product, prioritise fit-out quality here",
      "Phone booths prevent open-desk noise complaints — key for member retention",
      `${snapshot.competitorCount} coworking competitors in 1km — community events and hospitality differentiate`,
      score >= 65 ? "Strong score — go full-service (concierge, mail, events) to justify premium pricing" : "Competitive zone — focus on 24/7 access and flexible day-pass to capture overflow demand",
    ],
  };
}

// ── Master Generator ───────────────────────────────────────────────────────────
export function generateLayout(
  categoryId: string,
  subtypeId: string,
  snapshot: MarketSnapshot,
  score: number,
): LayoutConfig {
  switch (categoryId) {
    case "restaurant": return japaneseLayout(snapshot, score);
    case "cafe":       return cafeLayout(snapshot, score);
    case "bar":        return barLayout(snapshot, score);
    case "gym":        return gymLayout(snapshot, score);
    case "clinic":     return clinicLayout(snapshot, score);
    case "retail":     return retailLayout(snapshot, score);
    case "coworking":  return coworkingLayout(snapshot, score);
    default:           return cafeLayout(snapshot, score); // sensible fallback
  }
}
