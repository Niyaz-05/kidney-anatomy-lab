import { describe, expect, it } from 'vitest';
import { kidneyDefinition as def } from '../../src/kidney/definition';
import { validateDefinition } from '../../src/contract/validate';
import { APPROVED_ASSETS } from '../../src/contract/assets';
import geometry from '../../src/kidney/generated/geometry.json';
import provenance from '../../src/kidney/generated/provenance.json';
import spec from '../../src/kidney/source/structures.source.json';
import { effectiveMode, effectivePhysiology, effectiveSlice, effectiveStone, focusIds, initialState, isVisible, keptHalf, kidneyCut, makeReducer, RESTING_PHYSIOLOGY } from '../../src/app/state';
import { searchStructures } from '../../src/app/search';
import { bloodRoutes, bloodReturnRoutes, measures, nephronFrame, renalVessels, ureters, ureterWave, urineRoutes } from '../../src/kidney/anchors';

const reduce = makeReducer(def);
const G = geometry.structures as unknown as Record<string, { centroid: number[]; bounds: number[][] }>;
const bodyX = (id: string) => G[id]!.centroid[0]! + provenance.centreOffsetMetres[0]!;
const dist = (a: readonly number[], b: readonly number[]) => Math.hypot(a[0]! - b[0]!, a[1]! - b[1]!, a[2]! - b[2]!);

describe('kidney definition', () => {
  it('passes the validation gate with no warnings', () => {
    const r = validateDefinition(def);
    expect(r.issues).toEqual([]);
    expect(r.ok).toBe(true);
  });

  it('rejects an unapproved asset and a missing pair', () => {
    expect(validateDefinition({ ...def, assets: [{ id: 'not-approved', role: 'anatomy-model' }] }).ok).toBe(false);
    const r = validateDefinition({ ...def, structures: def.structures.filter((s) => s.id !== 'ureter-right'), urineRoute: def.urineRoute });
    expect(r.ok).toBe(false);
    expect(r.issues.map((i) => i.code)).toContain('pair.missing');
  });

  it('has exactly one mesh structure per model node', () => {
    const meshes = def.structures.filter((s) => s.kind === 'mesh').map((s) => s.id).sort();
    expect(meshes).toEqual([...APPROVED_ASSETS['hra-kidney-v1']!.nodes].sort());
  });

  it('places every left or right structure on its side of the body (+x is the patient’s left)', () => {
    const unchecked = new Set(spec.structures.filter((s) => (s as { sideCheck?: boolean }).sideCheck === false).map((s) => s.id));
    for (const s of def.structures.filter((x) => x.kind === 'mesh' && !unchecked.has(x.id))) {
      if (s.side === 'right') expect(bodyX(s.id), s.id).toBeLessThan(0);
      if (s.side === 'left') expect(bodyX(s.id), s.id).toBeGreaterThan(0);
    }
  });

  it('cites every structure, and only https sources', () => {
    for (const s of def.sources) if (s.url) expect(s.url.startsWith('https://')).toBe(true);
    for (const s of def.structures) expect(s.sources.length).toBeGreaterThan(0);
  });

  it('lays the body out the right way round', () => {
    expect(G['adrenal-gland-left']!.centroid[1]).toBeGreaterThan(G['kidney-capsule-left']!.centroid[1]!);
    expect(G['bladder-dome']!.centroid[1]).toBeLessThan(G['kidney-capsule-left']!.centroid[1]! - 0.15);
    expect(G.aorta!.centroid[0]).toBeGreaterThan(G['inferior-vena-cava']!.centroid[0]!);
    // The kidneys lie behind the colon and in front of the psoas-and-spine plane.
    expect(G['kidney-capsule-left']!.centroid[2]).toBeLessThan(G['descending-colon']!.centroid[2]!);
    expect(G['lumbar-vertebra-2']!.centroid[2]).toBeLessThan(G['kidney-capsule-left']!.centroid[2]!);
  });

  it('records real measurements in range', () => {
    for (const side of ['left', 'right'] as const) {
      const k = measures.kidneys[side];
      expect(k.lengthMm).toBeGreaterThan(100);
      expect(k.lengthMm).toBeLessThan(145);
      expect(k.volumeMl).toBeGreaterThan(60);
      expect(k.volumeMl).toBeLessThan(220);
      expect(measures.ureterLengthMm[side]).toBeGreaterThan(220);
      expect(measures.ureterLengthMm[side]).toBeLessThan(320);
    }
    expect(measures.kidneys.left.pyramids).toBe(11);
    expect(measures.kidneys.right.pyramids).toBe(10);
    expect(measures.lumbarVertebrae).toBe(6);
    expect(measures.bladder.ellipsoidMl).toBeGreaterThan(20);
    expect(measures.nephronAnchor.cortexThicknessMm).toBeGreaterThan(5);
    expect(measures.nephronAnchor.cortexThicknessMm).toBeLessThan(16);
  });
});

describe('routes', () => {
  it('urine runs from every papilla down its own ureter into the bladder', () => {
    const bladder = G['bladder-base']!.centroid;
    for (const side of ['left', 'right'] as const) {
      expect(urineRoutes[side]).toHaveLength(measures.kidneys[side].pyramids);
      for (const r of urineRoutes[side]) {
        const first = r.points[0]!, last = r.points[r.points.length - 1]!;
        expect(first[1]).toBeGreaterThan(last[1]!);
        expect(dist(last, bladder)).toBeLessThan(0.03);
        expect(Math.sign(first[0]! + provenance.centreOffsetMetres[0]!)).toBe(side === 'left' ? 1 : -1);
        // Steps along the route are short: no jumps through the body.
        for (let i = 1; i < r.points.length; i++) expect(dist(r.points[i]!, r.points[i - 1]!)).toBeLessThan(0.02);
      }
    }
  });

  it('finds the ureter’s three narrow points in order, top to bottom', () => {
    for (const side of ['left', 'right'] as const) {
      const n = ureters[side].narrow;
      expect(n.map((x) => x.id)).toEqual(['puj', 'brim', 'vuj']);
      expect(n[0]!.arcMm).toBeLessThan(n[1]!.arcMm);
      expect(n[1]!.arcMm).toBeLessThan(n[2]!.arcMm);
      expect(n[0]!.point[1]).toBeGreaterThan(n[2]!.point[1]!);
    }
  });

  it('blood goes in by the renal artery and out by the renal vein, through every pyramid', () => {
    for (const side of ['left', 'right'] as const) {
      expect(bloodRoutes[side].length).toBe(measures.kidneys[side].pyramids * 2);
      expect(bloodReturnRoutes[side].length).toBe(bloodRoutes[side].length);
      for (const r of bloodRoutes[side]) expect(dist(r.points[0]!, G.aorta!.centroid)).toBeLessThan(0.12);
    }
    const kinds = new Set(renalVessels.map((v) => v.order));
    expect([...kinds].sort()).toEqual(['arcuate', 'interlobar', 'link', 'radiate']);
  });

  it('runs a peristaltic wave down each ureter, then rests', () => {
    expect(ureterWave('left', 0, 3)).toBe(0);
    expect(ureterWave('left', 2, 3)).toBe(60);
    expect(ureterWave('left', 19, 3)).toBeNull(); // between waves (the wave takes about 9 s; a period is 20 s)
    expect(ureterWave('right', -6, 3)).toBeCloseTo(120, 6); // the right side runs half a period behind
  });

  it('frames the nephron view across a real pyramid', () => {
    const f = nephronFrame();
    const dot = (a: number[], b: number[]) => a[0]! * b[0]! + a[1]! * b[1]! + a[2]! * b[2]!;
    expect(Math.abs(dot(f.u, f.w))).toBeLessThan(1e-9);
    expect(Math.abs(dot(f.u, f.v))).toBeLessThan(1e-9);
    expect(f.w[2]).toBeGreaterThan(0);
  });
});

describe('lab state', () => {
  it('opens both kidneys from the front in the blood, urine and stone views', () => {
    let s = initialState(def);
    for (const mode of ['blood', 'urine', 'stones'] as const) {
      s = reduce(s, { type: 'set-mode', mode });
      expect(s.slice.axis).toBe('coronal');
      expect(s.slice).toEqual(kidneyCut(def, mode));
      expect(s.camera.preset).toBe('anterior');
    }
    s = reduce(s, { type: 'set-mode', mode: 'explore' });
    expect(s.slice.axis).toBe('off');
    expect(keptHalf(kidneyCut(def, 'blood'))).toBe('the back half');
  });

  it('shows each mode’s layers; the nephron views draw their own wedge instead of the model', () => {
    let s = reduce(initialState(def), { type: 'set-mode', mode: 'nephron' });
    expect(isVisible(def, s, 'renal-pyramids-left')).toBe(false);
    expect(isVisible(def, s, 'aorta')).toBe(false);
    s = reduce(s, { type: 'set-mode', mode: 'stones' });
    expect(isVisible(def, s, 'common-iliac-vein-left')).toBe(true);
    expect(isVisible(def, s, 'rib-12-left')).toBe(false);
  });

  it('clamps the physiology and resets it', () => {
    let s = reduce(initialState(def), { type: 'set-physiology', value: { map: 500, water: -3, afferent: 2 } });
    expect(s.physiology).toEqual({ ...RESTING_PHYSIOLOGY, map: 220, water: 0.5, afferent: 1 });
    s = reduce(s, { type: 'set-physiology', value: { map: Number.NaN } });
    expect(s.physiology.map).toBe(220);
    s = reduce(s, { type: 'reset-physiology' });
    expect(s.physiology).toEqual(RESTING_PHYSIOLOGY);
  });

  it('drops stones, fills the bladder and converts creatinine units', () => {
    let s = reduce(initialState(def), { type: 'drop-stone', size: 30 });
    expect(s.stoneMm).toBe(15);
    expect(s.stoneNonce).toBe(1);
    s = reduce(s, { type: 'set-bladder', value: 900 });
    expect(s.bladderMl).toBe(600);
    s = reduce(s, { type: 'set-egfr', value: { creatinine: 1 } });
    s = reduce(s, { type: 'set-egfr', value: { unit: 'µmol/L' } });
    expect(s.egfr.creatinine).toBe(88);
    s = reduce(s, { type: 'set-egfr', value: { unit: 'mg/dL' } });
    expect(s.egfr.creatinine).toBe(1);
  });

  it('steps through a hormone and lights its organs', () => {
    let s = reduce(initialState(def), { type: 'set-mode', mode: 'hormones' });
    s = reduce(s, { type: 'set-hormone', value: 'raas' });
    s = reduce(s, { type: 'hormone-step', value: 5 });
    expect(focusIds(def, s)).toEqual(['adrenal-gland-left', 'adrenal-gland-right']);
    s = reduce(s, { type: 'hormone-step', value: 99 });
    expect(s.hormoneStep).toBe(6);
  });

  it('lets a tour step set the mode, physiology, stone and cut', () => {
    const i = def.tour.findIndex((t) => t.id === 'low-pressure');
    let s = reduce(initialState(def), { type: 'tour-go', index: i });
    expect(effectiveMode(def, s)).toBe('filtering');
    expect(effectivePhysiology(def, s).map).toBe(60);
    s = reduce(s, { type: 'tour-go', index: def.tour.findIndex((t) => t.id === 'stone') });
    expect(effectiveStone(def, s)).toBe(7);
    expect(effectiveSlice(def, s).axis).toBe('coronal');
    s = reduce(s, { type: 'tour-go', index: def.tour.findIndex((t) => t.id === 'inside') });
    // The tour's frontal cut runs through the middle of the kidneys, so they show cut open.
    expect(effectiveSlice(def, s)).toEqual(kidneyCut(def, 'explore'));
    s = reduce(s, { type: 'tour-go', index: 0 });
    expect(effectiveSlice(def, s).axis).toBe('off');
  });

  it('turns the camera to face a new cut', () => {
    let s = reduce(initialState(def), { type: 'set-slice', axis: 'sagittal' });
    expect(s.camera.preset).toBe('left');
    expect(keptHalf(s.slice)).toBe('the right side of the body');
    s = reduce(s, { type: 'set-slice', flip: true });
    expect(s.camera.preset).toBe('right');
    s = reduce(s, { type: 'set-slice', axis: 'coronal' });
    expect(s.slice.at).toBeCloseTo(kidneyCut(def, 'explore').at, 10);
  });
});

describe('search', () => {
  it('finds structures by name and synonym', () => {
    expect(searchStructures(def.structures, 'calyx')[0]!.structure.id).toMatch(/calyces/);
    expect(searchStructures(def.structures, 'hilum').map((h) => h.structure.id)).toContain('renal-sinus-left');
    expect(searchStructures(def.structures, 'suprarenal gland')[0]!.structure.id).toMatch(/^adrenal-gland/);
    expect(searchStructures(def.structures, 'detrusor').map((h) => h.structure.id)).toContain('urinary-bladder');
    expect(searchStructures(def.structures, 'IVC')[0]!.structure.id).toBe('inferior-vena-cava');
    expect(searchStructures(def.structures, 'zzz')).toEqual([]);
  });
});
