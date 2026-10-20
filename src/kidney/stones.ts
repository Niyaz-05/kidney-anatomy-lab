/**
 * Kidney stones in the ureter (pure).
 *
 * Chance of passing on its own, by size: the EAU/AUA ureteral stones guideline meta-analysis
 * (Preminger GM et al., J Urol 2007;178:2418–34): about 68 % for stones of 5 mm or less and 47 %
 * for stones over 5 mm up to 10 mm. Larger stones rarely pass and usually need treatment.
 *
 * The ureter narrows at three points (pelviureteric junction, where it crosses the iliac vessels
 * at the pelvic brim, and where it passes through the bladder wall); the last is usually the
 * narrowest. Where a stone stops differs between people; this lab uses a simple rule: stones over
 * 10 mm stop at the pelviureteric junction, stones over 5 mm at the vesicoureteric junction, and
 * smaller stones usually reach the bladder.
 */
export type NarrowPoint = 'puj' | 'brim' | 'vuj';

export interface StoneOutcome {
  sizeMm: number;
  /** Where the animation stops it, or null if it reaches the bladder. */
  stopsAt: NarrowPoint | null;
  /** Chance of passing without treatment, 0 … 1, or null when too large to state. */
  passChance: number | null;
  passText: string;
}

export function stoneOutcome(sizeMm: number): StoneOutcome {
  const s = Math.max(0, sizeMm);
  if (s <= 5) return { sizeMm: s, stopsAt: null, passChance: 0.68, passText: 'About 68 % of stones this size (5 mm or less) pass on their own.' };
  if (s <= 10) return { sizeMm: s, stopsAt: 'vuj', passChance: 0.47, passText: 'About 47 % of stones over 5 mm and up to 10 mm pass on their own.' };
  return { sizeMm: s, stopsAt: 'puj', passChance: null, passText: 'Stones over 10 mm rarely pass on their own; they are usually broken up (shock-wave lithotripsy or laser) or removed.' };
}

/** Where the pain is felt for a stone stuck at each point (renal colic: loin to groin). */
export const PAIN: Record<NarrowPoint | 'kidney', string> = {
  kidney: 'A stone sitting in the kidney often causes no pain until it moves.',
  puj: 'Severe colicky pain in the loin (flank), below the ribs at the back, on that side.',
  brim: 'Pain moving from the loin round to the lower abdomen and groin.',
  vuj: 'Pain in the groin and the labia (or the testis in men), with an urgent, frequent need to pass urine.',
};

/** The three narrow points, top to bottom. */
export const NARROW_ORDER: readonly NarrowPoint[] = ['puj', 'brim', 'vuj'];
