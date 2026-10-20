import { useEffect, useRef } from 'react';
import { useLab } from '../app/LabContext';
import { BLOOD_IN, BLOOD_OUT, LAYER_COLOUR, NARROW, URINE } from '../viewer/palette';

/**
 * Source, scope and credits, kept off the main screen. The HuBMAP and BodyParts3D attribution
 * required by CC BY 4.0 lives here and is reachable from the ⓘ button and the "Source & credits" link.
 */
export function AboutSheet({ onClose }: { onClose: () => void }) {
  const { def } = useLab();
  const title = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    title.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onClose]);

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <section className="about-sheet glass" role="dialog" aria-modal="true" aria-labelledby="about-title" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="ghost sheet-close" onClick={onClose} aria-label="Close">✕</button>
        <p className="eyebrow">Source &amp; scope</p>
        <h2 id="about-title" className="sheet-title" tabIndex={-1} ref={title}>About this lab</h2>
        <p>{def.summary}</p>

        <h3 className="group-title">You will learn to</h3>
        <ul className="objectives">
          {def.learningObjectives.map((o) => <li key={o.id}>{o.text}</li>)}
        </ul>

        <h3 className="group-title">Colours</h3>
        <p className="small muted">
          “Real” shows the organs as they look in a specimen: a shiny capsule over the red-brown kidney, a paler cortex and
          darker striped pyramids, pale calyces, pelvis and ureters, a pink-tan bladder, yellow adrenal glands, red arteries,
          blue-purple veins and ivory bone. “Layers” gives each layer its own colour.
        </p>
        <p className="legend-row">
          {def.layers.map((l) => (
            <span key={l.id}><span className="dot" style={{ background: LAYER_COLOUR[l.id] }} aria-hidden="true" /> {l.label}</span>
          ))}
        </p>
        <p className="legend-row">
          <span><span className="dot" style={{ background: BLOOD_IN }} aria-hidden="true" /> Blood in</span>
          <span><span className="dot" style={{ background: BLOOD_OUT }} aria-hidden="true" /> Blood out</span>
          <span><span className="dot" style={{ background: URINE }} aria-hidden="true" /> Urine</span>
          <span><span className="dot" style={{ background: NARROW }} aria-hidden="true" /> Ureter narrow points</span>
        </p>

        <h3 className="group-title">Simulations</h3>
        <ul className="small disclaimers">
          <li>Filtration: Starling forces with OpenStax’s values (55 − 15 − 30 = 10 mmHg net, 125 mL/min); the afferent and efferent arterioles as two resistances in series, with autoregulation holding the flow steady from about 80 to 180 mmHg; the oncotic pressure rises along the capillary as plasma is filtered.</li>
          <li>Urine: the textbook shares of sodium and water each segment takes back; urine volume from a daily water balance (Guyton &amp; Hall) and about 600 mOsm of solute a day, concentrated between 50 and 1,200 mOsm/kg by ADH; glucose against a transport maximum of 375 mg/min.</li>
          <li>Bladder: urge at about 150 mL, a capacity of about 500 mL; ureter waves 2 to 6 a minute. Kidney stones: pass rates from the EAU/AUA guideline. eGFR: the CKD-EPI 2021 equation; stages from KDIGO 2012.</li>
          {[def.urineRoute, def.bloodRoute].flatMap((r) => r.assumptions).map((a) => <li key={a}>{a}</li>)}
        </ul>

        <h3 className="group-title">Please note</h3>
        <ul className="small disclaimers">
          {def.disclaimers.map((d) => <li key={d}>{d}</li>)}
        </ul>

        <h3 className="group-title">Source</h3>
        <p className="small">
          Kidneys, collecting system, ureters, bladder, renal vessels, aorta, vena cava, spine, pelvis and nearby organs: the
          HuBMAP Human Reference Atlas 3D Reference Organ Set for Female (v1.5), from the Visible Human female, by Kristen Browne,
          Heidi Schlehlein et al. Adrenal glands, segmental and adrenal vessels, lower ribs, psoas and diaphragm: BodyParts3D,
          © The Database Center for Life Science. All licensed under CC Attribution 4.0 International. Neither HuBMAP nor DBCLS
          has reviewed or endorsed this lab.
        </p>
        <div className="link-list small">
          <a href={`${import.meta.env.BASE_URL}ATTRIBUTION.md`} target="_blank" rel="noopener">Attribution and changes made ↗</a>
          <a href="https://doi.org/10.48539/HBM352.BTSQ.586" target="_blank" rel="noopener noreferrer">HRA female organ set ↗</a>
          <a href="https://dbarchive.biosciencedbc.jp/en/bodyparts3d/download.html" target="_blank" rel="noopener noreferrer">BodyParts3D ↗</a>
          <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noopener noreferrer">CC BY 4.0 licence ↗</a>
        </div>
      </section>
    </div>
  );
}
