import geometryJson from './generated/geometry.json';
import type { Mode, SimulationDefinition } from '../contract/schema';
import { MODE_LAYERS } from '../app/modes';

export type Vec3 = [number, number, number];
type Side = 'left' | 'right';

interface G { centroid: number[]; bounds: number[][]; surfaceAnchor?: number[]; side: string; layer: string }
export interface UrineRoute { papilla: string; minorCalyx: string; majorCalyx: string; points: number[][] }
export interface BloodRoute { pyramid: string; points: number[][] }
export interface NarrowPointGeo { id: 'puj' | 'brim' | 'vuj'; name: string; point: number[]; widthMm: number; arcMm: number }
export interface UreterGeo { points: number[][]; arcMm: number[]; lengthMm: number; widthsMm: number[]; medianWidthMm: number; narrow: NarrowPointGeo[] }
export interface RenalVessel { kind: 'artery' | 'vein'; order: 'interlobar' | 'arcuate' | 'radiate' | 'link'; side: Side; pyramid: string; widthMm: number; points: number[][] }
export interface NephronAnchor { side: Side; pyramid: string; papillaTip: number[]; baseCentre: number[]; axis: number[]; heightMm: number; cortexThicknessMm: number | null }
interface KidneyMeasures { lengthMm: number; widthMm: number; thicknessMm: number; volumeMl: number; upperPole: string; hilum: string; lowerPole: string; pyramids: number; minorCalyces: number; majorCalyces: number }
export interface Measures {
  kidneys: Record<Side, KidneyMeasures>;
  rightKidneyHigherByMm: number;
  ureterLengthMm: Record<Side, number>;
  bladder: { openEdges: number; volumeMl: number | null; ellipsoidMl: number; sizeMm: number[] };
  urethraLengthMm: number;
  lumbarVertebrae: number;
  nephronAnchor: NephronAnchor;
}

const raw = geometryJson.structures as unknown as Record<string, unknown>;
export const geometry = Object.fromEntries(Object.entries(raw).filter(([k]) => !k.startsWith('$'))) as Record<string, G>;
const R = raw.$routes as { ureter: Record<Side, UreterGeo>; urine: Record<Side, UrineRoute[]>; blood: Record<Side, BloodRoute[]>; bloodReturn: Record<Side, BloodRoute[]>; urethra: number[][] };
export const ureters = R.ureter;
export const urineRoutes = R.urine;
export const bloodRoutes = R.blood;
export const bloodReturnRoutes = R.bloodReturn;
export const urethraLine = R.urethra;
export const renalVessels = raw.$vessels as RenalVessel[];
export const measures = raw.$measures as Measures;

export const vec = (p: readonly number[]): Vec3 => [p[0] ?? 0, p[1] ?? 0, p[2] ?? 0];

/** A point to hang a label on: on the structure's surface, or the middle of a group. */
export function anchorOf(def: SimulationDefinition, id: string): Vec3 | null {
  const g = geometry[id];
  if (g) return vec(g.surfaceAnchor ?? g.centroid);
  const s = def.structures.find((x) => x.id === id);
  if (s?.kind === 'group' && s.members) {
    const pts = s.members.map((m) => anchorOf(def, m)).filter((p): p is Vec3 => p !== null);
    if (!pts.length) return null;
    return [0, 1, 2].map((a) => pts.reduce((n, p) => n + p[a]!, 0) / pts.length) as Vec3;
  }
  return null;
}

/** Axis-aligned bounds of a set of structures (groups expand to their members). */
export function boundsOfIds(def: SimulationDefinition, ids: readonly string[]): [Vec3, Vec3] | null {
  const lo: Vec3 = [Infinity, Infinity, Infinity];
  const hi: Vec3 = [-Infinity, -Infinity, -Infinity];
  const visit = (id: string) => {
    const g = geometry[id];
    if (g) {
      for (let a = 0; a < 3; a++) {
        lo[a] = Math.min(lo[a]!, g.bounds[0]![a]!);
        hi[a] = Math.max(hi[a]!, g.bounds[1]![a]!);
      }
      return;
    }
    def.structures.find((x) => x.id === id)?.members?.forEach(visit);
  };
  ids.forEach(visit);
  return Number.isFinite(lo[0]) ? [lo, hi] : null;
}

const KIDNEYS = ['kidney-capsule-left', 'kidney-capsule-right'];
const TRACT = [...KIDNEYS, 'bladder-dome', 'bladder-base', 'urethra', 'adrenal-gland-left', 'adrenal-gland-right'];

/** The parts each mode frames by default. */
const HOME: Partial<Record<Mode, readonly string[]>> = {
  explore: TRACT,
  blood: [...KIDNEYS, 'aorta'],
  urine: TRACT,
  stones: TRACT,
  function: TRACT,
  hormones: TRACT,
};

/** The nephron view's wedge: from the papilla tip to the capsule, in model coordinates. */
export function nephronWedge(): { tip: Vec3; base: Vec3; capsule: Vec3; axis: Vec3 } {
  const a = measures.nephronAnchor;
  const axis = vec(a.axis);
  const base = vec(a.baseCentre);
  const c = (a.cortexThicknessMm ?? 10) / 1000;
  return { tip: vec(a.papillaTip), base, capsule: [base[0] + axis[0] * c, base[1] + axis[1] * c, base[2] + axis[2] * c], axis };
}

/** Bounds of the default view for a mode. */
export function homeBounds(def: SimulationDefinition, mode: Mode = 'explore'): [Vec3, Vec3] {
  if (mode === 'nephron' || mode === 'filtering') {
    const w = nephronWedge();
    const pts = [w.tip, w.capsule];
    const lo = [0, 1, 2].map((i) => Math.min(...pts.map((p) => p[i]!)) - 0.004) as Vec3;
    const hi = [0, 1, 2].map((i) => Math.max(...pts.map((p) => p[i]!)) + 0.004) as Vec3;
    return [lo, hi];
  }
  const ids = HOME[mode] ?? HOME.explore!;
  return boundsOfIds(def, ids) ?? [[-0.1, -0.15, -0.05], [0.1, 0.15, 0.05]];
}

/** Bounds of everything shown in a mode (used to place the cut). */
export function modeBounds(def: SimulationDefinition, mode: Mode): [Vec3, Vec3] {
  const layers = mode === 'explore' || mode === 'tour' ? null : MODE_LAYERS[mode];
  const ids = def.structures.filter((s) => s.kind === 'mesh' && (layers ? layers.includes(s.layer) : !['neighbours', 'muscle', 'sinus'].includes(s.layer))).map((s) => s.id);
  return boundsOfIds(def, ids) ?? homeBounds(def, mode);
}

/** The middle of the two kidneys from front to back: where a frontal cut opens them. */
export const KIDNEY_MID_Z = (geometry['kidney-capsule-left']!.centroid[2]! + geometry['kidney-capsule-right']!.centroid[2]!) / 2;

/** Slice position (−1 … 1 across `bounds` on an axis) for a world coordinate. */
export function sliceAt(bounds: [Vec3, Vec3], axis: 0 | 1 | 2, world: number): number {
  const mid = (bounds[0][axis] + bounds[1][axis]) / 2, half = (bounds[1][axis] - bounds[0][axis]) / 2;
  return half > 0 ? Math.max(-1, Math.min(1, (world - mid) / half)) : 0;
}
/** The world coordinate of a slice position. */
export function sliceWorld(bounds: [Vec3, Vec3], axis: 0 | 1 | 2, at: number): number {
  const mid = (bounds[0][axis] + bounds[1][axis]) / 2, half = (bounds[1][axis] - bounds[0][axis]) / 2;
  return mid + at * half;
}

/**
 * The nephron view's frame: `u` along the pyramid's axis (outwards, towards the capsule), `w` as
 * near the body's front (+z) as possible across it, `v` the third axis. The origin is the
 * pyramid's base: the junction of cortex and medulla.
 */
export function nephronFrame(): { origin: Vec3; u: Vec3; v: Vec3; w: Vec3 } {
  const a = measures.nephronAnchor;
  const u = vec(a.axis);
  const ul = Math.hypot(...u); const un: Vec3 = [u[0] / ul, u[1] / ul, u[2] / ul];
  const front: Vec3 = [0, 0, 1];
  const d = front[0] * un[0] + front[1] * un[1] + front[2] * un[2];
  const w0: Vec3 = [front[0] - d * un[0], front[1] - d * un[1], front[2] - d * un[2]];
  const wl = Math.hypot(...w0); const w: Vec3 = [w0[0] / wl, w0[1] / wl, w0[2] / wl];
  const v: Vec3 = [w[1] * un[2] - w[2] * un[1], w[2] * un[0] - w[0] * un[2], w[0] * un[1] - w[1] * un[0]];
  return { origin: vec(a.baseCentre), u: un, v, w };
}

/** A nephron-local point [r, v, w] in model coordinates. */
export function nephronToWorld(p: readonly number[]): Vec3 {
  const f = nephronFrame();
  const [r, v, w] = [p[0] ?? 0, p[1] ?? 0, p[2] ?? 0];
  return [0, 1, 2].map((i) => f.origin[i]! + f.u[i]! * r + f.v[i]! * v + f.w[i]! * w) as Vec3;
}

/** The ureter wave: where along each ureter (mm from the top) the bolus is at time t (s), or null between waves. */
export function ureterWave(side: 'left' | 'right', timeS: number, perMin: number, speedMmS = 30): number | null {
  const period = 60 / Math.max(perMin, 0.1);
  const phase = (((timeS + (side === 'right' ? period / 2 : 0)) % period) + period) % period;
  const pos = phase * speedMmS;
  return pos <= ureters[side].lengthMm + 20 ? pos : null;
}
