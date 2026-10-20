# Architecture

The kidney lab shares the heart, lungs, brain, digestive and eye labs' design: a validated, data-only **`SimulationDefinition`** rendered by a generic viewer. The code is a deliberate copy of the eye lab, not a shared package, so each lab deploys independently.

## Differences from the eye lab

| Area | Kidney |
|---|---|
| Contract | Modes `explore` / `blood` / `nephron` / `filtering` / `urine` / `stones` / `function` / `hormones` / `tour`. Routes for urine and blood. Tour steps can set a mode, blood pressure, arteriole narrowing, water intake, glucose, stone size, hormone and step, cut and colour |
| Validation | Routes' structures and sources must exist; every `-left` mesh needs its `-right` partner and the reverse, on the side it names; on top of the shared checks |
| Science (`src/kidney/`) | `filtration.ts`: Starling forces with two arteriolar resistances in series, autoregulation of the afferent resistance from 80 to 180 mmHg, and the oncotic pressure rising with the filtration fraction (solved by iteration). `tubule.ts`: each segment's share of sodium and water, water balance and ADH, the concentration along the tubule, glucose against a transport maximum with splay. `egfr.ts`: CKD-EPI 2021 and KDIGO stages. `bladder.ts`: urge points, filling pressure, peristalsis rate, the voiding reflex. `stones.ts`: guideline pass rates and the stopping rule. `hormones.ts`: five hormone loops as ordered steps. `nephron.ts`: the nephron view's layout. All pure and unit-tested |
| Mode views | Each mode shows its own layers (`src/app/modes.ts`). Blood, urine and stones open both kidneys with a frontal cut through their middle; in those views only the kidney's own layers are cut, so the aorta, vena cava, renal vessels and ureters stay whole |
| Kidney model (`KidneyModel.tsx`) | The pyramids carry a stripe shader whose lines converge on the renal pelvis, like the parallel tubules of the medulla. The ureters swell in a travelling bolus, one wave every 10–30 s at 3 cm/s (the wave position comes from `ureterWave`, shared with the particles). The bladder wall stretches about the trigone with the volume, the dome rising most. Positions are read and written through the attribute API, because the glTF attributes are interleaved |
| Flow (`FlowParticles.tsx`) | Blood (bright in, dark out) along the generated routes; urine from each papilla through the calyces and pelvis, then boluses riding the ureter wave, and through the urethra while voiding; particles inside a kidney on the removed side of the cut are hidden. The small renal vessels are merged tubes. Stones roll down the lowest papilla's route to their stopping point; the narrow points are rings |
| Nephron (`NephronView.tsx`) | Tubes laid out in the frame of one real pyramid (its axis, base and cortex thickness from the model), over a wedge shaded by the medulla's rising concentration; clickable segments; filtrate particles coloured by `osmolalityAt`; afferent and efferent arterioles thinned as they are narrowed |
| Cut | The stencil-capped cut with `closeHoles`; the cut position runs across what the mode shows, and a new frontal cut starts in the middle of the kidneys |

The real-tissue look (`tissue.ts`, `Lighting.tsx`, `tools/bake-shading.mjs`) is the same in every lab.

## Asset pipeline

```
HRA united female v1.5 (y − 0.7948 m): kidneys, collecting system, ureters, ─┐
  bladder, renal vessels, aorta, IVC, iliac veins, T11–L6, sacrum, ilia,      ├─ tools/extract-kidney.mjs
  neighbouring organs                                                        │
BodyParts3D (Human Atlas) ─ similarity fits ─ mould, trim ───────────────────┘
        │  69 nodes, ~224k triangles; measurements; ureter narrow points; urine and blood routes;
        │  small renal vessels; urethra (schematic); nephron anchor
        └─ tools/bake-shading.mjs ─▶ public/models/kidney.glb (4.7 MB) · geometry.json · provenance.json
```

**Fitting BodyParts3D.** Three kinds of similarity transform (rotation, uniform scale, shift):
- **ribs** (11th and 12th ribs, diaphragm): Horn's method on the centroids of vertebrae T11–L2 (2.5 mm RMS);
- **spine** (psoas): T12–L5 and the sacrum (7.3 mm RMS). This body has six lumbar vertebrae, so the lower spine is longer than BodyParts3D's;
- **kidney-left / kidney-right** (adrenal glands, segmental and suprarenal vessels): the principal axes of the BodyParts3D kidney are aligned with the HRA kidney's (each axis keeping its sign, since both bodies share one frame), then refined by iterative closest point with the scale fixed by the kidneys' sizes (free-scale ICP shrinks). Surface RMS 5.4 mm left, 6.7 mm right. The vessel centroids are reported but not used, since the two bodies' vessels differ.

Afterwards the adrenal glands, psoas and diaphragm are pushed out of the HRA kidneys where they overlapped, and segmental branches that leave the HRA kidney more than 20 mm from its pelvis are cut off. The common iliac arteries were tried on the pelvis but fitted 30 mm off, so they are not used; the ureter's pelvic-brim narrow point is measured against the HRA common iliac veins.

**Measured on the model.** Kidney length, width and thickness (principal axes of the capsule), kidney volume (the closed outer cortex: 131 mL left, 84 mL right), vertebral levels of the poles and hilum, ureter length along its centre line (276 mm left, 270 mm right) and width, the three narrow points (pelviureteric junction; closest approach to the common iliac vein; entry into the bladder), and the bladder's size, with its volume by the clinical ellipsoid formula (the wall mesh is open).

**Routes.**
- **Urine:** each papilla's tip (its vertex farthest from its pyramid's centre) → the minor calyx it drains into → the major calyx that calyx touches → the pelvis → the ureter's centre line (slices by height) → the ureteral opening → the bladder.
- **Blood:** the aorta's contact with the renal artery, along the artery to the hilum; then, for each pyramid flank, a link through the sinus, an interlobar artery up the flank 0.8 mm outside the pyramid, an arcuate artery over the base, and a cortical radiate artery out to 1 mm under the capsule (ray cast). Veins run alongside and back to the vena cava.
- **Nephron anchor:** the left kidney's tallest pyramid: its papilla tip, base centre, axis, height (28 mm) and the cortex thickness above it (11 mm).
