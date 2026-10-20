#!/usr/bin/env node
/**
 * Build public/models/kidney.glb from the HRA united-female body (kidneys, collecting system, ureters,
 * bladder, renal vessels, spine, pelvis, neighbouring organs) and BodyParts3D (adrenal glands,
 * segmental and suprarenal arteries, iliac arteries, lower ribs, psoas, diaphragm).
 *
 *   node tools/extract-kidney.mjs <Female Atlas models dir> <Human Atlas models dir>
 *
 *   <Female Atlas dir>   repo3-female-atlas/public/models: HRA united-female v1.5, +0.794760942 m in y
 *                        (reversed here).
 *   <Human Atlas dir>    repo4-human-atlas/public/models: BodyParts3D 4.0 (metres, Y-up,
 *                        +x = patient's left).
 *
 * Per mesh: weld, simplify the large HRA meshes with meshoptimizer within a relative error bound,
 * merge into one node per structure, recompute smooth normals. BodyParts3D parts are placed by
 * similarity transforms: 'body' on landmark centroids; 'kidney-left'/'kidney-right' refined by ICP of
 * the BodyParts3D kidney onto the HRA kidney. The female urethra is generated (schematic).
 * Also measures the kidneys, ureters and bladder, finds the ureter's three narrow points, and
 * generates the urine routes, the blood routes and the small renal arteries and veins (illustrative).
 * Writes public/models/kidney.glb, src/kidney/generated/geometry.json and provenance.json.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { Document, NodeIO } from '@gltf-transform/core';
import { MeshoptSimplifier } from 'meshoptimizer';
import * as THREE from 'three';
import { MeshBVH } from 'three-mesh-bvh';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const [femaleDir, humanDir] = process.argv.slice(2);
if (!femaleDir || !humanDir) {
  console.error('Usage: node tools/extract-kidney.mjs <female-atlas public/models dir> <human-atlas public/models dir>');
  process.exit(2);
}
await MeshoptSimplifier.ready;

const sha256 = (buf) => crypto.createHash('sha256').update(buf).digest('hex');
const r6 = (v) => Math.round(v * 1e6) / 1e6;
const spec = JSON.parse(fs.readFileSync(path.join(root, 'src/kidney/source/structures.source.json'), 'utf8'));
const SHIFT = spec.unitedYShift;
const MAX_ERROR = 0.004;
const V = (a) => new THREE.Vector3(...a);

// ── Sources ────────────────────────────────────────────────────────────────
function atlasReader(dir) {
  const bytes = fs.readFileSync(path.join(dir, 'atlas.json'));
  const atlas = JSON.parse(bytes.toString('utf8'));
  const cache = new Map(), hashes = {};
  const chunk = (i) => {
    if (!cache.has(i)) {
      const file = path.join(dir, atlas.chunks[i].url.split('/').pop());
      const buf = fs.readFileSync(file);
      cache.set(i, buf);
      hashes[path.basename(file)] = sha256(buf);
    }
    return cache.get(i);
  };
  const read = (part) => {
    const b = chunk(part.chunk);
    return {
      positions: new Float32Array(b.buffer.slice(b.byteOffset + part.positions, b.byteOffset + part.positions + part.vertexCount * 12)),
      indices: new Uint32Array(b.buffer.slice(b.byteOffset + part.indices, b.byteOffset + part.indices + part.indexCount * 4)),
    };
  };
  return { bytes, atlas, byId: new Map(atlas.parts.map((p) => [p.id, p])), read, hashes };
}
const female = atlasReader(femaleDir);
const human = atlasReader(humanDir);
function readUnited(id) {
  const part = female.byId.get(id);
  if (!part) throw new Error(`united body: part "${id}" missing`);
  const raw = female.read(part);
  for (let i = 1; i < raw.positions.length; i += 3) raw.positions[i] -= SHIFT;
  return raw;
}
function readBp3d(id) {
  const part = human.byId.get(id);
  if (!part) throw new Error(`BodyParts3D: part "${id}" missing`);
  return { ...human.read(part), part };
}

// ── Mesh clean-up ───────────────────────────────────────────────────────────
function weld(positions, indices) {
  const map = new Map(), remap = new Uint32Array(positions.length / 3), out = [];
  for (let i = 0; i < positions.length / 3; i++) {
    const key = `${Math.round(positions[i * 3] * 1e6)},${Math.round(positions[i * 3 + 1] * 1e6)},${Math.round(positions[i * 3 + 2] * 1e6)}`;
    let k = map.get(key);
    if (k === undefined) { k = out.length / 3; map.set(key, k); out.push(positions[i * 3], positions[i * 3 + 1], positions[i * 3 + 2]); }
    remap[i] = k;
  }
  const idx = [];
  for (let t = 0; t < indices.length; t += 3) {
    const a = remap[indices[t]], b = remap[indices[t + 1]], c = remap[indices[t + 2]];
    if (a !== b && b !== c && a !== c) idx.push(a, b, c);
  }
  return { positions: Float32Array.from(out), indices: Uint32Array.from(idx) };
}
function smoothNormals(positions, indices) {
  const n = new Float32Array(positions.length);
  for (let t = 0; t < indices.length; t += 3) {
    const [a, b, c] = [indices[t] * 3, indices[t + 1] * 3, indices[t + 2] * 3];
    const e1 = [positions[b] - positions[a], positions[b + 1] - positions[a + 1], positions[b + 2] - positions[a + 2]];
    const e2 = [positions[c] - positions[a], positions[c + 1] - positions[a + 1], positions[c + 2] - positions[a + 2]];
    const f = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
    for (const v of [a, b, c]) { n[v] += f[0]; n[v + 1] += f[1]; n[v + 2] += f[2]; }
  }
  for (let i = 0; i < n.length; i += 3) {
    const len = Math.hypot(n[i], n[i + 1], n[i + 2]);
    if (len > 0) { n[i] /= len; n[i + 1] /= len; n[i + 2] /= len; } else { n[i + 1] = 1; }
  }
  return n;
}
function simplify(positions, indices) {
  const tris = indices.length / 3;
  if (tris <= 6000) return { positions, indices, error: 0 };
  const target = Math.floor((indices.length * 0.5) / 3) * 3;
  const [simplified, error] = MeshoptSimplifier.simplify(indices, positions, 3, target, MAX_ERROR);
  const used = new Map(), pos = [];
  const idx = new Uint32Array(simplified.length);
  for (let i = 0; i < simplified.length; i++) {
    const v = simplified[i];
    let k = used.get(v);
    if (k === undefined) { k = pos.length / 3; used.set(v, k); pos.push(positions[v * 3], positions[v * 3 + 1], positions[v * 3 + 2]); }
    idx[i] = k;
  }
  return { positions: Float32Array.from(pos), indices: idx, error };
}
function mergePieces(pieces) {
  const vCount = pieces.reduce((n, p) => n + p.positions.length / 3, 0);
  const positions = new Float32Array(vCount * 3), indices = new Uint32Array(pieces.reduce((n, p) => n + p.indices.length, 0));
  let vo = 0, io = 0;
  for (const p of pieces) {
    positions.set(p.positions, vo * 3);
    for (let k = 0; k < p.indices.length; k++) indices[io + k] = p.indices[k] + vo;
    vo += p.positions.length / 3; io += p.indices.length;
  }
  return { positions, indices };
}
/** Midpoint subdivision: every triangle becomes four (for the coarse BodyParts3D parts). */
function subdivide(positions, indices) {
  const pos = Array.from(positions), idx = [];
  const mids = new Map();
  const mid = (a, b) => {
    const key = a < b ? `${a}_${b}` : `${b}_${a}`;
    let m = mids.get(key);
    if (m === undefined) {
      m = pos.length / 3;
      pos.push((pos[a * 3] + pos[b * 3]) / 2, (pos[a * 3 + 1] + pos[b * 3 + 1]) / 2, (pos[a * 3 + 2] + pos[b * 3 + 2]) / 2);
      mids.set(key, m);
    }
    return m;
  };
  for (let t = 0; t < indices.length; t += 3) {
    const [a, b, c] = [indices[t], indices[t + 1], indices[t + 2]];
    const ab = mid(a, b), bc = mid(b, c), ca = mid(c, a);
    idx.push(a, ab, ca, ab, b, bc, ca, bc, c, ab, bc, ca);
  }
  return { positions: Float32Array.from(pos), indices: Uint32Array.from(idx) };
}
/** Taubin smoothing (shrink-free): alternating Laplacian steps. */
function taubin(positions, indices, iterations) {
  const n = positions.length / 3, nb = Array.from({ length: n }, () => new Set());
  for (let t = 0; t < indices.length; t += 3) {
    const [a, b, c] = [indices[t], indices[t + 1], indices[t + 2]];
    nb[a].add(b).add(c); nb[b].add(a).add(c); nb[c].add(a).add(b);
  }
  for (let it = 0; it < iterations * 2; it++) {
    const f = it % 2 === 0 ? 0.5 : -0.53;
    const next = Float32Array.from(positions);
    for (let v = 0; v < n; v++) {
      if (!nb[v].size) continue;
      for (let a = 0; a < 3; a++) {
        let avg = 0;
        for (const u of nb[v]) avg += positions[u * 3 + a];
        avg /= nb[v].size;
        next[v * 3 + a] = positions[v * 3 + a] + f * (avg - positions[v * 3 + a]);
      }
    }
    positions.set(next);
  }
}
const bboxOf = (pos) => {
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < pos.length; i += 3) for (let a = 0; a < 3; a++) { lo[a] = Math.min(lo[a], pos[i + a]); hi[a] = Math.max(hi[a], pos[i + a]); }
  return [lo, hi];
};
function centroid(pos) {
  const c = [0, 0, 0], n = pos.length / 3;
  for (let i = 0; i < pos.length; i += 3) for (let a = 0; a < 3; a++) c[a] += pos[i + a] / n;
  return c;
}
const ray = new THREE.Ray();
function bvhOf(m) {
  if (!m.bvh) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(m.positions, 3));
    g.setIndex(new THREE.BufferAttribute(m.indices, 1));
    m.bvh = new MeshBVH(g);
  }
  return m.bvh;
}
const DIRS = [new THREE.Vector3(1, 0.0013, 0.0007).normalize(), new THREE.Vector3(0.0011, 1, 0.0017).normalize(), new THREE.Vector3(0.0009, 0.0015, 1).normalize()];
function insideMesh(bvh, p) {
  let odd = 0;
  for (const d of DIRS) {
    ray.origin.set(p[0], p[1], p[2]); ray.direction.copy(d);
    if (bvh.raycast(ray, THREE.DoubleSide).length % 2 === 1) odd++;
  }
  return odd >= 2;
}
/** Principal axes (unit vectors, largest spread first) and extents of a point set. */
function pca(pos) {
  const c = centroid(pos), n = pos.length / 3;
  const cov = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  for (let i = 0; i < pos.length; i += 3) {
    const d = [pos[i] - c[0], pos[i + 1] - c[1], pos[i + 2] - c[2]];
    for (let r = 0; r < 3; r++) for (let k = 0; k < 3; k++) cov[r][k] += (d[r] * d[k]) / n;
  }
  const axes = [];
  const M = cov.map((r) => r.slice());
  for (let e = 0; e < 3; e++) {
    let v = [1, 0.7, 0.4];
    for (let it = 0; it < 300; it++) {
      let w = [0, 1, 2].map((r) => M[r][0] * v[0] + M[r][1] * v[1] + M[r][2] * v[2]);
      for (const a of axes) { const d = w[0] * a[0] + w[1] * a[1] + w[2] * a[2]; w = w.map((x, q) => x - d * a[q]); }
      const len = Math.hypot(...w) || 1; v = w.map((x) => x / len);
    }
    axes.push(v);
  }
  const extents = axes.map((a) => {
    let lo = Infinity, hi = -Infinity;
    for (let i = 0; i < pos.length; i += 3) { const t = (pos[i] - c[0]) * a[0] + (pos[i + 1] - c[1]) * a[1] + (pos[i + 2] - c[2]) * a[2]; lo = Math.min(lo, t); hi = Math.max(hi, t); }
    return hi - lo;
  });
  return { centre: c, axes, extents };
}

// ── Similarity fits ─────────────────────────────────────────────────────────
/** Symmetric 4x4 eigenvector of the largest eigenvalue (power iteration with shift). */
function topEigen4(N) {
  let v = [1, 0.3, 0.2, 0.1];
  const shift = Math.abs(N.flat().reduce((a, b) => a + Math.abs(b), 0));
  for (let it = 0; it < 2000; it++) {
    const w = [0, 1, 2, 3].map((r) => N[r].reduce((s, x, c) => s + x * v[c], 0) + shift * v[r]);
    const len = Math.hypot(...w);
    v = w.map((x) => x / len);
  }
  return v;
}
/** Weighted similarity (Horn's quaternion method, then the least-squares scale). */
function horn(src, dst, w, fixedScale = null) {
  const W = w.reduce((a, b) => a + b, 0);
  const ms = [0, 1, 2].map((a) => src.reduce((s, p, i) => s + w[i] * p[a], 0) / W);
  const md = [0, 1, 2].map((a) => dst.reduce((s, p, i) => s + w[i] * p[a], 0) / W);
  const S = [0, 1, 2].map((r) => [0, 1, 2].map((c) => src.reduce((s, p, i) => s + w[i] * (p[r] - ms[r]) * (dst[i][c] - md[c]), 0)));
  const [[Sxx, Sxy, Sxz], [Syx, Syy, Syz], [Szx, Szy, Szz]] = S;
  const N = [
    [Sxx + Syy + Szz, Syz - Szy, Szx - Sxz, Sxy - Syx],
    [Syz - Szy, Sxx - Syy - Szz, Sxy + Syx, Szx + Sxz],
    [Szx - Sxz, Sxy + Syx, -Sxx + Syy - Szz, Syz + Szy],
    [Sxy - Syx, Szx + Sxz, Syz + Szy, -Sxx - Syy + Szz],
  ];
  const [qw, qx, qy, qz] = topEigen4(N);
  const quat = new THREE.Quaternion(qx, qy, qz, qw).normalize();
  const rotM = new THREE.Matrix4().makeRotationFromQuaternion(quat);
  const v = new THREE.Vector3();
  let num = 0, den = 0;
  src.forEach((p, i) => {
    v.set(p[0] - ms[0], p[1] - ms[1], p[2] - ms[2]);
    den += w[i] * v.lengthSq();
    v.applyMatrix4(rotM);
    num += w[i] * (v.x * (dst[i][0] - md[0]) + v.y * (dst[i][1] - md[1]) + v.z * (dst[i][2] - md[2]));
  });
  const scale = fixedScale ?? num / den;
  const place = (x, y, z) => {
    v.set(x - ms[0], y - ms[1], z - ms[2]).applyMatrix4(rotM).multiplyScalar(scale);
    return [v.x + md[0], v.y + md[1], v.z + md[2]];
  };
  return { place, scale, quat };
}
const unitedRef = (refs) => mergePieces(refs.map(readUnited));
function fitSimilarity(name, f) {
  const reg = f.pairs.map(([bp, refs]) => {
    const src = centroid(readBp3d(bp).positions);
    const dst = centroid(unitedRef(refs).positions);
    if (Math.abs(src[0]) > 0.01 && Math.sign(src[0]) !== Math.sign(dst[0])) throw new Error(`registration ${name}: ${bp} lies on opposite sides`);
    return { bp, name: human.byId.get(bp).name, src, dst };
  });
  let fit = horn(reg.map((r) => r.src), reg.map((r) => r.dst), reg.map(() => 1));
  let surfaceRmsMm = null;
  if (f.icp) {
    // Iterative closest point: the BodyParts3D kidney surface onto the HRA kidney capsule. The scale
    // is fixed by the two kidneys' sizes (free-scale ICP shrinks); the start aligns the principal
    // axes. The vessel centroids are reported but not used: the two bodies' vessels differ.
    const src = readBp3d(f.icp.bp3d).positions;
    const target = unitedRef([f.icp.united]);
    const tb = bvhOf(target);
    const ps = pca(src), pt = pca(target.positions);
    const scale = Math.cbrt((pt.extents[0] * pt.extents[1] * pt.extents[2]) / (ps.extents[0] * ps.extents[1] * ps.extents[2]));
    const pts = [];
    for (let i = 0; i < src.length; i += 3) pts.push([src[i], src[i + 1], src[i + 2]]);
    const hit = {}, q = new THREE.Vector3();
    const lm = reg.slice(1);
    const score = (fit) => {
      let s2 = 0;
      for (const p of pts) { q.set(...fit.place(...p)); tb.closestPointToPoint(q, hit); s2 += hit.distance ** 2; }
      const surf = Math.sqrt(s2 / pts.length);
      const land = Math.sqrt(lm.reduce((t, r) => t + Math.hypot(...fit.place(...r.src).map((x, k) => x - r.dst[k])) ** 2, 0) / lm.length);
      return { surf, land, total: surf };
    };
    let best = null;
    // Both bodies share one frame (y up, +x left, +z front), so each target axis takes the sign that
    // agrees with its source axis (an upside-down or front-to-back kidney is not a candidate).
    const sgn = (k) => (V(ps.axes[k]).dot(V(pt.axes[k])) >= 0 ? 1 : -1);
    for (const [sa, sb] of [[sgn(0), sgn(1)]]) {
      const ax = (p, k, sg) => V(p.axes[k]).multiplyScalar(sg);
      const A = [ax(ps, 0, 1), ax(ps, 1, 1)], B = [ax(pt, 0, sa), ax(pt, 1, sb)];
      A.push(new THREE.Vector3().crossVectors(A[0], A[1])); B.push(new THREE.Vector3().crossVectors(B[0], B[1]));
      const cs = V(ps.centre), ct = V(pt.centre);
      const s0 = A.flatMap((a) => [cs.clone().add(a.clone().multiplyScalar(0.03)), cs.clone().add(a.clone().multiplyScalar(-0.03))]).map((p) => p.toArray());
      const d0 = B.flatMap((b) => [ct.clone().add(b.clone().multiplyScalar(0.03 * scale)), ct.clone().add(b.clone().multiplyScalar(-0.03 * scale))]).map((p) => p.toArray());
      let fit = horn(s0, d0, s0.map(() => 1), scale);
      for (let it = 0; it < 30; it++) {
        const pairs = pts.map((p) => { q.set(...fit.place(...p)); tb.closestPointToPoint(q, hit); return { p, d: hit.point.toArray(), dist: hit.distance }; });
        const sorted = pairs.map((x) => x.dist).sort((x, y) => x - y);
        const cut = sorted[Math.floor(sorted.length / 2)] * 3 + 1e-4;
        const kept = pairs.filter((x) => x.dist <= cut);
        const lw = 0; // vessel centroids differ between the bodies; shape alone sets the pose
        fit = horn([...kept.map((x) => x.p), ...lm.map((r) => r.src)], [...kept.map((x) => x.d), ...lm.map((r) => r.dst)], [...kept.map(() => 1), ...lm.map(() => lw)], scale);
      }
      const sc = score(fit);
      if (!best || sc.total < best.sc.total) best = { fit, sc };
    }
    fit = best.fit;
    surfaceRmsMm = r6(best.sc.surf * 1000);
  }
  const residuals = reg.map((r) => ({ landmark: `${r.bp} ${r.name}`, mm: r6(Math.hypot(...fit.place(...r.src).map((q, a) => q - r.dst[a])) * 1000) }));
  const rms = Math.sqrt(residuals.reduce((q, r) => q + r.mm ** 2, 0) / residuals.length);
  const rotationDeg = r6((2 * Math.acos(Math.min(1, Math.abs(fit.quat.w))) * 180) / Math.PI);
  return { place: fit.place, scale: r6(fit.scale), rotationDeg, rmsResidualMm: r6(rms), surfaceRmsMm, residuals };
}
const fits = Object.fromEntries(Object.entries(spec.registration.fits).map(([name, f]) => [name, fitSimilarity(name, f)]));
for (const [name, f] of Object.entries(fits)) {
  const limit = spec.registration.fits[name].maxRmsMm;
  const value = f.surfaceRmsMm ?? f.rmsResidualMm;
  if (value > limit) throw new Error(`Registration "${name}" too poor: ${value} mm\n${JSON.stringify(f.residuals)}`);
}

// ── Centre: the middle of the urinary tract (kidneys to bladder) ───────────
const centre = (() => {
  const ids = ['VH_F_kidney_capsule_L', 'VH_F_kidney_capsule_R', 'VH_F_fundus_of_urinary_bladder_dome', 'VH_F_fundus_of_urinary_bladder_base'];
  const [lo, hi] = bboxOf(unitedRef(ids).positions);
  return [0, 1, 2].map((a) => (lo[a] + hi[a]) / 2);
})();
const centred = (raw) => {
  const p = Float32Array.from(raw.positions);
  for (let i = 0; i < p.length; i += 3) for (let a = 0; a < 3; a++) p[i + a] -= centre[a];
  return { positions: p, indices: raw.indices };
};
/** United parts by id, centred (for routes that need the individual pyramids and calyces). */
const partCache = new Map();
const part = (id) => { if (!partCache.has(id)) partCache.set(id, weld(...Object.values(centred(readUnited(id))))); return partCache.get(id); };

// ── Build structures ────────────────────────────────────────────────────────
let sourceTriangles = 0, maxError = 0;
const used = new Set();
const meshes = [];
const bp3dParts = {};
for (const s of spec.structures) {
  if (s.schematic) continue;
  if (s.bp3d) {
    const { place } = fits[s.fit];
    const pieces = s.bp3d.map((id) => {
      const raw = readBp3d(id);
      bp3dParts[s.id] = [...(bp3dParts[s.id] ?? []), `${id} ${raw.part.name}`];
      sourceTriangles += raw.indices.length / 3;
      const pos = new Float32Array(raw.positions.length);
      for (let i = 0; i < pos.length; i += 3) {
        const p = place(raw.positions[i], raw.positions[i + 1], raw.positions[i + 2]);
        pos.set([p[0] - centre[0], p[1] - centre[1], p[2] - centre[2]], i);
      }
      const w = weld(pos, raw.indices);
      if (s.layer !== 'bone' && w.positions.length / 3 < 600) {
        const sub = subdivide(w.positions, w.indices);
        taubin(sub.positions, sub.indices, 3);
        return sub;
      }
      return w;
    });
    meshes.push({ structure: s, ...mergePieces(pieces) });
    continue;
  }
  const pieces = s.united.map((id) => {
    if (used.has(id)) throw new Error(`${id} used twice`);
    used.add(id);
    const raw = centred(readUnited(id));
    for (const v of raw.positions) if (!Number.isFinite(v)) throw new Error('non-finite position');
    for (const i of raw.indices) if (i >= raw.positions.length / 3) throw new Error('index out of range');
    sourceTriangles += raw.indices.length / 3;
    const w = weld(raw.positions, raw.indices);
    const sm = simplify(w.positions, w.indices);
    maxError = Math.max(maxError, sm.error);
    return sm;
  });
  meshes.push({ structure: s, ...mergePieces(pieces) });
}
const byId = new Map(meshes.map((m) => [m.structure.id, m]));
const cen = (id) => V(centroid(byId.get(id).positions));

// ── Keep placed BodyParts3D soft parts out of the HRA kidneys ─────────────
const kidneyBvh = bvhOf(mergePieces([byId.get('kidney-capsule-left'), byId.get('kidney-capsule-right')]));
const insidePct = (m) => { let inside = 0, n = 0; for (let i = 0; i < m.positions.length; i += 9) { n++; if (insideMesh(kidneyBvh, [m.positions[i], m.positions[i + 1], m.positions[i + 2]])) inside++; } return r6((100 * inside) / n); };
const overlap = { before: {}, after: {} };
for (const m of meshes) {
  if (!m.structure.bp3d) continue;
  const before = insidePct(m);
  overlap.before[m.structure.id] = before;
  if (!m.structure.mould || before === 0) { overlap.after[m.structure.id] = before; continue; }
  const res = {}, v = new THREE.Vector3();
  for (let pass = 0; pass < 6; pass++) {
    let moved = 0;
    for (let i = 0; i < m.positions.length; i += 3) {
      v.set(m.positions[i], m.positions[i + 1], m.positions[i + 2]);
      if (!insideMesh(kidneyBvh, [v.x, v.y, v.z])) continue;
      kidneyBvh.closestPointToPoint(v, res);
      const out = res.point.clone().sub(v).normalize();
      v.copy(res.point).addScaledVector(out, 0.0006);
      m.positions.set([v.x, v.y, v.z], i);
      moved++;
    }
    if (!moved) break;
    if (pass < 5) taubin(m.positions, m.indices, 1);
  }
  overlap.after[m.structure.id] = insidePct(m);
}

// ── Trim placed branches that leave the HRA kidney away from its hilum ─────
// The BodyParts3D kidney is a different shape, so a few of its segmental branches run outside the
// HRA kidney. Triangles wholly outside the kidney and more than 20 mm from its renal pelvis are cut.
const trimmed = {};
for (const m of meshes) {
  if (!m.structure.trim) continue;
  const side = m.structure.side;
  const cb = bvhOf(byId.get(`kidney-capsule-${side}`));
  const pc = V(centroid(byId.get(`renal-pelvis-${side}`).positions));
  const keepV = new Uint8Array(m.positions.length / 3);
  for (let i = 0; i < keepV.length; i++) {
    const p = [m.positions[i * 3], m.positions[i * 3 + 1], m.positions[i * 3 + 2]];
    keepV[i] = V(p).distanceTo(pc) < 0.02 || insideMesh(cb, p) ? 1 : 0;
  }
  const idx = [];
  for (let t = 0; t < m.indices.length; t += 3) if (keepV[m.indices[t]] || keepV[m.indices[t + 1]] || keepV[m.indices[t + 2]]) idx.push(m.indices[t], m.indices[t + 1], m.indices[t + 2]);
  const before = m.indices.length / 3;
  const remap = new Map(), pos = [];
  const out = idx.map((v) => { if (!remap.has(v)) { remap.set(v, pos.length / 3); pos.push(m.positions[v * 3], m.positions[v * 3 + 1], m.positions[v * 3 + 2]); } return remap.get(v); });
  m.positions = Float32Array.from(pos); m.indices = Uint32Array.from(out);
  trimmed[m.structure.id] = { trianglesBefore: before, trianglesAfter: out.length / 3 };
}

// ── Helpers on placed meshes ───────────────────────────────────────────────
function nearestVertex(m, p) {
  const q = m.positions; let b = 0, bd = Infinity;
  for (let i = 0; i < q.length; i += 3) { const d = (q[i] - p.x) ** 2 + (q[i + 1] - p.y) ** 2 + (q[i + 2] - p.z) ** 2; if (d < bd) { bd = d; b = i; } }
  return V([q[b], q[b + 1], q[b + 2]]);
}
/** Nearest vertex of mesh A to mesh B (and the gap between them). */
function contact(a, b) {
  const C = 0.004, grid = new Map();
  for (let i = 0; i < b.positions.length; i += 3) {
    const k = `${Math.floor(b.positions[i] / C)},${Math.floor(b.positions[i + 1] / C)},${Math.floor(b.positions[i + 2] / C)}`;
    (grid.get(k) ?? grid.set(k, []).get(k)).push(i);
  }
  let best = Infinity, at = 0;
  for (let i = 0; i < a.positions.length; i += 3) {
    const [x, y, z] = [a.positions[i], a.positions[i + 1], a.positions[i + 2]];
    const g = [Math.floor(x / C), Math.floor(y / C), Math.floor(z / C)];
    for (let r = 0; r <= 12 && best > (r - 1) * C; r++) {
      for (let dx = -r; dx <= r; dx++) for (let dy = -r; dy <= r; dy++) for (let dz = -r; dz <= r; dz++) {
        if (Math.max(Math.abs(dx), Math.abs(dy), Math.abs(dz)) !== r) continue;
        const cell = grid.get(`${g[0] + dx},${g[1] + dy},${g[2] + dz}`);
        if (!cell) continue;
        for (const j of cell) {
          const d = Math.hypot(b.positions[j] - x, b.positions[j + 1] - y, b.positions[j + 2] - z);
          if (d < best) { best = d; at = i; }
        }
      }
    }
  }
  return { point: V([a.positions[at], a.positions[at + 1], a.positions[at + 2]]), gap: best };
}
const polyLength = (pts) => pts.slice(1).reduce((s, p, i) => s + p.distanceTo(pts[i]), 0);
const arr = (pts) => pts.map((p) => p.toArray().map(r6));
/** Chaikin smoothing of a polyline (ends kept). */
function chaikin(pts, iterations = 2) {
  let out = pts;
  for (let it = 0; it < iterations; it++) {
    const next = [out[0]];
    for (let i = 0; i < out.length - 1; i++) next.push(out[i].clone().lerp(out[i + 1], 0.25), out[i].clone().lerp(out[i + 1], 0.75));
    next.push(out[out.length - 1]);
    out = next;
  }
  return out;
}
/** Resample a polyline at a fixed spacing. */
function resample(pts, step) {
  const out = [pts[0].clone()];
  let carry = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1], len = a.distanceTo(b);
    let t = step - carry;
    while (t <= len) { out.push(a.clone().lerp(b, t / len)); t += step; }
    carry = len - (t - step);
  }
  if (out[out.length - 1].distanceTo(pts[pts.length - 1]) > step * 0.2) out.push(pts[pts.length - 1].clone());
  return out;
}

// ── Ureters: centreline by height, widths, the three narrow points ─────────
const measures = {}, routes = {}, gaps = {};
const ureter = {};
for (const side of ['left', 'right']) {
  const m = byId.get(`ureter-${side}`);
  const pelvis = byId.get(`renal-pelvis-${side}`);
  const [lo, hi] = bboxOf(m.positions);
  const N = 48, slabs = [];
  for (let k = 0; k < N; k++) {
    const a = hi[1] - ((hi[1] - lo[1]) * k) / N, b = hi[1] - ((hi[1] - lo[1]) * (k + 1)) / N;
    const pts = [];
    for (let i = 0; i < m.positions.length; i += 3) { const y = m.positions[i + 1]; if (y <= a && y >= b) pts.push(V([m.positions[i], y, m.positions[i + 2]])); }
    if (pts.length < 6) continue;
    const c = pts.reduce((s, p) => s.add(p), new THREE.Vector3()).divideScalar(pts.length);
    slabs.push({ c, pts });
  }
  // Tangents and widths: the mean distance of the slab's vertices from the centre, across the tube.
  const line = slabs.map((s) => s.c);
  const widths = slabs.map((s, k) => {
    const t = line[Math.min(k + 1, line.length - 1)].clone().sub(line[Math.max(k - 1, 0)]).normalize();
    const r = s.pts.reduce((sum, p) => { const d = p.clone().sub(s.c); return sum + d.sub(t.clone().multiplyScalar(d.dot(t))).length(); }, 0) / s.pts.length;
    return 2 * r;
  });
  const top = contact(pelvis, m).point;
  const orifice = cen(`ureteral-orifice-${side}`);
  const pts = chaikin([top, ...line, orifice], 2);
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + pts[i].distanceTo(pts[i - 1]));
  const arcAt = (p) => { let b = 0, bd = Infinity; pts.forEach((q, i) => { const d = q.distanceTo(p); if (d < bd) { bd = d; b = i; } }); return cum[b]; };
  const widthNear = (p, span = 2) => {
    let b = 0, bd = Infinity; line.forEach((q, i) => { const d = q.distanceTo(p); if (d < bd) { bd = d; b = i; } });
    const w = widths.slice(Math.max(0, b - span), b + span + 1);
    return Math.min(...w);
  };
  // 1. Pelviureteric junction: where the ureter leaves the pelvis.
  const puj = line[1] ?? line[0];
  // 2. Crossing the iliac vessels at the pelvic brim: the ureter's closest approach to them.
  const iliac = byId.get(`common-iliac-vein-${side}`); // the common iliac artery's bifurcation lies on it
  let brim = line[0], brimGap = Infinity;
  for (const p of line) { const q = nearestVertex(iliac, p); const d = q.distanceTo(p); if (d < brimGap) { brimGap = d; brim = p; } }
  // 3. Vesicoureteric junction: where the ureter enters the bladder wall.
  const bladder = mergePieces([byId.get('bladder-base'), byId.get('bladder-dome')]);
  let vuj = line[line.length - 1], vujGap = Infinity;
  for (const p of line.slice(Math.floor(line.length / 2))) { const d = nearestVertex(bladder, p).distanceTo(p); if (d < vujGap) { vujGap = d; vuj = p; } }
  const narrow = [
    { id: 'puj', name: 'Pelviureteric junction', point: puj, widthMm: widthNear(puj, 1) * 1000 },
    { id: 'brim', name: 'Crossing the iliac vessels (pelvic brim)', point: brim, widthMm: widthNear(brim) * 1000, gapToVesselsMm: brimGap * 1000 },
    { id: 'vuj', name: 'Vesicoureteric junction', point: vuj, widthMm: widthNear(vuj) * 1000, gapToBladderMm: vujGap * 1000 },
  ].map((n) => ({ ...n, point: n.point.toArray().map(r6), arcMm: r6(arcAt(n.point) * 1000), widthMm: r6(n.widthMm), ...(n.gapToVesselsMm !== undefined ? { gapToVesselsMm: r6(n.gapToVesselsMm) } : {}), ...(n.gapToBladderMm !== undefined ? { gapToBladderMm: r6(n.gapToBladderMm) } : {}) }));
  ureter[side] = { points: arr(pts), arcMm: cum.map((c) => r6(c * 1000)), lengthMm: r6(cum[cum.length - 1] * 1000), widthsMm: widths.map((w) => r6(w * 1000)), medianWidthMm: r6([...widths].sort((a, b) => a - b)[Math.floor(widths.length / 2)] * 1000), narrow };
}
routes.ureter = ureter;

// ── Urine: papilla → minor calyx → major calyx → pelvis → ureter → bladder ─
{
  const urine = {};
  for (const [side, X] of [['left', 'L'], ['right', 'R']]) {
    const s = spec.structures;
    const ids = (prefix) => s.find((x) => x.id === `${prefix}-${side}`).united;
    const papillae = ids('renal-papillae'), pyramids = ids('renal-pyramids'), minors = ids('minor-calyces'), majors = ids('major-calyces');
    const pelvis = byId.get(`renal-pelvis-${side}`);
    const ur = ureter[side];
    const urTop = V(ur.points[0]);
    const pelvisC = cen(`renal-pelvis-${side}`);
    const bladderC = V(centroid(mergePieces([byId.get('bladder-base'), byId.get('bladder-dome')]).positions));
    const minorTo = {};
    for (const mi of minors) {
      const mm = part(mi);
      let best = null;
      for (const ma of majors) { const c = contact(mm, part(ma)); if (!best || c.gap < best.gap) best = { ma, ...c }; }
      minorTo[mi] = best;
    }
    const majorTo = Object.fromEntries(majors.map((ma) => [ma, contact(part(ma), pelvis)]));
    urine[side] = papillae.map((pid, k) => {
      const pap = part(pid), pyr = part(pyramids[k]);
      const pyrC = V(centroid(pyr.positions));
      // The papilla's tip: its vertex farthest from the pyramid's centre.
      let tip = null, td = -1;
      for (let i = 0; i < pap.positions.length; i += 3) { const p = V([pap.positions[i], pap.positions[i + 1], pap.positions[i + 2]]); const d = p.distanceTo(pyrC); if (d > td) { td = d; tip = p; } }
      let mi = null, md = Infinity;
      for (const id of minors) { const d = nearestVertex(part(id), tip).distanceTo(tip); if (d < md) { md = d; mi = id; } }
      const to = minorTo[mi];
      gaps[`${pid}→${mi}`] = r6(md * 1000);
      const pts = [tip, V(centroid(part(mi).positions)), to.point, V(centroid(part(to.ma).positions)), majorTo[to.ma].point, pelvisC.clone().lerp(urTop, 0.5), urTop];
      const route = [...chaikin(pts, 2), ...ur.points.slice(1).map((q) => V(q)), bladderC];
      return { papilla: pid, minorCalyx: mi, majorCalyx: to.ma, points: arr(resample(route, 0.003)) };
    });
  }
  routes.urine = urine;
}

// ── Small renal vessels (illustrative) and the blood routes ────────────────
// Each pyramid gets an interlobar artery up each flank (in the renal column beside it), an arcuate
// artery over its base, and cortical radiate arteries out towards the capsule. The pattern is
// generated, but it follows the real pyramids and capsule of this kidney. Veins run alongside.
const vessels = [];
let nephron = null;
{
  const blood = {}, bloodReturn = {};
  for (const side of ['left', 'right']) {
    const s = spec.structures;
    const pyramids = s.find((x) => x.id === `renal-pyramids-${side}`).united;
    const papillae = s.find((x) => x.id === `renal-papillae-${side}`).united;
    const capsule = byId.get(`kidney-capsule-${side}`), cb = bvhOf(capsule);
    const artery = byId.get(`renal-artery-${side}`), vein = byId.get(`renal-vein-${side}`);
    const aorta = byId.get('aorta'), ivc = byId.get('inferior-vena-cava');
    const kC = cen(`kidney-capsule-${side}`), pelvisC = cen(`renal-pelvis-${side}`);
    const hilumDir = pelvisC.clone().sub(kC).normalize();
    // Main trunks: from the aorta along the renal artery to the hilum; from the hilum along the
    // renal vein to the vena cava.
    const trunk = (m, from, to) => {
      const pts = [from];
      const pos = m.positions, ax = to.clone().sub(from), L = ax.length(); ax.normalize();
      const N = 10;
      for (let k = 1; k < N; k++) {
        const t0 = (L * (k - 0.5)) / N, t1 = (L * (k + 0.5)) / N, acc = new THREE.Vector3(); let n = 0;
        for (let i = 0; i < pos.length; i += 3) { const p = V([pos[i], pos[i + 1], pos[i + 2]]); const t = p.clone().sub(from).dot(ax); if (t >= t0 && t < t1) { acc.add(p); n++; } }
        if (n) pts.push(acc.divideScalar(n));
      }
      pts.push(to);
      return chaikin(pts, 2);
    };
    const aOrigin = contact(artery, aorta).point, aEnd = nearestVertex(artery, pelvisC.clone().addScaledVector(hilumDir, 0.01));
    const vEnd = contact(vein, ivc).point, vStart = nearestVertex(vein, pelvisC.clone().addScaledVector(hilumDir, 0.01));
    const aTrunk = trunk(artery, aOrigin, aEnd), vTrunk = trunk(vein, vStart, vEnd);
    const arterial = [], venous = [];
    pyramids.forEach((pid, k) => {
      const pyr = part(pid), pap = part(papillae[k]);
      const pyrC = V(centroid(pyr.positions)), papC = V(centroid(pap.positions));
      const axis = pyrC.clone().sub(papC).normalize();
      const pos = pyr.positions;
      const P = []; for (let i = 0; i < pos.length; i += 3) P.push(V([pos[i], pos[i + 1], pos[i + 2]]));
      const tOf = (p) => p.clone().sub(papC).dot(axis);
      const tMax = Math.max(...P.map(tOf));
      const base = P.filter((p) => tOf(p) > 0.7 * tMax);
      const baseC = base.reduce((a, p) => a.add(p), new THREE.Vector3()).divideScalar(base.length);
      const flat = new Float32Array(base.length * 3); base.forEach((p, i) => flat.set(p.toArray(), i * 3));
      const e1 = V(pca(flat).axes[0]); e1.sub(axis.clone().multiplyScalar(e1.dot(axis))).normalize();
      const e2 = new THREE.Vector3().crossVectors(axis, e1).normalize();
      const extreme = (dir, t0, t1) => { let b = null, bd = -Infinity; for (const p of P) { const t = tOf(p); if (t < t0 || t > t1) continue; const d = p.clone().sub(papC).dot(dir); if (d > bd) { bd = d; b = p; } } return b; };
      const hit = {};
      const toCapsule = (p, dir) => { ray.origin.copy(p); ray.direction.copy(dir); const h = cb.raycastFirst(ray, THREE.DoubleSide); return h && h.distance < 0.03 ? h.distance : null; };
      for (const sgn of [1, -1]) {
        const dir = e1.clone().multiplyScalar(sgn);
        // Interlobar: up the flank, 0.8 mm outside the pyramid, from 15 % to 85 % of its height.
        const flank = [];
        for (let f = 0.15; f <= 0.851; f += 0.1) { const q = extreme(dir, (f - 0.06) * tMax, (f + 0.06) * tMax); if (q) flank.push(q.clone().addScaledVector(dir, 0.0008)); }
        if (flank.length < 3) return;
        // Arcuate: over the base, from this flank's corner to the base's middle.
        const arc = [];
        for (let a = 0; a <= 4; a++) {
          const ang = (a / 4) * (Math.PI / 2);
          const d = dir.clone().multiplyScalar(Math.cos(ang)).addScaledVector(axis, Math.sin(ang)).normalize();
          let b = null, bd = -Infinity;
          for (const p of P) { if (tOf(p) < 0.6 * tMax) continue; const v = p.clone().sub(baseC); const dd = v.dot(d) - 0.5 * Math.abs(v.dot(e2)); if (dd > bd) { bd = dd; b = p; } }
          if (b) arc.push(b.clone().addScaledVector(d, 0.0008));
        }
        // Cortical radiate: from the arcuate's middle, outward to 1 mm under the capsule.
        const rStart = arc[Math.floor(arc.length / 2)] ?? flank[flank.length - 1];
        const outward = rStart.clone().sub(papC).normalize();
        const reach = toCapsule(rStart, outward);
        const radiate = reach ? [rStart, rStart.clone().addScaledVector(outward, Math.max(0.001, reach - 0.001))] : null;
        const sinusPoint = flank[0].clone().addScaledVector(axis, -0.004);
        const link = chaikin([aEnd, aEnd.clone().lerp(sinusPoint, 0.5).addScaledVector(axis, -0.002), sinusPoint, flank[0]], 2);
        const off = e2.clone().multiplyScalar(0.0009);
        const vein = (pts) => pts.map((p) => p.clone().add(off));
        const pieceA = { interlobar: chaikin(flank, 2), arcuate: chaikin(arc, 2), radiate };
        vessels.push({ kind: 'artery', order: 'interlobar', side, pyramid: pid, widthMm: 1.0, points: arr(pieceA.interlobar) });
        vessels.push({ kind: 'artery', order: 'arcuate', side, pyramid: pid, widthMm: 0.6, points: arr(pieceA.arcuate) });
        if (radiate) vessels.push({ kind: 'artery', order: 'radiate', side, pyramid: pid, widthMm: 0.35, points: arr(radiate) });
        vessels.push({ kind: 'vein', order: 'interlobar', side, pyramid: pid, widthMm: 1.2, points: arr(vein(pieceA.interlobar)) });
        vessels.push({ kind: 'vein', order: 'arcuate', side, pyramid: pid, widthMm: 0.7, points: arr(vein(pieceA.arcuate)) });
        if (radiate) vessels.push({ kind: 'vein', order: 'radiate', side, pyramid: pid, widthMm: 0.4, points: arr(vein(radiate)) });
        vessels.push({ kind: 'artery', order: 'link', side, pyramid: pid, widthMm: 1.4, points: arr(link) });
        const vLink = chaikin([vein([flank[0]])[0], vein([sinusPoint])[0], vStart.clone().lerp(sinusPoint, 0.5).addScaledVector(axis, -0.002), vStart], 2);
        vessels.push({ kind: 'vein', order: 'link', side, pyramid: pid, widthMm: 1.6, points: arr(vLink) });
        const aPath = [...aTrunk, ...link.slice(1), ...pieceA.interlobar.slice(1), ...pieceA.arcuate.slice(1), ...(radiate ? radiate.slice(1) : [])];
        const vPath = [...(radiate ? vein(radiate).reverse() : []), ...vein(pieceA.arcuate).reverse().slice(1), ...vein(pieceA.interlobar).reverse().slice(1), ...vLink.slice(1), ...vTrunk.slice(1)];
        arterial.push({ pyramid: pid, points: arr(resample(aPath, 0.002)) });
        venous.push({ pyramid: pid, points: arr(resample(vPath, 0.002)) });
        // The nephron view sits in the left kidney's largest pyramid.
        if (side === 'left' && sgn === 1 && (!nephron || tMax > nephron.heightMm / 1000)) {
          const cortex = toCapsule(baseC, axis);
          nephron = { side, pyramid: pid, papillaTip: papC.toArray().map(r6), baseCentre: baseC.toArray().map(r6), axis: axis.toArray().map(r6), heightMm: r6(tMax * 1000), cortexThicknessMm: cortex ? r6(cortex * 1000) : null };
        }
      }
    });
    blood[side] = arterial; bloodReturn[side] = venous;
    gaps[`renal-artery-${side}→aorta`] = r6(contact(artery, aorta).gap * 1000);
    gaps[`renal-vein-${side}→ivc`] = r6(contact(vein, ivc).gap * 1000);
  }
  routes.blood = blood; routes.bloodReturn = bloodReturn;
}

// ── Schematic female urethra ────────────────────────────────────────────────
// The HRA body has no urethra, and BodyParts3D's is male, so a 4 cm tube is drawn from the lowest
// point of the bladder neck, along the front of the vagina (Gray's: about 4 cm long, 6 mm wide).
{
  const neck = byId.get('bladder-neck'), vag = byId.get('vagina');
  let low = 1; for (let k = 1; k < neck.positions.length; k += 3) if (neck.positions[k] < neck.positions[low]) low = k;
  const start = V([neck.positions[low - 1], neck.positions[low], neck.positions[low + 1]]);
  const vp = pca(vag.positions);
  let axis = V(vp.axes[0]); if (axis.y > 0) axis.negate();
  const dir = axis.clone().add(V([0, 0, 0.35])).normalize(); // a little forward, in front of the vagina
  const len = 0.04, R = 0.003, segs = 20, rad = 16;
  const side1 = new THREE.Vector3(1, 0, 0), side2 = new THREE.Vector3().crossVectors(dir, side1).normalize();
  const pos = [], idx = [];
  for (let i = 0; i <= segs; i++) {
    const t = i / segs, c = start.clone().addScaledVector(dir, len * t);
    const r = R * (i === 0 ? 1.2 : 1) * (1 - 0.15 * t);
    for (let j = 0; j < rad; j++) { const a = (j / rad) * Math.PI * 2; const p = c.clone().addScaledVector(side1, Math.cos(a) * r).addScaledVector(side2, Math.sin(a) * r); pos.push(p.x, p.y, p.z); }
  }
  for (let i = 0; i < segs; i++) for (let j = 0; j < rad; j++) {
    const a = i * rad + j, b = i * rad + ((j + 1) % rad), c = (i + 1) * rad + j, d = (i + 1) * rad + ((j + 1) % rad);
    idx.push(a, c, b, b, c, d);
  }
  const s = spec.structures.find((x) => x.id === 'urethra');
  meshes.push({ structure: s, positions: Float32Array.from(pos), indices: Uint32Array.from(idx) });
  byId.set('urethra', meshes[meshes.length - 1]);
  routes.urethra = arr([start, start.clone().addScaledVector(dir, len)]);
  measures.urethraLengthMm = len * 1000;
}
for (const m of meshes) m.normals = smoothNormals(m.positions, m.indices);

// ── Measurements ────────────────────────────────────────────────────────────
function signedVolume(m) {
  let v = 0; const p = m.positions, ix = m.indices;
  for (let t = 0; t < ix.length; t += 3) {
    const a = ix[t] * 3, b = ix[t + 1] * 3, c = ix[t + 2] * 3;
    v += (p[a] * (p[b + 1] * p[c + 2] - p[b + 2] * p[c + 1]) - p[a + 1] * (p[b] * p[c + 2] - p[b + 2] * p[c]) + p[a + 2] * (p[b] * p[c + 1] - p[b + 1] * p[c])) / 6;
  }
  return v;
}
const vertebrae = ['thoracic-vertebra-11', 'thoracic-vertebra-12', ...[1, 2, 3, 4, 5, 6].map((n) => `lumbar-vertebra-${n}`)];
const levelAt = (y) => { let best = null, bd = Infinity; for (const id of vertebrae) { const c = cen(id); const d = Math.abs(c.y - y); if (d < bd) { bd = d; best = id; } } return best; };
measures.kidneys = {};
for (const side of ['left', 'right']) {
  const cap = byId.get(`kidney-capsule-${side}`);
  const p = pca(cap.positions);
  const [lo, hi] = bboxOf(cap.positions);
  measures.kidneys[side] = {
    lengthMm: r6(p.extents[0] * 1000), widthMm: r6(p.extents[1] * 1000), thicknessMm: r6(p.extents[2] * 1000),
    // The capsule is a thin closed shell; the outer cortex is the closed outline of the whole kidney.
    volumeMl: r6(Math.abs(signedVolume(byId.get(`renal-cortex-${side}`))) * 1e6),
    upperPole: levelAt(hi[1]), hilum: levelAt(cen(`renal-pelvis-${side}`).y), lowerPole: levelAt(lo[1]),
    pyramids: spec.structures.find((x) => x.id === `renal-pyramids-${side}`).united.length,
    minorCalyces: spec.structures.find((x) => x.id === `minor-calyces-${side}`).united.length,
    majorCalyces: spec.structures.find((x) => x.id === `major-calyces-${side}`).united.length,
  };
}
measures.rightKidneyHigherByMm = r6((cen('kidney-capsule-right').y - cen('kidney-capsule-left').y) * 1000);
measures.ureterLengthMm = { left: ureter.left.lengthMm, right: ureter.right.lengthMm };
{
  // The bladder wall: dome + base (+ trigone and neck) welded; its volume is reported only if closed.
  const w = weld(...Object.values(mergePieces(['bladder-dome', 'bladder-base', 'trigone', 'bladder-neck'].map((id) => byId.get(id)))));
  const edges = new Map();
  for (let t = 0; t < w.indices.length; t += 3) for (const [a, b] of [[w.indices[t], w.indices[t + 1]], [w.indices[t + 1], w.indices[t + 2]], [w.indices[t + 2], w.indices[t]]]) { const k = a < b ? a + '_' + b : b + '_' + a; edges.set(k, (edges.get(k) ?? 0) + 1); }
  const open = [...edges.values()].filter((n) => n === 1).length;
  const [lo, hi] = bboxOf(w.positions);
  const size = [0, 1, 2].map((a) => (hi[a] - lo[a]) * 1000);
  // Open wall: estimate the volume as clinicians do on ultrasound, 0.52 x length x width x height.
  measures.bladder = { openEdges: open, volumeMl: open === 0 ? r6(Math.abs(signedVolume(w)) * 1e6) : null, ellipsoidMl: r6((0.52 * size[0] * size[1] * size[2]) / 1000), sizeMm: size.map(r6) };
}
measures.lumbarVertebrae = 6;
measures.nephronAnchor = nephron;

// ── Geometry facts ──────────────────────────────────────────────────────────
const geometry = {};
const sideErrors = [];
for (const m of meshes) {
  const s = m.structure;
  const [lo, hi] = bboxOf(m.positions);
  const c = centroid(m.positions);
  const bodyX = c[0] + centre[0];
  if (s.sideCheck !== false) {
    if (s.side === 'right' && !(bodyX < 0)) sideErrors.push(`${s.id} claims right but body x = ${bodyX.toFixed(4)}`);
    if (s.side === 'left' && !(bodyX > 0)) sideErrors.push(`${s.id} claims left but body x = ${bodyX.toFixed(4)}`);
  }
  let nearest = 0, nearestD = Infinity;
  for (let i = 0; i < m.positions.length; i += 3) {
    const d = Math.hypot(m.positions[i] - c[0], m.positions[i + 1] - c[1], m.positions[i + 2] - c[2]);
    if (d < nearestD) { nearestD = d; nearest = i; }
  }
  geometry[s.id] = {
    layer: s.layer, side: s.side,
    bounds: [lo.map(r6), hi.map(r6)],
    centroid: c.map(r6),
    surfaceAnchor: [m.positions[nearest], m.positions[nearest + 1], m.positions[nearest + 2]].map(r6),
    vertexCount: m.positions.length / 3,
    triangleCount: m.indices.length / 3,
  };
}
if (sideErrors.length) throw new Error(`Side checks failed:\n${sideErrors.join('\n')}`);
geometry.$routes = routes;
geometry.$vessels = vessels;
geometry.$measures = measures;
const g = (id) => geometry[id];
const checks = {
  leftKidneyOnLeft: g('kidney-capsule-left').centroid[0] > 0.03,
  rightKidneyOnRight: g('kidney-capsule-right').centroid[0] < -0.03,
  bladderBelowKidneys: g('bladder-dome').centroid[1] < g('kidney-capsule-left').centroid[1] - 0.15,
  adrenalsAboveKidneys: g('adrenal-gland-left').centroid[1] > g('kidney-capsule-left').centroid[1] && g('adrenal-gland-right').centroid[1] > g('kidney-capsule-right').centroid[1],
  uretersDescend: routes.ureter.left.points[0][1] > routes.ureter.left.points.at(-1)[1] && routes.ureter.right.points[0][1] > routes.ureter.right.points.at(-1)[1],
  aortaLeftOfVenaCava: g('aorta').centroid[0] > g('inferior-vena-cava').centroid[0],
  kidneysBehind: g('kidney-capsule-left').centroid[2] < g('descending-colon').centroid[2],
  pelvisMedial: Math.abs(g('renal-pelvis-left').centroid[0]) < Math.abs(g('kidney-capsule-left').centroid[0]),
  narrowPointsInOrder: ['left', 'right'].every((s) => { const a = routes.ureter[s].narrow.map((n) => n.arcMm); return a[0] < a[1] && a[1] < a[2]; }),
  nephronAnchored: !!nephron,
};
const failed = Object.entries(checks).filter(([, ok]) => !ok).map(([k]) => k);
if (failed.length) throw new Error(`Orientation checks failed: ${failed.join(', ')}`);

// ── Write ───────────────────────────────────────────────────────────────────
const doc = new Document();
const buffer = doc.createBuffer();
const scene = doc.createScene('kidney');
for (const m of meshes) {
  const prim = doc.createPrimitive()
    .setAttribute('POSITION', doc.createAccessor().setType('VEC3').setArray(m.positions).setBuffer(buffer))
    .setAttribute('NORMAL', doc.createAccessor().setType('VEC3').setArray(m.normals).setBuffer(buffer))
    .setIndices(doc.createAccessor().setType('SCALAR').setArray(m.positions.length / 3 < 65536 ? Uint16Array.from(m.indices) : m.indices).setBuffer(buffer));
  const s = m.structure;
  scene.addChild(doc.createNode(s.id).setMesh(doc.createMesh(s.id).addPrimitive(prim)).setExtras({
    layer: s.layer,
    source: s.schematic ? 'schematic' : s.bp3d ? 'bodyparts3d' : 'hra-united-female',
    nodes: [...(s.united ?? []), ...(s.bp3d ?? [])],
  }));
}
doc.getRoot().getAsset().generator = 'kidney-anatomy-lab tools/extract-kidney.mjs';
doc.getRoot().getAsset().copyright = 'HuBMAP HRA 3D reference organs (Browne, Schlehlein et al.), CC BY 4.0; BodyParts3D (DBCLS), CC BY 4.0';
const outGlb = path.join(root, 'public/models/kidney.glb');
fs.mkdirSync(path.dirname(outGlb), { recursive: true });
const glb = await new NodeIO().writeBinary(doc);
fs.writeFileSync(outGlb, glb);

const commit = (dir) => { try { return execFileSync('git', ['-C', path.resolve(dir, '../..'), 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(); } catch { return null; } };
const genDir = path.join(root, 'src/kidney/generated');
fs.mkdirSync(genDir, { recursive: true });
fs.writeFileSync(path.join(genDir, 'geometry.json'), JSON.stringify({ units: 'metres', axes: { x: "patient's left", y: 'superior', z: 'anterior' }, structures: geometry }, null, 1) + '\n');
const triangles = meshes.reduce((n, m) => n + m.indices.length / 3, 0);
fs.writeFileSync(path.join(genDir, 'provenance.json'), JSON.stringify({
  output: { file: 'public/models/kidney.glb', bytes: glb.byteLength, sha256: sha256(glb), triangles, sourceTriangles },
  sources: {
    united: {
      name: '3D Reference Organ Set for Female v1.5 (HuBMAP HRA united female), as converted by Female Atlas',
      creators: 'Kristen Browne, Heidi Schlehlein', doi: 'https://doi.org/10.48539/HBM352.BTSQ.586', license: 'CC-BY-4.0',
      intermediate: 'github.com/Niyaz-05/female-atlas, commit ' + commit(femaleDir),
      atlasJsonSha256: sha256(female.bytes), chunkSha256: female.hashes,
      transformReversed: `y - ${SHIFT} m`,
    },
    bodyparts3d: {
      name: 'BodyParts3D 4.0 (Database Center for Life Science), via the Human Atlas build', license: 'CC-BY-4.0',
      intermediate: 'github.com/Niyaz-05/human-atlas, commit ' + commit(humanDir),
      atlasJsonSha256: sha256(human.bytes), chunkSha256: human.hashes,
      parts: bp3dParts,
      registration: { method: 'similarity (rotation, uniform scale, shift): Horn quaternion method on landmark centroids; kidney fits refined by ICP onto the HRA kidney capsule', fits: Object.fromEntries(Object.entries(fits).map(([k, f]) => [k, { usedFor: spec.structures.filter((x) => x.bp3d && x.fit === k).map((x) => x.id), scale: f.scale, rotationDeg: f.rotationDeg, rmsResidualMm: f.rmsResidualMm, surfaceRmsMm: f.surfaceRmsMm, residuals: f.residuals }])) },
      verticesInsideKidneysPct: overlap,
      trimmedOutsideKidney: trimmed,
    },
    schematic: { urethra: 'Generated tube, 40 mm long and 6 mm wide (female urethra, Gray\'s Anatomy), from the lowest point of the HRA bladder neck along the front of the HRA vagina.' },
  },
  changesHere: `Selected and merged the source meshes in src/kidney/source/structures.source.json; welded coincident vertices; simplified the large HRA meshes with meshoptimizer within a ${MAX_ERROR * 100} % relative error bound (largest error used: ${(maxError * 100).toFixed(3)} %); subdivided and smoothed the small BodyParts3D parts; recomputed smooth normals; placed the BodyParts3D parts onto the HRA body; pushed the adrenal glands, psoas and diaphragm out of the kidneys; cut off the segmental-artery branches that leave the kidney away from its hilum; generated the urethra; translated so the middle of the urinary tract is the origin.`,
  centreOffsetMetres: centre.map(r6),
  measures,
  orientationChecks: checks,
  routeGapsMm: gaps,
  structures: spec.structures.map((s) => ({ id: s.id, united: s.united, bp3d: s.bp3d, schematic: s.schematic })),
}, null, 1) + '\n');

console.log(JSON.stringify({ structures: meshes.length, sourceTriangles, triangles, bytes: glb.byteLength, maxErrorPct: r6(maxError * 100), registration: Object.fromEntries(Object.entries(fits).map(([k, f]) => [k, { scale: f.scale, rotationDeg: f.rotationDeg, rmsMm: f.rmsResidualMm, surfaceRmsMm: f.surfaceRmsMm }])), overlap, measures, narrow: { left: ureter.left.narrow, right: ureter.right.narrow }, ureterWidths: { left: ureter.left.widthsMm, right: ureter.right.widthsMm }, vessels: vessels.length, checks }, null, 1));
