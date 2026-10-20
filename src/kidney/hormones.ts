/**
 * The kidney's hormone loops as ordered steps (pure data). Each step names where it happens: a
 * structure in the 3D model (highlighted) or an organ that is not modelled. Following OpenStax A&P
 * 2e §25.8 ("Endocrine Regulation of Kidney Function") and §25.9, and Guyton & Hall 14e ch. 28–30.
 */
export type HormoneId = 'raas' | 'adh' | 'epo' | 'vitamin-d' | 'anp';

export interface HormoneStep {
  label: string;
  text: string;
  /** Model structures to highlight. */
  focus: readonly string[];
  /** An organ that is not in the model. */
  offModel?: 'liver' | 'lungs' | 'brain' | 'heart' | 'bone-marrow' | 'skin' | 'gut' | 'blood';
  /** In the nephron view, the part that acts. */
  nephron?: 'jg-cells' | 'macula-densa' | 'collecting' | 'pct' | 'dct' | 'interstitium';
}

export interface Hormone {
  id: HormoneId;
  label: string;
  trigger: string;
  effect: string;
  steps: readonly HormoneStep[];
}

const KIDNEYS = ['kidney-left', 'kidney-right'] as const;
const ADRENALS = ['adrenal-gland-left', 'adrenal-gland-right'] as const;

export const HORMONES: readonly Hormone[] = [
  {
    id: 'raas', label: 'Renin–angiotensin–aldosterone', trigger: 'Blood pressure or sodium falls', effect: 'Blood pressure and volume rise',
    steps: [
      { label: 'Low pressure sensed', text: 'Juxtaglomerular cells in the wall of the afferent arteriole sense the lower pressure; the macula densa senses less salt; sympathetic nerves are active.', focus: [...KIDNEYS], nephron: 'jg-cells' },
      { label: 'Renin released', text: 'The juxtaglomerular cells release the enzyme renin into the blood.', focus: [...KIDNEYS], nephron: 'jg-cells' },
      { label: 'Angiotensin I', text: 'Renin cuts angiotensinogen, a plasma protein made by the liver, into angiotensin I.', focus: [], offModel: 'liver' },
      { label: 'Angiotensin II', text: 'Angiotensin-converting enzyme (ACE), mostly on lung capillaries, turns it into angiotensin II, a powerful vasoconstrictor. ACE-inhibitor medicines block this step.', focus: [], offModel: 'lungs' },
      { label: 'Vessels narrow', text: 'Angiotensin II narrows arterioles all over the body, and the efferent arterioles in the kidney, keeping the filtration pressure up.', focus: ['renal-artery-left', 'renal-artery-right', 'aorta'] },
      { label: 'Aldosterone', text: 'Angiotensin II makes the adrenal cortex release aldosterone, and the brain release ADH and cause thirst.', focus: [...ADRENALS] },
      { label: 'Sodium and water kept', text: 'Aldosterone makes the distal tubule and collecting duct take back more sodium (and water follows) and secrete potassium. Blood volume and pressure rise, and renin falls again: negative feedback.', focus: [...KIDNEYS], nephron: 'collecting' },
    ],
  },
  {
    id: 'adh', label: 'ADH (antidiuretic hormone)', trigger: 'The blood becomes too concentrated, or blood volume falls', effect: 'Less, more concentrated urine',
    steps: [
      { label: 'Osmoreceptors', text: 'Cells in the hypothalamus sense that the blood is too concentrated (a rise of 1–2 %) and cause thirst.', focus: [], offModel: 'brain' },
      { label: 'ADH released', text: 'The posterior pituitary releases ADH (vasopressin) into the blood.', focus: [], offModel: 'brain' },
      { label: 'Water channels', text: 'In the collecting ducts ADH inserts aquaporin-2 water channels into the cell membranes.', focus: [...KIDNEYS], nephron: 'collecting' },
      { label: 'Water leaves the duct', text: 'Water moves out of the duct into the salty medulla and back into the blood: the urine becomes concentrated, up to 1,200 mOsm/kg, and its volume falls to as little as 0.5 L a day.', focus: ['renal-pyramids-left', 'renal-pyramids-right'], nephron: 'interstitium' },
    ],
  },
  {
    id: 'epo', label: 'Erythropoietin (EPO)', trigger: 'Too little oxygen reaches the kidney', effect: 'More red blood cells',
    steps: [
      { label: 'Low oxygen sensed', text: 'Cells between the tubules in the cortex (interstitial fibroblasts) sense low oxygen, for example after blood loss, at high altitude or in anaemia.', focus: [...KIDNEYS], nephron: 'interstitium' },
      { label: 'EPO released', text: 'They release erythropoietin into the blood. The kidneys make about 90 % of the body’s EPO.', focus: [...KIDNEYS] },
      { label: 'Bone marrow', text: 'EPO makes the red bone marrow produce more red blood cells; over days the blood carries more oxygen, and EPO falls again. Failing kidneys make too little EPO, which causes anaemia.', focus: ['lumbar-vertebra-3', 'ilium-left', 'ilium-right'], offModel: 'bone-marrow' },
    ],
  },
  {
    id: 'vitamin-d', label: 'Vitamin D (calcitriol)', trigger: 'Blood calcium falls (parathyroid hormone rises)', effect: 'More calcium absorbed from food',
    steps: [
      { label: 'Skin and food', text: 'Vitamin D is made in the skin in sunlight or taken in food.', focus: [], offModel: 'skin' },
      { label: 'Liver', text: 'The liver adds one hydroxyl group (25-hydroxyvitamin D).', focus: [], offModel: 'liver' },
      { label: 'Kidney activates it', text: 'Cells of the proximal tubule add a second one (1α-hydroxylase), making active calcitriol. Parathyroid hormone speeds this up.', focus: [...KIDNEYS], nephron: 'pct' },
      { label: 'Calcium rises', text: 'Calcitriol increases calcium absorption in the gut and calcium reabsorption in the kidney, keeping bones mineralised.', focus: [], offModel: 'gut' },
    ],
  },
  {
    id: 'anp', label: 'Atrial natriuretic peptide (ANP)', trigger: 'Blood volume is high (the heart’s atria stretch)', effect: 'More sodium and water excreted',
    steps: [
      { label: 'Atria stretch', text: 'The heart’s atria release ANP when they are stretched by too much blood.', focus: [], offModel: 'heart' },
      { label: 'More filtration', text: 'ANP widens the afferent arterioles, raising the filtration rate.', focus: [...KIDNEYS], nephron: 'jg-cells' },
      { label: 'Less renin and aldosterone', text: 'It reduces renin, aldosterone and ADH, so the collecting ducts keep less sodium and water: the opposite of the renin–angiotensin–aldosterone system.', focus: [...ADRENALS], nephron: 'collecting' },
    ],
  },
];

export const hormoneById = (id: HormoneId) => HORMONES.find((h) => h.id === id)!;
