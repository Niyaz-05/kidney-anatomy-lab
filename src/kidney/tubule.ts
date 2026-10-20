/**
 * What the tubule does to the filtrate (pure), with the textbook shares (OpenStax A&P 2e §25.6, §25.9;
 * Guyton & Hall, Textbook of Medical Physiology 14e, ch. 28):
 * - proximal tubule: about 65 % of the filtered sodium and water, all the glucose and amino acids;
 * - loop of Henle: about 25 % of the sodium (thick ascending limb) and 15 % of the water
 *   (descending limb), building the medullary osmotic gradient from 300 to 1,200 mOsm/kg;
 * - distal tubule: about 5 % of the sodium, little water;
 * - collecting duct: the rest of the sodium (aldosterone) and the water ADH allows.
 *
 * Daily water balance follows Guyton & Hall table 25-1: water taken in (drinks and food) plus
 * 0.2 L made by metabolism, minus 0.9 L lost through skin, breath, sweat and faeces, leaves the
 * urine. The kidneys excrete about 600 mOsm of solute a day on a normal diet, so the urine's
 * concentration follows from its volume, between 50 and 1,200 mOsm/kg. Below 0.5 L/day the solute
 * cannot all be excreted (the obligatory urine volume).
 */
import { filtration, RESTING, type FiltrationInput } from './filtration';

export const PLASMA = { sodium: 140, osmolality: 290 } as const;
export const URINE_LIMITS = { minOsm: 50, maxOsm: 1200, obligatoryL: 0.5, soluteMosmPerDay: 600 } as const;
export const WATER = { metabolicL: 0.2, otherLossesL: 0.9 } as const;
/** Glucose transport maximum, mg/min (Guyton & Hall: about 375 mg/min). */
export const GLUCOSE_TM = 375;

export type SegmentId = 'glomerulus' | 'pct' | 'descending' | 'thin-ascending' | 'thick-ascending' | 'dct' | 'collecting';

export interface Segment {
  id: SegmentId;
  label: string;
  /** Share of the filtered sodium taken back here. */
  sodium: number;
  /** Share of the filtered water taken back here (the collecting duct's share depends on ADH). */
  water: number | 'adh';
  does: string;
}

export const SEGMENTS: readonly Segment[] = [
  { id: 'glomerulus', label: 'Glomerulus and Bowman’s capsule', sodium: 0, water: 0, does: 'Blood pressure pushes water and small solutes out of the capillaries into the capsule: about 125 mL a minute. Blood cells and most proteins stay in the blood.' },
  { id: 'pct', label: 'Proximal convoluted tubule', sodium: 0.65, water: 0.65, does: 'Takes back about two thirds of the sodium, water, potassium and chloride, nearly all the bicarbonate, and all the glucose and amino acids. Its cells have a brush border of microvilli. It also secretes H⁺, drugs and toxins.' },
  { id: 'descending', label: 'Descending limb of the loop of Henle', sodium: 0, water: 0.15, does: 'Lets water out but not salt. As it goes deeper into the salty medulla, water leaves and the filtrate becomes more concentrated (up to about 1,200 mOsm/kg at the bend in long loops).' },
  { id: 'thin-ascending', label: 'Thin ascending limb', sodium: 0.05, water: 0, does: 'Impermeable to water; salt leaks out passively into the medulla.' },
  { id: 'thick-ascending', label: 'Thick ascending limb', sodium: 0.2, water: 0, does: 'Pumps Na⁺, K⁺ and Cl⁻ out (the transporter that loop diuretics block) but keeps water in. This builds the salty medulla and leaves the filtrate dilute, about 100 mOsm/kg. Its macula densa cells sense the salt and signal the glomerulus.' },
  { id: 'dct', label: 'Distal convoluted tubule', sodium: 0.05, water: 0, does: 'Takes back more sodium and chloride, and calcium under parathyroid hormone; little water.' },
  { id: 'collecting', label: 'Collecting duct', sodium: 0.04, water: 'adh', does: 'Aldosterone makes it take back sodium and secrete potassium. ADH puts water channels (aquaporin-2) in its walls, so water leaves into the salty medulla and the urine becomes concentrated. Without ADH the urine stays dilute.' },
];

export interface WaterBalance {
  /** Water taken in, L/day (drinks and food). */
  intakeL: number;
  /** Urine, L/day. */
  urineL: number;
  /** Urine concentration, mOsm/kg. */
  urineOsm: number;
  /** ADH level, 0 (none) … 1 (maximal). */
  adh: number;
  /** Too little water to make the obligatory urine: the body is drying out. */
  dehydrating: boolean;
  /** More water than the kidneys can excrete: plasma becomes dilute. */
  overloaded: boolean;
  /** Share of the filtered water excreted. */
  waterExcretedShare: number;
}

const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));

/** Steady state for a daily water intake (with the default 125 mL/min filtration). */
export function waterBalance(intakeL: number, gfrMlMin = filtration(RESTING).gfr): WaterBalance {
  const { minOsm, maxOsm, obligatoryL, soluteMosmPerDay } = URINE_LIMITS;
  const needed = intakeL + WATER.metabolicL - WATER.otherLossesL;
  const maxL = soluteMosmPerDay / minOsm;
  const urineL = clamp(needed, obligatoryL, maxL);
  const urineOsm = clamp(soluteMosmPerDay / urineL, minOsm, maxOsm);
  const adh = (urineOsm - minOsm) / (maxOsm - minOsm);
  const filteredL = (gfrMlMin * 1440) / 1000;
  return {
    intakeL, urineL, urineOsm, adh,
    dehydrating: needed < obligatoryL,
    overloaded: needed > maxL,
    waterExcretedShare: filteredL > 0 ? urineL / filteredL : 0,
  };
}

/**
 * Osmolality of the tubular fluid along a nephron, at a fraction 0 … 1 of each segment.
 * Long (juxtamedullary) loops reach the inner medulla's 1,200 mOsm/kg; short (cortical) loops turn
 * in the outer medulla at about 600. The collecting duct ends at the urine's concentration.
 */
export function osmolalityAt(segment: SegmentId, t: number, urineOsm: number, longLoop = true): number {
  const tip = longLoop ? URINE_LIMITS.maxOsm : 600;
  const x = clamp(t, 0, 1);
  switch (segment) {
    case 'glomerulus': case 'pct': return 300;
    case 'descending': return 300 + (tip - 300) * x;
    case 'thin-ascending': return tip - (tip - 400) * x;
    case 'thick-ascending': return 400 - 300 * x;
    case 'dct': return 100;
    case 'collecting': {
      // Cortex: equilibrates towards 300 if ADH is present; then concentrates through the medulla.
      const adh = (urineOsm - URINE_LIMITS.minOsm) / (URINE_LIMITS.maxOsm - URINE_LIMITS.minOsm);
      const cortical = 100 + (300 - 100) * Math.min(1, adh * 3);
      const start = Math.min(cortical, Math.max(urineOsm, URINE_LIMITS.minOsm));
      return start + (urineOsm - start) * x;
    }
  }
}

/** Glucose in the urine (mg/min) for a blood glucose (mg/dL): filtered load against the transport maximum. */
export function glucose(bloodMgDl: number, gfrMlMin = filtration(RESTING).gfr) {
  const filtered = (gfrMlMin * Math.max(0, bloodMgDl)) / 100;
  // Nephrons differ, so the transport saturates gradually ("splay"): a non-rectangular hyperbola.
  const theta = 0.9975;
  const s = filtered + GLUCOSE_TM;
  const reabsorbed = (s - Math.sqrt(Math.max(0, s * s - 4 * theta * filtered * GLUCOSE_TM))) / (2 * theta);
  const excreted = Math.max(0, filtered - reabsorbed);
  return { filtered, reabsorbed, excreted, inUrine: excreted > 1 };
}

/** Everything the Filtering panel shows. */
export function urineState(f: FiltrationInput, intakeL: number, bloodGlucose: number) {
  const fl = filtration(f);
  const w = waterBalance(intakeL, fl.gfr);
  const noFlow = fl.gfr < 10;
  return { filtration: fl, water: noFlow ? { ...w, urineL: (w.urineL * fl.gfr) / 125 } : w, glucose: glucose(bloodGlucose, fl.gfr), noFlow };
}

/** A urine colour for a concentration (pale straw when dilute, dark amber when concentrated). */
export function urineColour(osm: number): string {
  const t = clamp((osm - 50) / (1200 - 50), 0, 1);
  const lerp = (a: number, b: number) => Math.round(a + (b - a) * t);
  const [r, g, b] = [lerp(250, 196), lerp(246, 128), lerp(214, 24)];
  return `rgb(${r}, ${g}, ${b})`;
}
