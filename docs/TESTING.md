# Testing

Results recorded on 2026-10-20 on Windows 11, Node 22.14.0. Browser tests ran in headless Chromium (Playwright 1.64, software WebGL via SwiftShader, which uses the automatic low-quality mode). The GPU check ran in installed Google Chrome 155 on an AMD Radeon integrated GPU (ANGLE, Direct3D 11).

## Commands

| Check | Command | What it covers |
|---|---|---|
| Types | `npm run typecheck` | TypeScript strict, `noUncheckedIndexedAccess` |
| Unit | `npm test` | Definition and validation gate (no warnings; unapproved asset and a missing left/right partner rejected); one mesh structure per model node; every left/right structure on its side; https-only sources; body layout (adrenals above kidneys, bladder below, aorta left of the vena cava, kidneys behind the colon); measurements in range (kidney length and volume, ureter length, 11 + 10 pyramids, six lumbar vertebrae); urine routes from every papilla into the bladder with no jumps; the three narrow points in order; blood routes through every pyramid; the ureter wave; the nephron frame; reducer (opened views and their frontal cut, mode layers, physiology clamping and reset, stones, bladder, creatinine unit conversion, hormone steps and their focus, tour overrides, cut facing); search (calyx, hilum, suprarenal gland, detrusor, IVC); the structure list names every mesh once; `closeHoles` on synthetic and all model meshes. Science: Starling forces at rest (55 − 15 − 30 = 10 mmHg, GFR 125 mL/min, 180 L/day); autoregulation from 80 to 180 mmHg and loss below; afferent and efferent narrowing; sodium shares (99 %, 65 % proximal, 25 % loop); water balance and ADH (0.5 L at 1,200 mOsm/kg, 50 mOsm/kg without ADH); the loop's concentration profile; glucose threshold; CKD-EPI 2021 worked values and KDIGO stages; bladder urge points and pressure; stone outcomes; hormone step order; the nephron layout's depths and continuous filtrate paths |
| Assets | `npm run validate:assets` | GLB sha256 = provenance, node set = geometry record, finite positions within 0.35 m, unit normals, indices in range, triangle counts, baked `_TISSUE` on every mesh, attribution names HuBMAP, the authors, the organ-set DOI, BodyParts3D, DBCLS, CC BY 4.0 and the source and output hashes |
| Determinism | re-run `tools/extract-kidney.mjs` then `tools/bake-shading.mjs` | Byte-identical `kidney.glb` |
| Build | `npm run build` | Type check + production bundle |
| E2E | `npm run build && npm run e2e` | 23 scenarios below; screenshots in `docs/screenshots/` |

## E2E scenarios (`tests/e2e/lab.spec.ts`)

1. Loads with no console errors; real colours; no details sheet on the main screen.
2. Clicking the model selects the structure under the pointer.
3. Search: "calyx" + Enter selects the left minor calyces; "IVC" and "suprarenal gland" find their structures; no-match message; Escape restores the list.
4. A group (left kidney) lists its 6 parts; a part (pyramids, "11 pyramids") links back to it.
5. Colour by Layers changes the rendered colours.
6. Layers: the nearby organs can be shown; the ureters hidden.
7. Isolate, Zoom to and Reset.
8. Camera presets change the view (from behind).
9. Labels mode: at least 3 labels, none overlapping.
10. Cut: Front faces the front camera with the "back half" hint; Flip faces the back camera with the "front half" hint; Side gives "the left side of the body"; Off; no console errors.
11. Blood: the kidneys open from the front, the route lists the interlobar arteries; Pause/Play; no console errors.
12. Nephron: the concentration chart; the thick ascending limb (loop diuretics) and the collecting duct (aquaporin-2) explain themselves; no console errors.
13. Filtering: net filtration pressure 10.00 mmHg and GFR about 125; at 60 mmHg GFR under 30 and "below its range"; at 150 mmHg back to 125; 1 L of water gives 0.50 L of urine and "drying out"; glucose 250 mg/dL spills into urine; Reset (marked slow).
14. Urine: 2–6 ureter waves a minute; Fill to 400 mL gives the strong urge; Empty the bladder runs until under 60 mL; no console errors (marked slow).
15. Stones: 7 mm stops at the vesicoureteric junction (47 %), 12 mm at the pelviureteric junction, 4 mm reaches the bladder.
16. Kidney test: eGFR 95 by default; creatinine 2.5 mg/dL gives stage G4; switching to µmol/L converts to 221 and keeps G4; male gives 32.5.
17. Hormones: ADH steps (hypothalamus, posterior pituitary); the renin–angiotensin–aldosterone system to its aldosterone step.
18. Guided tour: 14 steps, Next/Back, jump to the last step, Finish (marked slow).
19. Phone 390×844: no horizontal overflow; Structures opens from the dock; picking closes it and shows the details.
20. About (ⓘ): HuBMAP, BodyParts3D, Starling forces, CKD-EPI 2021 and CC BY 4.0 credits; Escape closes.
21. `?nowebgl`: fallback message; the list, details and the kidney test still work.
22. Missing model (HTTP 404): error alert; Try again refetches and loads.
23. Reduced motion: the blood, urine and nephron views without errors.

## Results

| Check | Result |
|---|---|
| `npm run typecheck` | **Pass** |
| `npm test` | **Pass**: 43/43 in 4 files |
| `npm run validate:assets` | **Pass**: 69 nodes, 224,315 triangles, sha256 `f6856c6b94bd…` |
| Determinism | **Pass**: re-extraction gives the same unbaked model (`7833b5dc51ab…`) and re-baking the recorded final sha256 (`f6856c6b94bd…`) |
| `npm run build` | **Pass**. Vite warns about chunk size |
| `npm run e2e` | **Pass**: 23/23. The first full run passed 18 and failed 5. Four failures came from the structure list naming a part twice (inside its group and on its own) and one from a wrong expected stage in the test; after the fixes those five, and the three list-related tests, were run again and passed |
| GPU check (Chrome 155, AMD Radeon, D3D11) | Every mode renders with no console errors. Ready in 11.3 s. Frame rates: 59–61 fps in every mode |

## Defects found and fixed during QA

- **The cut in the blood, urine and stone views removed the aorta and renal arteries with the front of the kidneys**, so blood had nowhere to flow. In those views only the kidney's own layers are cut now.
- **Blood and urine particles were hidden inside the opaque vessels and tissue.** They are drawn over the tissue now; those inside a kidney on the removed side of the cut stay hidden.
- **Some BodyParts3D segmental arteries ran outside the HRA kidney** (the two bodies' kidneys differ in shape). Branches leaving the kidney more than 20 mm from its pelvis are cut off.
- **The first kidney fits collapsed** (free-scale ICP shrank the kidney to a tenth) and then turned a kidney upside down. The scale is now fixed by the kidneys' sizes and each principal axis keeps its sign.
- **The body fit was 26–45 mm off.** This body has six lumbar vertebrae; ribs and diaphragm are now fitted on T11–L2 and the psoas on T12–L5 and the sacrum. The common iliac arteries still fitted 30 mm off and were dropped.
- **The nephron view was muddy and slow (16 fps)**: the whole ghosted kidney filled the screen. It now draws its own wedge of cortex and medulla, shaded by the medulla's concentration (60 fps); its labels sit beside the tubes and under the page's panels.
- **The structure list showed parts twice**, inside their group and on their own. A unit test now checks every mesh is listed once.

## Not verified

- **Physical devices other than one AMD integrated GPU.** No phone, tablet or discrete GPU was tested. Firefox and Safari were not run.
- **Automated accessibility audit.** axe-core is not installed; keyboard paths and ARIA labels were checked by hand and by E2E only.
- **Medical review.** The text follows OpenStax A&P 2e ch. 25, Guyton & Hall and the cited guidelines; no nephrologist or urologist has reviewed it.
- **The physiology models are teaching models.** Filtration uses two resistances and textbook pressures; tubular shares, water balance and ADH are steady-state textbook values; the stone stopping rule is a simplification (the pass rates are the guideline's).
- **The fit of BodyParts3D is approximate**: 5–7 mm for the parts fitted on the kidneys, 2.5–7 mm for those fitted on the spine; the parts come from a male body.
- **Illustrations.** The nephron, the interlobar, arcuate and cortical radiate vessels and the urethra are drawn; the HuBMAP ureter is thinner (about 2 mm) than a living one.
