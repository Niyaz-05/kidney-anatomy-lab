/**
 * UI and simulation state as a pure reducer, so every learner action is unit-testable without
 * rendering. The 3D scene only reads this state; it never owns selection or visibility itself.
 */
import type { Mode, SimulationDefinition, SliceAxis } from '../contract/schema';
import type { HormoneId } from '../kidney/hormones';
import type { SegmentId } from '../kidney/tubule';
import type { Sex } from '../kidney/egfr';
import { MODE_CAMERA, MODE_EXTRA, MODE_HIDE, MODE_LAYERS } from './modes';
import { KIDNEY_MID_Z, modeBounds, sliceAt } from '../kidney/anchors';
import { HORMONES } from '../kidney/hormones';

export type { Mode } from '../contract/schema';
export { MODE_LAYERS } from './modes';
export type ColourBy = 'real' | 'layer';

export interface Slice {
  axis: SliceAxis;
  /** Position across what the mode shows, -1 … 1. */
  at: number;
  /** Keep the other side of the cut. */
  flip: boolean;
}

/** The learner's settings for the physiology views. */
export interface Physiology {
  /** Mean arterial pressure, mmHg. */
  map: number;
  /** Extra narrowing of the afferent and efferent arterioles, 0 … 1. */
  afferent: number;
  efferent: number;
  /** Water taken in, L/day. */
  water: number;
  /** Blood glucose, mg/dL. */
  glucose: number;
}

export interface LabState {
  mode: Mode;
  selected: string | null;
  hovered: string | null;
  visibleLayers: ReadonlySet<string>;
  isolate: boolean;
  labels: boolean;
  colourBy: ColourBy;
  slice: Slice;
  /** Animations (blood, filtrate, urine) running. */
  playing: boolean;
  physiology: Physiology;
  /** Bladder volume, mL (urine view). */
  bladderMl: number;
  /** The voiding reflex is running. */
  voiding: boolean;
  /** Kidney stone size, mm; null = none dropped yet. */
  stoneMm: number | null;
  /** Bumped each time a stone is dropped, so the same size can be dropped again. */
  stoneNonce: number;
  /** Selected part of the nephron (nephron view). */
  segment: SegmentId | null;
  hormone: HormoneId;
  hormoneStep: number;
  /** eGFR calculator inputs. */
  egfr: { creatinine: number; unit: 'mg/dL' | 'µmol/L'; age: number; sex: Sex };
  tourIndex: number;
  /** A camera move the scene should perform; the nonce makes repeat requests distinct. */
  camera: { preset: string; focus: readonly string[]; nonce: number };
}

export type LabAction =
  | { type: 'select'; id: string | null }
  | { type: 'hover'; id: string | null }
  | { type: 'toggle-layer'; layer: string }
  | { type: 'set-isolate'; value: boolean }
  | { type: 'set-labels'; value: boolean }
  | { type: 'set-colour-by'; value: ColourBy }
  | { type: 'set-slice'; axis?: SliceAxis; at?: number; flip?: boolean }
  | { type: 'set-mode'; mode: Mode }
  | { type: 'set-playing'; value: boolean }
  | { type: 'set-physiology'; value: Partial<Physiology> }
  | { type: 'reset-physiology' }
  | { type: 'set-bladder'; value: number }
  | { type: 'set-voiding'; value: boolean }
  | { type: 'drop-stone'; size: number }
  | { type: 'clear-stone' }
  | { type: 'set-segment'; value: SegmentId | null }
  | { type: 'set-hormone'; value: HormoneId; step?: number }
  | { type: 'hormone-step'; value: number }
  | { type: 'set-egfr'; value: Partial<LabState['egfr']> }
  | { type: 'tour-go'; index: number }
  | { type: 'camera'; preset: string; focus?: readonly string[] }
  | { type: 'reset' };

const NO_SLICE: Slice = { axis: 'off', at: 0, flip: false };
export const RESTING_PHYSIOLOGY: Physiology = { map: 95, afferent: 0, efferent: 0, water: 2.3, glucose: 90 };

/** Modes that open both kidneys with a frontal cut, keeping their back halves. */
const OPENED: readonly Mode[] = ['blood', 'urine', 'stones'];
/** The frontal cut through the middle of both kidneys, for a mode's bounds. */
export function kidneyCut(def: SimulationDefinition, mode: Mode): Slice {
  return { axis: 'coronal', at: sliceAt(modeBounds(def, mode), 2, KIDNEY_MID_Z), flip: false };
}

export function initialState(def: SimulationDefinition): LabState {
  return {
    mode: 'explore',
    selected: null,
    hovered: null,
    visibleLayers: new Set(def.layers.filter((l) => l.visibleByDefault).map((l) => l.id)),
    isolate: false,
    labels: false,
    colourBy: 'real',
    slice: NO_SLICE,
    playing: true,
    physiology: RESTING_PHYSIOLOGY,
    bladderMl: 80,
    voiding: false,
    stoneMm: null,
    stoneNonce: 0,
    segment: null,
    hormone: 'raas',
    hormoneStep: 0,
    egfr: { creatinine: 0.8, unit: 'mg/dL', age: 40, sex: 'female' },
    tourIndex: 0,
    camera: { preset: def.defaultCamera, focus: [], nonce: 0 },
  };
}

/** Ids that a selection or tour step highlights: a group stands for its members. */
export function highlightedIds(def: SimulationDefinition, ids: readonly string[]): Set<string> {
  const out = new Set<string>();
  for (const id of ids) {
    const s = def.structures.find((x) => x.id === id);
    if (!s) continue;
    if (s.kind === 'group') s.members?.forEach((m) => out.add(m));
    else out.add(id);
  }
  return out;
}

const step = (def: SimulationDefinition, state: LabState) => (state.mode === 'tour' ? def.tour[state.tourIndex] : undefined);

/** The mode in effect: in a tour, the step's (Anatomy if it names none). */
export function effectiveMode(def: SimulationDefinition, state: LabState): Exclude<Mode, 'tour'> {
  if (state.mode === 'tour') return step(def, state)?.mode ?? 'explore';
  return state.mode;
}

/** The structures currently in focus: the selection, a hormone step's organs, or the tour step's. */
export function focusIds(def: SimulationDefinition, state: LabState): string[] {
  if (state.mode === 'tour') return [...(step(def, state)?.focus ?? [])];
  if (state.selected) return [state.selected];
  if (state.mode === 'hormones') {
    const h = HORMONES.find((x) => x.id === state.hormone);
    return [...(h?.steps[state.hormoneStep]?.focus ?? [])];
  }
  return [];
}

/** The physiology in effect: a tour step can set its own. */
export function effectivePhysiology(def: SimulationDefinition, state: LabState): Physiology {
  const s = step(def, state);
  if (!s) return state.physiology;
  return {
    map: s.map ?? RESTING_PHYSIOLOGY.map,
    afferent: s.afferent ?? 0,
    efferent: s.efferent ?? 0,
    water: s.water ?? RESTING_PHYSIOLOGY.water,
    glucose: s.glucose ?? RESTING_PHYSIOLOGY.glucose,
  };
}

/** The stone in effect (stones view): the learner's, or the tour step's. */
export function effectiveStone(def: SimulationDefinition, state: LabState): number | null {
  const s = step(def, state);
  if (s) return s.stoneMm ?? null;
  return state.stoneMm;
}

/** The hormone and step in effect. */
export function effectiveHormone(def: SimulationDefinition, state: LabState): { id: HormoneId; step: number } {
  const s = step(def, state);
  if (s?.hormone) return { id: s.hormone, step: s.hormoneStep ?? 0 };
  return { id: state.hormone, step: state.hormoneStep };
}

/** The colour mode in effect: a tour step can set its own. */
export function effectiveColourBy(def: SimulationDefinition, state: LabState): ColourBy {
  if (state.mode === 'tour') return step(def, state)?.colourBy ?? 'real';
  return state.colourBy;
}

/** The cut in effect: a tour step's; the opened kidneys in the blood, urine and stone views; otherwise the learner's. */
export function effectiveSlice(def: SimulationDefinition, state: LabState): Slice {
  if (state.mode === 'tour') {
    const s = step(def, state);
    if (s?.slice) {
      const m = s.mode ?? 'explore';
      const at = s.slice.at ?? (s.slice.axis === 'coronal' ? kidneyCut(def, m).at : 0);
      return { axis: s.slice.axis, at, flip: false };
    }
    return s?.mode && OPENED.includes(s.mode) ? kidneyCut(def, s.mode) : NO_SLICE;
  }
  return state.slice;
}

/**
 * Whether a mesh structure is drawn. In Anatomy mode the learner's layers decide; the other modes
 * show their own layers. A highlighted structure is always shown; with isolate on, only those.
 */
export function isVisible(def: SimulationDefinition, state: LabState, id: string): boolean {
  const s = def.structures.find((x) => x.id === id);
  if (!s) return false;
  const lit = highlightedIds(def, focusIds(def, state));
  if (lit.has(id)) return true;
  if (state.isolate && lit.size > 0) return false;
  const mode = effectiveMode(def, state);
  if (mode === 'explore') return state.visibleLayers.has(s.layer);
  if ((MODE_HIDE[mode] ?? []).includes(id)) return false;
  return MODE_LAYERS[mode].includes(s.layer) || (MODE_EXTRA[mode] ?? []).includes(id);
}

/**
 * The camera preset that looks at the cut face. The cut keeps the side below the plane on its axis
 * (x: the patient's right, z: the back, y: the lower part), or the side above it when flipped, so
 * the camera looks from the removed side.
 */
export function facingPreset(slice: Slice): string | null {
  switch (slice.axis) {
    case 'sagittal': return slice.flip ? 'right' : 'left';
    case 'coronal': return slice.flip ? 'posterior' : 'anterior';
    case 'axial': return slice.flip ? 'inferior' : 'superior';
    default: return null;
  }
}

/** What the cut leaves in view, for the panel's hint (+x is the patient's left). */
export function keptHalf(slice: Slice): string | null {
  switch (slice.axis) {
    case 'sagittal': return slice.flip ? 'the left side of the body' : 'the right side of the body';
    case 'coronal': return slice.flip ? 'the front half' : 'the back half';
    case 'axial': return slice.flip ? 'the upper part' : 'the lower part';
    default: return null;
  }
}

const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));

export function makeReducer(def: SimulationDefinition) {
  const known = new Set(def.structures.map((s) => s.id));
  const layers = new Set(def.layers.map((l) => l.id));
  const presets = new Set(def.cameraPresets.map((c) => c.id));
  const cam = (state: LabState, preset: string | undefined, focus: readonly string[] = []) =>
    preset && presets.has(preset) ? { preset, focus, nonce: state.camera.nonce + 1 } : state.camera;

  return function reduce(state: LabState, action: LabAction): LabState {
    switch (action.type) {
      case 'select': {
        if (action.id !== null && !known.has(action.id)) return state;
        const selected = action.id === state.selected ? null : action.id;
        return { ...state, selected, isolate: selected ? state.isolate : false };
      }
      case 'hover':
        return action.id === state.hovered || (action.id !== null && !known.has(action.id)) ? state : { ...state, hovered: action.id };
      case 'toggle-layer': {
        if (!layers.has(action.layer)) return state;
        const next = new Set(state.visibleLayers);
        if (next.has(action.layer)) next.delete(action.layer);
        else next.add(action.layer);
        return { ...state, visibleLayers: next };
      }
      case 'set-isolate':
        return { ...state, isolate: action.value };
      case 'set-labels':
        return { ...state, labels: action.value };
      case 'set-colour-by':
        return action.value === state.colourBy ? state : { ...state, colourBy: action.value };
      case 'set-slice': {
        const at = action.at === undefined || !Number.isFinite(action.at) ? state.slice.at : clamp(action.at, -1, 1);
        const axis = action.axis ?? state.slice.axis;
        // Choosing a new axis starts the cut in the middle (the frontal cut through the kidneys).
        const fresh = action.axis !== undefined && action.axis !== state.slice.axis && action.at === undefined;
        const start = axis === 'coronal' ? kidneyCut(def, state.mode === 'tour' ? 'explore' : state.mode).at : 0;
        const slice = { axis, at: fresh ? start : at, flip: action.flip ?? state.slice.flip };
        // A new axis or a flip turns the camera to face the cut, from the side the cut removed.
        const turned = axis !== 'off' && (axis !== state.slice.axis || slice.flip !== state.slice.flip);
        if (!turned) return { ...state, slice };
        return { ...state, slice, camera: cam(state, facingPreset(slice) ?? undefined) };
      }
      case 'set-mode': {
        if (action.mode === state.mode) return state;
        if (action.mode === 'tour') {
          const first = def.tour[0];
          return {
            ...state, mode: 'tour', tourIndex: 0, selected: null, isolate: false, playing: true,
            camera: cam(state, first?.camera ?? MODE_CAMERA[first?.mode ?? 'explore'], first?.frame === 'mode' ? [] : first?.focus ?? []),
          };
        }
        // The blood, urine and stone views open both kidneys from the front.
        const slice = OPENED.includes(action.mode) ? kidneyCut(def, action.mode) : OPENED.includes(state.mode) ? NO_SLICE : state.slice;
        return { ...state, mode: action.mode, playing: true, selected: null, slice, voiding: false, camera: cam(state, MODE_CAMERA[action.mode]) };
      }
      case 'set-playing':
        return { ...state, playing: action.value };
      case 'set-physiology': {
        const v = { ...state.physiology, ...action.value };
        const ok = Object.values(v).every((x) => Number.isFinite(x));
        if (!ok) return state;
        return { ...state, physiology: { map: clamp(v.map, 30, 220), afferent: clamp(v.afferent, 0, 1), efferent: clamp(v.efferent, 0, 1), water: clamp(v.water, 0.5, 8), glucose: clamp(v.glucose, 50, 500) } };
      }
      case 'reset-physiology':
        return { ...state, physiology: RESTING_PHYSIOLOGY };
      case 'set-bladder':
        return Number.isFinite(action.value) ? { ...state, bladderMl: clamp(action.value, 0, 600) } : state;
      case 'set-voiding':
        return { ...state, voiding: action.value };
      case 'drop-stone':
        return Number.isFinite(action.size) ? { ...state, stoneMm: clamp(action.size, 1, 15), stoneNonce: state.stoneNonce + 1 } : state;
      case 'clear-stone':
        return { ...state, stoneMm: null };
      case 'set-segment':
        return { ...state, segment: action.value === state.segment ? null : action.value };
      case 'set-hormone':
        return { ...state, hormone: action.value, hormoneStep: action.step ?? 0, selected: null };
      case 'hormone-step': {
        const h = HORMONES.find((x) => x.id === state.hormone)!;
        return { ...state, hormoneStep: clamp(Math.round(action.value), 0, h.steps.length - 1), selected: null };
      }
      case 'set-egfr': {
        const e = { ...state.egfr, ...action.value };
        if (!Number.isFinite(e.creatinine) || !Number.isFinite(e.age)) return state;
        // Changing the unit converts the value, so the result does not jump.
        if (action.value.unit && action.value.unit !== state.egfr.unit && action.value.creatinine === undefined) {
          e.creatinine = action.value.unit === 'µmol/L' ? Math.round(state.egfr.creatinine * 88.4) : Math.round((state.egfr.creatinine / 88.4) * 100) / 100;
        }
        return { ...state, egfr: { ...e, age: clamp(Math.round(e.age), 18, 110), creatinine: Math.max(0, e.creatinine) } };
      }
      case 'tour-go': {
        const index = clamp(action.index, 0, def.tour.length - 1);
        const s = def.tour[index];
        if (!s) return state;
        return { ...state, mode: 'tour', tourIndex: index, camera: cam(state, s.camera ?? MODE_CAMERA[s.mode ?? 'explore'], s.frame === 'mode' ? [] : s.focus) };
      }
      case 'camera':
        if (!presets.has(action.preset)) return state;
        return { ...state, camera: { preset: action.preset, focus: action.focus ?? [], nonce: state.camera.nonce + 1 } };
      case 'reset': {
        const fresh = initialState(def);
        return { ...fresh, camera: { ...fresh.camera, nonce: state.camera.nonce + 1 } };
      }
    }
  };
}
