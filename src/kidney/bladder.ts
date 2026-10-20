/**
 * Bladder filling and emptying (pure). Volumes from OpenStax A&P 2e §25.2: the urge to urinate is
 * felt at about 150 mL, voluntary control becomes hard as the volume nears 300–400 mL, and the
 * capacity is about 500–600 mL. While filling, the bladder wall relaxes, so its pressure rises only
 * a few cmH₂O; in the voiding reflex the detrusor contracts to about 40 cmH₂O (Guyton & Hall 14e
 * ch. 26). Ureter peristalsis: about 2 to 6 waves a minute, more often when more urine is made
 * (Campbell-Walsh-Wein Urology 12e, physiology of the renal pelvis and ureter).
 */
export const BLADDER = { firstUrgeMl: 150, strongUrgeMl: 400, capacityMl: 500, voidingPressureCmH2O: 40 } as const;

/** Bladder pressure while filling, cmH₂O: nearly flat (compliance), rising steeply near capacity. */
export function fillingPressure(volumeMl: number): number {
  const v = Math.max(0, volumeMl);
  return 4 + v / 60 + Math.max(0, v - BLADDER.strongUrgeMl) ** 2 / 400;
}

export type Sensation = 'none' | 'first-urge' | 'strong-urge' | 'full';
export function sensation(volumeMl: number): Sensation {
  if (volumeMl >= BLADDER.capacityMl) return 'full';
  if (volumeMl >= BLADDER.strongUrgeMl) return 'strong-urge';
  if (volumeMl >= BLADDER.firstUrgeMl) return 'first-urge';
  return 'none';
}

/** Urine flow into the bladder, mL/min, from the daily urine volume. */
export const flowMlMin = (urineLPerDay: number) => (urineLPerDay * 1000) / 1440;

/** Minutes until the bladder reaches a volume, from empty, at a daily urine volume. */
export const minutesToFill = (targetMl: number, urineLPerDay: number) => targetMl / flowMlMin(urineLPerDay);

/** Ureter waves per minute for a urine flow (2 at low flow, 6 at high). */
export function peristalsisPerMin(urineLPerDay: number): number {
  const t = Math.min(1, Math.max(0, (urineLPerDay - 0.5) / 3.5));
  return 2 + 4 * t;
}

/** The micturition reflex, step by step. */
export const VOIDING_STEPS = [
  { id: 'stretch', label: 'Stretch receptors', text: 'As the bladder fills, stretch receptors in its wall send signals along the pelvic nerves to the sacral spinal cord. The urge is felt at about 150 mL.' },
  { id: 'brain', label: 'The brain decides', text: 'The signals reach the pons (the micturition centre) and the cortex. Until it is a good time, the brain keeps the reflex in check.' },
  { id: 'detrusor', label: 'Detrusor contracts', text: 'Parasympathetic fibres in the pelvic nerves make the detrusor muscle of the bladder wall contract.' },
  { id: 'internal', label: 'Internal sphincter opens', text: 'The smooth muscle at the bladder neck (internal urethral sphincter) relaxes. During filling, sympathetic signals in the hypogastric nerves held the detrusor relaxed.' },
  { id: 'external', label: 'External sphincter relaxes', text: 'The skeletal-muscle external urethral sphincter, controlled at will through the pudendal nerve (S2–S4), relaxes and urine flows out through the urethra.' },
] as const;
