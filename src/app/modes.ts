import type { Mode } from '../contract/schema';

/** Which layers each mode shows (the learner's layer toggles apply in Anatomy mode). */
export const MODE_LAYERS: Record<Exclude<Mode, 'explore' | 'tour'>, readonly string[]> = {
  blood: ['cortex', 'medulla', 'collecting', 'artery', 'vein'],
  // The nephron views draw their own wedge of cortex and medulla (see NephronView).
  nephron: [],
  filtering: [],
  urine: ['capsule', 'cortex', 'medulla', 'collecting', 'ureter', 'bladder'],
  stones: ['capsule', 'cortex', 'medulla', 'collecting', 'ureter', 'bladder', 'bone'],
  function: ['capsule', 'collecting', 'ureter', 'bladder', 'artery', 'vein', 'adrenal'],
  hormones: ['capsule', 'cortex', 'medulla', 'collecting', 'ureter', 'bladder', 'artery', 'vein', 'adrenal'],
};

/** Single structures a mode adds to its layers. */
export const MODE_EXTRA: Partial<Record<Mode, readonly string[]>> = {
  urine: ['common-iliac-vein-left', 'common-iliac-vein-right'],
  stones: ['common-iliac-vein-left', 'common-iliac-vein-right'],
};

/** Structures a mode hides although their layer is shown. */
export const MODE_HIDE: Partial<Record<Mode, readonly string[]>> = {
  // The stone view keeps the bones that mark the ureter's course: the spine and the pelvic brim.
  stones: ['thoracic-vertebra-11', 'thoracic-vertebra-12', 'rib-11-left', 'rib-12-left', 'rib-11-right', 'rib-12-right'],
};

/** The camera each mode starts with. */
export const MODE_CAMERA: Partial<Record<Mode, string>> = {
  explore: 'anterior', blood: 'anterior', nephron: 'anterior', filtering: 'anterior', urine: 'anterior', stones: 'anterior', function: 'anterior', hormones: 'anterior',
};
