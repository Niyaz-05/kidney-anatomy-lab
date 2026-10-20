import type { AnatomicalStructure } from '../contract/schema';
import type { ColourBy } from '../app/state';
import type { TissueLook } from './tissue';

/**
 * Real looks as in a fresh specimen: a glossy, thin capsule over the red-brown kidney; the cortex
 * paler and granular, the pyramids darker and striped; the calyces, pelvis and ureter pale and
 * pinkish-white (urothelium); the bladder pink-tan muscle; yellow adrenal glands and sinus fat;
 * red arteries, blue-purple veins, ivory bone.
 */
const REAL: Record<string, TissueLook> = {
  capsule: { color: '#9a4a3c', roughness: 0.22, clearcoat: 1, clearcoatRoughness: 0.08, sheen: 0.35, sheenColor: '#ffd8cc', rim: 0.22, rimColor: '#ff9a88', ao: 0.55, mottle: 0.18, mottleTint: '#6e2c22' },
  cortex: { color: '#a85846', roughness: 0.45, clearcoat: 0.45, clearcoatRoughness: 0.25, sheen: 0.3, sheenColor: '#ffcabb', rim: 0.15, rimColor: '#ff8a76', ao: 0.7, mottle: 0.35, mottleTint: '#7a3428' },
  columns: { color: '#b0604e', roughness: 0.45, clearcoat: 0.4, sheen: 0.3, rim: 0.12, ao: 0.7, mottle: 0.3, mottleTint: '#7e3a2c' },
  pyramid: { color: '#7a2a24', roughness: 0.4, clearcoat: 0.5, clearcoatRoughness: 0.2, sheen: 0.25, sheenColor: '#e09a8a', rim: 0.15, rimColor: '#c0504a', ao: 0.75, mottle: 0.25, mottleTint: '#521a16' },
  papilla: { color: '#c8857a', roughness: 0.3, clearcoat: 0.7, sheen: 0.3, rim: 0.15, ao: 0.6, mottle: 0.15 },
  calyx: { color: '#e6cbbd', roughness: 0.3, clearcoat: 0.8, clearcoatRoughness: 0.12, sheen: 0.4, sheenColor: '#ffffff', rim: 0.12, rimColor: '#ffd8c8', ao: 0.6, mottle: 0.15, mottleTint: '#c8a090' },
  sinus: { color: '#e8c56a', roughness: 0.55, clearcoat: 0.5, sheen: 0.45, sheenColor: '#fff4c8', rim: 0.1, ao: 0.7, mottle: 0.45, mottleTint: '#c8a040' },
  ureter: { color: '#dcae98', roughness: 0.35, clearcoat: 0.7, clearcoatRoughness: 0.15, sheen: 0.35, sheenColor: '#fff0e8', rim: 0.15, rimColor: '#ffb8a0', ao: 0.6, mottle: 0.15, mottleTint: '#b08070' },
  bladder: { color: '#cf927e', roughness: 0.4, clearcoat: 0.6, clearcoatRoughness: 0.2, sheen: 0.4, sheenColor: '#ffd8cc', rim: 0.2, rimColor: '#ff9a88', ao: 0.75, mottle: 0.35, mottleTint: '#a0604e' },
  trigone: { color: '#e0a896', roughness: 0.3, clearcoat: 0.7, sheen: 0.3, rim: 0.15, ao: 0.6, mottle: 0.15 },
  sphincter: { color: '#c47a68', roughness: 0.45, clearcoat: 0.5, sheen: 0.35, rim: 0.2, ao: 0.75, mottle: 0.3, mottleTint: '#8a4a3a' },
  urethra: { color: '#d99a8a', roughness: 0.35, clearcoat: 0.6, sheen: 0.3, rim: 0.15, ao: 0.6, mottle: 0.15 },
  artery: { color: '#b4262a', roughness: 0.35, clearcoat: 0.7, clearcoatRoughness: 0.15, sheen: 0.2, rim: 0.25, rimColor: '#ff5a50', ao: 0.7, mottle: 0.15, mottleTint: '#7a1418' },
  vein: { color: '#4a3a78', roughness: 0.35, clearcoat: 0.7, clearcoatRoughness: 0.15, sheen: 0.2, rim: 0.2, rimColor: '#8a7ac0', ao: 0.7, mottle: 0.15, mottleTint: '#2a2050' },
  adrenal: { color: '#d89a36', roughness: 0.5, clearcoat: 0.45, sheen: 0.45, sheenColor: '#fff0c0', rim: 0.18, rimColor: '#ffc860', ao: 0.8, mottle: 0.45, mottleTint: '#a86a1a' },
  bone: { color: '#e6d9bc', roughness: 0.7, clearcoat: 0.1, sheen: 0.15, sheenColor: '#fff6e0', rim: 0.05, ao: 0.95, mottle: 0.35, mottleTint: '#bfae88' },
  muscle: { color: '#a63a30', roughness: 0.5, clearcoat: 0.5, clearcoatRoughness: 0.25, sheen: 0.4, sheenColor: '#ffb0a0', rim: 0.25, rimColor: '#ff6a55', ao: 0.85, mottle: 0.35, mottleTint: '#702018' },
  liver: { color: '#7a2e22', roughness: 0.3, clearcoat: 0.8, sheen: 0.3, rim: 0.2, ao: 0.75, mottle: 0.3, mottleTint: '#4e1a12' },
  spleen: { color: '#6a2a3c', roughness: 0.3, clearcoat: 0.8, sheen: 0.3, rim: 0.2, ao: 0.75, mottle: 0.3, mottleTint: '#401828' },
  pancreas: { color: '#e0b48c', roughness: 0.55, clearcoat: 0.4, sheen: 0.45, rim: 0.12, ao: 0.8, mottle: 0.5, mottleTint: '#b88860' },
  gut: { color: '#e0a090', roughness: 0.35, clearcoat: 0.8, sheen: 0.35, rim: 0.2, ao: 0.75, mottle: 0.3, mottleTint: '#b07060' },
  uterus: { color: '#d88a88', roughness: 0.35, clearcoat: 0.7, sheen: 0.35, rim: 0.2, ao: 0.75, mottle: 0.25, mottleTint: '#a85858' },
};

function kindOf(s: AnatomicalStructure): string {
  const id = s.id;
  if (id.startsWith('kidney-capsule')) return 'capsule';
  if (id.startsWith('renal-cortex')) return 'cortex';
  if (id.startsWith('renal-columns')) return 'columns';
  if (id.startsWith('renal-pyramids')) return 'pyramid';
  if (id.startsWith('renal-papillae')) return 'papilla';
  if (s.layer === 'collecting') return 'calyx';
  if (s.layer === 'sinus') return 'sinus';
  if (s.layer === 'ureter') return 'ureter';
  if (id === 'trigone' || id.startsWith('ureteral-orifice')) return 'trigone';
  if (id === 'bladder-neck') return 'sphincter';
  if (id === 'urethra') return 'urethra';
  if (s.layer === 'bladder') return 'bladder';
  if (s.layer === 'artery') return 'artery';
  if (s.layer === 'vein') return 'vein';
  if (s.layer === 'adrenal') return 'adrenal';
  if (s.layer === 'bone') return 'bone';
  if (s.layer === 'muscle') return 'muscle';
  if (id === 'liver') return 'liver';
  if (id === 'spleen') return 'spleen';
  if (id === 'pancreas') return 'pancreas';
  if (id === 'uterus' || id === 'vagina') return 'uterus';
  return 'gut';
}

export function realLook(s: AnatomicalStructure): TissueLook {
  return REAL[kindOf(s)] ?? REAL.gut!;
}

/** How see-through each structure is in its real look (1 = opaque). Nearby organs are ghosts. */
export function realOpacity(s: AnatomicalStructure): number {
  if (s.layer === 'neighbours') return 0.35;
  if (s.id === 'diaphragm') return 0.4;
  return 1;
}

/** One hue per layer (Colour: Layers). */
export const LAYER_COLOUR: Record<string, string> = {
  capsule: '#c8a0e0', cortex: '#e8784a', medulla: '#a03050', collecting: '#f2e090', sinus: '#f0c040', ureter: '#5ab0e0', bladder: '#40c0a0',
  artery: '#e03040', vein: '#4060d0', adrenal: '#f0a020', bone: '#d8c8a0', muscle: '#c8463a', neighbours: '#9aa0a8',
};
/** Groups use the colour of their layer. */
export function baseColour(s: AnatomicalStructure, colourBy: ColourBy): string {
  if (colourBy === 'layer' || s.kind === 'group') return LAYER_COLOUR[s.layer] ?? realLook(s).color;
  return realLook(s).color;
}

/** Blood, urine, filtrate and stone colours. */
export const BLOOD_IN = '#ff3a3a';
export const BLOOD_OUT = '#6a4ad0';
export const URINE = '#ffd84a';
export const STONE = '#c8b48a';
export const NARROW = '#ff7a2a';

export const HIGHLIGHT = '#ffc94d';
export const HOVER = '#ffe7a8';

/** Cut-surface colours: what a slice through each tissue shows. */
const CUT: Record<string, string> = {
  capsule: '#e4d6cc', cortex: '#b0624e', columns: '#b66a56', pyramid: '#7e2e28', papilla: '#b8786c', calyx: '#eadad0', sinus: '#e8c870',
  ureter: '#e0bcaa', bladder: '#c08070', trigone: '#d8a090', sphincter: '#b87060', urethra: '#d49888',
  artery: '#9a2024', vein: '#3a2c60', adrenal: '#d8a040', bone: '#dccdaa', muscle: '#963228', liver: '#6e2a20', spleen: '#5a2232', pancreas: '#d8ac84', gut: '#d49888', uterus: '#c47a78',
};
export function cutColour(s: AnatomicalStructure): string {
  return CUT[kindOf(s)] ?? '#c9a090';
}

/** Filtrate colour by osmolality: blue when dilute, white at plasma's 300, amber when concentrated. */
export function osmColour(osm: number): string {
  const lerp = (a: number[], b: number[], t: number) => a.map((x, i) => Math.round(x + (b[i]! - x) * t));
  const dilute = [90, 160, 255], iso = [245, 245, 235], conc = [235, 150, 30];
  const c = osm <= 300 ? lerp(dilute, iso, Math.max(0, (osm - 50) / 250)) : lerp(iso, conc, Math.min(1, (osm - 300) / 900));
  return `rgb(${c[0]}, ${c[1]}, ${c[2]})`;
}
