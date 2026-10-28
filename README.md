# Human Kidney and Urinary System — Interactive 3D Learning Lab

**Live:** https://kidney-anatomy-lab.vercel.app

Works on phones and tablets: the details rise from the bottom in a sheet you can drag, fold or close with a swipe down, and picking a structure frames it above the sheet.

A realistic, interactive 3D urinary system for secondary-school and first-year biology:

- **Real look.** A shiny capsule over the red-brown kidney; cut open, a paler cortex, darker striped pyramids, and pale calyces and pelvis; pale ureters, a pink-tan bladder, yellow adrenal glands, red arteries, blue-purple veins, ivory bone. "Colour" switches to **Layers** to give each layer its own colour.
- **Anatomy explorer.** Both kidneys with their capsule, cortex, renal columns, pyramids, papillae, minor and major calyces, pelvis and sinus; the ureters, bladder (dome, base, trigone, neck, ureteral openings) and urethra; the aorta, vena cava, renal, segmental and adrenal vessels; the adrenal glands; the spine (this body has six lumbar vertebrae), sacrum, ilia, floating ribs, psoas and diaphragm; and the neighbouring organs.
- **Blood flow.** The kidneys open from the front and blood flows from the aorta through the renal artery, segmental, interlobar, arcuate and cortical radiate arteries, and back by the renal vein.
- **Nephron.** A juxtamedullary and a cortical nephron in a wedge of one real pyramid: glomerulus, proximal tubule, loop of Henle, distal tubule and collecting duct, with the filtrate coloured by its concentration and what each part does.
- **Filtering.** Starling forces across the glomerulus (55 − 15 − 30 = 10 mmHg), autoregulation, the afferent and efferent arterioles, water intake and ADH (urine 0.5–12 L/day, 50–1,200 mOsm/kg), and glucose spilling into urine above the transport maximum.
- **Urine.** Urine drips from the papillae, peristaltic waves carry it down the ureters, the bladder fills (urge at about 150 mL) and empties in the voiding reflex.
- **Kidney stones.** Drop a stone and see where it sticks at the ureter's three narrow points, the chance it passes (EAU/AUA guideline) and where the pain is felt.
- **Kidney test.** eGFR from creatinine, age and sex (CKD-EPI 2021) with the KDIGO stages.
- **Hormones.** Step through the renin–angiotensin–aldosterone system, ADH, erythropoietin, vitamin D and ANP.
- **Cut and guided tour.** Slice the body side-to-side, front-to-back or top-to-bottom (the camera turns to face the cut) and take a 14-step tour.

**Educational only.** This is not a clinical tool, and the text has not been reviewed by a physician. The kidneys, urinary tract, main vessels, spine and pelvis are the HuBMAP Human Reference Atlas female organ set; the adrenal glands, segmental and adrenal vessels, lower ribs, psoas and diaphragm are BodyParts3D (DBCLS), fitted onto it. All are CC BY 4.0; see [public/ATTRIBUTION.md](public/ATTRIBUTION.md).

## Run

Requires Node.js ≥ 22.12.

```sh
npm install
npm run dev            # http://localhost:5190
npm run build          # type-check + production build → dist/
npm run preview        # http://localhost:5191
```

Add `?quality=high` or `?quality=low` to the URL to force a rendering quality. By default the lab drops the costly wet coat and sheen on software renderers and when frames stay slow.

## Check

```sh
npm run typecheck
npm test                         # unit tests (Vitest)
npm run validate:assets          # model hash, nodes, geometry sanity, baked shading, attribution
npx playwright install chromium  # once
npm run build && npm run e2e     # browser tests (Playwright)
```

See [docs/TESTING.md](docs/TESTING.md) for results and what is not verified.

## Rebuild the model

`public/models/kidney.glb` is generated from two checkouts:

1. The Female Atlas (`github.com/Niyaz-05/female-atlas`): the HRA united female body.
2. The Human Atlas (`github.com/Niyaz-05/human-atlas`): BodyParts3D.

```sh
node tools/extract-kidney.mjs "<female-atlas>/public/models" "<human-atlas>/public/models"
node tools/bake-shading.mjs
node tools/validate-assets.mjs
```

Both steps are deterministic, and every input and the output are hashed in `src/kidney/generated/provenance.json`, with the BodyParts3D fits, the measurements and the routes.

## Deploy

The site is a Vercel project (Vite preset, output `dist/`) for [github.com/Niyaz-05/kidney-anatomy-lab](https://github.com/Niyaz-05/kidney-anatomy-lab), deployed with `vercel deploy --prod` to https://kidney-anatomy-lab.vercel.app.

## Layout

| Path | What |
|---|---|
| `src/contract/` | Simulation schema (zod), approved-asset registry, validation gate |
| `src/kidney/` | Definition (structures, layers, routes, tour, sources), filtration, tubule and urine, eGFR, bladder, stones, hormones, nephron layout, anchors, generated geometry and provenance |
| `src/app/` | Pure state reducer (modes, colour, cut, physiology, bladder, stones, hormones, eGFR), mode layers, search, React context |
| `src/viewer/` | three.js / react-three-fiber scene: tissue material and lighting, kidney model (pyramid stripes, ureter peristalsis, bladder filling, cut caps), renal vessels, blood and urine particles, stones, nephron view, camera rig, labels |
| `src/ui/` | Panels: structures (colour, cut, layers), details, Blood, Nephron, Filtering, Urine, Stones, Kidney test, Hormones, tour, About |
| `tools/` | Extraction, shading bake and asset validation |
| `tests/unit`, `tests/e2e` | Vitest and Playwright suites |
