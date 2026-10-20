# Attribution and asset provenance

## 3D model — `models/kidney.glb`

### Sources

1. **3D Reference Organ Set for Female v1.5 (HuBMAP Human Reference Atlas, united female)**, by **Kristen Browne and Heidi Schlehlein** (and HRA contributors), from the Visible Human Female (National Library of Medicine). DOI https://doi.org/10.48539/HBM352.BTSQ.586. Licensed **CC BY 4.0** (https://creativecommons.org/licenses/by/4.0/).
   - Taken as converted by *Female Atlas* (github.com/Niyaz-05/female-atlas, commit `4c2dfcca02739b59827601915128ee64abdff2ea`; its `atlas.json` sha256 `5fec63b2ebcb76ecd9c33027ed725e8ec0a7a76b756f72681285410072ae5c51`). The converter's +0.794760942 m vertical translation is reversed here.
   - It provides both kidneys (capsule, outer cortex, renal columns, 11 + 10 pyramids and papillae, 10 + 10 minor calyces, 4 + 3 major calyces, renal pelvis, renal sinus at the hilum), both ureters, the urinary bladder (dome, base, trigone, neck smooth muscle, both ureteral openings), the renal arteries and veins, the descending aorta, the inferior vena cava, the common iliac veins, vertebrae T11–L6, the sacrum and ilia, and the liver, spleen, pancreas, duodenum, colon, uterus and vagina.
2. **BodyParts3D 4.0**, © The **Database Center for Life Science** (DBCLS), CC BY 4.0. https://dbarchive.biosciencedbc.jp/en/bodyparts3d/download.html
   - The adrenal glands, the segmental branches and anterior and posterior divisions of the renal arteries, the suprarenal arteries and veins, the 11th and 12th ribs, the psoas major muscles and the diaphragm, which the HRA set does not include.
   - Taken as converted by *Human Atlas* (github.com/Niyaz-05/human-atlas, commit `76f069640f2c3dd40a58d1556896ac25008f592e`; its `atlas.json` sha256 `c359f4bcd2cba90b7411d66d5e9fc04dc81294d46cd5c1e8b212c824f2e5bbee`).

Neither HuBMAP nor DBCLS has reviewed or endorsed this lab.

### Changes made (as CC BY 4.0 requires)

`tools/extract-kidney.mjs`:
- Selected and merged the source meshes listed in `src/kidney/source/structures.source.json`; welded coincident vertices; simplified the large HRA meshes with meshoptimizer within a 0.4 % relative error bound; recomputed smooth normals.
- Placed the BodyParts3D parts with similarity transforms (rotation, uniform scale, shift):
  - lower ribs and diaphragm on vertebrae T11–L2 (Horn's method on centroids; 2.5 mm RMS);
  - psoas on T12–L5 and the sacrum (7.3 mm RMS; this body has six lumbar vertebrae);
  - adrenal glands, segmental and suprarenal vessels on each kidney, by iterative closest point of the BodyParts3D kidney onto the HRA kidney with the scale fixed by their sizes (5.4 mm RMS left, 6.7 mm right).
- Pushed the adrenal glands, psoas and diaphragm out of the HRA kidneys where they overlapped, and cut off the segmental-artery branches that left the HRA kidney away from its hilum (the two bodies' kidneys differ in shape).
- Generated a schematic female urethra (40 mm long, 6 mm wide) from the bladder neck along the front of the vagina; the HRA body has no urethra and the BodyParts3D urethra is male.
- Measured the kidneys, ureters and bladder; found the ureter's three narrow points; computed the urine routes (papilla → calyces → pelvis → ureter → bladder) and blood routes; and generated illustrative interlobar, arcuate and cortical radiate vessels that follow the real pyramids and capsule.
- Translated so that the middle of the urinary tract is the origin.

`tools/bake-shading.mjs` then adds a per-vertex `_TISSUE` attribute: ambient occlusion and a noise value, for the real-tissue look.

The output is `models/kidney.glb` (4,657,840 bytes, 224,315 triangles, sha256 `f6856c6b94bd1000ee1d4f606f1eb38483043f50fd9a770088c5b8224bf12b0a`). Every input hash is in `src/kidney/generated/provenance.json`.

### Scientific sources for the simulations

- Anatomy and physiology text, filtration pressures, bladder volumes: OpenStax *Anatomy and Physiology 2e*, ch. 25 (§25.1–25.9) and §7.3–7.4, CC BY 4.0.
- Tubular reabsorption shares, water balance (table 25-1), glucose transport maximum: Hall JE, Hall ME. *Guyton and Hall Textbook of Medical Physiology*, 14th ed., 2021.
- Autoregulation range: Boron WF, Boulpaep EL. *Medical Physiology*, 3rd ed., 2017, ch. 34.
- eGFR: Inker LA et al. New creatinine- and cystatin C-based equations to estimate GFR without race. *N Engl J Med* 2021;385:1737–1749. Stages: KDIGO 2012 CKD guideline.
- Stone passage: Preminger GM et al. 2007 Guideline for the management of ureteral calculi (EAU/AUA). *J Urol* 2007;178:2418–2434.
- Ureter peristalsis: *Campbell-Walsh-Wein Urology*, 12th ed., 2020.
