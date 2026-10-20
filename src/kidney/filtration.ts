/**
 * Glomerular filtration (pure). Starling forces across the glomerular capillaries, with the
 * values in OpenStax A&P 2e §25.5: glomerular blood hydrostatic pressure 55 mmHg, capsular
 * hydrostatic pressure 15 mmHg, blood colloid osmotic pressure 30 mmHg, so a net filtration
 * pressure of 10 mmHg, and a GFR of about 125 mL/min (180 L/day; OpenStax gives about 105 mL/min
 * for women).
 *
 * The circulation is two resistances in series: the afferent arteriole (renal artery → glomerulus)
 * and the efferent arteriole (glomerulus → peritubular capillaries, about 18 mmHg). Autoregulation
 * (myogenic response and tubuloglomerular feedback, OpenStax §25.7) adjusts the afferent resistance
 * so that blood flow and glomerular pressure stay constant for a mean arterial pressure of about
 * 80 to 180 mmHg (Boron & Boulpaep, Medical Physiology 3e, ch. 34). Outside that range the afferent
 * resistance is at its limit; filtration nearly stops by a mean pressure of about 60 mmHg, as in
 * shock (OpenStax §25.5). The oncotic
 * pressure rises along the capillary as plasma is filtered: its mean is taken between the afferent
 * value and the efferent value, π_a / (1 − filtration fraction).
 */

export const BASE = {
  /** Mean arterial pressure, mmHg. */
  map: 95,
  glomerularPressure: 55,
  capsularPressure: 15,
  oncoticPressure: 30,
  /** Filtration coefficient, mL/min per mmHg (125 mL/min / 10 mmHg). */
  kf: 12.5,
  /** Renal blood flow, mL/min: about a fifth to a quarter of the cardiac output at rest. */
  rbf: 1100,
  haematocrit: 0.45,
  peritubularPressure: 18,
  autoregulation: [80, 180] as const,
} as const;

const RPF0 = BASE.rbf * (1 - BASE.haematocrit);
const GFR0 = BASE.kf * (BASE.glomerularPressure - BASE.capsularPressure - BASE.oncoticPressure);
const FF0 = GFR0 / RPF0;
/** Afferent oncotic pressure that makes the mean 30 mmHg at the resting filtration fraction. */
const PI_A = (2 * BASE.oncoticPressure) / (1 + 1 / (1 - FF0));
const RA0 = (BASE.map - BASE.glomerularPressure) / BASE.rbf;
const RE0 = (BASE.glomerularPressure - BASE.peritubularPressure) / BASE.rbf;

export interface FiltrationInput {
  /** Mean arterial pressure, mmHg. */
  map: number;
  /** Extra narrowing of the afferent arteriole, 0 (none) … 1 (strong): resistance × (1 + 3·x). */
  afferent: number;
  /** Extra narrowing of the efferent arteriole, 0 … 1. */
  efferent: number;
}

export interface Filtration {
  glomerularPressure: number;
  capsularPressure: number;
  oncoticPressure: number;
  netPressure: number;
  /** mL/min */
  gfr: number;
  /** L/day */
  gfrPerDay: number;
  /** mL/min */
  rbf: number;
  rpf: number;
  filtrationFraction: number;
  /** Whether autoregulation is holding the flow steady. */
  autoregulated: boolean;
}

const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));

/** The afferent resistance autoregulation sets for a mean arterial pressure. */
function autoAfferent(map: number): number {
  const [lo, hi] = BASE.autoregulation;
  const m = clamp(map, lo, hi);
  return (RA0 * (m - BASE.glomerularPressure)) / (BASE.map - BASE.glomerularPressure);
}

export function filtration(input: FiltrationInput): Filtration {
  const map = clamp(input.map, 20, 250);
  const ra = autoAfferent(map) * (1 + 3 * clamp(input.afferent, 0, 1));
  const re = RE0 * (1 + 3 * clamp(input.efferent, 0, 1));
  const pt = BASE.peritubularPressure;
  // Glomerular pressure between the two resistances (no filtration correction to the flow: the
  // filtered volume is a fifth of the plasma and leaves after the glomerulus).
  const pgc = (map / ra + pt / re) / (1 / ra + 1 / re);
  const rbf = Math.max(0, (map - pgc) / ra);
  const rpf = rbf * (1 - BASE.haematocrit);
  // Oncotic pressure and filtration depend on each other: iterate to the fixed point.
  let gfr = GFR0, pi = BASE.oncoticPressure;
  for (let i = 0; i < 60; i++) {
    const ff = rpf > 0 ? clamp(gfr / rpf, 0, 0.6) : 0;
    pi = (PI_A * (1 + 1 / (1 - ff))) / 2;
    const next = Math.max(0, BASE.kf * (pgc - BASE.capsularPressure - pi));
    if (Math.abs(next - gfr) < 1e-9) { gfr = next; break; }
    gfr = 0.5 * gfr + 0.5 * next;
  }
  const net = pgc - BASE.capsularPressure - pi;
  const [lo, hi] = BASE.autoregulation;
  return {
    glomerularPressure: pgc,
    capsularPressure: BASE.capsularPressure,
    oncoticPressure: pi,
    netPressure: net,
    gfr,
    gfrPerDay: (gfr * 1440) / 1000,
    rbf,
    rpf,
    filtrationFraction: rpf > 0 ? gfr / rpf : 0,
    autoregulated: map >= lo && map <= hi && input.afferent === 0 && input.efferent === 0,
  };
}

export const RESTING: FiltrationInput = { map: BASE.map, afferent: 0, efferent: 0 };
