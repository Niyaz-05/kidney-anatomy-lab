/**
 * Estimated GFR from serum creatinine: the CKD-EPI 2021 equation without race (Inker LA et al.,
 * N Engl J Med 2021;385:1737–49), as recommended by the NKF–ASN task force:
 *
 *   eGFR = 142 × min(Scr/κ, 1)^α × max(Scr/κ, 1)^−1.200 × 0.9938^age × 1.012 [if female]
 *
 * Scr in mg/dL; κ = 0.7 (female) or 0.9 (male); α = −0.241 (female) or −0.302 (male). Result in
 * mL/min/1.73 m². Stages G1–G5 follow KDIGO 2012. Valid for adults (18 years and over).
 */
export type Sex = 'female' | 'male';

/** µmol/L per mg/dL of creatinine. */
export const CREATININE_UMOL_PER_MGDL = 88.4;

export function egfr(creatinineMgDl: number, age: number, sex: Sex): number {
  if (!(creatinineMgDl > 0) || !(age >= 18)) return NaN;
  const k = sex === 'female' ? 0.7 : 0.9;
  const a = sex === 'female' ? -0.241 : -0.302;
  const r = creatinineMgDl / k;
  return 142 * Math.min(r, 1) ** a * Math.max(r, 1) ** -1.2 * 0.9938 ** age * (sex === 'female' ? 1.012 : 1);
}

export interface Stage { id: 'G1' | 'G2' | 'G3a' | 'G3b' | 'G4' | 'G5'; min: number; label: string }

export const STAGES: readonly Stage[] = [
  { id: 'G1', min: 90, label: 'Normal or high' },
  { id: 'G2', min: 60, label: 'Mildly decreased' },
  { id: 'G3a', min: 45, label: 'Mildly to moderately decreased' },
  { id: 'G3b', min: 30, label: 'Moderately to severely decreased' },
  { id: 'G4', min: 15, label: 'Severely decreased' },
  { id: 'G5', min: 0, label: 'Kidney failure' },
];

/** KDIGO GFR category. (Chronic kidney disease also needs signs of damage or 3 months below 60.) */
export function stageOf(gfr: number): Stage {
  return STAGES.find((s) => gfr >= s.min) ?? STAGES[STAGES.length - 1]!;
}
