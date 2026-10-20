import type { AnatomicalStructure, SimulationDefinition } from '../contract/schema';
import { measures } from './anchors';

/**
 * The kidney lab as data. Function statements follow the cited OpenStax sections (A&P 2e ch. 25,
 * "The Urinary System"; §26.1 for body water) and Guyton & Hall; measurements in the model notes
 * are taken from this model (tools/extract-kidney.mjs).
 */

const KID = ['openstax-kidney', 'hra-united'] as const;
const TRANSPORT = ['openstax-transport', 'hra-united'] as const;
const BP = ['openstax-kidney', 'bodyparts3d'] as const;

type M = Omit<AnatomicalStructure, 'kind' | 'synonyms' | 'related'> & { synonyms?: string[]; related?: string[] };
const mesh = (s: M): AnatomicalStructure => ({ ...s, kind: 'mesh', synonyms: s.synonyms ?? [], related: s.related ?? [] });
const group = (s: Omit<M, 'organ'> & { members: string[] }): AnatomicalStructure => ({ ...s, kind: 'group', synonyms: s.synonyms ?? [], related: s.related ?? [] });
const SIDES = ['left', 'right'] as const;
const cap = (s: string) => s[0]!.toUpperCase() + s.slice(1);
const k = measures.kidneys;
const mm = (v: number) => `${Math.round(v)} mm`;
const level = (id: string) => id.replace('thoracic-vertebra-', 'T').replace('lumbar-vertebra-', 'L');

/** The per-side kidney parts (both kidneys share the text). */
function kidneyParts(side: 'left' | 'right'): AnatomicalStructure[] {
  const S = cap(side), m = k[side];
  return [
    mesh({
      id: `kidney-capsule-${side}`, label: `${S} renal capsule`, synonyms: ['fibrous capsule', 'kidney capsule', `${side} kidney`], layer: 'capsule', side, organ: `kidney-${side}`,
      summary: 'The thin, tough, shiny coat of dense connective tissue lying directly on the kidney.',
      function: 'Protects the kidney and holds its shape. Outside it (not shown) a pad of fat cushions the kidney and the renal fascia anchors it to the back wall of the abdomen.',
      modelNote: `In this body the ${side} kidney is ${mm(m.lengthMm)} long and its outline holds about ${Math.round(m.volumeMl)} mL; its upper pole is level with ${level(m.upperPole)} and its lower pole with ${level(m.lowerPole)}.`,
      related: [`renal-cortex-${side}`, `adrenal-gland-${side}`], sources: [...KID],
    }),
    mesh({
      id: `renal-cortex-${side}`, label: `${S} renal cortex`, synonyms: ['cortex', 'outer layer of the kidney'], layer: 'cortex', side, organ: `kidney-${side}`,
      summary: 'The outer, lighter layer of the kidney, under the capsule, about 1 cm thick.',
      function: 'Holds all the renal corpuscles (the glomerular filters) and the convoluted tubules of the about 1.3 million nephrons in each kidney. Its cells also make erythropoietin and activate vitamin D.',
      modelNote: measures.nephronAnchor ? `In the pyramid used for the nephron view, the cortex is ${mm(measures.nephronAnchor.cortexThicknessMm ?? 10)} thick.` : undefined,
      related: [`renal-columns-${side}`, `renal-pyramids-${side}`], sources: ['openstax-kidney', 'openstax-micro', 'hra-united'],
    }),
    mesh({
      id: `renal-columns-${side}`, label: `${S} renal columns`, synonyms: ['columns of Bertin', 'renal column'], layer: 'cortex', side, organ: `kidney-${side}`,
      summary: 'Extensions of the cortex that run inwards between the pyramids.',
      function: 'Carry the interlobar arteries and veins between the pyramids, and divide the kidney into lobes.',
      related: [`renal-pyramids-${side}`, `renal-cortex-${side}`], sources: [...KID],
    }),
    mesh({
      id: `renal-pyramids-${side}`, label: `${S} renal pyramids`, synonyms: ['medulla', 'renal medulla', 'medullary pyramids', 'pyramid'], layer: 'medulla', side, organ: `kidney-${side}`,
      summary: 'The cone-shaped, striped tissue of the inner kidney (the medulla), with their bases towards the cortex and tips (papillae) towards the sinus.',
      function: 'Hold the loops of Henle and the collecting ducts, which run in parallel and give the pyramids their stripes. The salt they pile up in the medulla lets the collecting ducts concentrate urine.',
      modelNote: `This ${side} kidney has ${m.pyramids} pyramids (people have about 8 to 18).`,
      related: [`renal-papillae-${side}`, `renal-columns-${side}`], sources: [...KID],
    }),
    mesh({
      id: `renal-papillae-${side}`, label: `${S} renal papillae`, synonyms: ['papilla', 'renal papilla'], layer: 'medulla', side, organ: `kidney-${side}`,
      summary: 'The rounded tips of the pyramids, each pushing into a minor calyx.',
      function: 'The collecting ducts open on the papilla, so urine drips from here into the minor calyx.',
      related: [`minor-calyces-${side}`, `renal-pyramids-${side}`], sources: [...KID],
    }),
    mesh({
      id: `minor-calyces-${side}`, label: `${S} minor calyces`, synonyms: ['minor calyx', 'calyx', 'calices'], layer: 'collecting', side, organ: `collecting-system-${side}`,
      summary: 'Small cups, each fitting round one or more papillae.',
      function: 'Collect the urine that drips from the papillae. From here on, urine is no longer changed: it is only carried and stored.',
      modelNote: `${m.minorCalyces} minor calyces drain the ${side} kidney in this model.`,
      related: [`major-calyces-${side}`, `renal-papillae-${side}`], sources: [...KID],
    }),
    mesh({
      id: `major-calyces-${side}`, label: `${S} major calyces`, synonyms: ['major calyx'], layer: 'collecting', side, organ: `collecting-system-${side}`,
      summary: 'Larger channels formed where several minor calyces join.',
      function: 'Carry urine from the minor calyces to the renal pelvis. Smooth muscle in their walls helps move it along.',
      modelNote: `${m.majorCalyces} major calyces here.`,
      related: [`minor-calyces-${side}`, `renal-pelvis-${side}`], sources: [...KID],
    }),
    mesh({
      id: `renal-pelvis-${side}`, label: `${S} renal pelvis`, synonyms: ['pelvis of the kidney'], layer: 'collecting', side, organ: `collecting-system-${side}`,
      summary: 'The funnel formed by the major calyces, narrowing into the ureter at the hilum.',
      function: 'Funnels urine into the ureter. Where it joins the ureter (the pelviureteric junction) is the first of the ureter’s three narrow points, where kidney stones can stick.',
      related: [`ureter-${side}`, `major-calyces-${side}`], sources: [...KID],
    }),
    mesh({
      id: `renal-sinus-${side}`, label: `${S} renal sinus and hilum`, synonyms: ['hilum', 'renal hilum', 'hilus', 'sinus fat'], layer: 'sinus', side, organ: `kidney-${side}`,
      summary: 'The space inside the kidney’s inner (medial) notch, the hilum, filled with fat around the calyces, pelvis and vessels.',
      function: 'The renal artery, vein, nerves, lymph vessels and the ureter enter and leave the kidney here: from front to back, the vein, the artery and the pelvis.',
      related: [`renal-pelvis-${side}`, `renal-artery-${side}`, `renal-vein-${side}`], sources: [...KID],
    }),
    mesh({
      id: `ureter-${side}`, label: `${S} ureter`, synonyms: ['ureter'], layer: 'ureter', side,
      summary: 'A muscular tube about 30 cm long carrying urine from the renal pelvis to the bladder.',
      function: 'Waves of smooth-muscle contraction (peristalsis) push urine down in spurts, even when you lie down. It enters the bladder wall at a slant, so the filling bladder squeezes it shut and urine cannot flow back. It narrows where it leaves the pelvis, where it crosses the iliac vessels at the pelvic brim, and where it passes through the bladder wall.',
      modelNote: `This ureter is ${mm(measures.ureterLengthMm[side])} long, measured along its centre line. The HuBMAP ureter is drawn thin, about 2 mm across; a living ureter is about 3–5 mm.`,
      related: [`renal-pelvis-${side}`, `ureteral-orifice-${side}`, `common-iliac-vein-${side}`], sources: [...TRANSPORT],
    }),
    mesh({
      id: `ureteral-orifice-${side}`, label: `${S} ureteral opening`, synonyms: ['ureteric orifice', 'ureteral orifice', 'vesicoureteric junction'], layer: 'bladder', side, organ: 'urinary-bladder',
      summary: 'The slit where the ureter opens into the bladder, at a back corner of the trigone.',
      function: 'The ureter passes obliquely through the bladder wall, which acts as a valve: rising bladder pressure closes it. This vesicoureteric junction is usually the narrowest part of the ureter.',
      related: [`ureter-${side}`, 'trigone'], sources: [...TRANSPORT],
    }),
    mesh({
      id: `renal-artery-${side}`, label: `${S} renal artery`, synonyms: ['renal artery'], layer: 'artery', side, organ: 'renal-vessels',
      summary: 'The branch of the abdominal aorta that supplies the kidney.',
      function: `Carries about a fifth to a quarter of the heart’s output (about 1.1 L a minute for both kidneys). At the hilum it divides into segmental arteries.${side === 'right' ? ' The right renal artery passes behind the inferior vena cava.' : ''}`,
      related: ['aorta', `segmental-arteries-${side}`, `renal-vein-${side}`], sources: ['openstax-kidney', 'openstax-blood-flow', 'hra-united'],
    }),
    mesh({
      id: `renal-vein-${side}`, label: `${S} renal vein`, synonyms: ['renal vein'], layer: 'vein', side, organ: 'renal-vessels',
      summary: 'Carries the cleaned blood from the kidney to the inferior vena cava.',
      function: side === 'left' ? 'The left renal vein is longer: it crosses in front of the aorta, just below the superior mesenteric artery, to reach the vena cava, and receives the left adrenal and gonadal veins.' : 'The right renal vein is short and drains straight into the inferior vena cava.',
      related: ['inferior-vena-cava', `renal-artery-${side}`], sources: [...KID],
    }),
    mesh({
      id: `segmental-arteries-${side}`, label: `${S} segmental arteries`, synonyms: ['segmental artery', 'anterior and posterior divisions of the renal artery'], layer: 'artery', side, organ: 'renal-vessels',
      summary: 'The branches of the renal artery in the renal sinus: anterior and posterior divisions and the superior, inferior and posterior segmental arteries.',
      function: 'Each supplies its own segment of the kidney and they do not join each other (end arteries), so a blocked branch kills its segment. They divide into interlobar arteries in the renal columns.',
      modelNote: 'From BodyParts3D, a different body, fitted onto this kidney (about 5–7 mm).',
      related: [`renal-artery-${side}`, `renal-columns-${side}`], sources: [...BP],
    }),
    mesh({
      id: `adrenal-gland-${side}`, label: `${S} adrenal gland`, synonyms: ['suprarenal gland', 'adrenal'], layer: 'adrenal', side,
      summary: side === 'left' ? 'A half-moon-shaped gland on the upper, inner edge of the left kidney.' : 'A pyramid-shaped gland on top of the right kidney.',
      function: 'Not part of the urinary system, but it works with it. Its cortex makes aldosterone, which makes the kidney keep sodium and water, and cortisol; its medulla makes adrenaline.',
      modelNote: 'From BodyParts3D, fitted onto this kidney.',
      related: [`kidney-capsule-${side}`, `suprarenal-arteries-${side}`], sources: ['openstax-kidney', 'openstax-endocrine-kidney', 'bodyparts3d'],
    }),
    mesh({
      id: `suprarenal-arteries-${side}`, label: `${S} suprarenal arteries`, synonyms: ['adrenal arteries'], layer: 'artery', side, organ: 'renal-vessels',
      summary: 'Small arteries to the adrenal gland (the middle from the aorta, the inferior from the renal artery).',
      function: 'The adrenal glands have one of the richest blood supplies in the body for their size.',
      modelNote: 'From BodyParts3D, fitted onto this kidney.',
      related: [`adrenal-gland-${side}`], sources: [...BP],
    }),
    mesh({
      id: `suprarenal-vein-${side}`, label: `${S} suprarenal vein`, synonyms: ['adrenal vein'], layer: 'vein', side, organ: 'renal-vessels',
      summary: side === 'left' ? 'Drains the left adrenal gland into the left renal vein.' : 'Drains the right adrenal gland straight into the inferior vena cava.',
      function: 'Carries the adrenal hormones into the circulation.',
      modelNote: 'From BodyParts3D, fitted onto this kidney.',
      related: [`adrenal-gland-${side}`, side === 'left' ? 'renal-vein-left' : 'inferior-vena-cava'], sources: [...BP],
    }),
    mesh({
      id: `common-iliac-vein-${side}`, label: `${S} common iliac vein`, synonyms: ['iliac vein', 'pelvic brim'], layer: 'vein', side,
      summary: 'The large vein from the leg and pelvis; the two join to form the inferior vena cava.',
      function: 'The ureter crosses the iliac vessels at the pelvic brim, the second narrow point where stones can stick. (The common iliac arteries lie in front of these veins; they are not in this model.)',
      related: [`ureter-${side}`, 'inferior-vena-cava'], sources: [...KID],
    }),
    mesh({ id: `ilium-${side}`, label: `${S} ilium`, synonyms: ['hip bone', 'iliac crest', 'pelvic brim'], layer: 'bone', side, summary: 'The large, wing-shaped upper part of the hip bone.', function: 'Its inner rim forms part of the pelvic brim, where the ureter enters the pelvis.', related: ['sacrum'], sources: ['openstax-skeleton', 'hra-united'] }),
    mesh({ id: `rib-11-${side}`, label: `${S} 11th rib`, synonyms: ['floating rib', 'eleventh rib'], layer: 'bone', side, summary: 'A floating rib, attached only to the spine.', function: 'Together with the 12th rib it shields the back of the upper kidney.', modelNote: 'From BodyParts3D, fitted on the spine.', related: [`rib-12-${side}`, `kidney-capsule-${side}`], sources: ['openstax-skeleton', 'bodyparts3d'] }),
    mesh({ id: `rib-12-${side}`, label: `${S} 12th rib`, synonyms: ['floating rib', 'twelfth rib'], layer: 'bone', side, summary: 'The lowest, shortest rib.', function: 'Crosses the back of the upper kidney; doctors use it to find the kidneys, and pain from them is felt just below it.', modelNote: 'From BodyParts3D, fitted on the spine.', related: [`kidney-capsule-${side}`], sources: ['openstax-skeleton', 'bodyparts3d'] }),
    mesh({ id: `psoas-major-${side}`, label: `${S} psoas major`, synonyms: ['psoas'], layer: 'muscle', side, summary: 'A long muscle from the lumbar spine to the thigh bone.', function: 'Flexes the hip. The kidneys lie on it and on the muscles of the back wall; the ureter runs down its front.', modelNote: 'From BodyParts3D, fitted on the spine and kept out of the kidneys.', related: [`ureter-${side}`, `kidney-capsule-${side}`], sources: ['openstax-kidney', 'bodyparts3d'] }),
  ];
}

const kidneyMembers = (side: string) => [`kidney-capsule-${side}`, `renal-cortex-${side}`, `renal-columns-${side}`, `renal-pyramids-${side}`, `renal-papillae-${side}`, `renal-sinus-${side}`];

const structures: AnatomicalStructure[] = [
  // ── Groups ────────────────────────────────────────────────────────────────
  ...SIDES.map((side) => group({
    id: `kidney-${side}`, label: `${cap(side)} kidney`, synonyms: ['kidney', 'renal'], layer: 'cortex', side,
    members: kidneyMembers(side),
    summary: 'A bean-shaped organ about 11–14 cm long, behind the abdominal organs, against the back wall on one side of the spine.',
    function: 'Filters about 180 L of plasma a day and returns 99 % of it, keeping the right amounts of water, salts and acid in the blood and removing urea and other wastes as 1–2 L of urine. It also makes renin, erythropoietin and active vitamin D.',
    modelNote: side === 'right' ? `Textbooks place the right kidney a little lower than the left, because of the liver. In this body it sits ${Math.abs(Math.round(measures.rightKidneyHigherByMm))} mm ${measures.rightKidneyHigherByMm > 0 ? 'higher' : 'lower'}: real bodies vary.` : undefined,
    related: [`collecting-system-${side}`, `ureter-${side}`, `adrenal-gland-${side}`], sources: [...KID],
  })),
  ...SIDES.map((side) => group({
    id: `collecting-system-${side}`, label: `${cap(side)} collecting system`, synonyms: ['calyces and pelvis', 'urinary collecting system'], layer: 'collecting', side,
    members: [`minor-calyces-${side}`, `major-calyces-${side}`, `renal-pelvis-${side}`],
    summary: 'The channels inside the kidney that gather urine: minor calyces, major calyces and the renal pelvis.',
    function: 'Urine from the papillae flows into the minor calyces, then the major calyces, then the pelvis and out into the ureter.',
    related: [`ureter-${side}`], sources: [...KID],
  })),
  group({
    id: 'urinary-bladder', label: 'Urinary bladder', synonyms: ['bladder', 'detrusor'], layer: 'bladder', side: 'midline',
    members: ['bladder-dome', 'bladder-base', 'trigone', 'bladder-neck', 'ureteral-orifice-left', 'ureteral-orifice-right'],
    summary: 'A hollow, stretchy, muscular bag in the pelvis, behind the pubic bone; in women in front of the uterus and vagina.',
    function: 'Stores urine until it is a good time to pass it. Its wall is the detrusor muscle, lined by transitional epithelium that stretches as it fills (about 500–600 mL at most).',
    modelNote: `The bladder in this body is nearly empty: about ${Math.round(measures.bladder.ellipsoidMl)} mL by the clinical ellipsoid formula (0.52 × length × width × height).`,
    related: ['urethra', 'ureter-left', 'ureter-right'], sources: [...TRANSPORT],
  }),
  group({
    id: 'renal-vessels', label: 'Renal blood vessels', synonyms: ['kidney blood supply'], layer: 'artery', side: 'midline',
    members: ['aorta', 'inferior-vena-cava', 'renal-artery-left', 'renal-artery-right', 'renal-vein-left', 'renal-vein-right', 'segmental-arteries-left', 'segmental-arteries-right', 'suprarenal-arteries-left', 'suprarenal-arteries-right', 'suprarenal-vein-left', 'suprarenal-vein-right'],
    summary: 'The arteries and veins of the kidneys and adrenal glands.',
    function: 'Inside the kidney the arteries branch: segmental → interlobar (in the renal columns) → arcuate (over the pyramid bases) → cortical radiate → afferent arterioles → glomeruli → efferent arterioles → peritubular capillaries and vasa recta. The veins follow back the same way.',
    related: ['aorta', 'inferior-vena-cava'], sources: ['openstax-kidney', 'openstax-blood-flow'],
  }),
  group({
    id: 'lumbar-spine', label: 'Spine (T11–L6) and sacrum', synonyms: ['vertebrae', 'spine', 'backbone', 'lumbar vertebrae'], layer: 'bone', side: 'midline',
    members: ['thoracic-vertebra-11', 'thoracic-vertebra-12', 'lumbar-vertebra-1', 'lumbar-vertebra-2', 'lumbar-vertebra-3', 'lumbar-vertebra-4', 'lumbar-vertebra-5', 'lumbar-vertebra-6', 'sacrum'],
    summary: 'The lower thoracic and lumbar vertebrae and the sacrum.',
    function: 'The kidneys lie on either side of the spine, usually from T12 to L3.',
    modelNote: 'This body (the Visible Human female) has six lumbar vertebrae, a normal variation found in some people.',
    related: ['kidney-left', 'kidney-right'], sources: ['openstax-skeleton', 'hra-united'],
  }),

  // ── Kidneys (both sides) ──────────────────────────────────────────────────
  ...SIDES.flatMap(kidneyParts),

  // ── Bladder and urethra ───────────────────────────────────────────────────
  mesh({ id: 'bladder-dome', label: 'Bladder dome (fundus)', synonyms: ['fundus of the bladder', 'bladder wall', 'detrusor'], layer: 'bladder', side: 'midline', organ: 'urinary-bladder', summary: 'The upper part of the bladder wall, which rises as the bladder fills.', function: 'Its detrusor muscle stretches to store urine and contracts to empty the bladder.', related: ['bladder-base', 'uterus'], sources: [...TRANSPORT] }),
  mesh({ id: 'bladder-base', label: 'Bladder base', synonyms: ['bladder wall', 'body of the bladder'], layer: 'bladder', side: 'midline', organ: 'urinary-bladder', summary: 'The lower and back part of the bladder wall.', function: 'Rests on the pelvic floor and, in women, against the front of the vagina and the cervix.', related: ['trigone', 'bladder-dome', 'vagina'], sources: [...TRANSPORT] }),
  mesh({ id: 'trigone', label: 'Trigone', synonyms: ['trigone of the bladder'], layer: 'bladder', side: 'midline', organ: 'urinary-bladder', summary: 'A smooth triangle on the floor of the bladder, between the two ureteral openings and the urethral opening.', function: 'Unlike the rest of the wall it does not fold or stretch much; it funnels urine towards the urethra.', related: ['ureteral-orifice-left', 'ureteral-orifice-right', 'bladder-neck'], sources: [...TRANSPORT] }),
  mesh({ id: 'bladder-neck', label: 'Bladder neck (internal sphincter)', synonyms: ['internal urethral sphincter', 'bladder neck'], layer: 'bladder', side: 'midline', organ: 'urinary-bladder', summary: 'The funnel where the bladder joins the urethra, ringed by smooth muscle.', function: 'The internal urethral sphincter is involuntary (autonomic): it stays closed while the bladder fills and opens in the voiding reflex.', related: ['urethra', 'trigone'], sources: [...TRANSPORT] }),
  mesh({ id: 'urethra', label: 'Urethra', synonyms: ['female urethra', 'external urethral sphincter'], layer: 'bladder', side: 'midline', summary: 'The tube carrying urine out of the body; in women about 4 cm long, opening in front of the vagina.', function: 'Its external sphincter is skeletal muscle under voluntary control (pudendal nerve). The short female urethra is one reason urinary infections are more common in women.', modelNote: 'Schematic: the HuBMAP body has no urethra, so a 4 cm tube is drawn from the bladder neck along the front of the vagina.', related: ['bladder-neck', 'vagina'], sources: ['openstax-transport'] }),

  // ── Great vessels and body wall ───────────────────────────────────────────
  mesh({ id: 'aorta', label: 'Abdominal aorta', synonyms: ['aorta', 'descending aorta'], layer: 'artery', side: 'midline', organ: 'renal-vessels', summary: 'The body’s main artery, running down in front of the spine, a little to the left.', function: 'Gives off the renal arteries at about the level of L1–L2.', modelNote: 'The HuBMAP descending aorta, from the chest to its division into the iliac arteries.', related: ['renal-artery-left', 'renal-artery-right'], sources: ['openstax-blood-flow', 'hra-united'] }),
  mesh({ id: 'inferior-vena-cava', label: 'Inferior vena cava', synonyms: ['vena cava', 'IVC'], layer: 'vein', side: 'midline', organ: 'renal-vessels', summary: 'The large vein to the right of the aorta, returning blood from the lower body to the heart.', function: 'Receives both renal veins.', related: ['renal-vein-left', 'renal-vein-right'], sources: ['openstax-blood-flow', 'hra-united'] }),
  ...['thoracic-vertebra-11', 'thoracic-vertebra-12', 'lumbar-vertebra-1', 'lumbar-vertebra-2', 'lumbar-vertebra-3', 'lumbar-vertebra-4', 'lumbar-vertebra-5', 'lumbar-vertebra-6'].map((id) => mesh({
    id, label: id.startsWith('thoracic') ? `${id.endsWith('11') ? '11th' : '12th'} thoracic vertebra (${level(id)})` : `${['1st', '2nd', '3rd', '4th', '5th', '6th'][Number(id.slice(-1)) - 1]} lumbar vertebra (${level(id)})`,
    synonyms: [level(id), 'vertebra'], layer: 'bone', side: 'midline', organ: 'lumbar-spine',
    summary: id === 'lumbar-vertebra-6' ? 'An extra, sixth lumbar vertebra: this body has six.' : id.startsWith('thoracic') ? 'A lower thoracic vertebra, carrying a floating rib.' : 'A large lumbar vertebra of the lower back.',
    function: id === 'lumbar-vertebra-6' ? 'A few people have six lumbar vertebrae (often the first sacral vertebra is separate, “lumbarised”); it usually causes no problems.' : 'Supports the weight of the upper body. The kidneys lie to either side of the spine.',
    related: ['lumbar-spine'], sources: ['openstax-skeleton', 'hra-united'],
  })),
  mesh({ id: 'sacrum', label: 'Sacrum', synonyms: ['sacral bone'], layer: 'bone', side: 'midline', organ: 'lumbar-spine', summary: 'The triangular bone of fused vertebrae at the back of the pelvis.', function: 'The nerves to the bladder (pelvic nerves, S2–S4) leave the spinal canal through it.', related: ['ilium-left', 'ilium-right'], sources: ['openstax-skeleton', 'hra-united'] }),
  mesh({ id: 'diaphragm', label: 'Diaphragm', synonyms: ['diaphragm muscle'], layer: 'muscle', side: 'midline', summary: 'The dome-shaped breathing muscle between the chest and abdomen.', function: 'The kidneys lie against its back part, so they move down a few centimetres with each deep breath.', modelNote: 'From BodyParts3D, fitted on the spine.', related: ['kidney-left', 'kidney-right'], sources: ['openstax-kidney', 'bodyparts3d'] }),

  // ── Neighbouring organs ───────────────────────────────────────────────────
  mesh({ id: 'liver', label: 'Liver', layer: 'neighbours', side: 'right', summary: 'The large organ in the upper right abdomen.', function: 'Its underside rests on the right kidney. It makes angiotensinogen (for the renin–angiotensin system) and the first step of vitamin D activation.', related: ['kidney-right'], sources: ['openstax-kidney', 'hra-united'] }),
  mesh({ id: 'spleen', label: 'Spleen', layer: 'neighbours', side: 'left', summary: 'An organ of the immune system in the upper left abdomen.', function: 'Lies against the upper outer part of the left kidney.', related: ['kidney-left'], sources: ['hra-united'] }),
  mesh({ id: 'pancreas', label: 'Pancreas', layer: 'neighbours', side: 'midline', summary: 'The gland behind the stomach.', function: 'Its tail lies in front of the left kidney.', related: ['kidney-left'], sources: ['hra-united'] }),
  mesh({ id: 'duodenum', label: 'Duodenum', layer: 'neighbours', side: 'midline', summary: 'The first part of the small intestine, curved round the head of the pancreas.', function: 'Lies in front of the right kidney’s hilum.', related: ['kidney-right'], sources: ['hra-united'] }),
  mesh({ id: 'ascending-colon', label: 'Ascending colon', layer: 'neighbours', side: 'right', summary: 'The right side of the large intestine.', function: 'Lies in front of the lower right kidney.', related: ['kidney-right'], sources: ['hra-united'] }),
  mesh({ id: 'descending-colon', label: 'Descending colon', layer: 'neighbours', side: 'left', summary: 'The left side of the large intestine.', function: 'Lies in front of the lower left kidney.', related: ['kidney-left'], sources: ['hra-united'] }),
  mesh({ id: 'uterus', label: 'Uterus', layer: 'neighbours', side: 'midline', summary: 'The womb, lying on top of and behind the bladder.', function: 'A full bladder pushes it back; in pregnancy it presses on the bladder.', related: ['urinary-bladder'], sources: ['hra-united'] }),
  mesh({ id: 'vagina', label: 'Vagina', layer: 'neighbours', side: 'midline', summary: 'The muscular canal behind the urethra.', function: 'The urethra runs along its front wall.', related: ['urethra'], sources: ['hra-united'] }),
];

export const kidneyDefinition: SimulationDefinition = {
  schemaVersion: 1,
  id: 'kidney-urinary-lab',
  title: 'Human Kidney and Urinary System — Interactive 3D Learning Lab',
  domain: 'biology',
  simulationType: '3d-anatomy',
  audience: 'Secondary school (Classes 10–12) and first-year undergraduate biology',
  summary:
    'Explore the real kidneys, ureters and bladder of the HuBMAP female reference body, with their blood vessels, the adrenal glands, spine and ribs. Follow blood into the kidney and urine out of it, look inside a nephron, change blood pressure and water intake to see how the kidney filters and concentrates urine, fill and empty the bladder, drop in a kidney stone, test kidney function and step through the kidney’s hormones.',
  learningObjectives: [
    { id: 'parts', text: 'Name the parts of the kidney and the urinary tract, and say where the kidneys lie.' },
    { id: 'blood', text: 'Trace blood from the aorta through the kidney to the vena cava.' },
    { id: 'nephron', text: 'Name the parts of a nephron and say what each does to the filtrate.' },
    { id: 'filtration', text: 'Explain glomerular filtration with the Starling forces, and how blood pressure and the arterioles change it.' },
    { id: 'water', text: 'Explain how ADH and the loop of Henle let the kidney make dilute or concentrated urine.' },
    { id: 'urine', text: 'Trace urine from the papilla to the urethra, and describe the micturition reflex.' },
    { id: 'stones', text: 'Name the three narrow points of the ureter and explain renal colic.' },
    { id: 'egfr', text: 'Explain how GFR is estimated from creatinine and what the CKD stages mean.' },
    { id: 'hormones', text: 'Describe the renin–angiotensin–aldosterone system, ADH, erythropoietin and vitamin D.' },
  ],
  assets: [{ id: 'hra-kidney-v1', role: 'anatomy-model' }],
  layers: [
    { id: 'capsule', label: 'Renal capsule', description: 'The thin shiny coat of each kidney.', visibleByDefault: true },
    { id: 'cortex', label: 'Cortex and renal columns', description: 'The outer kidney, where blood is filtered.', visibleByDefault: true },
    { id: 'medulla', label: 'Pyramids and papillae', description: 'The striped inner kidney, where urine is concentrated.', visibleByDefault: true },
    { id: 'collecting', label: 'Calyces and pelvis', description: 'The channels that collect urine inside the kidney.', visibleByDefault: true },
    { id: 'sinus', label: 'Renal sinus (hilum)', description: 'The fatty space at the kidney’s inner notch.', visibleByDefault: false },
    { id: 'ureter', label: 'Ureters', description: 'The tubes from the kidneys to the bladder.', visibleByDefault: true },
    { id: 'bladder', label: 'Bladder and urethra', description: 'The bladder wall, trigone, sphincter and urethra.', visibleByDefault: true },
    { id: 'artery', label: 'Arteries', description: 'Aorta, renal, segmental and adrenal arteries.', visibleByDefault: true },
    { id: 'vein', label: 'Veins', description: 'Vena cava, renal, adrenal and iliac veins.', visibleByDefault: true },
    { id: 'adrenal', label: 'Adrenal glands', description: 'The glands on top of the kidneys.', visibleByDefault: true },
    { id: 'bone', label: 'Spine, ribs and pelvis', description: 'Lower vertebrae, floating ribs, sacrum and ilium.', visibleByDefault: true },
    { id: 'muscle', label: 'Psoas and diaphragm', description: 'Muscles of the back wall the kidneys lie on.', visibleByDefault: false },
    { id: 'neighbours', label: 'Nearby organs', description: 'Liver, spleen, pancreas, intestines, uterus and vagina.', visibleByDefault: false },
  ],
  structures,
  cameraPresets: [
    { id: 'anterior', label: 'Front', direction: [0, 0.05, 1] },
    { id: 'posterior', label: 'Back', direction: [0, 0.05, -1] },
    { id: 'left', label: 'Left side', direction: [1, 0, 0] },
    { id: 'right', label: 'Right side', direction: [-1, 0, 0] },
    { id: 'superior', label: 'Top', direction: [0, 1, 0.0001], up: [0, 0, -1] },
    { id: 'inferior', label: 'Bottom', direction: [0, -1, 0.0001], up: [0, 0, 1] },
    { id: 'oblique', label: '3/4', direction: [0.55, 0.25, 0.8] },
  ],
  defaultCamera: 'anterior',
  urineRoute: {
    id: 'urine-route',
    label: 'The path of urine',
    description: 'Urine is made in the nephrons, then only carried and stored: from the papillae through the calyces and pelvis, down the ureters to the bladder, and out through the urethra.',
    steps: [
      { offModel: 'nephrons', label: 'Nephrons and collecting ducts', note: 'About 180 L of filtrate a day becomes 1–2 L of urine.' },
      { structure: 'renal-papillae-left', label: 'Renal papillae', note: 'Collecting ducts open on the papilla tips.' },
      { structure: 'minor-calyces-left', label: 'Minor calyces', note: 'Each cups one or more papillae.' },
      { structure: 'major-calyces-left', label: 'Major calyces', note: 'Two to four per kidney.' },
      { structure: 'renal-pelvis-left', label: 'Renal pelvis', note: 'Funnels urine into the ureter.' },
      { structure: 'ureter-left', label: 'Ureter', note: 'Peristaltic waves, about 2 to 6 a minute, push urine down in spurts.' },
      { structure: 'ureteral-orifice-left', label: 'Into the bladder', note: 'The ureter crosses the wall obliquely, a valve against back-flow.' },
      { structure: 'urinary-bladder', label: 'Bladder', note: 'Stores urine; the urge comes at about 150 mL.' },
      { structure: 'urethra', label: 'Urethra', note: 'About 4 cm long in women.' },
    ],
    facts: [
      'Urine is about 95 % water; it also carries urea, creatinine, salts and other wastes.',
      'Urine normally contains no glucose, protein or blood cells.',
    ],
    assumptions: ['The routes run through the real calyces, pelvis and ureter of this model; the speed is not to scale (urine takes many seconds to travel down a ureter in each wave).'],
    sources: ['openstax-transport', 'openstax-kidney', 'openstax-urine'],
  },
  bloodRoute: {
    id: 'blood-route',
    label: 'Blood through the kidney',
    description: 'Each kidney receives blood from the aorta through its renal artery; the arteries branch down to a million glomeruli, and the cleaned blood returns by the renal vein to the vena cava.',
    steps: [
      { structure: 'aorta', label: 'Abdominal aorta', note: 'About a fifth of the heart’s output goes to the kidneys.' },
      { structure: 'renal-artery-left', label: 'Renal artery', note: 'Enters the hilum, between the vein in front and the pelvis behind.' },
      { structure: 'segmental-arteries-left', label: 'Segmental arteries', note: 'End arteries, each to its own segment.' },
      { structure: 'renal-columns-left', label: 'Interlobar arteries', note: 'Run out between the pyramids, in the renal columns.' },
      { structure: 'renal-pyramids-left', label: 'Arcuate arteries', note: 'Arch over the bases of the pyramids.' },
      { structure: 'renal-cortex-left', label: 'Cortical radiate arteries', note: 'Run out through the cortex and give off afferent arterioles.' },
      { offModel: 'glomeruli', label: 'Glomeruli', note: 'Blood is filtered; it leaves by the efferent arterioles.' },
      { offModel: 'peritubular', label: 'Peritubular capillaries and vasa recta', note: 'Take back what the tubules reabsorb.' },
      { structure: 'renal-vein-left', label: 'Renal vein', note: 'The veins follow the arteries back.' },
      { structure: 'inferior-vena-cava', label: 'Inferior vena cava', note: 'Back to the heart.' },
    ],
    facts: ['The kidneys are about 0.5 % of body weight but receive about 20–25 % of the heart’s output at rest.', 'The blood leaving the kidney has given up only a little oxygen, but much of its water and solute has been filtered and returned.'],
    assumptions: ['The aorta, renal arteries and veins are HuBMAP vessels; the segmental arteries are fitted from BodyParts3D. The interlobar, arcuate and cortical radiate vessels are drawn: they follow this kidney’s pyramids and capsule, but the pattern is illustrative and wider than life.'],
    sources: ['openstax-kidney', 'openstax-blood-flow', 'hra-united', 'bodyparts3d'],
  },
  tour: [
    { id: 'overview', title: 'The urinary system', camera: 'anterior', mode: 'explore', focus: ['kidney-left', 'kidney-right', 'ureter-left', 'ureter-right', 'urinary-bladder'], body: 'Two kidneys make urine, two ureters carry it, the bladder stores it and the urethra lets it out. The kidneys lie against the back wall of the abdomen, on either side of the spine, partly under the lowest ribs.' },
    { id: 'from-behind', title: 'Behind the other organs', camera: 'posterior', mode: 'explore', focus: ['rib-12-left', 'rib-12-right', 'kidney-left', 'kidney-right'], body: 'Seen from the back, the floating 11th and 12th ribs cross the upper kidneys. The kidneys are retroperitoneal: behind the lining of the abdomen, cushioned in fat.' },
    { id: 'inside', title: 'Inside the kidney', camera: 'anterior', mode: 'explore', slice: { axis: 'coronal', at: -0.45 }, focus: ['renal-cortex-left', 'renal-pyramids-left', 'minor-calyces-left', 'renal-pelvis-left'], body: 'Cut open from the front, a kidney shows its pale outer cortex, the striped pyramids of the medulla with their tips (papillae), the cup-shaped calyces and the renal pelvis.' },
    { id: 'layers', title: 'Cortex and medulla', camera: 'anterior', mode: 'explore', colourBy: 'layer', slice: { axis: 'coronal', at: -0.45 }, focus: ['kidney-left'], body: 'In colour: the cortex, with the renal columns between the pyramids, and the medulla. All glomeruli are in the cortex; the loops of Henle and collecting ducts run through the pyramids.' },
    { id: 'blood', title: 'Blood in', mode: 'blood', focus: ['renal-artery-left', 'segmental-arteries-left'], body: 'Blood enters by the renal artery and branches into segmental, interlobar, arcuate and cortical radiate arteries, then into about a million afferent arterioles per kidney, each feeding a glomerulus.' },
    { id: 'nephron', title: 'The nephron', mode: 'nephron', focus: [], body: 'The nephron is the kidney’s working unit, about 1.3 million in each kidney. Filtrate made in the glomerulus flows through the proximal tubule, the loop of Henle, the distal tubule and into a collecting duct.' },
    { id: 'filter', title: 'Filtration', mode: 'filtering', focus: [], body: 'Blood pressure in the glomerulus (55 mmHg) pushes fluid out; the pressure in the capsule (15) and the pull of the blood proteins (30) oppose it. The net 10 mmHg filters about 125 mL a minute: 180 L a day.' },
    { id: 'low-pressure', title: 'When blood pressure falls', mode: 'filtering', map: 60, focus: [], body: 'Autoregulation keeps filtration steady while the mean blood pressure is between about 80 and 180 mmHg. Below that, as in shock, filtration falls and nearly stops by about 60 mmHg.' },
    { id: 'adh', title: 'Little water, concentrated urine', mode: 'filtering', water: 1.2, focus: [], body: 'When you drink little, ADH puts water channels in the collecting ducts. Water leaves into the salty medulla, and the urine becomes small in volume and dark: up to 1,200 mOsm/kg.' },
    { id: 'urine', title: 'The path of urine', mode: 'urine', focus: ['collecting-system-left', 'ureter-left'], body: 'Urine drips from the papillae into the calyces and pelvis, and peristaltic waves carry it down the ureters to the bladder, about 1 mL a minute.' },
    { id: 'bladder', title: 'Filling and emptying', mode: 'urine', camera: 'anterior', focus: ['urinary-bladder'], body: 'The bladder relaxes as it fills, so its pressure hardly rises. The urge comes at about 150 mL; the voiding reflex contracts the detrusor and opens the sphincters.' },
    { id: 'stone', title: 'A kidney stone', mode: 'stones', stoneMm: 7, focus: ['ureter-left'], body: 'A stone that leaves the kidney can stick at one of the ureter’s narrow points, causing renal colic: waves of severe pain from the loin to the groin. A 7 mm stone often sticks where the ureter enters the bladder.' },
    { id: 'egfr', title: 'Testing kidney function', mode: 'function', focus: ['kidney-left', 'kidney-right'], body: 'Doctors estimate the filtration rate from creatinine, a waste from muscle, in a blood test. The CKD-EPI 2021 equation uses creatinine, age and sex.' },
    { id: 'hormones', title: 'Hormones', mode: 'hormones', hormone: 'raas', hormoneStep: 5, focus: ['adrenal-gland-left', 'adrenal-gland-right'], body: 'When blood pressure falls, the kidney releases renin. Through angiotensin II it makes the adrenal glands release aldosterone, so the kidney keeps salt and water and the pressure rises.' },
  ],
  sources: [
    { id: 'openstax-urine', citation: 'Betts JG, Young KA, Wise JA, et al. Anatomy and Physiology 2e, section 25.1 "Physical Characteristics of Urine". Houston: OpenStax; 2022.', url: 'https://openstax.org/books/anatomy-and-physiology-2e/pages/25-1-physical-characteristics-of-urine' },
    { id: 'openstax-transport', citation: 'Betts JG, Young KA, Wise JA, et al. Anatomy and Physiology 2e, section 25.2 "Gross Anatomy of Urine Transport". Houston: OpenStax; 2022.', url: 'https://openstax.org/books/anatomy-and-physiology-2e/pages/25-2-gross-anatomy-of-urine-transport' },
    { id: 'openstax-kidney', citation: 'Betts JG, Young KA, Wise JA, et al. Anatomy and Physiology 2e, section 25.3 "Gross Anatomy of the Kidney". Houston: OpenStax; 2022.', url: 'https://openstax.org/books/anatomy-and-physiology-2e/pages/25-3-gross-anatomy-of-the-kidney' },
    { id: 'openstax-micro', citation: 'Betts JG, Young KA, Wise JA, et al. Anatomy and Physiology 2e, section 25.4 "Microscopic Anatomy of the Kidney". Houston: OpenStax; 2022.', url: 'https://openstax.org/books/anatomy-and-physiology-2e/pages/25-4-microscopic-anatomy-of-the-kidney' },
    { id: 'openstax-filtration', citation: 'Betts JG, Young KA, Wise JA, et al. Anatomy and Physiology 2e, section 25.5 "Physiology of Urine Formation". Houston: OpenStax; 2022.', url: 'https://openstax.org/books/anatomy-and-physiology-2e/pages/25-5-physiology-of-urine-formation' },
    { id: 'openstax-reabsorption', citation: 'Betts JG, Young KA, Wise JA, et al. Anatomy and Physiology 2e, section 25.6 "Tubular Reabsorption". Houston: OpenStax; 2022.', url: 'https://openstax.org/books/anatomy-and-physiology-2e/pages/25-6-tubular-reabsorption' },
    { id: 'openstax-blood-flow', citation: 'Betts JG, Young KA, Wise JA, et al. Anatomy and Physiology 2e, section 25.7 "Regulation of Renal Blood Flow". Houston: OpenStax; 2022.', url: 'https://openstax.org/books/anatomy-and-physiology-2e/pages/25-7-regulation-of-renal-blood-flow' },
    { id: 'openstax-endocrine-kidney', citation: 'Betts JG, Young KA, Wise JA, et al. Anatomy and Physiology 2e, section 25.8 "Endocrine Regulation of Kidney Function". Houston: OpenStax; 2022.', url: 'https://openstax.org/books/anatomy-and-physiology-2e/pages/25-8-endocrine-regulation-of-kidney-function' },
    { id: 'openstax-fluid', citation: 'Betts JG, Young KA, Wise JA, et al. Anatomy and Physiology 2e, section 25.9 "Regulation of Fluid Volume and Composition". Houston: OpenStax; 2022.', url: 'https://openstax.org/books/anatomy-and-physiology-2e/pages/25-9-regulation-of-fluid-volume-and-composition' },
    { id: 'openstax-skeleton', citation: 'Betts JG, Young KA, Wise JA, et al. Anatomy and Physiology 2e, section 7.3 "The Vertebral Column" and 7.4 "The Thoracic Cage". Houston: OpenStax; 2022.', url: 'https://openstax.org/books/anatomy-and-physiology-2e/pages/7-3-the-vertebral-column' },
    { id: 'guyton', citation: 'Hall JE, Hall ME. Guyton and Hall Textbook of Medical Physiology, 14th ed. Philadelphia: Elsevier; 2021. Chapters 25–30 (body fluids, urine formation, tubular reabsorption, urine concentration).' },
    { id: 'boron', citation: 'Boron WF, Boulpaep EL. Medical Physiology, 3rd ed. Philadelphia: Elsevier; 2017. Chapter 34, "Glomerular Filtration and Renal Blood Flow" (autoregulation about 80 to 180 mmHg).' },
    { id: 'ckd-epi-2021', citation: 'Inker LA, Eneanya ND, Coresh J, et al. New creatinine- and cystatin C-based equations to estimate GFR without race. N Engl J Med 2021;385:1737–1749.', url: 'https://www.nejm.org/doi/full/10.1056/NEJMoa2102953' },
    { id: 'kdigo-2012', citation: 'KDIGO 2012 Clinical Practice Guideline for the Evaluation and Management of Chronic Kidney Disease. Kidney Int Suppl 2013;3:1–150 (GFR categories G1–G5).', url: 'https://kdigo.org/guidelines/ckd-evaluation-and-management/' },
    { id: 'preminger-2007', citation: 'Preminger GM, Tiselius HG, Assimos DG, et al. 2007 Guideline for the management of ureteral calculi (EAU/AUA). J Urol 2007;178:2418–2434 (spontaneous passage about 68 % for stones ≤5 mm, 47 % for >5–10 mm).', url: 'https://pubmed.ncbi.nlm.nih.gov/17993340/' },
    { id: 'campbell', citation: 'Partin AW, Dmochowski RR, Kavoussi LR, Peters CA (eds). Campbell-Walsh-Wein Urology, 12th ed. Philadelphia: Elsevier; 2020. "Physiology and Pharmacology of the Renal Pelvis and Ureter" (peristalsis about 2–6 per minute).' },
    { id: 'hra-united', citation: 'Browne K, Schlehlein H, et al. 3D Reference Organ Set for Female, v1.5 (HuBMAP Human Reference Atlas; kidneys, ureters, urinary bladder and body). doi:10.48539/HBM352.BTSQ.586', url: 'https://doi.org/10.48539/HBM352.BTSQ.586', license: 'CC BY 4.0' },
    { id: 'bodyparts3d', citation: 'Mitsuhashi N, Fujieda K, Tamura T, Kawamoto S, Takagi T, Okubo K. BodyParts3D: 3D structure database for anatomical concepts. Nucleic Acids Res. 2009;37(Database issue):D782-5. doi:10.1093/nar/gkn613', url: 'https://dbarchive.biosciencedbc.jp/en/bodyparts3d/download.html', license: 'CC BY 4.0' },
  ],
  disclaimers: [
    'For learning only. This is not a clinical or diagnostic tool, and the explanations have not been reviewed by a physician. The eGFR calculator is not for medical decisions.',
    'The kidneys, ureters, bladder, main vessels, spine and pelvis are the HuBMAP female reference organs, based on the Visible Human female; real bodies vary.',
    'The adrenal glands, segmental and adrenal vessels, lower ribs, psoas and diaphragm come from a different reference body (BodyParts3D), fitted onto this one; their positions are approximate (about 3–7 mm). The urethra is schematic.',
    'The nephron, the small renal vessels and the hormone and filtration models are teaching models built from textbook values, not measurements of this body.',
  ],
};
