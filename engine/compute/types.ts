/**
 * engine/compute/types.ts — Types for the chart computation engine.
 */

export interface BirthInput {
  date: string
  time: string
  timezone: number
  latitude: number
  longitude: number
  name?: string
  /**
   * Controls the sunrise reference point used for time-based special lagnas
   * (Bhava/Hora/Ghati Lagna, Varnada, Kunda, Pranapada):
   *
   *   "precise" — uses real astronomical sunrise via Swiss Ephemeris.
   *               Astronomically accurate; may differ from software like
   *               Jagannatha Hora that uses the simplified convention.
   *
   *   "jhora"   — uses a fixed 6:00 AM local time as sunrise, matching
   *               the convention used by Jagannatha Hora (PVR Narasimha Rao).
   *               Useful for cross-verification against JHora charts.
   *
   * Defaults to "precise".
   */
  sunriseMode?: 'precise' | 'jhora'
}

export interface PlanetPosition {
  planet: string
  longitude: number
  latitude: number
  speed: number
  retrograde: boolean
  sign: string
  signNumber: number
  degreeInSign: number
  house: number
}

export interface NakshatraInfo {
  planet: string
  nakshatra: string
  nakshatraIndex: number
  pada: number
  nakshatraLord: string
  degreeInNakshatra: number
  subLord: string
}

export interface DivisionalPlacement {
  planet: string
  sign: string
  signNumber: number
  house: number
  retrograde?: boolean
  /**
   * Panchadha-maitri dignity label of the planet in THIS varga sign
   * (exalted / debilitated / moolatrikona / own / great_friend / friend /
   * neutral / enemy / great_enemy). `undefined` for Rahu/Ketu, which carry no
   * classical friendship dignity. Computed deterministically — see
   * `engine/compute/dignity.ts`.
   */
  dignity?: import('./dignity').DignityLabel
  /**
   * True when the planet occupies the SAME sign in this varga as it does in D1
   * (rasi) — i.e. vargottama in this division. A strong dignity, classically
   * treated on par with own/exaltation, so it is exposed SEPARATELY from
   * `dignity` (which reports only the positional friend/enemy status of the
   * varga sign). Set only when true; never set for D1 itself, where it would
   * be trivially true for every planet. Applies to all bodies, incl. Rahu/Ketu.
   */
  vargottama?: boolean
}

/** An arudha pada as placed within a specific chart (for display). */
export interface ChartArudhaMark {
  abbr: string
  signNumber: number
  house_in_chart: number
}

/** A special lagna / upagraha as placed within a specific chart (for display). */
export interface ChartPointMark {
  abbr: string
  signNumber: number
  house: number
}

export interface DivisionalChart {
  division: number
  name: string
  shortName: string
  lagna: string
  lagnaSignNumber: number
  lagnaDegreee: number
  planets: DivisionalPlacement[]
  /** Arudha padas computed within this varga (A1–A12). */
  arudhaPadas?: ChartArudhaMark[]
  /** Special lagnas projected into this varga. */
  specialLagnas?: ChartPointMark[]
  /** Upagrahas projected into this varga. */
  upagrahas?: ChartPointMark[]
}

export interface CharaKaraka {
  planet: string
  karaka: string
  karakaAbbr: string
  degreeInSign: number
}

/**
 * One house of the Ashtakavarga chart, indexed FROM THE LAGNA (house 1 = the
 * lagna sign). Pre-rotated so consumers never re-derive the house→sign mapping.
 */
export interface AshtakavargaHouseEntry {
  /** House number 1–12, counted from the lagna. */
  house: number
  /** Sign occupying this house (1=Aries … 12=Pisces). */
  signNumber: number
  /** Sign name. */
  sign: string
  /** Sarvashtakavarga bindus in this house/sign. */
  sav: number
  /** Per-planet (Bhinnashtakavarga) bindus in this house/sign. */
  bav: Record<string, number>
}

export interface AshtakavargaResult {
  /** Bhinnashtakavarga per planet — SIGN-indexed 12-slot arrays (0 = Aries). */
  bav: Record<string, number[]>
  /** Sarvashtakavarga — SIGN-indexed 12-slot array (0 = Aries). */
  sav: number[]
  savTotal: number
  /**
   * Lagna sign number (1–12) used to build the house-indexed view. Optional
   * because charts computed/stored before this field existed will not carry it
   * (present on all freshly computed charts).
   */
  lagnaSignNumber?: number
  /**
   * House-indexed view (house 1 = lagna sign), pre-rotated from the SIGN-indexed
   * `bav`/`sav` above so callers don't hand-map houses to signs. Optional for
   * the same back-compat reason as `lagnaSignNumber`.
   */
  byHouse?: AshtakavargaHouseEntry[]
}

// ─── New types ───────────────────────────────────────────────────────

export interface Upagraha {
  name: string
  abbr: string
  longitude: number
  sign: string
  signNumber: number
  degreeInSign: number
  house: number
}

export interface SpecialLagna {
  name: string
  abbr: string
  longitude: number
  sign: string
  signNumber: number
  degreeInSign: number
  house: number
}

export interface ArudhaPada {
  house: number
  name: string
  abbr: string
  signNumber: number
  sign: string
  house_in_chart: number
}

export interface PindaStrengthEntry {
  planet: string
  uchcha_bala: number
  sapta_varga_bala: number
  ojha_yugma_bala: number
  kendradi_bala: number
  drekana_bala: number
  total: number
  pct: number
  grade: string
}

export interface TransitPlanet {
  planet: string
  longitude: number
  sign: string
  signNumber: number
  degreeInSign: number
  retrograde: boolean
  houseFromMoon: number
  houseFromLagna: number
}

export interface SadeSatiPeriod {
  phase: 'rising' | 'peak' | 'setting'
  phaseSign: string
  startApprox: string
  endApprox: string
  isCurrent: boolean
}

export interface SadeSatiInfo {
  active: boolean
  phase: 'rising' | 'peak' | 'setting' | null
  saturnSignNumber: number
  natalMoonSignNumber: number
  description: string
  allPeriods: SadeSatiPeriod[]
}

/** One contiguous passage of Saturn through the ±45° window (R6.1, R6.2). */
export interface DegreeSadeSatiPeriod {
  /** 1-based, contiguous, ascending by start across the whole scan horizon (R6.6). */
  sequence: number
  /** ISO-8601 UTC, bisection-refined (R6.8). */
  start: string
  end: string
  /** "Mon YYYY" display form, matching the sign-based reading's convention. */
  startApprox: string
  endApprox: string
  /** end − start in days (fractional). The machine-readable duration (R6.2). */
  durationDays: number
  /** True when [start, end) contains TransitAnalysis.asOf (R6.2, R6.10, R6.11). */
  isCurrent: boolean
  /** Integer 0–100, rounded half away from zero. Present only when isCurrent (R6.13). */
  completionPct?: number
  /** Days from asOf to `start`, fractional. Present only when start > asOf (R6.14). */
  startsInDays?: number
  /** R6.15, e.g. "Saturn ±45° from natal Moon (347.76°) - 12th, 1st, 2nd houses". */
  label: string
}

export interface DegreeSadeSatiInfo {
  /** Natal Moon sidereal longitude (0–360) the window is centred on. */
  natalMoonLongitude: number
  /** Half-width of the window in degrees. Always 45 for this reading (R6.1). */
  orbDeg: number
  /** True when asOf falls inside the window (R6.3). */
  active: boolean
  /** Shorter-arc separation |Saturn − natal Moon| at asOf, 0–180 (R6.3). */
  separationDeg: number
  /** The horizon actually scanned, so a divergence can be attributed (R6.9). */
  scanFromYear: number
  scanToYear: number
  /** Ascending by start; non-overlapping (R6.12). */
  allPeriods: DegreeSadeSatiPeriod[]
}

export interface MoonTransitPeriod {
  signNumber: number
  sign: string
  entryDate: string
  exitDate: string
  isCurrent: boolean
  houseFromMoon: number
}

export interface AscendantTransitPeriod {
  signNumber: number
  sign: string
  entryDate: string
  exitDate: string
  isCurrent: boolean
  houseFromLagna: number
}

export interface TransitAnalysis {
  asOf: string
  transits: TransitPlanet[]
  sadeSati: SadeSatiInfo
  /**
   * Degree-based Sade Sati — sibling of `sadeSati`, never nested inside it.
   * Optional: absent on charts computed before this addition, and absent when the
   * caller supplies no natal Moon longitude.
   */
  sadeSatiByDegree?: DegreeSadeSatiInfo
  ashtamaShani: boolean
  kantakaShani: boolean
  currentMoonSign: string
  natalMoonSign: string
  moonTransitSameAsNatal: boolean
  moonTransits: MoonTransitPeriod[]
  ascendantTransits: AscendantTransitPeriod[]
}

// ─── Shadbala (1C) ───────────────────────────────────────────────────

export interface ShadbalComponent {
  sthana: number
  dig: number
  kaala: number
  cheshta: number
  naisargika: number
  drik: number
  total: number
}

export interface ShadbalPlanet {
  planet: string
  components: ShadbalComponent

  // Sthana sub-components
  ucchaBala: number
  saptaVargaBala: number
  ojhaYugmaBala: number
  kendradiBala: number
  drekkanaBala: number

  // Kaala sub-components
  natonnata: number
  pakshaBala: number
  tribhagaBala: number
  abdaBala: number
  masaBala: number
  varaBala: number
  horaBala: number
  ayanaBala: number

  cheshtaBala: number
  naisargikaBala: number
  drikBala: number

  // Derived
  totalVirupas: number
  requiredRupas: number
  totalRupas: number
  strengthRatio: number
  grade: 'Strong' | 'Average' | 'Weak'
  gradePct: number

  // Ishta/Kashta
  ishtaPhala: number
  kashtaPhala: number
  beneficRatio: number

  // Vimsopaka
  vimsopakaScore: number

  // Retro effect classification
  retroEffect: 'brightening' | 'stationary' | 'internalised' | 'direct_normal' | 'near_combustion_exception'
}

export interface ShadbalResult {
  planets: ShadbalPlanet[]
  strengthRanking: { rank: number; planet: string; ratio: number }[]
  computedAt: string
}

// ─── Relationship Geometry (1D) ──────────────────────────────────────

export interface Conjunction {
  planets: string[]
  sign: string
  signNumber: number
  house: number
  orb: number
  isSandhi?: boolean
  involvesUpagraha?: boolean
  upagrahaAbbrs?: string[]
  gulikaAffliction?: boolean
}

export interface AspectEdge {
  from: string
  fromHouse: number
  toHouse: number
  toSign: number
  toPlanets: string[]
  toUpagrahas: string[]
  type: string
  strength: number
  school: 'parashari' | 'jaimini_optional'
}

export interface RashiAspectEdge {
  fromSign: string
  fromSignNumber: number
  fromHouse: number
  toSign: string
  toSignNumber: number
  toHouse: number
  toPlanets: string[]
  type: 'movable_to_fixed' | 'fixed_to_movable' | 'dual_to_dual'
}

export interface PlanetaryWar {
  planet_a: string
  planet_b: string
  separation_deg: number
  winner: string
  loser: string
  intense: boolean
}

export interface Parivartana {
  planet_a: string
  sign_a: string
  house_a: number
  planet_b: string
  sign_b: string
  house_b: number
  exchange_type: 'maha' | 'dainya' | 'kahala' | 'simple'
}

export interface Stellium {
  sign: string
  signNumber: number
  house: number
  planets: string[]
  count: number
  isStrong: boolean
}

export interface CombustionResult {
  planet: string
  degreeFromSun: number
  combust: boolean
  cazimi: boolean
  nearCombust: boolean
  threshold: number
  retrogradeThresholdApplied: boolean
  moonStrictCombust?: boolean
}

export interface AvasthaResult {
  planet: string
  avastha: 'Bala' | 'Kumara' | 'Yuva' | 'Vriddha' | 'Mrita'
  avasthaStrength: 'VeryWeak' | 'Weak' | 'Moderate' | 'Strong'
}

export interface GandantaResult {
  planet: string
  gandanta: boolean
  junctionPoint?: string
  degreesFromJunction?: number
}

export interface SandhiResult {
  planet: string
  sandhi: boolean
  type?: 'ingress' | 'egress'
  degreeInSign: number
}

export interface UpagrahaPlacement {
  abbr: string
  name: string
  signNumber: number
  house: number
}

export interface HouseLordships {
  [division: number]: {
    [house: number]: string
  }
}

export interface RelationshipGeometry {
  conjunctions: Conjunction[]
  aspects: AspectEdge[]
  rashiAspects: RashiAspectEdge[]
  grahaYuddha: PlanetaryWar[]
  mutualReception: Parivartana[]
  stelliums: Stellium[]
  combustion: CombustionResult[]
  avastha: AvasthaResult[]
  gandanta: GandantaResult[]
  sandhi: SandhiResult[]
  upagrahaPlacements: UpagrahaPlacement[]
  houseLords: HouseLordships
  computedAt: string
}

// ─── Nakshatra Relationships ─────────────────────────────────────────

export interface NakshatraAxisEntry {
  planet: string
  nakshatra: string
  pada: number
  nakshatraLord: string
  subLord: string
}

export interface NakshatraRelationships {
  subLords: { planet: string; subLord: string }[]
  depositorChains: { planet: string; chain: string[]; selfReinforcing: boolean }[]
  nakshatraParivartana: { planet_a: string; planet_b: string }[]
  clusters: { nakshatra: string; nakshatraLord: string; planets: string[]; count: number }[]
  rahuKetuAxis: { rahu: NakshatraAxisEntry; ketu: NakshatraAxisEntry }
  nakshatraLordGroups: Record<string, string[]>
  computedAt: string
}

// ─── Jaimini Geometry ────────────────────────────────────────────────

export interface ArgalaEntry {
  targetSign: number
  targetHouse: number
  argalaFrom: number
  argalaPlanets: string[]
  type: 'primary' | 'secondary'
  kind: 'argala'
}

export interface VirodhaArgalaEntry {
  targetSign: number
  counterFrom: number
  counterPlanets: string[]
  neutralizes: number
}

export interface JaiminiGeometry {
  argala: ArgalaEntry[]
  virodhaArgala: VirodhaArgalaEntry[]
  yogiPoint: { longitude: number; signNumber: number; nakshatra: string; yogiPlanet: string }
  avayogiPoint: { longitude: number; signNumber: number; nakshatra: string; avayogiPlanet: string }
  specialLagnaAspects: { lagna: string; signNumber: number; aspectsHouses: number[] }[]
  lordRelationshipMap: { lordA: string; houseA: number; lordB: string; houseB: number; relationship: 'kendra' | 'trikona' | 'kendra_trikona' | 'none' }[]
  computedAt: string
}

// ─── Named Yogas ─────────────────────────────────────────────────────

export type YogaCategory =
  | 'mahapurusha'
  | 'raja'
  | 'dhana'
  | 'viparita'
  | 'lunar'
  | 'neechabhanga'
  | 'parivartana'
  | 'kartari'
  | 'combination'   // Budha-Aditya, Gaja Kesari, etc.

export type YogaStrength = 'strong' | 'moderate' | 'weak'

/** How a yoga was recognized — the auditable seam downstream analyzers (F3/F4/F5) read. */
export interface YogaEvidence {
  /** Machine rule id that fired, e.g. "raja.kendra_trikona.conjunction". */
  rule: string
  /** Linkage type when the yoga is an association. */
  linkage?: 'conjunction' | 'graha_aspect' | 'rashi_aspect' | 'parivartana' | 'placement'
  /** Houses each involved planet owns (planet → houses), for lord-based yogas. */
  ownedHouses?: Record<string, number[]>
  /** Dignity label of each involved planet where dignity gated the rule. */
  dignity?: Record<string, string>
  /** Combustion / cancellation context — never dropped (F3 seam). */
  afflictions?: Array<{ planet: string; kind: 'combust' | 'debilitated' | 'nodal'; detail?: string }>
  /** Free-form notes (school variant, e.g. Gaja Kesari from Lagna). */
  notes?: string[]
}

export interface Yoga {
  /** Stable machine key, e.g. "mahapurusha.sasa", "raja.dka". */
  key: string
  /** Human name, e.g. "Sasa Yoga", "Dharma-Karmadhipati Raja Yoga". */
  name: string
  category: YogaCategory
  /** Participating grahas, sorted for deterministic output. */
  planets: string[]
  /** Houses (from lagna) the yoga implicates, sorted. */
  houses: number[]
  /** Net classical benefic/malefic disposition of the yoga. */
  benefic: boolean
  /** Coarse formation-quality grade (NOT a calibrated score). */
  strength: YogaStrength
  /** Planets whose dashas classically fire the yoga (slicer hint; no dates). */
  activatingPlanets: string[]
  evidence: YogaEvidence
}

// ─── Bhava Bala ──────────────────────────────────────────────────────

export interface BhavaBalaHouse {
  house: number
  bhavadhipatiBala: number
  bhavaDigBala: number
  bhavaDrishtiBala: number
  total: number
  rupas: number
}

export interface BhavaBalaResult {
  houses: BhavaBalaHouse[]
  computedAt: string
}

// ─── Varshaphal (Tajika annual solar-return chart) ───────────────────

/** The five office-bearer candidates competing to be Varshesha (year lord). */
export interface VarsheshaCandidate {
  /** Which office this planet holds among the five. */
  office:
    | 'muntha_lord'
    | 'varsha_lagna_lord'
    | 'janma_lagna_lord'
    | 'dinaratri_lord'
    | 'trirashi_lord'
  planet: string
  /** Human-readable label for the office. */
  officeLabel: string
  /** Final Panchavargeeya Bala (0–20 scale). */
  panchavargeeyaBala: number
}

/** Per-planet Panchavargeeya Bala breakdown (Tajika 5-fold strength). */
export interface PanchavargeeyaBalaEntry {
  planet: string
  kshetraBala: number   // sign dignity (Vishwa)
  ucchaBala: number     // exaltation proximity (Vishwa)
  haddaBala: number     // Egyptian term / bound (Vishwa)
  drekkanaBala: number  // D3 dignity (Vishwa)
  navamsaBala: number   // D9 dignity (Vishwa)
  total: number         // sum of the five (Vishwa)
  finalBala: number     // total / 4 → 0–20
  grade: 'Weak' | 'Ordinary' | 'Powerful' | 'VeryStrong' | 'Extraordinary'
}

export interface Muntha {
  signNumber: number
  sign: string
  /** House occupied in the annual (Varsha) chart, counted from Varsha Lagna. */
  house: number
  lord: string
}

export interface VarshaPravesh {
  julianDay: number
  /** Local civil date of the solar return (YYYY-MM-DD). */
  date: string
  /** Local civil time of the solar return (HH:MM:SS). */
  time: string
  /** ISO-8601 UTC instant of the solar return. */
  utcISO: string
  weekday: string
  weekdayLord: string
}

export interface VarshaphalResult {
  varshaYear: number
  /** Completed years of age at the solar return (= varshaYear − birthYear). */
  age: number
  natalSunLongitude: number
  natalLagnaSignNumber: number
  varshaPravesh: VarshaPravesh
  /** Full chart cast for the solar-return instant at the birthplace. */
  annualChart: ComputedChart
  muntha: Muntha
  /**
   * Whether the year COMMENCES (Varsha Pravesh) by day — the annual Sun above
   * the horizon (houses 7–12). Drives the Dinaratri & Trirashi year-lord offices.
   */
  dayVarsha: boolean
  panchavargeeyaBala: PanchavargeeyaBalaEntry[]
  candidates: VarsheshaCandidate[]
  /** The selected year lord (strongest candidate by Panchavargeeya Bala). */
  varshesha: {
    planet: string
    office: VarsheshaCandidate['office']
    officeLabel: string
    panchavargeeyaBala: number
  }
  /** Method notes / caveats surfaced to the UI. */
  method: string
  computedAt: string
}

// ─── Full chart result ───────────────────────────────────────────────

export interface ComputedChart {
  input: BirthInput
  sunriseMode: 'precise' | 'jhora'
  /** true when precise sunrise was requested but swe_rise_trans failed — 6 AM was used instead */
  sunriseFallback: boolean
  julianDay: number
  ayanamsa: number
  lagna: string
  lagnaSignNumber: number
  lagnaLongitude: number
  lagnaDegreeInSign: number
  planets: PlanetPosition[]
  /**
   * The 9 grahas' nakshatra entries followed by a final `planet: 'Ascendant'`
   * entry (10 total). Consumers that reason about planet-to-planet nakshatra
   * geometry MUST filter `planet !== 'Ascendant'` first — `computeFullChart`
   * already passes a planets-only array into `computeNakshatraRelationships`.
   */
  nakshatras: NakshatraInfo[]
  /**
   * The Ascendant (Lagna) nakshatra — the same longitude→nakshatra arithmetic
   * used for the grahas applied to `lagnaLongitude` (PVR/JHora methodology).
   * Prefer this over scanning `nakshatras` for `planet === 'Ascendant'`.
   * Purely derived from `lagnaLongitude`, so it can always be recomputed for
   * charts stored before this field existed.
   */
  ascendantNakshatra: NakshatraInfo
  divisionalCharts: DivisionalChart[]
  charaKarakas: CharaKaraka[]
  ashtakavarga: AshtakavargaResult
  upagrahas: Upagraha[]
  specialLagnas: SpecialLagna[]
  arudhaPadas: ArudhaPada[]
  pindaStrength: PindaStrengthEntry[]
  transits: TransitAnalysis
  // ─── Batch 1 additions (always populated by computeFullChart) ───
  relationships: RelationshipGeometry
  shadbala: ShadbalResult
  computedNakshatra: NakshatraRelationships
  computedJaimini: JaiminiGeometry
  bhavaBala: BhavaBalaResult
  /** Deterministic named-yoga catalogue (engine/compute/yogas.ts). */
  yogas: Yoga[]
}

// ─── Chara Dasha (Jaimini rasi dasha) ────────────────────────────────

/** One equal 1/12 sub-period (antardasha) of a Chara mahadasha. */
export interface CharaAntardasha {
  /** Sign name of this sub-period. */
  sign: string
  /** Sign number (1–12). */
  signNumber: number
  /** ISO start datetime. */
  start: string
  /** ISO end datetime. */
  end: string
  /** Duration in years (mahadasha years / 12). */
  durationYears: number
}

/** One Chara mahadasha — a SIGN period (not a planet period). */
export interface CharaDashaPeriod {
  /** Mahadasha sign name. */
  sign: string
  /** Mahadasha sign number (1–12). */
  signNumber: number
  /** Classical lord of the sign (Scorpio→Mars, Aquarius→Saturn; no nodes). */
  lord: string
  /** Sign number the lord occupies in D1 (drives the duration). */
  lordSignNumber: number
  /** Duration in years (variable per sign; second-cycle = 12 − first-cycle). */
  durationYears: number
  /** Which of the two 12-sign cycles this period belongs to (1 or 2). */
  cycle: number
  /** ISO start datetime. */
  start: string
  /** ISO end datetime. */
  end: string
  /** The 12 equal antardashas of this mahadasha. */
  antardashas: CharaAntardasha[]
}

/** Complete Jaimini Chara Dasha (Parasara / PVR method) for a chart. */
export interface CharaDashaResult {
  /** Method label, e.g. "Parasara / PVR (JHora-matching, 2-cycle)". */
  method: string
  /** Ascendant sign number (1–12). */
  lagnaSignNumber: number
  /** 9th sign from the lagna — decides the sequence direction. */
  ninthSignNumber: number
  /** Sequence direction of the mahadashas. */
  direction: 'forward' | 'reverse'
  /** Sum of the FIRST 12-sign cycle in years (second cycle sums to 144 − this). */
  cycleYears: number
  /** Two cycles of dated sign mahadashas (24 periods, 144 years total). */
  periods: CharaDashaPeriod[]
}

// ─── Marriage Matchmaking (Ashtakoota Guna Milan + Mangal Dosha) ──────

/**
 * Bride/groom role. Every matchmaking type and scorer parameter is named
 * `bride`/`groom` — never `a`/`b` — so directional kootas (Varna) cannot be
 * got wrong by argument order. See engine/compute/matchmaking.ts.
 */
export type MatchRole = 'bride' | 'groom'

/** The 8 Ashtakoota kootas, in fixed scoring order. */
export type KootaKey =
  | 'varna' | 'vashya' | 'tara' | 'yoni'
  | 'grahaMaitri' | 'gana' | 'bhakoot' | 'nadi'

/**
 * A Bhanga (cancellation) rule that fired for a dosha-bearing koota or for
 * Mangal Dosha. Recorded in evidence — NEVER applied silently by mutating a
 * score/status out from under the caller (mirrors yogas.ts's Neechabhanga
 * evidence pattern).
 */
export interface Cancellation {
  /** Stable machine rule id, e.g. "nadi.same_nakshatra_different_rashi". */
  rule: string
  /** Human name, e.g. "Nadi Bhanga (same nakshatra, different rashi)". */
  name: string
  /** Plain-text description of the satisfying condition. */
  condition: string
}

/** Auditable inputs/outputs behind one koota's score — the "why" a point total was reached. */
export interface KootaEvidence {
  /** Machine rule id for the scoring path taken, e.g. "gana.matrix". */
  rule: string
  /** The bride's relevant attribute values (nakshatra/rashi/gana/yoni/etc.), by name. */
  bride: Record<string, string | number>
  /** The groom's relevant attribute values, by name. */
  groom: Record<string, string | number>
  /** Free-form notes — e.g. which directional check fired, simplifications taken. */
  notes?: string[]
}

export interface KootaScore {
  key: KootaKey
  /** Display label, e.g. "Graha Maitri". */
  name: string
  /** Fractional — 0.5 steps are legitimate (Vashya, Graha Maitri, Tara). NEVER rounded. */
  points: number
  maxPoints: number
  /** 'unavailable' when required input was missing/malformed — never a throw. */
  status: 'scored' | 'unavailable'
  evidence: KootaEvidence
  /** Set only when a Bhanga rule nullified this koota's dosha (Nadi, Bhakoot). */
  cancellation?: Cancellation
}

/**
 * Presentation-only guidance band for a `gunaScore`. These bands
 * (<18 / 18-24 / 24-32 / >=32) are ALMANAC / COMMERCIAL-SOFTWARE
 * CONVENTION — NOT classical Parashari and NOT PVR Narasimha Rao (NFR-8).
 * They must never be presented as a verdict of record.
 *
 * `'incomplete'` is NOT a band — it is returned whenever any koota reported
 * `status: 'unavailable'`, because a band derived from a partial sum is
 * actively misleading: an unscored Nadi alone caps the reachable total at
 * (maxScore - 8), so a strong match would read `good` instead of
 * `excellent`, and a fully unscorable pair (e.g. two natives carrying the
 * same role) would otherwise render as a confident `below_average` on a
 * score of 0.
 */
export type MatchVerdict = 'below_average' | 'average' | 'good' | 'excellent' | 'incomplete'

/** Per-native boundary-risk flag — Moon longitude close to a nakshatra edge (OD-12). */
export interface BoundaryRisk {
  role: MatchRole
  /** Present only when the caller supplied a Moon longitude for this native. */
  moonLongitude?: number
  /** Degrees to the nearest nakshatra boundary. Present only alongside moonLongitude. */
  distanceToBoundaryDeg?: number
  /** True when distanceToBoundaryDeg is within the tunable threshold (see matchmaking.ts). */
  atRisk: boolean
}

export interface AshtakootaResult {
  /**
   * 0–maxScore, in 0.5 steps — NEVER rounded, floored, or truncated on
   * store.
   */
  gunaScore: number
  /**
   * The classical framework's fixed denominator, 36 — computed as
   * `TOTAL_KOOTA_MAXIMA` (matchmakingTables.ts) rather than hardcoded a
   * second time, so it can never drift from the koota maxima it is the sum
   * of. Matches JHora/PyJHora's own display convention: a fixed "X / 36"
   * regardless of whether a given pair could reach it — NOT a per-pair or
   * per-implementation "corrected" reachable ceiling (see
   * `KOOTA_MAXIMA.tara`'s doc comment for why Tara's declared 3 stays 3 even
   * though no pair can score more than 1.5 of it).
   */
  maxScore: number
  /** Always 8 entries, in fixed order (varna, vashya, tara, yoni, grahaMaitri, gana, bhakoot, nadi). */
  kootas: KootaScore[]
  verdict: MatchVerdict
  /** One entry per native. */
  boundaryRisk: BoundaryRisk[]
  /** Requirement 5.5 boilerplate text — rendered, not decorative. */
  limitations: string[]
}

/** Per-native Mangal Dosha (Kuja Dosha) result. */
export interface MangalDoshaNative {
  status: 'manglik' | 'not_manglik' | 'unavailable'
  /** Provenance, never a bare boolean — which reference point(s) triggered it. */
  triggeredFrom: Array<'lagna' | 'moon' | 'venus'>
  marsHouseFrom: Record<'lagna' | 'moon' | 'venus', number | null>
  cancellations: Cancellation[]
}

export interface MatchResult {
  ashtakoota: AshtakootaResult
  mangalDosha: {
    bride: MangalDoshaNative
    groom: MangalDoshaNative
    compatibility: 'matched' | 'mismatched' | 'cancelled' | 'unavailable'
  }
  /** Bump when a koota table changes — see matchmakingTables.MATCHMAKING_TABLES_VERSION. */
  tablesVersion: string
}
