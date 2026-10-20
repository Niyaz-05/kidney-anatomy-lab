/**
 * The nephron view's geometry (pure). Two nephrons are laid out in a wedge of one real pyramid of
 * the left kidney: a juxtamedullary nephron, whose glomerulus sits near the medulla and whose long
 * loop of Henle reaches deep towards the papilla, and a cortical nephron (about 85 % of nephrons,
 * OpenStax A&P 2e §25.4) with its glomerulus high in the cortex and a short loop. Both drain into
 * one collecting duct that opens at the papilla.
 *
 * Coordinates are local to the pyramid: `r` along the pyramid's axis (0 at the junction of cortex
 * and medulla, +cortex thickness at the capsule, −pyramid height at the papilla), `v` and `w`
 * across it, in metres. The depths come from the model (cortex thickness and pyramid height of
 * that pyramid); the courses are drawn, not traced, and tubule widths are enlarged about four times.
 */
import type { SegmentId } from './tubule';

export type Local = [r: number, v: number, w: number];
export type NephronKind = 'juxtamedullary' | 'cortical';

export interface NephronPiece { id: SegmentId | 'connecting'; nephron: NephronKind | 'shared'; points: Local[] }
export interface Vessel { id: 'radiate' | 'afferent' | 'efferent' | 'vasa-recta' | 'peritubular'; kind: 'artery' | 'vein' | 'capillary'; points: Local[] }
export interface NephronLayout {
  cortexM: number;
  medullaM: number;
  pieces: NephronPiece[];
  vessels: Vessel[];
  glomeruli: { nephron: NephronKind; centre: Local }[];
  /** The macula densa: where each thick ascending limb touches its own glomerulus. */
  maculaDensa: { nephron: NephronKind; at: Local }[];
  /** The filtrate's whole path through each nephron, with the segment each point belongs to. */
  paths: { nephron: NephronKind; points: Local[]; segment: (SegmentId | 'connecting')[]; t: number[] }[];
  tubeRadiusM: number;
  glomerulusRadiusM: number;
}

const MM = 0.001;

/** A coil: a path from a to b that winds round its own line `turns` times with radius `rad`. */
function coil(a: Local, b: Local, turns: number, rad: number, n = 80): Local[] {
  const out: Local[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n, env = Math.sin(Math.PI * t);
    const ang = t * turns * Math.PI * 2;
    out.push([
      a[0] + (b[0] - a[0]) * t + env * rad * 0.6 * Math.sin(ang * 0.5),
      a[1] + (b[1] - a[1]) * t + env * rad * Math.cos(ang),
      a[2] + (b[2] - a[2]) * t + env * rad * Math.sin(ang),
    ]);
  }
  return out;
}
const line = (a: Local, b: Local, n = 16): Local[] => Array.from({ length: n + 1 }, (_, i) => { const t = i / n; return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t] as Local; });
/** A hairpin bend at depth `r` from v0 to v1. */
function bend(r: number, v0: number, v1: number, w: number, n = 12): Local[] {
  const c = (v0 + v1) / 2, rad = Math.abs(v1 - v0) / 2, s = Math.sign(v1 - v0);
  return Array.from({ length: n + 1 }, (_, i) => { const a = Math.PI * (i / n); return [r - rad * Math.sin(a), c - s * rad * Math.cos(a), w] as Local; });
}
const join = (...parts: Local[][]) => parts.flatMap((p, i) => (i ? p.slice(1) : p));

export function nephronLayout(cortexMm: number, medullaMm: number): NephronLayout {
  const C = cortexMm * MM, H = medullaMm * MM;
  const pieces: NephronPiece[] = [];
  const glomeruli: NephronLayout['glomeruli'] = [];
  const maculaDensa: NephronLayout['maculaDensa'] = [];
  const paths: NephronLayout['paths'] = [];
  const cdV = 1.6 * MM;
  const cd = line([0.88 * C, cdV, 0], [-0.97 * H, cdV * 0.6, 0], 40);

  const build = (kind: NephronKind) => {
    const jm = kind === 'juxtamedullary';
    const v = jm ? -1.4 * MM : -0.3 * MM, w = jm ? 0 : 0.9 * MM;
    const g: Local = jm ? [0.14 * C, v, w] : [0.74 * C, v, w];
    glomeruli.push({ nephron: kind, centre: g });
    const loopDepth = jm ? -0.93 * H : -0.28 * H;
    const thinUp = jm ? -0.42 * H : loopDepth; // short loops have no thin ascending limb
    const loopV = v + 0.45 * MM;
    // Proximal tubule: coiled near the glomerulus, then its straight part runs down to the medulla.
    const pctTop: Local = jm ? [0.42 * C, v - 0.2 * MM, w + 0.4 * MM] : [0.95 * C, v - 0.2 * MM, w + 0.4 * MM];
    const pctCoil = join(coil(g, pctTop, 5, 0.45 * MM), coil(pctTop, [jm ? 0.05 * C : 0.5 * C, v, w], 4, 0.4 * MM));
    const pctStraight = line(pctCoil[pctCoil.length - 1]!, [-0.06 * H, v, w], 10);
    const pct = join(pctCoil, pctStraight);
    const desc = line([-0.06 * H, v, w], [loopDepth, v, w], 30);
    const hair = bend(loopDepth, v, loopV, w);
    const thinAsc = jm ? line([loopDepth, loopV, w], [thinUp, loopV, w], 24) : [hair[hair.length - 1]!];
    const md: Local = [g[0] - 0.35 * MM, loopV, w];
    const thick = line([thinUp, loopV, w], md, 30);
    maculaDensa.push({ nephron: kind, at: md });
    const dctEnd: Local = jm ? [0.3 * C, cdV - 0.5 * MM, w] : [0.84 * C, cdV - 0.5 * MM, w];
    const dct = coil(md, dctEnd, 3, 0.35 * MM);
    const joinAt = jm ? 0.24 * C : 0.8 * C;
    const cnt = line(dctEnd, [joinAt, cdV, 0], 8);
    pieces.push({ id: 'glomerulus', nephron: kind, points: [g] });
    pieces.push({ id: 'pct', nephron: kind, points: pct });
    pieces.push({ id: 'descending', nephron: kind, points: join(desc, hair) });
    if (jm) pieces.push({ id: 'thin-ascending', nephron: kind, points: thinAsc });
    pieces.push({ id: 'thick-ascending', nephron: kind, points: thick });
    pieces.push({ id: 'dct', nephron: kind, points: dct });
    pieces.push({ id: 'connecting', nephron: kind, points: cnt });
    // The filtrate's path, ending down the collecting duct from where this nephron joins it.
    const cdFrom = cd.findIndex((p) => p[0] <= joinAt);
    const route: [SegmentId | 'connecting', Local[]][] = [
      ['pct', pct], ['descending', join(desc, hair)], ...(jm ? [['thin-ascending', thinAsc] as [SegmentId, Local[]]] : []),
      ['thick-ascending', thick], ['dct', dct], ['connecting', cnt], ['collecting', cd.slice(Math.max(0, cdFrom))],
    ];
    const pts: Local[] = [], seg: (SegmentId | 'connecting')[] = [], ts: number[] = [];
    for (const [id, p] of route) p.forEach((q, i) => { if (pts.length && i === 0) return; pts.push(q); seg.push(id); ts.push(p.length > 1 ? i / (p.length - 1) : 0); });
    paths.push({ nephron: kind, points: pts, segment: seg, t: ts });
  };
  build('juxtamedullary');
  build('cortical');
  pieces.push({ id: 'collecting', nephron: 'shared', points: cd });

  // Blood: a cortical radiate artery runs out through the cortex; afferent arterioles feed each
  // glomerulus; efferent arterioles leave it. The juxtamedullary efferent dips into the medulla as
  // the vasa recta, beside the long loop.
  const rad: Local[] = line([-0.01 * C, -2.6 * MM, 0.3 * MM], [0.97 * C, -2.6 * MM, 0.3 * MM], 20);
  const vessels: Vessel[] = [{ id: 'radiate', kind: 'artery', points: rad }];
  for (const gl of glomeruli) {
    const [r, v, w] = gl.centre;
    vessels.push({ id: 'afferent', kind: 'artery', points: line([r - 0.2 * MM, -2.6 * MM, 0.3 * MM], [r, v - 0.3 * MM, w], 8) });
    if (gl.nephron === 'juxtamedullary') {
      const vr = v - 0.9 * MM;
      vessels.push({ id: 'vasa-recta', kind: 'capillary', points: join(line([r, v - 0.3 * MM, w + 0.2 * MM], [r - 0.6 * MM, vr, w + 0.3 * MM], 6), line([r - 0.6 * MM, vr, w + 0.3 * MM], [-0.88 * H, vr, w + 0.3 * MM], 30), bend(-0.88 * H, vr, vr - 0.5 * MM, w + 0.3 * MM), line([-0.88 * H, vr - 0.5 * MM, w + 0.3 * MM], [0, vr - 0.5 * MM, w + 0.3 * MM], 30)) });
    } else {
      vessels.push({ id: 'efferent', kind: 'artery', points: line([r, v - 0.3 * MM, w + 0.2 * MM], [r + 0.5 * MM, v - 1.0 * MM, w + 0.6 * MM], 8) });
      vessels.push({ id: 'peritubular', kind: 'capillary', points: coil([r + 0.5 * MM, v - 1.0 * MM, w + 0.6 * MM], [0.5 * C, v - 0.8 * MM, w + 0.8 * MM], 3, 0.5 * MM) });
    }
  }
  return { cortexM: C, medullaM: H, pieces, vessels, glomeruli, maculaDensa, paths, tubeRadiusM: 0.11 * MM, glomerulusRadiusM: 0.45 * MM };
}

/** Polyline length, metres. */
export const lengthOf = (pts: readonly Local[]) => pts.slice(1).reduce((s, p, i) => s + Math.hypot(p[0] - pts[i]![0], p[1] - pts[i]![1], p[2] - pts[i]![2]), 0);
