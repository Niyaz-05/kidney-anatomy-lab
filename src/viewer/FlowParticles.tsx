import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { bloodReturnRoutes, bloodRoutes, geometry as G, renalVessels, ureters, ureterWave, urethraLine, urineRoutes, vec } from '../kidney/anchors';
import { stoneOutcome } from '../kidney/stones';
import { BLOOD_IN, BLOOD_OUT, NARROW, STONE, URINE } from './palette';
import { clip } from './KidneyModel';

function curveOf(points: readonly (readonly number[])[]) {
  return new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(...vec(p))), false, 'centripetal');
}

interface Track { curve: THREE.CatmullRomCurve3; length: number; count: number; offset: number; colour: string }

/** The kidneys' boxes: the opened views cut only the kidneys, so only flow inside them is hidden by the cut. */
const KIDNEY_BOXES = ['kidney-capsule-left', 'kidney-capsule-right'].map((id) => new THREE.Box3(new THREE.Vector3(...vec(G[id]!.bounds[0]!)), new THREE.Vector3(...vec(G[id]!.bounds[1]!))));
const inKidney = (p: THREE.Vector3) => KIDNEY_BOXES.some((b) => b.containsPoint(p));

/**
 * Particles streaming along tracks at a steady speed. Particles inside a kidney, on the side the
 * cut has removed, are hidden, so the flow shows on the cut face rather than floating in front of it.
 */
function Stream({ tracks, speed, radius, playing, reducedMotion, depthTest = false, opacity = 0.95 }: { tracks: Track[]; speed: number; radius: number; playing: boolean; reducedMotion: boolean; depthTest?: boolean; opacity?: number }) {
  const total = tracks.reduce((n, t) => n + t.count, 0);
  const mesh = useRef<THREE.InstancedMesh>(null);
  const travelled = useRef(0);
  const invalidate = useThree((s) => s.invalidate);
  const geometry = useMemo(() => new THREE.SphereGeometry(radius, 8, 6), [radius]);
  const material = useMemo(() => new THREE.MeshBasicMaterial({ toneMapped: false, depthTest, transparent: true, opacity }), [depthTest, opacity]);
  useEffect(() => () => { geometry.dispose(); material.dispose(); }, [geometry, material]);
  const tmp = useMemo(() => new THREE.Object3D(), []);
  const p = useMemo(() => new THREE.Vector3(), []);

  function place(distance: number) {
    const m = mesh.current;
    if (!m) return;
    for (const t of tracks) {
      const shift = distance / t.length;
      for (let i = 0; i < t.count; i++) {
        const u = (((i / t.count + shift) % 1) + 1) % 1;
        t.curve.getPointAt(u, p);
        const hidden = clip.active && clip.plane.distanceToPoint(p) < 0 && inKidney(p);
        tmp.position.copy(p);
        tmp.scale.setScalar(hidden ? 0 : 1);
        tmp.updateMatrix();
        m.setMatrixAt(t.offset + i, tmp.matrix);
      }
    }
    m.instanceMatrix.needsUpdate = true;
  }

  useEffect(() => {
    const m = mesh.current;
    if (m) {
      const c = new THREE.Color();
      for (const t of tracks) for (let i = 0; i < t.count; i++) m.setColorAt(t.offset + i, c.set(t.colour));
      if (m.instanceColor) m.instanceColor.needsUpdate = true;
    }
    place(travelled.current);
    invalidate();
  }, [tracks]);

  useFrame((_, dt) => {
    if (!playing || reducedMotion) return;
    travelled.current += speed * Math.min(dt, 0.25);
    place(travelled.current);
  });

  return <instancedMesh key={total} ref={mesh} args={[geometry, material, total]} frustumCulled={false} renderOrder={6} />;
}

const build = (defs: { points: readonly (readonly number[])[]; colour: string; density: number }[]): Track[] => {
  let offset = 0;
  return defs.map((d) => {
    const curve = curveOf(d.points);
    const length = curve.getLength();
    const count = Math.max(4, Math.round(length * d.density));
    const t = { curve, length, count, offset, colour: d.colour };
    offset += count;
    return t;
  });
};

/** Blood into each kidney (bright red) and back out (dark blue-red), along the generated routes. */
export function BloodFlow({ playing, reducedMotion }: { playing: boolean; reducedMotion: boolean }) {
  const inTracks = useMemo(() => build((['left', 'right'] as const).flatMap((s) => bloodRoutes[s].map((r) => ({ points: r.points, colour: BLOOD_IN, density: 45 })))), []);
  const outTracks = useMemo(() => build((['left', 'right'] as const).flatMap((s) => bloodReturnRoutes[s].map((r) => ({ points: r.points, colour: BLOOD_OUT, density: 45 })))), []);
  return (
    <>
      <Stream tracks={inTracks} speed={0.03} radius={0.0007} playing={playing} reducedMotion={reducedMotion} />
      <Stream tracks={outTracks} speed={0.022} radius={0.0007} playing={playing} reducedMotion={reducedMotion} />
    </>
  );
}

/**
 * Urine: drops from each papilla through the calyces and pelvis, carried down the ureters in
 * boluses that ride the peristaltic wave, then out through the urethra while voiding.
 */
export function UrineFlow({ playing, reducedMotion, wavesPerMin, voiding }: { playing: boolean; reducedMotion: boolean; wavesPerMin: number; voiding: boolean }) {
  // In the kidney: from each papilla tip to the top of the ureter.
  const kidneyTracks = useMemo(() => build((['left', 'right'] as const).flatMap((s) => urineRoutes[s].map((r) => {
    const top = new THREE.Vector3(...vec(ureters[s].points[0]!));
    let cut = r.points.length;
    r.points.forEach((p, i) => { if (cut === r.points.length && new THREE.Vector3(...vec(p)).distanceTo(top) < 0.004) cut = i + 1; });
    return { points: r.points.slice(0, Math.max(2, cut)), colour: URINE, density: 160 };
  }))), []);
  const urethra = useMemo(() => build([{ points: urethraLine, colour: URINE, density: 700 }]), []);
  const curves = useMemo(() => ({ left: curveOf(ureters.left.points), right: curveOf(ureters.right.points) }), []);
  const bolus = useRef<THREE.InstancedMesh>(null);
  const geometry = useMemo(() => new THREE.SphereGeometry(0.0011, 10, 8), []);
  const material = useMemo(() => new THREE.MeshBasicMaterial({ color: URINE, toneMapped: false, transparent: true, opacity: 0.95, depthTest: false }), []);
  useEffect(() => () => { geometry.dispose(); material.dispose(); }, [geometry, material]);
  const tmp = useMemo(() => new THREE.Object3D(), []);
  const p = useMemo(() => new THREE.Vector3(), []);
  const PER = 5;
  useFrame(({ clock }) => {
    const m = bolus.current;
    if (!m) return;
    let i = 0;
    for (const side of ['left', 'right'] as const) {
      const w = playing && !reducedMotion ? ureterWave(side, clock.elapsedTime, wavesPerMin) : null;
      const L = ureters[side].lengthMm;
      for (let k = 0; k < PER; k++, i++) {
        const at = w === null ? null : w + 6 - k * 2.5;
        if (at === null || at < 0 || at > L) { tmp.scale.setScalar(0); }
        else { curves[side].getPointAt(Math.min(1, at / L), p); tmp.position.copy(p); tmp.scale.setScalar(1 - k * 0.12); }
        tmp.updateMatrix();
        m.setMatrixAt(i, tmp.matrix);
      }
    }
    m.instanceMatrix.needsUpdate = true;
  });
  return (
    <>
      <Stream tracks={kidneyTracks} speed={0.006} radius={0.0005} playing={playing} reducedMotion={reducedMotion} />
      <instancedMesh ref={bolus} args={[geometry, material, PER * 2]} frustumCulled={false} renderOrder={6} />
      {voiding && <Stream tracks={urethra} speed={0.05} radius={0.0007} playing={playing} reducedMotion={reducedMotion} />}
    </>
  );
}

/**
 * The small renal vessels (interlobar, arcuate, cortical radiate): drawn tubes, merged by kind. They
 * lie inside the kidney, so they are drawn over the cut face, like the vessels in a textbook section.
 */
export function RenalVessels() {
  const meshes = useMemo(() => (['artery', 'vein'] as const).map((kind) => {
    const parts = renalVessels.filter((v) => v.kind === kind).map((v) => {
      const curve = curveOf(v.points);
      return new THREE.TubeGeometry(curve, Math.max(6, v.points.length * 2), (v.widthMm / 2000) * 1.0, 6, false);
    });
    const g = mergeGeometries(parts, false)!;
    parts.forEach((x) => x.dispose());
    const material = new THREE.MeshStandardMaterial({ color: kind === 'artery' ? '#d0303a' : '#5a4aa0', roughness: 0.35, metalness: 0, emissive: kind === 'artery' ? '#4a0808' : '#14103a', depthTest: false, transparent: true, opacity: 0.9 });
    const m = new THREE.Mesh(g, material);
    m.raycast = () => {};
    m.renderOrder = kind === 'artery' ? 5.5 : 5;
    return m;
  }), []);
  useEffect(() => () => meshes.forEach((m) => { m.geometry.dispose(); (m.material as THREE.Material).dispose(); }), [meshes]);
  return <>{meshes.map((m) => <primitive key={m.uuid} object={m} />)}</>;
}

/** The ureter's three narrow points on both sides, as rings. */
export function NarrowMarks() {
  const rings = useMemo(() => (['left', 'right'] as const).flatMap((side) => ureters[side].narrow.map((n) => {
    const pts = ureters[side].points, at = new THREE.Vector3(...vec(n.point));
    let k = 0, bd = Infinity;
    pts.forEach((q, i) => { const d = at.distanceTo(new THREE.Vector3(...vec(q))); if (d < bd) { bd = d; k = i; } });
    const a = new THREE.Vector3(...vec(pts[Math.max(0, k - 1)]!)), b = new THREE.Vector3(...vec(pts[Math.min(pts.length - 1, k + 1)]!));
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), b.sub(a).normalize());
    return { key: `${side}-${n.id}`, position: at, quaternion: q };
  })), []);
  return (
    <>
      {rings.map((r) => (
        <mesh key={r.key} position={r.position} quaternion={r.quaternion} renderOrder={7}>
          <torusGeometry args={[0.0042, 0.0007, 8, 32]} />
          <meshBasicMaterial color={NARROW} depthTest={false} transparent opacity={0.9} toneMapped={false} />
        </mesh>
      ))}
    </>
  );
}

/**
 * A kidney stone: it leaves a lower calyx of the left kidney, runs down the urine route and stops
 * at the narrow point the stone rule picks, or reaches the bladder.
 */
export function Stone({ sizeMm, nonce, reducedMotion }: { sizeMm: number; nonce: number; reducedMotion: boolean }) {
  const outcome = stoneOutcome(sizeMm);
  const route = useMemo(() => {
    // The lowest papilla's route: stones most often form in a lower calyx.
    const r = [...urineRoutes.left].sort((a, b) => a.points[0]![1]! - b.points[0]![1]!)[0]!;
    return curveOf(r.points);
  }, []);
  const stopU = useMemo(() => {
    if (!outcome.stopsAt) return 1;
    const target = new THREE.Vector3(...vec(ureters.left.narrow.find((n) => n.id === outcome.stopsAt)!.point));
    let best = 1, bd = Infinity;
    for (let i = 0; i <= 400; i++) { const u = i / 400; const d = route.getPointAt(u).distanceTo(target); if (d < bd) { bd = d; best = u; } }
    return best;
  }, [route, outcome.stopsAt]);
  const mesh = useRef<THREE.Mesh>(null);
  const u = useRef(0);
  const invalidate = useThree((s) => s.invalidate);
  useEffect(() => { u.current = reducedMotion ? stopU : 0; invalidate(); }, [nonce, stopU, reducedMotion, invalidate]);
  const p = useMemo(() => new THREE.Vector3(), []);
  useFrame((_, dt) => {
    const m = mesh.current;
    if (!m) return;
    if (u.current < stopU) { u.current = Math.min(stopU, u.current + (dt * 0.06)); invalidate(); }
    route.getPointAt(u.current, p);
    m.position.copy(p);
  });
  // Irregular, like a calcium oxalate stone: a sphere with seeded bumps.
  const geometry = useMemo(() => {
    const g = new THREE.IcosahedronGeometry(sizeMm / 2000, 2);
    const pos = g.getAttribute('position') as THREE.BufferAttribute;
    let seed = 3;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const bump = new Map<string, number>();
    for (let i = 0; i < pos.count; i++) {
      const key = `${pos.getX(i).toFixed(6)},${pos.getY(i).toFixed(6)},${pos.getZ(i).toFixed(6)}`;
      const k = bump.get(key) ?? 0.8 + 0.4 * rnd();
      bump.set(key, k);
      pos.setXYZ(i, pos.getX(i) * k, pos.getY(i) * k, pos.getZ(i) * k);
    }
    g.computeVertexNormals();
    return g;
  }, [sizeMm]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  return (
    <mesh ref={mesh} geometry={geometry} renderOrder={8}>
      <meshStandardMaterial color={STONE} roughness={0.85} metalness={0} emissive="#3a2e14" depthTest={false} transparent />
    </mesh>
  );
}

