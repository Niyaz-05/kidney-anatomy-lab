import { describe, expect, it } from 'vitest';
import { BASE, filtration, RESTING } from '../../src/kidney/filtration';
import { glucose, osmolalityAt, SEGMENTS, URINE_LIMITS, urineColour, waterBalance } from '../../src/kidney/tubule';
import { egfr, stageOf } from '../../src/kidney/egfr';
import { BLADDER, fillingPressure, minutesToFill, peristalsisPerMin, sensation } from '../../src/kidney/bladder';
import { stoneOutcome } from '../../src/kidney/stones';
import { HORMONES } from '../../src/kidney/hormones';
import { lengthOf, nephronLayout } from '../../src/kidney/nephron';

describe('glomerular filtration', () => {
  it('reproduces the textbook Starling forces at rest', () => {
    const f = filtration(RESTING);
    expect(f.glomerularPressure).toBeCloseTo(55, 6);
    expect(f.oncoticPressure).toBeCloseTo(30, 3);
    expect(f.netPressure).toBeCloseTo(10, 3);
    expect(f.gfr).toBeCloseTo(125, 1);
    expect(f.gfrPerDay).toBeCloseTo(180, 0);
    expect(f.rbf).toBeCloseTo(BASE.rbf, 6);
    expect(f.filtrationFraction).toBeCloseTo(0.207, 2);
    expect(f.autoregulated).toBe(true);
  });

  it('holds filtration steady from 80 to 180 mmHg and loses it below', () => {
    for (const map of [80, 100, 140, 180]) expect(filtration({ ...RESTING, map }).gfr).toBeCloseTo(125, 1);
    expect(filtration({ ...RESTING, map: 70 }).gfr).toBeLessThan(110);
    expect(filtration({ ...RESTING, map: 60 }).gfr).toBeLessThan(30);
    expect(filtration({ ...RESTING, map: 40 }).gfr).toBe(0);
    expect(filtration({ ...RESTING, map: 200 }).gfr).toBeGreaterThan(125);
  });

  it('afferent narrowing lowers filtration; efferent narrowing raises it, while blood flow falls', () => {
    const a = filtration({ ...RESTING, afferent: 0.5 });
    expect(a.gfr).toBeLessThan(100);
    expect(a.rbf).toBeLessThan(BASE.rbf);
    const e = filtration({ ...RESTING, efferent: 0.3 });
    expect(e.glomerularPressure).toBeGreaterThan(55);
    expect(e.gfr).toBeGreaterThan(125);
    expect(e.rbf).toBeLessThan(BASE.rbf);
    expect(e.filtrationFraction).toBeGreaterThan(0.21);
  });
});

describe('tubule and urine', () => {
  it('takes back about 99 % of the filtered sodium, two thirds of it in the proximal tubule', () => {
    const total = SEGMENTS.reduce((n, s) => n + s.sodium, 0);
    expect(total).toBeCloseTo(0.99, 6);
    expect(SEGMENTS.find((s) => s.id === 'pct')!.sodium).toBe(0.65);
    const loop = ['descending', 'thin-ascending', 'thick-ascending'].reduce((n, id) => n + SEGMENTS.find((s) => s.id === id)!.sodium, 0);
    expect(loop).toBeCloseTo(0.25, 6);
  });

  it('makes about 1.6 L of moderately concentrated urine on a normal intake', () => {
    const w = waterBalance(2.3);
    expect(w.urineL).toBeCloseTo(1.6, 6);
    expect(w.urineOsm).toBeCloseTo(375, 3);
    expect(w.waterExcretedShare).toBeLessThan(0.01);
  });

  it('concentrates to 1,200 mOsm/kg with maximal ADH and dilutes to 50 without it', () => {
    const dry = waterBalance(0.8);
    expect(dry.urineL).toBe(URINE_LIMITS.obligatoryL);
    expect(dry.urineOsm).toBe(1200);
    expect(dry.adh).toBe(1);
    expect(dry.dehydrating).toBe(true);
    const wet = waterBalance(15);
    expect(wet.urineOsm).toBe(50);
    expect(wet.adh).toBe(0);
    expect(wet.overloaded).toBe(true);
  });

  it('follows the loop’s concentration profile', () => {
    expect(osmolalityAt('pct', 0.5, 600)).toBe(300);
    expect(osmolalityAt('descending', 1, 600)).toBe(1200);
    expect(osmolalityAt('descending', 1, 600, false)).toBe(600);
    expect(osmolalityAt('thick-ascending', 1, 600)).toBe(100);
    expect(osmolalityAt('collecting', 1, 900)).toBe(900);
    expect(osmolalityAt('collecting', 1, 60)).toBe(60);
  });

  it('spills glucose into the urine only above about 180–200 mg/dL', () => {
    expect(glucose(100).inUrine).toBe(false);
    expect(glucose(170).inUrine).toBe(false);
    expect(glucose(220).inUrine).toBe(true);
    const high = glucose(500);
    expect(high.reabsorbed).toBeLessThanOrEqual(375);
    expect(high.excreted).toBeGreaterThan(high.filtered - 380);
  });

  it('colours dilute urine pale and concentrated urine dark', () => {
    expect(urineColour(50)).toBe('rgb(250, 246, 214)');
    expect(urineColour(1200)).toBe('rgb(196, 128, 24)');
  });
});

describe('eGFR (CKD-EPI 2021)', () => {
  it('matches worked values of the equation', () => {
    // 60-year-old man, creatinine 1.0 mg/dL: 142 × (1/0.9)^−1.2 × 0.9938^60 ≈ 86.
    expect(Math.round(egfr(1.0, 60, 'male'))).toBe(86);
    // 50-year-old woman, creatinine 0.7: 142 × 0.9938^50 × 1.012 ≈ 105.
    expect(egfr(0.7, 50, 'female')).toBeCloseTo(142 * 0.9938 ** 50 * 1.012, 6);
    // Below κ the gentler exponent applies.
    expect(egfr(0.5, 30, 'female')).toBeCloseTo(142 * (0.5 / 0.7) ** -0.241 * 0.9938 ** 30 * 1.012, 6);
    expect(egfr(3.0, 70, 'male')).toBeCloseTo(142 * (3 / 0.9) ** -1.2 * 0.9938 ** 70, 6);
    expect(egfr(1, 12, 'male')).toBeNaN();
  });

  it('stages by KDIGO', () => {
    expect([95, 75, 50, 35, 20, 10].map((g) => stageOf(g).id)).toEqual(['G1', 'G2', 'G3a', 'G3b', 'G4', 'G5']);
    expect(stageOf(60).id).toBe('G2');
    expect(stageOf(59.9).id).toBe('G3a');
  });
});

describe('bladder', () => {
  it('signals the urge at about 150 mL and is full at about 500 mL', () => {
    expect(sensation(100)).toBe('none');
    expect(sensation(150)).toBe('first-urge');
    expect(sensation(420)).toBe('strong-urge');
    expect(sensation(BLADDER.capacityMl)).toBe('full');
  });

  it('keeps a low pressure while filling', () => {
    expect(fillingPressure(300)).toBeLessThan(15);
    expect(fillingPressure(550)).toBeGreaterThan(fillingPressure(400) + 30);
  });

  it('fills in hours and speeds up the ureters with more urine', () => {
    expect(minutesToFill(400, 1.6) / 60).toBeCloseTo(6, 0);
    expect(peristalsisPerMin(0.5)).toBe(2);
    expect(peristalsisPerMin(6)).toBe(6);
  });
});

describe('kidney stones', () => {
  it('uses the guideline pass rates and stops larger stones', () => {
    expect(stoneOutcome(4)).toMatchObject({ stopsAt: null, passChance: 0.68 });
    expect(stoneOutcome(7)).toMatchObject({ stopsAt: 'vuj', passChance: 0.47 });
    expect(stoneOutcome(12)).toMatchObject({ stopsAt: 'puj', passChance: null });
  });
});

describe('hormones', () => {
  it('runs each loop in order, from its trigger to its effect', () => {
    const raas = HORMONES.find((h) => h.id === 'raas')!;
    expect(raas.steps.map((s) => s.label)).toEqual(['Low pressure sensed', 'Renin released', 'Angiotensin I', 'Angiotensin II', 'Vessels narrow', 'Aldosterone', 'Sodium and water kept']);
    expect(raas.steps[2]!.offModel).toBe('liver');
    expect(raas.steps[3]!.offModel).toBe('lungs');
    expect(HORMONES.map((h) => h.id)).toEqual(['raas', 'adh', 'epo', 'vitamin-d', 'anp']);
    for (const h of HORMONES) for (const s of h.steps) expect(s.focus.length > 0 || !!s.offModel, `${h.id}: ${s.label}`).toBe(true);
  });
});

describe('nephron layout', () => {
  const L = nephronLayout(11, 28);
  it('reaches deep for the long loop and stays shallow for the short one', () => {
    const depth = (n: string) => Math.min(...L.pieces.filter((p) => p.nephron === n && p.id === 'descending').flatMap((p) => p.points.map((q) => q[0])));
    expect(depth('juxtamedullary')).toBeLessThan(-0.9 * L.medullaM);
    expect(depth('cortical')).toBeGreaterThan(-0.35 * L.medullaM);
    // Glomeruli are in the cortex; the collecting duct opens at the papilla.
    for (const g of L.glomeruli) { expect(g.centre[0]).toBeGreaterThan(0); expect(g.centre[0]).toBeLessThan(L.cortexM); }
    const cd = L.pieces.find((p) => p.id === 'collecting')!;
    expect(cd.points[cd.points.length - 1]![0]).toBeLessThan(-0.95 * L.medullaM);
  });

  it('gives the filtrate a continuous path through each nephron, in order', () => {
    const order = ['pct', 'descending', 'thin-ascending', 'thick-ascending', 'dct', 'connecting', 'collecting'];
    for (const p of L.paths) {
      const seen = p.segment.filter((s, i) => i === 0 || s !== p.segment[i - 1]);
      expect(seen).toEqual(order.filter((s) => p.nephron === 'juxtamedullary' || s !== 'thin-ascending'));
      for (let i = 1; i < p.points.length; i++) expect(lengthOf([p.points[i - 1]!, p.points[i]!])).toBeLessThan(0.003);
    }
    // Proximal tubules are long and coiled (about 14 mm in life).
    expect(lengthOf(L.pieces.find((p) => p.id === 'pct' && p.nephron === 'juxtamedullary')!.points)).toBeGreaterThan(0.006);
  });
});
