/**
 * LOCWISE — Conflict & Synergy Matrix
 *
 * AI Acknowledgement:
 * This file was developed with AI assistance (Claude by Anthropic) for:
 *  - Diagnosing why the matrix always showed 0/C grade
 *    (root cause: LABEL_TO_KEY used frontend labels like "Office Buildings" but
 *     the backend sends "Office Towers" — mismatch meant all signals mapped to null)
 *  - Fixing "+120 pts" nonsense scores: raw backend counts (65, 130) were multiplied
 *    directly by rule weights; fix was normalizing by verdict (PROCEED=5, NEUTRAL=2, WEAK=1)
 *  - Adding RULES_BY_CATEGORY export so Step5Dashboard and ExportPDF can share the same rules
 *  - Explaining the two-score system: this file powers the "why" table; the grade dial
 *    comes from backend's 0–100 live score, not from scoreNeighbors() here
 *
 * How it works:
 *  - RULES_BY_CATEGORY: hand-written synergy/conflict weights per business category
 *  - scoreNeighbors(): used only for mock data; live data uses backend signal matrix
 *  - overallScore(): clamps final score to 0–100 and assigns A/B/C/D/F grade
 */

export type Verdict = "great" | "proceed" | "caution" | "avoid";

export interface Signal {
  id: string;
  label: string;
  count: number;
  score: number;
  verdict: Verdict;
  reason: string;
  impact: string; // e.g. "+8 pts" or "-15 pts"
}

export interface OverallResult {
  score: number;
  grade: string;
  verdict: Verdict;
}

interface SignalRule {
  label: string;
  score: number;   // points per unit (positive = synergy, negative = conflict)
  reason: string;
}

// ─── Category-Aware Rules ────────────────────────────────────────────────────
// Each business category has its own scoring for every nearby signal.

const RULES_BY_CATEGORY: Record<string, Record<string, SignalRule>> = {

  restaurant: {
    office_tower:  { label: "Office Buildings",      score: +12, reason: "Workers need lunch — reliable weekday demand." },
    hotel:         { label: "Hotels & Lodging",      score: +10, reason: "Guests look for dinner spots every night." },
    transit:       { label: "Transit Stops",         score: +12, reason: "Commuters discover you walking to/from the station." },
    residential:   { label: "Residential Area",      score: +10, reason: "Locals who eat out regularly = backbone of your revenue." },
    luxury_retail: { label: "Luxury Retail",         score: +8,  reason: "High-income shoppers are willing to spend on meals." },
    park:          { label: "Parks Nearby",           score: +6,  reason: "Park crowds spill into nearby food options." },
    school:        { label: "Schools & Uni",         score: +5,  reason: "Students and staff eat out multiple times a week." },
    gym:           { label: "Gyms & Fitness",        score: +6,  reason: "Post-workout meals are a consistent spend category." },
    bar:           { label: "Bars & Nightlife",      score: +5,  reason: "Entertainment strips = people already out spending money." },
    cafe:          { label: "Cafés Nearby",          score: -3,  reason: "Minor overlap on brunch and light meals." },
    fast_food:     { label: "Fast Food Chains",      score: -8,  reason: "Price anchoring makes customers unwilling to pay more." },
    competitor:    { label: "Direct Competitors",    score: -16, reason: "Same cuisine nearby directly splits your customer base." },
    hospital:      { label: "Hospitals & Clinics",   score: +4,  reason: "Staff and visitors need food options nearby." },
  },

  cafe: {
    office_tower:  { label: "Office Buildings",      score: +18, reason: "Morning coffee is non-negotiable for office workers — captive market." },
    transit:       { label: "Transit Stops",         score: +15, reason: "Commuters grab coffee en route — highest-value moment." },
    residential:   { label: "Residential Area",      score: +10, reason: "Locals become morning regulars and weekend brunch crowd." },
    gym:           { label: "Gyms & Fitness",        score: +12, reason: "Post-workout smoothies and snacks = strong natural upsell." },
    park:          { label: "Parks Nearby",           score: +8,  reason: "Weekend park crowds want takeaway coffee." },
    school:        { label: "Schools & Uni",         score: +7,  reason: "Students are high-frequency café customers." },
    luxury_retail: { label: "Luxury Retail",         score: +6,  reason: "Shoppers take café breaks — good for afternoon trade." },
    hotel:         { label: "Hotels & Lodging",      score: +6,  reason: "Hotel guests look for local cafés instead of hotel breakfast." },
    hospital:      { label: "Hospitals & Clinics",   score: +8,  reason: "Healthcare workers run on coffee — reliable high-frequency demand." },
    bar:           { label: "Bars & Nightlife",      score: -5,  reason: "Nightlife areas are quiet in mornings — your peak trading hours." },
    fast_food:     { label: "Fast Food Chains",      score: -6,  reason: "Fast food coffee (McCafé etc.) competes directly on price." },
    cafe:          { label: "Other Cafés",           score: -12, reason: "Coffee loyalty is strong — every nearby café fights for the same regulars." },
    competitor:    { label: "Direct Competitors",    score: -18, reason: "A café next door takes your regulars — hyper-local competition." },
  },

  bar: {
    office_tower:  { label: "Office Buildings",      score: +15, reason: "After-work drinks are a predictable weekly ritual." },
    transit:       { label: "Transit Stops",         score: +10, reason: "Commuters stop for a drink before heading home." },
    hotel:         { label: "Hotels & Lodging",      score: +12, reason: "Guests drink at nearby bars — consistent nightly demand." },
    residential:   { label: "Residential Area",      score: +8,  reason: "Locals become regulars for Friday/Saturday nights." },
    luxury_retail: { label: "Luxury Retail",         score: +10, reason: "High-income area = higher spend per head at the bar." },
    park:          { label: "Parks Nearby",           score: +5,  reason: "Outdoor areas attract social weekend crowds." },
    cafe:          { label: "Cafés Nearby",          score: +3,  reason: "Café streets transition to bar streets at night — same strips." },
    gym:           { label: "Gyms & Fitness",        score: -5,  reason: "Health-focused crowd is not your core bar demographic." },
    fast_food:     { label: "Fast Food Chains",      score: -3,  reason: "Fast food signals a low-spend area — may not match your price point." },
    school:        { label: "Schools & Uni",         score: -8,  reason: "Schools attract noise complaints and liquor licence scrutiny." },
    competitor:    { label: "Other Bars",            score: -12, reason: "Too many bars splits the nightlife crowd on your street." },
    hospital:      { label: "Hospitals & Clinics",   score: -5,  reason: "Hospital proximity creates licensing and noise concerns." },
  },

  gym: {
    residential:   { label: "Residential Area",      score: +15, reason: "Locals are your core membership base — proximity drives retention." },
    office_tower:  { label: "Office Buildings",      score: +12, reason: "Office workers gym before work or at lunch — strong weekday demand." },
    transit:       { label: "Transit Stops",         score: +10, reason: "Members stop at the gym on the commute — reduces friction." },
    park:          { label: "Parks Nearby",           score: +8,  reason: "Active outdoor area signals a health-conscious demographic." },
    school:        { label: "Schools & Uni",         score: +8,  reason: "Students are gym-curious and often sign up for cheap memberships." },
    cafe:          { label: "Cafés & Juice Bars",    score: +6,  reason: "Post-workout nutrition stops are a strong lifestyle fit." },
    luxury_retail: { label: "Luxury Retail",         score: +6,  reason: "High-income area = willingness to pay premium gym memberships." },
    hotel:         { label: "Hotels & Lodging",      score: +5,  reason: "Hotels refer guests to nearby gyms — small but consistent source." },
    hospital:      { label: "Hospitals & Clinics",   score: +6,  reason: "Physio and medical referrals to exercise programs are common." },
    fast_food:     { label: "Fast Food Chains",      score: -8,  reason: "Fast food signals low health-consciousness in the area — wrong market." },
    bar:           { label: "Bars & Nightlife",      score: -6,  reason: "Nightlife district = late nights, not early-morning gym culture." },
    competitor:    { label: "Other Gyms",            score: -20, reason: "Gym memberships are exclusive — a nearby gym directly steals members." },
  },

  clinic: {
    residential:   { label: "Residential Area",      score: +15, reason: "Local patients prefer a clinic within walking distance." },
    office_tower:  { label: "Office Buildings",      score: +12, reason: "Office workers book appointments during lunch or after work." },
    hospital:      { label: "Hospitals & Clinics",   score: +8,  reason: "Medical precincts attract patients seeking specialist care." },
    transit:       { label: "Transit Stops",         score: +8,  reason: "Patients choose clinics they can reach easily — accessibility matters." },
    school:        { label: "Schools & Uni",         score: +6,  reason: "School areas = families with children — consistent patient pool." },
    gym:           { label: "Gyms & Fitness",        score: +8,  reason: "Active people get injured — physios, sports medicine thrive near gyms." },
    luxury_retail: { label: "Luxury Retail",         score: +5,  reason: "High-income area = patients who pay for out-of-pocket specialist fees." },
    park:          { label: "Parks Nearby",           score: +4,  reason: "Parkside feels calming to anxious patients — improves appointment attendance." },
    hotel:         { label: "Hotels & Lodging",      score: +3,  reason: "Hotels occasionally refer sick guests to nearby clinics." },
    fast_food:     { label: "Fast Food Chains",      score: -5,  reason: "Fast food area signals low health consciousness — smaller patient pool." },
    bar:           { label: "Bars & Nightlife",      score: -10, reason: "Nightlife conflicts with the calm, trusted image patients expect." },
    competitor:    { label: "Other Clinics",         score: -14, reason: "Patients are loyal to their doctor — a nearby clinic takes new patients." },
  },

  retail: {
    transit:       { label: "Transit Stops",         score: +15, reason: "Retail lives and dies by foot traffic — transit is the #1 driver." },
    office_tower:  { label: "Office Buildings",      score: +12, reason: "Office workers shop at lunch and after work — reliable weekday peak." },
    residential:   { label: "Residential Area",      score: +12, reason: "Locals shop nearby for convenience, gifts, and daily needs." },
    hotel:         { label: "Hotels & Lodging",      score: +10, reason: "Tourists and guests browse and buy — especially gifts and essentials." },
    luxury_retail: { label: "Luxury Retail Strip",   score: +12, reason: "Being in a retail cluster raises all boats — shoppers visit multiple stores." },
    cafe:          { label: "Cafés Nearby",          score: +5,  reason: "Café areas attract browsing foot traffic — good for retail dwell time." },
    gym:           { label: "Gyms & Fitness",        score: +4,  reason: "Gym-goers browse activewear, supplements, and healthy snacks." },
    park:          { label: "Parks Nearby",           score: +6,  reason: "Weekend park crowds browse nearby shops." },
    school:        { label: "Schools & Uni",         score: +6,  reason: "Students are impulse buyers — great for fashion, books, accessories." },
    bar:           { label: "Bars & Nightlife",      score: -5,  reason: "Nightlife area = low daytime footfall when retail trades." },
    fast_food:     { label: "Fast Food Chains",      score: -4,  reason: "Fast food indicates a lower-spend area — risks mismatching your price point." },
    competitor:    { label: "Same-Category Stores",  score: -14, reason: "Shoppers compare then choose — a nearby competitor splits the decision." },
    hospital:      { label: "Hospitals & Clinics",   score: +3,  reason: "Hospital visitors pick up essentials from nearby retail." },
  },

  beauty: {
    residential:   { label: "Residential Area",      score: +15, reason: "Locals book beauty appointments close to home — distance is a top factor." },
    office_tower:  { label: "Office Buildings",      score: +12, reason: "Office workers get blow-dries and manicures at lunch or after work." },
    luxury_retail: { label: "Luxury Retail",         score: +12, reason: "High-income shoppers are exactly your target beauty clientele." },
    gym:           { label: "Gyms & Fitness",        score: +10, reason: "People who invest in fitness also invest in grooming and appearance." },
    transit:       { label: "Transit Stops",         score: +10, reason: "Easy access = easier to book and show up consistently." },
    hotel:         { label: "Hotels & Lodging",      score: +8,  reason: "Hotel guests book same-day appointments for events and business trips." },
    cafe:          { label: "Cafés Nearby",          score: +4,  reason: "Café culture and beauty culture overlap — same demographic." },
    park:          { label: "Parks Nearby",           score: +4,  reason: "Park areas attract wellness-conscious consumers." },
    school:        { label: "Schools & Uni",         score: +5,  reason: "Students are price-sensitive but frequent beauty customers." },
    fast_food:     { label: "Fast Food Chains",      score: -6,  reason: "Fast food heavy area signals lower disposable income for beauty spend." },
    bar:           { label: "Bars & Nightlife",      score: -4,  reason: "Nightlife areas attract a different crowd from beauty clientele." },
    competitor:    { label: "Other Salons/Spas",     score: -16, reason: "Beauty is relationship-driven — competing on the same block is tough." },
    hospital:      { label: "Hospitals & Clinics",   score: +2,  reason: "Minor overlap — some medical aesthetic referrals." },
  },

  education: {
    residential:   { label: "Residential Area",      score: +15, reason: "Families with children are your core market — proximity to homes is key." },
    school:        { label: "Schools & Uni",         score: +12, reason: "Being near existing schools puts you in front of education-seeking families." },
    transit:       { label: "Transit Stops",         score: +10, reason: "Students need easy access — transit reduces enrollment friction." },
    park:          { label: "Parks Nearby",           score: +6,  reason: "Families with kids are drawn to park areas — ideal catchment." },
    luxury_retail: { label: "Luxury Retail",         score: +6,  reason: "High-income area = families with budget for premium education." },
    office_tower:  { label: "Office Buildings",      score: +6,  reason: "Working parents need childcare/tutoring near their workplace." },
    gym:           { label: "Gyms & Fitness",        score: +4,  reason: "Sports academies and after-school fitness thrive in active areas." },
    cafe:          { label: "Cafés Nearby",          score: +3,  reason: "Parents waiting during lessons spend time at nearby cafés." },
    hospital:      { label: "Hospitals & Clinics",   score: +2,  reason: "Health & education focused families overlap." },
    hotel:         { label: "Hotels & Lodging",      score: -2,  reason: "Hotel areas are transient — not ideal for community-based education." },
    fast_food:     { label: "Fast Food Chains",      score: -5,  reason: "Fast food heavy area signals lower-income demographics, reducing fee capacity." },
    bar:           { label: "Bars & Nightlife",      score: -15, reason: "Parents will not send children to a school near a nightlife strip." },
    competitor:    { label: "Other Education",       score: -14, reason: "Parents comparison-shop — a nearby competitor pulls enrollment away." },
  },

  entertainment: {
    transit:       { label: "Transit Stops",         score: +15, reason: "Groups travel together for entertainment — transit is essential." },
    bar:           { label: "Bars & Nightlife",      score: +12, reason: "Entertainment and nightlife cluster — customers visit both in one night." },
    hotel:         { label: "Hotels & Lodging",      score: +10, reason: "Tourists actively seek entertainment — hotel guests are a ready market." },
    residential:   { label: "Residential Area",      score: +10, reason: "Local residents are repeat customers for nearby entertainment." },
    school:        { label: "Schools & Uni",         score: +6,  reason: "Young demographic is your highest-frequency entertainment customer." },
    office_tower:  { label: "Office Buildings",      score: +6,  reason: "Team events and after-work activities from office workers." },
    luxury_retail: { label: "Luxury Retail",         score: +5,  reason: "High-income area = higher willingness to spend on experiences." },
    park:          { label: "Parks Nearby",           score: +6,  reason: "Outdoor areas support outdoor entertainment and family activities." },
    cafe:          { label: "Cafés Nearby",          score: +3,  reason: "Daytime café culture transitions to evening entertainment." },
    hospital:      { label: "Hospitals & Clinics",   score: -6,  reason: "Hospital proximity restricts noise levels — critical for venues." },
    gym:           { label: "Gyms & Fitness",        score: -2,  reason: "Gym culture is health-focused — minor clash with late-night entertainment." },
    fast_food:     { label: "Fast Food Chains",      score: -4,  reason: "Fast food heavy area may signal lower spend capacity for ticketed events." },
    competitor:    { label: "Same Venue Type",       score: -14, reason: "Entertainment options compete for the same night-out budget." },
  },

  hotel: {
    transit:       { label: "Transit Stops",         score: +18, reason: "Guests need to reach the airport, CBD, attractions — transit is #1 factor." },
    luxury_retail: { label: "Luxury Retail",         score: +12, reason: "Retail strips signal a destination area worth staying in." },
    office_tower:  { label: "Office Buildings",      score: +10, reason: "Business travellers need hotels near their meetings." },
    park:          { label: "Parks Nearby",           score: +8,  reason: "Views and green space are a booking selling point." },
    cafe:          { label: "Cafés Nearby",          score: +6,  reason: "Guests appreciate local café culture — adds to destination appeal." },
    bar:           { label: "Bars & Nightlife",      score: +6,  reason: "Nightlife options appeal to leisure travellers." },
    residential:   { label: "Residential Area",      score: +4,  reason: "Residential neighbourhood signals a safe, liveable area." },
    gym:           { label: "Gyms & Fitness",        score: +4,  reason: "Business travellers want gym access — nearby gyms are a minor positive." },
    hospital:      { label: "Hospitals & Clinics",   score: -3,  reason: "Hospital proximity deters leisure guests — attracts only medical tourists." },
    school:        { label: "Schools & Uni",         score: -3,  reason: "School zones are noisy — unattractive to most hotel guests." },
    fast_food:     { label: "Fast Food Chains",      score: -6,  reason: "Fast food strip signals a low-quality area — reduces nightly rate potential." },
    competitor:    { label: "Other Hotels",          score: -12, reason: "Hotels compete on OTA platforms — nearby options split bookings." },
  },

  coworking: {
    transit:       { label: "Transit Stops",         score: +15, reason: "Members commute — seamless transit access is the top selection criteria." },
    office_tower:  { label: "Office Buildings",      score: +12, reason: "Freelancers from nearby offices are your core market." },
    cafe:          { label: "Cafés Nearby",          score: +12, reason: "Coffee shops and coworking go together — members want good coffee close." },
    residential:   { label: "Residential Area",      score: +10, reason: "Work-from-home professionals prefer coworking near where they live." },
    school:        { label: "Schools & Uni",         score: +8,  reason: "University areas attract students and startup founders needing desk space." },
    luxury_retail: { label: "Luxury Retail",         score: +6,  reason: "High-income area = professionals who can afford memberships." },
    gym:           { label: "Gyms & Fitness",        score: +6,  reason: "Members who gym at lunch are drawn to coworking in wellness precincts." },
    hotel:         { label: "Hotels & Lodging",      score: +6,  reason: "Business travellers use day passes — hotels nearby drive drop-in revenue." },
    park:          { label: "Parks Nearby",           score: +6,  reason: "Workers take lunch breaks in parks — adds to member wellbeing." },
    hospital:      { label: "Hospitals & Clinics",   score: +2,  reason: "Medical professionals use coworking for admin and telehealth." },
    bar:           { label: "Bars & Nightlife",      score: -5,  reason: "Nightlife area = noisy streets during the day — not ideal for focus work." },
    fast_food:     { label: "Fast Food Chains",      score: -4,  reason: "Fast food strip signals a lower-quality environment for premium workspace." },
    competitor:    { label: "Other Coworking",       score: -16, reason: "Coworking is low-switching-cost — nearby options poach your members." },
  },

  professional_services: {
    office_tower:  { label: "Office Buildings",      score: +18, reason: "B2B clients are in nearby offices — proximity drives referrals and walk-ins." },
    transit:       { label: "Transit Stops",         score: +10, reason: "Clients need to reach you easily for in-person meetings." },
    luxury_retail: { label: "Luxury Retail",         score: +10, reason: "High-income area = clients who can afford professional fees." },
    hotel:         { label: "Hotels & Lodging",      score: +6,  reason: "Business travellers need local legal, financial, or consulting support." },
    residential:   { label: "Residential Area",      score: +6,  reason: "Locals use nearby accountants, lawyers, and financial advisers." },
    school:        { label: "Schools & Uni",         score: +4,  reason: "Educated area attracts professionals who understand service value." },
    cafe:          { label: "Cafés Nearby",          score: +4,  reason: "Client meetings over coffee — a café next door is a convenience." },
    park:          { label: "Parks Nearby",           score: +3,  reason: "Pleasant environment helps with staff retention and client first impression." },
    hospital:      { label: "Hospitals & Clinics",   score: +4,  reason: "Medical legal, billing, and healthcare consulting opportunities nearby." },
    gym:           { label: "Gyms & Fitness",        score: +2,  reason: "Minor: working professionals who gym nearby may notice your office." },
    bar:           { label: "Bars & Nightlife",      score: -8,  reason: "Nightlife area conflicts with the professional image clients expect." },
    fast_food:     { label: "Fast Food Chains",      score: -6,  reason: "Fast food strip signals low-income area — reduces client fee capacity." },
    competitor:    { label: "Same Profession Nearby", score: -12, reason: "Clients comparison-shop for professionals — nearby firms divert enquiries." },
  },
};

// ─── Subtype-Level Score Overrides ───────────────────────────────────────────
// Applied on top of the category rules for specific subtypes with unique dynamics.
// Example: fast food + gyms = bad. Vegan restaurant + gyms = great.

const SUBTYPE_OVERRIDES: Record<string, Record<string, Partial<SignalRule>>> = {
  // Fast food suffers near gyms (health-conscious avoidance)
  fast_food: {
    gym:       { score: -15, reason: "Health-conscious gym crowd actively avoids fast food — direct lifestyle conflict." },
    school:    { score: +12, reason: "Teens are your #1 fast food customer — schools drive strong lunch and after-school traffic." },
    transit:   { score: +15, reason: "Commuters grab fast food on the go — transit stops are your most valuable signal." },
  },
  // Vegan restaurant thrives near gyms
  vegan: {
    gym:       { score: +15, reason: "Gym crowd actively seeks plant-based options — the strongest natural demand signal for vegan." },
    fast_food: { score: -12, reason: "Fast food nearby signals the area isn't health-focused — brand misalignment." },
    park:      { score: +10, reason: "Park crowds skew health-conscious — great fit for plant-based concepts." },
  },
  // Juice bar = gym's best friend
  juice_bar: {
    gym:       { score: +22, reason: "Post-workout juice is a top purchase — gyms are your single biggest demand driver." },
    fast_food: { score: -12, reason: "Fast food signals a non-health-focused area — misalignment with your entire brand." },
  },
  // Supplement store: gym density = gold
  supplement: {
    gym:       { score: +22, reason: "Gym-goers are your #1 customer — supplement stores live and die by gym density." },
    fast_food: { score: -12, reason: "Fast food culture is the opposite of your health-focused buyer." },
    park:      { score: +8,  reason: "Active outdoor area = health-conscious population who buy supplements." },
  },
  // Fine dining clashes with fast food
  fine_dining: {
    fast_food: { score: -15, reason: "Fast food chains set a low price anchor — customers balk at fine dining prices." },
    luxury_retail: { score: +15, reason: "Luxury retail signals exactly the high-income demographic fine dining needs." },
    gym:       { score: -4,  reason: "Gym strip culture skews casual — not aligned with fine dining's occasion-based visits." },
  },
  // Sports bar actually benefits from gyms
  sports_bar: {
    gym:       { score: +8,  reason: "Sports-active crowd watches games together after training sessions." },
    school:    { score: -5,  reason: "Schools near sports bars attract noise complaints and liquor licence scrutiny." },
  },
  // Yoga dislikes gyms (competition) and fast food (lifestyle)
  yoga: {
    gym:       { score: -10, reason: "Yoga studios compete with general fitness studios for the same wellness market." },
    fast_food: { score: -12, reason: "Fast food zone is a lifestyle mismatch for your wellness-focused clientele." },
    park:      { score: +12, reason: "Park areas attract your exact customer — mindful, health-conscious, outdoor-oriented." },
  },
  // Barbershop loves gyms
  barbershop: {
    gym:       { score: +10, reason: "Men who invest in fitness also invest in grooming — very high demographic overlap." },
    office_tower: { score: +14, reason: "Corporate workers need regular haircuts — offices are your most reliable client source." },
  },
  // Kids entertainment
  indoor_play: {
    school:    { score: +15, reason: "School areas = families with young children — perfect catchment for indoor play." },
    bar:       { score: -20, reason: "Parents will not bring children to a nightlife strip — absolute location killer." },
    residential: { score: +18, reason: "Young families cluster in suburbs — proximity to homes is everything for play centres." },
  },
  preschool: {
    bar:       { score: -20, reason: "Absolute red flag — parents avoid sending toddlers anywhere near nightlife." },
    residential: { score: +20, reason: "Young families are your entire market — suburban residential is ideal." },
    fast_food: { score: -8,  reason: "Fast food environment signals a family-unfocused area — reduces enrollment." },
  },
  // Brunch café loves weekends and parks
  brunch: {
    park:      { score: +12, reason: "Weekend park crowds = brunch crowds — highest overlap of any signal." },
    residential: { score: +14, reason: "Locals are your core brunch customer — Sunday regulars drive the whole week." },
    office_tower: { score: -4, reason: "Office areas are quiet on weekends — brunch's peak trading time." },
  },
  // Specialty coffee is office-dependent
  specialty_coffee: {
    office_tower: { score: +22, reason: "Specialty coffee is an office ritual — proximity to offices drives 70% of weekday revenue." },
    gym:          { score: +10, reason: "Post-workout cold brew is a growing category — gym adjacency is valuable." },
  },
};

// ─── Scoring Functions ───────────────────────────────────────────────────────

export { RULES_BY_CATEGORY };

export function scoreNeighbors(
  categoryId: string,
  subtypeId: string,
  neighborCounts: Record<string, number>
): Signal[] {
  const categoryRules = RULES_BY_CATEGORY[categoryId] ?? RULES_BY_CATEGORY.restaurant;
  const subtypeOverrides = SUBTYPE_OVERRIDES[subtypeId] ?? {};
  const MAX_COUNT = 10; // cap to avoid extreme swings from high counts

  const signals: Signal[] = [];

  for (const [id, count] of Object.entries(neighborCounts)) {
    if (count === 0) continue;
    const baseRule = categoryRules[id];
    if (!baseRule) continue;

    // Merge subtype override on top of base category rule
    const override = subtypeOverrides[id] ?? {};
    const rule: SignalRule = { ...baseRule, ...override };

    const cappedCount = Math.min(count, MAX_COUNT);
    const rawScore = rule.score * cappedCount;

    signals.push({
      id,
      label: rule.label,
      count,
      score: rawScore,
      verdict: getVerdict(rawScore),
      reason: rule.reason,
      impact: `${rawScore > 0 ? "+" : ""}${rawScore} pts`,
    });
  }

  // Sort: worst conflicts first, then best synergies
  return signals.sort((a, b) => a.score - b.score);
}

export function overallScore(signals: Signal[]): OverallResult {
  const total = signals.reduce((sum, s) => sum + s.score, 0);
  const clamped = Math.max(-100, Math.min(100, total));
  const grade   = clamped >= 60 ? "A" : clamped >= 30 ? "B" : clamped >= 0 ? "C" : clamped >= -30 ? "D" : "F";
  const verdict = clamped >= 40 ? "great" : clamped >= 10 ? "proceed" : clamped >= -20 ? "caution" : "avoid";
  return { score: clamped, grade, verdict };
}

export function verdictLabel(verdict: Verdict): string {
  switch (verdict) {
    case "great":   return "Great";
    case "proceed": return "Proceed";
    case "caution": return "Caution";
    case "avoid":   return "Avoid";
  }
}

export function verdictTone(verdict: Verdict): string {
  switch (verdict) {
    case "great":   return "text-signal-green border-signal-green";
    case "proceed": return "text-accent border-accent";
    case "caution": return "text-signal-amber border-signal-amber";
    case "avoid":   return "text-signal-red border-signal-red";
  }
}

function getVerdict(score: number): Verdict {
  if (score >= 15)  return "great";
  if (score >= 0)   return "proceed";
  if (score >= -15) return "caution";
  return "avoid";
}
