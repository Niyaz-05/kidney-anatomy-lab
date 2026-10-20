import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { useGLTF } from '@react-three/drei';
import { useFrame, useThree, type ThreeEvent } from '@react-three/fiber';
import * as THREE from 'three';
import { useLab } from '../app/LabContext';
import { effectiveColourBy, effectiveMode, effectivePhysiology, effectiveSlice, focusIds, highlightedIds, isVisible } from '../app/state';
import type { AnatomicalStructure } from '../contract/schema';
import { geometry as G, measures, modeBounds, sliceWorld, ureters, ureterWave, vec } from '../kidney/anchors';
import { peristalsisPerMin } from '../kidney/bladder';
import { urineState } from '../kidney/tubule';
import { baseColour, cutColour, HIGHLIGHT, HOVER, realLook, realOpacity } from './palette';
import { closeHoles } from './closeHoles';
import { applyQuality, hasTissueData, makeTissueMaterial, quality, type TissueMaterial } from './tissue';

export const MODEL_URL = `${import.meta.env.BASE_URL}models/kidney.glb`;

const GREY = new THREE.Color('#a59a96');
const HIGHLIGHT_COLOUR = new THREE.Color(HIGHLIGHT);

/** Pointer travel (px) above which a press is treated as a drag (rotate), not a pick. */
const CLICK_SLOP = 5;

/** The cut shared with the label layer and the overlays, so hits on the removed side can be ignored. */
export const clip = { plane: new THREE.Plane(new THREE.Vector3(-1, 0, 0), 0), active: false };

/** The kidney's own layers: in the opened views only these are cut, so the vessels and ureters stay whole. */
const KIDNEY_LAYERS = new Set(['capsule', 'cortex', 'medulla', 'collecting', 'sinus']);
const OPENED = new Set(['blood', 'urine', 'stones']);

/** Parts reshaped by the bladder's filling. */
const BLADDER_WALL = new Set(['bladder-dome', 'bladder-base']);
const URETERS = { 'ureter-left': 'left', 'ureter-right': 'right' } as const;

interface Cap { back: THREE.Mesh; front: THREE.Mesh; face: THREE.Mesh; material: THREE.MeshStandardMaterial; closed: THREE.BufferGeometry }
interface Part {
  id: string;
  mesh: THREE.Mesh;
  material: TissueMaterial;
  structure: AnatomicalStructure;
  box: THREE.Box3;
  cap: Cap;
  /** Original positions, for parts that are reshaped (bladder, ureters), and a scratch array. */
  base?: Float32Array;
  scratch?: Float32Array;
  /** Ureters: each vertex's distance along the ureter (mm) and its offset from the centre line. */
  along?: Float32Array;
  centre?: Float32Array;
  /** Whether the cut applies to this part now. */
  clipped: boolean;
}

/** Cut-face grain: one tile of the noise texture spans this many metres. */
const GRAIN_TILE = 0.01;

let grain: THREE.DataTexture | null = null;
/** A soft, tileable value-noise texture (deterministic) that gives cut faces a tissue grain. */
function grainTexture(): THREE.DataTexture {
  if (grain) return grain;
  const n = 128;
  let seed = 7;
  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const smooth = (t: number) => t * t * (3 - 2 * t);
  const octave = (cells: number) => {
    const lattice = Array.from({ length: cells * cells }, rand);
    const at = (x: number, y: number) => lattice[(y % cells) * cells + (x % cells)]!;
    const step = n / cells;
    return (x: number, y: number) => {
      const gx = Math.floor(x / step), gy = Math.floor(y / step);
      const fx = smooth((x % step) / step), fy = smooth((y % step) / step);
      const top = at(gx, gy) * (1 - fx) + at(gx + 1, gy) * fx;
      const bottom = at(gx, gy + 1) * (1 - fx) + at(gx + 1, gy + 1) * fx;
      return top * (1 - fy) + bottom * fy;
    };
  };
  const coarse = octave(8), medium = octave(16), fine = octave(32);
  const data = new Uint8Array(n * n * 4);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const v = 0.84 + 0.08 * coarse(x, y) + 0.05 * medium(x, y) + 0.03 * fine(x, y);
    data.set([v * 255, v * 255, v * 255, 255], (y * n + x) * 4);
  }
  grain = new THREE.DataTexture(data, n, n);
  grain.wrapS = grain.wrapT = THREE.RepeatWrapping;
  grain.magFilter = THREE.LinearFilter;
  grain.minFilter = THREE.LinearMipmapLinearFilter;
  grain.generateMipmaps = true;
  grain.colorSpace = THREE.SRGBColorSpace;
  grain.needsUpdate = true;
  return grain;
}

/**
 * Stencil capping (as in three.js' clipping-stencil example): back faces behind the cut add 1 and
 * front faces subtract 1, so the stencil is non-zero exactly where the cut passes through the
 * inside of a closed mesh. The face drawn there is the filled cut surface, in the tissue's colour.
 * The stencil passes use a closed copy of the part (`closeHoles`), since some source parts are open.
 */
function makeCap(geometry: THREE.BufferGeometry, plane: THREE.Plane, order: number, colour: string, size: number): Cap {
  const stencilMat = (side: THREE.Side, op: THREE.StencilOp) => new THREE.MeshBasicMaterial({
    side, colorWrite: false, depthWrite: false, depthTest: false,
    stencilWrite: true, stencilFunc: THREE.AlwaysStencilFunc,
    stencilFail: op, stencilZFail: op, stencilZPass: op,
    clippingPlanes: [plane],
  });
  const closed = closeHoles(geometry);
  const back = new THREE.Mesh(closed, stencilMat(THREE.BackSide, THREE.IncrementWrapStencilOp));
  const front = new THREE.Mesh(closed, stencilMat(THREE.FrontSide, THREE.DecrementWrapStencilOp));
  back.renderOrder = front.renderOrder = order;
  const map = grainTexture().clone();
  map.repeat.setScalar(Math.max(1, size / GRAIN_TILE));
  const material = new THREE.MeshStandardMaterial({
    color: colour, map, roughness: 0.5, metalness: 0, side: THREE.DoubleSide,
    stencilWrite: true, stencilRef: 0, stencilFunc: THREE.NotEqualStencilFunc,
    stencilFail: THREE.ReplaceStencilOp, stencilZFail: THREE.ReplaceStencilOp, stencilZPass: THREE.ReplaceStencilOp,
  });
  const face = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), material);
  face.renderOrder = order + 0.1;
  for (const m of [back, front, face]) {
    m.visible = false;
    m.raycast = () => {}; // never pickable
    m.matrixAutoUpdate = false;
  }
  return { back, front, face, material, closed };
}

/**
 * Positions of a mesh as a plain xyz array. The model's attributes are interleaved (position,
 * normal and baked shading share one buffer), so they are read and written through the attribute.
 */
type PosAttr = THREE.BufferAttribute | THREE.InterleavedBufferAttribute;
function readPositions(attr: PosAttr): Float32Array {
  const out = new Float32Array(attr.count * 3);
  for (let i = 0; i < attr.count; i++) { out[i * 3] = attr.getX(i); out[i * 3 + 1] = attr.getY(i); out[i * 3 + 2] = attr.getZ(i); }
  return out;
}
function writePositions(geometry: THREE.BufferGeometry, xyz: Float32Array, normals = true) {
  const attr = geometry.getAttribute('position') as PosAttr;
  for (let i = 0; i < attr.count; i++) attr.setXYZ(i, xyz[i * 3]!, xyz[i * 3 + 1]!, xyz[i * 3 + 2]!);
  if ('data' in attr && attr.isInterleavedBufferAttribute) attr.data.needsUpdate = true;
  else (attr as THREE.BufferAttribute).needsUpdate = true;
  if (normals) geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
}

/** For each ureter vertex: its distance along the centre line (mm) and the nearest centre-line point. */
function ureterParams(base: Float32Array, side: 'left' | 'right') {
  const line = ureters[side].points, arc = ureters[side].arcMm;
  const along = new Float32Array(base.length / 3), centre = new Float32Array(base.length);
  for (let i = 0; i < base.length / 3; i++) {
    let best = 0, bd = Infinity;
    for (let k = 0; k < line.length; k++) {
      const p = line[k]!;
      const d = (base[i * 3]! - p[0]!) ** 2 + (base[i * 3 + 1]! - p[1]!) ** 2 + (base[i * 3 + 2]! - p[2]!) ** 2;
      if (d < bd) { bd = d; best = k; }
    }
    along[i] = arc[best]!;
    centre.set(line[best]!, i * 3);
  }
  return { along, centre };
}

/**
 * The pyramids' stripes: the parallel loops of Henle and collecting ducts run towards the papillae,
 * so the medulla looks streaked in lines that converge on the renal sinus.
 */
function makePyramidMaterial(material: TissueMaterial, hilum: THREE.Vector3) {
  const uniforms = { uHilum: { value: hilum } };
  const prev = material.onBeforeCompile;
  material.onBeforeCompile = (shader, renderer) => {
    prev.call(material, shader, renderer);
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vPyrPos;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvPyrPos = position;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vPyrPos;\nuniform vec3 uHilum;')
      .replace('#include <color_fragment>', [
        '#include <color_fragment>',
        '{',
        '  vec3 d = normalize(vPyrPos - uHilum);',
        '  float th = atan(d.y, d.x), ph = asin(clamp(d.z, -1.0, 1.0));',
        '  float s = 0.5 + 0.5 * sin(th * 150.0 + 3.0 * sin(ph * 40.0));',
        '  float s2 = 0.5 + 0.5 * sin(ph * 130.0 + 2.0 * sin(th * 23.0));',
        '  diffuseColor.rgb *= 0.78 + 0.3 * smoothstep(0.35, 0.65, s * s2 + 0.25 * s);',
        '}',
      ].join('\n'));
  };
  material.customProgramCacheKey = () => 'tissue-pyramid';
}

/** The bladder's pivot: the trigone, which hardly moves as the bladder fills. */
const PIVOT = new THREE.Vector3(...vec(G.trigone!.centroid));

export function KidneyModel({ onReady }: { onReady?: () => void }) {
  const { def, state, dispatch } = useLab();
  const gltf = useGLTF(MODEL_URL);
  const invalidate = useThree((s) => s.invalidate);
  const mode = effectiveMode(def, state);
  const bounds = useMemo(() => modeBounds(def, mode), [def, mode]);
  const physiology = effectivePhysiology(def, state);
  const urine = useMemo(() => urineState(physiology, physiology.water, physiology.glucose), [physiology]);
  const waves = peristalsisPerMin(urine.water.urineL);

  const parts = useMemo(() => {
    const out = new Map<string, Part>();
    gltf.scene.traverse((o) => {
      if (!(o instanceof THREE.Mesh)) return;
      const id = o.name || o.parent?.name || '';
      const s = def.structures.find((x) => x.id === id);
      if (!s) return;
      const material = makeTissueMaterial(realLook(s), hasTissueData(o));
      material.clippingPlanes = [clip.plane];
      if (id.startsWith('renal-pyramids-')) makePyramidMaterial(material, new THREE.Vector3(...vec(G[id.replace('renal-pyramids', 'renal-pelvis')]!.centroid)));
      o.geometry.computeBoundingBox();
      const box = o.geometry.boundingBox!.clone();
      const capSize = box.getSize(new THREE.Vector3()).length() * 1.05;
      const reshaped = BLADDER_WALL.has(id) || id in URETERS;
      const base = reshaped ? readPositions(o.geometry.getAttribute('position')) : undefined;
      const part: Part = { id, mesh: o, material, structure: s, box, cap: makeCap(o.geometry, clip.plane, 10, cutColour(s), capSize), base, clipped: true };
      if (base && id in URETERS) Object.assign(part, ureterParams(base, URETERS[id as keyof typeof URETERS]));
      out.set(id, part);
    });
    // Large structures first, so smaller ones inside them draw their caps last.
    const sorted = [...out.values()].sort((a, b) => b.box.getSize(new THREE.Vector3()).lengthSq() - a.box.getSize(new THREE.Vector3()).lengthSq());
    sorted.forEach((p, i) => {
      p.cap.back.renderOrder = p.cap.front.renderOrder = 10 + i * 2;
      p.cap.face.renderOrder = 10 + i * 2 + 1;
    });
    return out;
  }, [gltf, def]);

  // Attach materials in an effect, not in useMemo: StrictMode may run the memo twice, and the
  // meshes must carry the materials this component actually updates. Dispose them on unmount.
  useLayoutEffect(() => {
    for (const p of parts.values()) {
      p.mesh.material = p.material;
      p.mesh.userData.structureId = p.id;
      gltf.scene.add(p.cap.back, p.cap.front, p.cap.face);
    }
    onReady?.();
    return () => parts.forEach((p) => {
      p.material.dispose();
      p.cap.material.map?.dispose();
      p.cap.material.dispose();
      if (p.cap.closed !== p.mesh.geometry) p.cap.closed.dispose();
      (p.cap.back.material as THREE.Material).dispose();
      (p.cap.front.material as THREE.Material).dispose();
      p.cap.face.geometry.dispose();
      gltf.scene.remove(p.cap.back, p.cap.front, p.cap.face);
      if (p.base) writePositions(p.mesh.geometry, p.base);
    });
  }, [parts, onReady, gltf]);

  // Follow quality changes (a slow device drops the costly coat and sheen).
  useEffect(() => quality.subscribe((level) => {
    for (const p of parts.values()) { applyQuality(p.material, level); p.material.needsUpdate = true; }
    invalidate();
  }), [parts, invalidate]);

  const focus = focusIds(def, state);
  const lit = highlightedIds(def, focus);
  const colourBy = effectiveColourBy(def, state);
  const slice = effectiveSlice(def, state);

  // The cut plane: keeps the side where n·p + c ≥ 0. The plane stays attached to every material
  // (parked far outside the model when there is no cut), so turning a cut on or off never
  // recompiles the tissue shaders.
  useEffect(() => {
    const a = slice.axis;
    clip.active = a !== 'off';
    if (clip.active) {
      const ax = a === 'sagittal' ? 0 : a === 'axial' ? 1 : 2;
      const at = sliceWorld(bounds, ax, slice.at);
      const n = new THREE.Vector3();
      n.setComponent(ax, slice.flip ? 1 : -1);
      clip.plane.set(n, slice.flip ? -at : at);
    } else {
      clip.plane.set(new THREE.Vector3(-1, 0, 0), 100);
    }
    invalidate();
  }, [slice.axis, slice.at, slice.flip, bounds, invalidate]);

  // Ureter peristalsis and bladder filling, in the urine and stone views.
  const tmpV = useMemo(() => new THREE.Vector3(), []);
  const applied = useRef({ bladder: -1, waves: { 'ureter-left': -2, 'ureter-right': -2 } as Record<string, number> });
  const reshapeBladder = (ml: number) => {
    const v0 = Math.max(measures.bladder.ellipsoidMl, 1);
    const s = Math.cbrt(Math.max(ml, 8) / v0);
    const sx = s ** 0.85, sy = s ** 1.3;
    for (const id of BLADDER_WALL) {
      const p = parts.get(id);
      if (!p?.base) continue;
      const b = p.base, arr = (p.scratch ??= new Float32Array(b.length));
      for (let i = 0; i < b.length; i += 3) {
        tmpV.set(b[i]! - PIVOT.x, b[i + 1]! - PIVOT.y, b[i + 2]! - PIVOT.z);
        // The dome rises most; the floor of the bladder (below the trigone) barely moves.
        const lift = tmpV.y > 0 ? sy : 1 + (sy - 1) * 0.2;
        arr[i] = PIVOT.x + tmpV.x * sx; arr[i + 1] = PIVOT.y + tmpV.y * lift; arr[i + 2] = PIVOT.z + tmpV.z * sx;
      }
      writePositions(p.mesh.geometry, arr);
    }
  };
  const reshapeUreter = (id: string, waveMm: number | null) => {
    const p = parts.get(id);
    if (!p?.base || !p.along || !p.centre) return;
    const b = p.base, arr = (p.scratch ??= new Float32Array(b.length));
    for (let i = 0; i < b.length / 3; i++) {
      let k = 1;
      if (waveMm !== null) {
        const d = p.along[i]! - waveMm;
        // A bolus of urine swells the ureter just ahead of the contraction ring that pushes it.
        k = 1 + 0.9 * Math.exp(-(((d - 6) / 9) ** 2)) - 0.35 * Math.exp(-(((d + 10) / 6) ** 2));
      }
      for (let a = 0; a < 3; a++) arr[i * 3 + a] = p.centre[i * 3 + a]! + (b[i * 3 + a]! - p.centre[i * 3 + a]!) * k;
    }
    // A radial swelling barely turns the surface: the original normals still serve.
    writePositions(p.mesh.geometry, arr, false);
  };
  const flowing = (mode === 'urine' || mode === 'stones') && state.playing;
  const reduce = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  useFrame(({ clock }) => {
    let changed = false;
    const ml = mode === 'urine' ? state.bladderMl : measures.bladder.ellipsoidMl;
    if (Math.abs(ml - applied.current.bladder) > 2) { reshapeBladder(ml); applied.current.bladder = ml; changed = true; }
    for (const [id, side] of Object.entries(URETERS)) {
      const w = flowing && !reduce ? ureterWave(side, clock.elapsedTime, waves) : null;
      const key = w === null ? -1 : Math.round(w);
      if (key !== applied.current.waves[id]) { reshapeUreter(id, w); applied.current.waves[id] = key; changed = true; }
    }
    if (changed) invalidate();
  });

  useEffect(() => {
    const kidneyOnly = OPENED.has(mode);
    for (const p of parts.values()) {
      const s = p.structure;
      p.mesh.visible = isVisible(def, state, p.id);
      const clipped = !kidneyOnly || KIDNEY_LAYERS.has(s.layer);
      if (clipped !== p.clipped) {
        p.clipped = clipped;
        p.material.clippingPlanes = clipped ? [clip.plane] : [];
        p.material.needsUpdate = true;
      }
      const isLit = lit.has(p.id);
      const isHover = state.hovered === p.id && !isLit;
      const dim = lit.size > 0 && !isLit;
      const painted = colourBy !== 'real';
      p.material.color.set(baseColour(s, colourBy));
      if (isLit && !painted) p.material.color.lerp(HIGHLIGHT_COLOUR, 0.35);
      else if (dim) p.material.color.lerp(GREY, 0.45);
      if (isLit) p.material.emissive.copy(painted ? p.material.color : HIGHLIGHT_COLOUR);
      else p.material.emissive.set(isHover ? HOVER : '#000000');
      p.material.emissiveIntensity = isLit ? (painted ? 0.22 : 0.3) : isHover ? 0.3 : 0;

      // In the nephron views the kidney is a faint ghost around the nephron; the spine is ghosted
      // in the stone view so the ureter shows in front of it.
      let opacity = realOpacity(s);
      if ((mode === 'nephron' || mode === 'filtering') && (s.layer === 'cortex' || s.layer === 'medulla')) opacity = s.layer === 'cortex' ? 0.1 : 0.16;
      if (mode === 'stones' && s.layer === 'bone') opacity = 0.35;
      if (mode === 'blood' && s.layer === 'cortex' && !clip.active) opacity = 0.35;
      if (dim && opacity < 1) opacity *= 0.6;
      const transparent = opacity < 1;
      // Changing `transparent` changes the shader program; only flag an update when it flips.
      if (p.material.transparent !== transparent) p.material.needsUpdate = true;
      p.material.transparent = transparent;
      p.material.opacity = opacity;
      p.material.depthWrite = !transparent;
      p.mesh.renderOrder = transparent ? 2 : 0;

      p.cap.material.color.set(colourBy !== 'real' ? baseColour(s, colourBy) : cutColour(s));
      if (isLit) p.cap.material.color.lerp(HIGHLIGHT_COLOUR, 0.3);
      else if (dim) p.cap.material.color.lerp(GREY, 0.35);
    }
    invalidate();
  }, [parts, def, state, lit, colourBy, mode, invalidate]);

  // Keep each cap on the plane, just large enough to cover the part's footprint, and show it only
  // where the plane crosses a solid part. Reshaped parts (the bladder wall while it fills, the
  // ureters while a wave runs) go uncapped, since their closed copies are not rebuilt.
  const tmp = useMemo(() => new THREE.Vector3(), []);
  const size = useMemo(() => new THREE.Vector3(), []);
  const worldBox = useMemo(() => new THREE.Box3(), []);
  useFrame(() => {
    for (const p of parts.values()) {
      const solid = p.mesh.visible && !p.material.transparent;
      const reshapedNow = (BLADDER_WALL.has(p.id) && mode === 'urine') || (p.id in URETERS && flowing);
      p.mesh.updateMatrix();
      worldBox.copy(p.box).applyMatrix4(p.mesh.matrix);
      const show = clip.active && p.clipped && solid && !reshapedNow && clip.plane.intersectsBox(worldBox);
      p.cap.back.visible = p.cap.front.visible = p.cap.face.visible = show;
      if (show) {
        p.cap.back.matrix.copy(p.mesh.matrix);
        p.cap.front.matrix.copy(p.mesh.matrix);
        clip.plane.projectPoint(worldBox.getCenter(tmp), tmp);
        p.cap.face.position.copy(tmp);
        p.cap.face.lookAt(tmp.x - clip.plane.normal.x, tmp.y - clip.plane.normal.y, tmp.z - clip.plane.normal.z);
        p.cap.face.scale.setScalar(worldBox.getSize(size).length() * 1.05);
        p.cap.face.updateMatrix();
      }
    }
  });

  /** Ignore hits on the part of the model the cut has removed. */
  const removed = (e: ThreeEvent<PointerEvent | MouseEvent>) => clip.active && (parts.get(e.object.userData.structureId as string)?.clipped ?? true) && clip.plane.distanceToPoint(e.point) < 0;
  const pick = (e: ThreeEvent<MouseEvent>) => {
    const id = e.object.userData.structureId as string | undefined;
    if (!id || !e.object.visible || removed(e)) return; // let the event reach the next hit
    const m = (e.object as THREE.Mesh).material as THREE.Material;
    if (m.transparent && m.opacity < 0.3) return; // ghosted parts are see-through to clicks
    e.stopPropagation();
    if (e.delta > CLICK_SLOP) return;
    dispatch({ type: 'select', id });
  };
  const over = (e: ThreeEvent<PointerEvent>) => {
    const id = e.object.userData.structureId as string | undefined;
    if (!id || !e.object.visible || removed(e)) return;
    const m = (e.object as THREE.Mesh).material as THREE.Material;
    if (m.transparent && m.opacity < 0.3) return;
    e.stopPropagation();
    dispatch({ type: 'hover', id });
    document.body.style.cursor = 'pointer';
  };
  const out = (e: ThreeEvent<PointerEvent>) => {
    if (e.object.userData.structureId === state.hovered) dispatch({ type: 'hover', id: null });
    document.body.style.cursor = '';
  };

  return <primitive object={gltf.scene} onClick={pick} onPointerOver={over} onPointerOut={out} />;
}
