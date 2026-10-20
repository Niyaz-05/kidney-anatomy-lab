import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree, type ThreeEvent } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import * as THREE from 'three';
import { measures, nephronFrame, nephronToWorld } from '../kidney/anchors';
import { nephronLayout, type Local } from '../kidney/nephron';
import { osmolalityAt, type SegmentId } from '../kidney/tubule';
import { osmColour } from './palette';

/** Segment colours (as in the panel's chart). */
export const SEGMENT_COLOUR: Record<SegmentId | 'connecting', string> = {
  glomerulus: '#e04848', pct: '#e8a23a', descending: '#5aa8e8', 'thin-ascending': '#7ac0f0', 'thick-ascending': '#3a6ad8', dct: '#a070e0', connecting: '#b890e8', collecting: '#40b890',
};

const world = (p: Local) => new THREE.Vector3(...nephronToWorld(p));

interface Props {
  /** Selected segment (others dim). */
  segment: SegmentId | null;
  onSegment: (id: SegmentId | null) => void;
  urineOsm: number;
  /** Filtration relative to 125 mL/min: sets the filtrate's speed. */
  flowScale: number;
  afferent: number;
  efferent: number;
  playing: boolean;
  reducedMotion: boolean;
  labels: boolean;
  /** Hormone view: the part to point out. */
  pointOut?: 'jg-cells' | 'macula-densa' | 'collecting' | 'pct' | 'dct' | 'interstitium' | null;
}

/**
 * The nephron close-up, placed in one real pyramid of the left kidney (see kidney/nephron.ts).
 * Tubes are clickable; the filtrate's particles change colour with its concentration.
 */
export function NephronView({ segment, onSegment, urineOsm, flowScale, afferent, efferent, playing, reducedMotion, labels, pointOut = null }: Props) {
  const anchor = measures.nephronAnchor;
  const layout = useMemo(() => nephronLayout(anchor.cortexThicknessMm ?? 10, anchor.heightMm), [anchor]);
  const invalidate = useThree((s) => s.invalidate);

  const tubes = useMemo(() => layout.pieces.filter((p) => p.points.length > 1).map((p, i) => {
    const curve = new THREE.CatmullRomCurve3(p.points.map(world), false, 'centripetal');
    const g = new THREE.TubeGeometry(curve, Math.max(12, p.points.length * 3), layout.tubeRadiusM * (p.id === 'collecting' ? 1.5 : p.id === 'pct' ? 1.25 : p.id === 'descending' || p.id === 'thin-ascending' ? 0.75 : 1), 8, false);
    return { key: `${p.nephron}-${p.id}-${i}`, id: p.id, geometry: g };
  }), [layout]);
  const vessels = useMemo(() => layout.vessels.map((v, i) => {
    const curve = new THREE.CatmullRomCurve3(v.points.map(world), false, 'centripetal');
    const base = v.id === 'radiate' ? 0.16e-3 : v.kind === 'capillary' ? 0.06e-3 : 0.09e-3;
    return { key: `${v.id}-${i}`, id: v.id, curve, base };
  }), [layout]);
  const glomeruli = useMemo(() => layout.glomeruli.map((g) => ({ nephron: g.nephron, at: world(g.centre) })), [layout]);
  // The wedge of kidney the nephrons sit in: cortex (with the capsule's line on top) and the
  // pyramid narrowing to its papilla, shaded by the medulla's rising saltiness (300 → 1,200 mOsm/kg).
  const wedge = useMemo(() => {
    const C = layout.cortexM, H = layout.medullaM, back = -0.9e-3, half = 4.6e-3, tip = 1.3e-3;
    const pos: number[] = [], col: number[] = [], idx: number[] = [];
    const c = new THREE.Color();
    const add = (r: number, v: number, colour: string) => { pos.push(...nephronToWorld([r, v, back])); c.set(colour); col.push(c.r, c.g, c.b); return pos.length / 3 - 1; };
    const quad = (a: number, b: number, d: number, e: number) => idx.push(a, b, d, b, e, d);
    // Cortex.
    quad(add(C, -half, '#c98a7c'), add(C, half, '#c98a7c'), add(0, -half, '#b8786a'), add(0, half, '#b8786a'));
    // Medulla, in bands down to the papilla.
    const N = 12;
    for (let k = 0; k < N; k++) {
      const r0 = -(H * k) / N, r1 = -(H * (k + 1)) / N;
      const w0 = half - ((half - tip) * k) / N, w1 = half - ((half - tip) * (k + 1)) / N;
      const t0 = osmColour(300 + (900 * k) / N), t1 = osmColour(300 + (900 * (k + 1)) / N);
      const mix = (o: string) => { const a = new THREE.Color(o), b = new THREE.Color('#8a3a34'); return '#' + b.lerp(a, 0.45).getHexString(); };
      quad(add(r0, -w0, mix(t0)), add(r0, w0, mix(t0)), add(r1, -w1, mix(t1)), add(r1, w1, mix(t1)));
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.setIndex(idx);
    const line = new THREE.BufferGeometry().setFromPoints([world([C, -half, back]), world([C, half, back])]);
    return { g, line };
  }, [layout]);
  useEffect(() => () => { wedge.g.dispose(); wedge.line.dispose(); }, [wedge]);
  useEffect(() => () => tubes.forEach((t) => t.geometry.dispose()), [tubes]);

  // Arterioles: narrowing makes them thinner (radius ∝ 1 / (1 + 3x)^(1/4), from Poiseuille's law
  // for the resistance factor used in the filtration model).
  const vesselGeoms = useMemo(() => vessels.map((v) => {
    const k = v.id === 'afferent' ? (1 + 3 * afferent) ** -0.25 : v.id === 'efferent' || v.id === 'vasa-recta' ? (1 + 3 * efferent) ** -0.25 : 1;
    return { ...v, geometry: new THREE.TubeGeometry(v.curve, Math.max(8, 40), v.base * k, 6, false) };
  }), [vessels, afferent, efferent]);
  useEffect(() => () => vesselGeoms.forEach((v) => v.geometry.dispose()), [vesselGeoms]);

  // Filtrate particles along each nephron's path, coloured by concentration.
  const paths = useMemo(() => layout.paths.map((p) => {
    const pts = p.points.map(world);
    const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal');
    // Arc-length fraction of each point, to look up its segment.
    const cum = [0];
    for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1]! + pts[i]!.distanceTo(pts[i - 1]!));
    const total = cum[cum.length - 1]!;
    return { nephron: p.nephron, curve, length: total, frac: cum.map((c) => c / total), segment: p.segment, t: p.t };
  }), [layout]);
  const COUNT = 70;
  const mesh = useRef<THREE.InstancedMesh>(null);
  const sphere = useMemo(() => new THREE.SphereGeometry(0.00009, 8, 6), []);
  const pmat = useMemo(() => new THREE.MeshBasicMaterial({ toneMapped: false, depthTest: false, transparent: true }), []);
  useEffect(() => () => { sphere.dispose(); pmat.dispose(); }, [sphere, pmat]);
  const travelled = useRef(0);
  const tmp = useMemo(() => new THREE.Object3D(), []);
  const c = useMemo(() => new THREE.Color(), []);
  const pos = useMemo(() => new THREE.Vector3(), []);
  const place = () => {
    const m = mesh.current;
    if (!m) return;
    let i = 0;
    for (const p of paths) {
      for (let k = 0; k < COUNT; k++, i++) {
        const u = (((k / COUNT + travelled.current / p.length) % 1) + 1) % 1;
        p.curve.getPointAt(u, pos);
        tmp.position.copy(pos); tmp.updateMatrix();
        m.setMatrixAt(i, tmp.matrix);
        let j = 0;
        while (j < p.frac.length - 1 && p.frac[j + 1]! < u) j++;
        const seg = p.segment[j]!;
        const osm = seg === 'connecting' ? 100 : osmolalityAt(seg, p.t[j]!, urineOsm, p.nephron === 'juxtamedullary');
        m.setColorAt(i, c.set(osmColour(osm)));
      }
    }
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
  };
  useEffect(() => { place(); invalidate(); }, [paths, urineOsm]);
  useFrame((_, dt) => {
    if (!playing || reducedMotion || flowScale <= 0) return;
    travelled.current += 0.0025 * flowScale * Math.min(dt, 0.25);
    place();
  });

  const click = (id: SegmentId | 'connecting') => (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    if (e.delta > 5) return;
    onSegment(id === 'connecting' ? 'dct' : id);
  };
  const jm = layout.glomeruli.find((g) => g.nephron === 'juxtamedullary')!;
  const jmMd = layout.maculaDensa.find((m) => m.nephron === 'juxtamedullary')!;
  const jgAt = world([jm.centre[0] - 0.25e-3, jm.centre[1] - 0.45e-3, jm.centre[2]]);
  const mdAt = world(jmMd.at);
  const label = (text: string, at: THREE.Vector3, key: string, kind = '') => (
    <Html key={key} position={at} center zIndexRange={[3, 0]} className={`nephron-label ${kind}`} pointerEvents="none">{text}</Html>
  );
  const C = layout.cortexM, H = layout.medullaM;
  const LABELS: [string, Local, string?][] = [
    ['Capsule', [C + 0.6e-3, -5.6e-3, 0], 'is-zone'], ['Cortex', [C / 2, -6.2e-3, 0], 'is-zone'], ['Medulla (pyramid)', [-H / 2, -5.4e-3, 0], 'is-zone'], ['Papilla', [-H - 0.8e-3, 0, 0], 'is-zone'],
    ['Glomerulus', [jm.centre[0] - 0.2e-3, -3.4e-3, 0]], ['Proximal tubule', [0.42 * C, -3.6e-3, 0]], ['Distal tubule', [0.32 * C, 3.6e-3, 0]],
    ['Loop of Henle', [-0.72 * H, -3.0e-3, 0]], ['Collecting duct', [-0.45 * H, 3.4e-3, 0]], ['Cortical nephron', [layout.glomeruli[1]!.centre[0], 3.6e-3, 0]],
  ];
  const showLabels = labels || segment === null;

  return (
    <group>
      <mesh geometry={wedge.g} renderOrder={1} raycast={() => null}>
        <meshBasicMaterial vertexColors transparent opacity={0.42} side={THREE.DoubleSide} depthWrite={false} toneMapped={false} />
      </mesh>
      <lineSegments geometry={wedge.line} renderOrder={1}>
        <lineBasicMaterial color="#f4ece6" />
      </lineSegments>
      {tubes.map((t) => {
        const on = segment === null || segment === t.id || (segment === 'dct' && t.id === 'connecting');
        return (
          <mesh key={t.key} geometry={t.geometry} onClick={click(t.id)} renderOrder={4}>
            <meshStandardMaterial color={SEGMENT_COLOUR[t.id]} roughness={0.4} emissive={SEGMENT_COLOUR[t.id]} emissiveIntensity={on ? 0.25 : 0.02} transparent opacity={on ? 0.7 : 0.2} depthWrite={false} />
          </mesh>
        );
      })}
      {vesselGeoms.map((v) => (
        <mesh key={v.key} geometry={v.geometry} renderOrder={3}>
          <meshStandardMaterial color={v.id === 'radiate' || v.id === 'afferent' ? '#d0303a' : '#9a3a7a'} roughness={0.4} transparent opacity={segment ? 0.35 : 0.85} />
        </mesh>
      ))}
      {glomeruli.map((g) => (
        <group key={g.nephron} position={g.at}>
          <mesh onClick={click('glomerulus')} renderOrder={5}>
            <icosahedronGeometry args={[layout.glomerulusRadiusM * 0.72, 2]} />
            <meshStandardMaterial color="#c8303a" roughness={0.6} emissive="#6a1018" emissiveIntensity={segment === 'glomerulus' ? 0.8 : 0.3} />
          </mesh>
          <mesh renderOrder={5}>
            <sphereGeometry args={[layout.glomerulusRadiusM, 24, 16]} />
            <meshStandardMaterial color="#f0e8e0" transparent opacity={0.22} roughness={0.2} depthWrite={false} />
          </mesh>
        </group>
      ))}
      {/* Juxtaglomerular cells (on the afferent arteriole) and the macula densa (in the thick ascending limb). */}
      <mesh position={jgAt} renderOrder={6}>
        <sphereGeometry args={[0.00016, 12, 8]} />
        <meshBasicMaterial color={pointOut === 'jg-cells' ? '#ffe040' : '#c8b040'} toneMapped={false} />
      </mesh>
      <mesh position={mdAt} renderOrder={6}>
        <sphereGeometry args={[0.00014, 12, 8]} />
        <meshBasicMaterial color={pointOut === 'macula-densa' ? '#ffffff' : '#a0c8ff'} toneMapped={false} />
      </mesh>
      <instancedMesh ref={mesh} args={[sphere, pmat, COUNT * paths.length]} frustumCulled={false} renderOrder={7} />
      {showLabels && LABELS.map(([text, at, kind]) => label(text, world(at), text, kind))}
      {pointOut === 'jg-cells' && label('Juxtaglomerular cells', jgAt.clone().add(new THREE.Vector3(...nephronFrame().v).multiplyScalar(-1.6e-3)), 'jg', 'is-pointer')}
    </group>
  );
}
