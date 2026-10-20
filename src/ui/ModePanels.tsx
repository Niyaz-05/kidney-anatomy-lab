import { useEffect, useId, useRef } from 'react';
import { useLab } from '../app/LabContext';
import { effectiveHormone, effectivePhysiology, effectiveStone, RESTING_PHYSIOLOGY } from '../app/state';
import type { Route } from '../contract/schema';
import { SEGMENTS, osmolalityAt, urineColour, urineState, type SegmentId } from '../kidney/tubule';
import { BLADDER, fillingPressure, flowMlMin, peristalsisPerMin, sensation, VOIDING_STEPS } from '../kidney/bladder';
import { PAIN, stoneOutcome } from '../kidney/stones';
import { CREATININE_UMOL_PER_MGDL, egfr, STAGES, stageOf } from '../kidney/egfr';
import { HORMONES, hormoneById, type HormoneId } from '../kidney/hormones';
import { measures, ureters } from '../kidney/anchors';
import { BLOOD_IN, BLOOD_OUT, NARROW, URINE, osmColour } from '../viewer/palette';
import { SEGMENT_COLOUR } from '../viewer/NephronView';

function Steps({ route, colour }: { route: Route; colour: string }) {
  const { state, dispatch } = useLab();
  return (
    <ol className="flow-steps">
      {route.steps.map((st, i) => (
        <li key={i}>
          <span className="dot" aria-hidden="true" style={{ background: colour }} />
          {st.structure ? (
            <button type="button" className="link" aria-pressed={state.selected === st.structure} onClick={() => dispatch({ type: 'select', id: st.structure! })}>{st.label}</button>
          ) : (
            <span className="offmodel">{st.label} <span className="tag">not on model</span></span>
          )}
          {st.note && <span className="muted small block">{st.note}</span>}
        </li>
      ))}
    </ol>
  );
}

function PlayButton() {
  const { state, dispatch } = useLab();
  return (
    <button type="button" className="secondary" onClick={() => dispatch({ type: 'set-playing', value: !state.playing })} aria-pressed={!state.playing}>
      {state.playing ? 'Pause' : 'Play'}
    </button>
  );
}

function Radios<T extends string | number | null>({ label, options, value, onChange }: { label: string; options: readonly { id: T; label: string }[]; value: T; onChange: (v: T) => void }) {
  return (
    <div className="seg-toggle wrap" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button key={String(o.id)} type="button" role="radio" aria-checked={value === o.id} onClick={() => onChange(o.id)}>{o.label}</button>
      ))}
    </div>
  );
}

function Slider({ label, min, max, step, value, unit, onChange, text }: { label: string; min: number; max: number; step: number; value: number; unit: string; onChange: (v: number) => void; text?: string }) {
  const id = useId();
  return (
    <div className="field slider-field">
      <label htmlFor={id} className="small"><span>{label}</span> <strong>{text ?? `${value} ${unit}`}</strong></label>
      <input id={id} type="range" min={min} max={max} step={step} value={value} aria-valuetext={text ?? `${value} ${unit}`} onChange={(e) => onChange(Number(e.target.value))} />
    </div>
  );
}

const f0 = (x: number) => Math.round(x).toLocaleString('en-GB');
const f1 = (x: number) => x.toFixed(1);

/** Blood flow: the route and the numbers. */
export function BloodPanel() {
  const { def } = useLab();
  const id = useId();
  return (
    <section className="sheet blood-panel" aria-labelledby={`${id}-title`}>
      <div className="detail-head"><h2 id={`${id}-title`} className="panel-title">Blood through the kidney</h2><PlayButton /></div>
      <p className="small">{def.bloodRoute.description} The kidneys are cut open from the front: <span style={{ color: BLOOD_IN }}>bright red</span> blood flows in, <span style={{ color: BLOOD_OUT }}>dark</span> blood flows out.</p>
      <Steps route={def.bloodRoute} colour={BLOOD_IN} />
      <ul className="facts small">{def.bloodRoute.facts.map((f) => <li key={f}>{f}</li>)}</ul>
      <p className="muted small">{def.bloodRoute.assumptions[0]}</p>
    </section>
  );
}

/** Concentration along a long loop and the collecting duct, as a small chart. */
function OsmChart({ urineOsm }: { urineOsm: number }) {
  const parts: [SegmentId, string][] = [['pct', 'PCT'], ['descending', 'Desc.'], ['thin-ascending', 'Thin'], ['thick-ascending', 'Thick'], ['dct', 'DCT'], ['collecting', 'CD']];
  const W = 260, H = 110, x0 = 30, w = (W - x0 - 6) / parts.length, y = (o: number) => H - 18 - (o / 1300) * (H - 30);
  const path = parts.map(([seg], i) => Array.from({ length: 11 }, (_, k) => `${i || k ? 'L' : 'M'} ${(x0 + i * w + (k / 10) * w).toFixed(1)} ${y(osmolalityAt(seg, k / 10, urineOsm)).toFixed(1)}`).join(' ')).join(' ');
  return (
    <svg className="osm-chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Concentration of the tubular fluid: 300 mOsm/kg in the proximal tubule, rising to 1,200 at the bend of a long loop, falling to 100 in the distal tubule, then ${Math.round(urineOsm)} at the end of the collecting duct.`}>
      {[300, 600, 900, 1200].map((o) => <g key={o}><line x1={x0} x2={W - 6} y1={y(o)} y2={y(o)} stroke="currentColor" strokeOpacity={0.12} /><text x={x0 - 4} y={y(o) + 3} fontSize="7" textAnchor="end" fill="currentColor">{o}</text></g>)}
      {parts.map(([seg, l], i) => <g key={seg}><rect x={x0 + i * w} y={H - 16} width={w - 1} height={3} fill={SEGMENT_COLOUR[seg]} /><text x={x0 + i * w + w / 2} y={H - 4} fontSize="7" textAnchor="middle" fill="currentColor">{l}</text></g>)}
      <path d={path} fill="none" stroke="#e8a23a" strokeWidth={1.6} />
      <text x={x0} y={9} fontSize="7" fill="currentColor" opacity={0.7}>mOsm/kg</text>
    </svg>
  );
}

/** The nephron: what each part does; the hormones' targets are linked from the Hormones view. */
export function NephronPanel() {
  const { def, state, dispatch } = useLab();
  const id = useId();
  const p = effectivePhysiology(def, state);
  const u = urineState(p, p.water, p.glucose);
  const seg = SEGMENTS.find((s) => s.id === state.segment);
  return (
    <section className="sheet nephron-panel" aria-labelledby={`${id}-title`}>
      <div className="detail-head"><h2 id={`${id}-title`} className="panel-title">The nephron</h2><PlayButton /></div>
      <p className="small">Two nephrons in a pyramid of the left kidney: a <strong>juxtamedullary</strong> nephron with a long loop reaching towards the papilla (about 15 % of nephrons) and a <strong>cortical</strong> nephron with a short loop. Click a part.</p>
      <ul className="segment-list small">
        {SEGMENTS.map((s) => (
          <li key={s.id}>
            <button type="button" aria-pressed={state.segment === s.id} onClick={() => dispatch({ type: 'set-segment', value: s.id })}>
              <span className="dot" aria-hidden="true" style={{ background: SEGMENT_COLOUR[s.id] }} />{s.label}
            </button>
          </li>
        ))}
      </ul>
      {seg && (
        <div className="segment-detail" aria-live="polite" data-segment={seg.id}>
          <h3 className="group-title">{seg.label}</h3>
          <p className="small">{seg.does}</p>
          {seg.id !== 'glomerulus' && <p className="small muted">Takes back about {Math.round(seg.sodium * 100)} % of the filtered sodium and {seg.water === 'adh' ? `the water ADH allows (now ${Math.round((1 - u.water.waterExcretedShare - 0.8) * 100)} % of the filtered water)` : `${Math.round((seg.water as number) * 100)} % of the water`}.</p>}
        </div>
      )}
      <h3 className="group-title">Concentration along the tubule</h3>
      <OsmChart urineOsm={u.water.urineOsm} />
      <p className="legend-row small">
        <span><span className="dot" style={{ background: osmColour(100) }} aria-hidden="true" /> dilute</span>
        <span><span className="dot" style={{ background: osmColour(300) }} aria-hidden="true" /> like plasma (300)</span>
        <span><span className="dot" style={{ background: osmColour(1200) }} aria-hidden="true" /> concentrated</span>
      </p>
      <p className="muted small">The tubes are drawn about 4 times wider than life and their courses are illustrations; the depths of the cortex ({Math.round(measures.nephronAnchor.cortexThicknessMm ?? 0)} mm) and pyramid ({Math.round(measures.nephronAnchor.heightMm)} mm) are this kidney’s. The particles show the filtrate, coloured by its concentration; set the water you drink in the Filtering view.</p>
    </section>
  );
}

/** Filtering: Starling forces, autoregulation, ADH and glucose. */
export function FilteringPanel() {
  const { def, state, dispatch } = useLab();
  const id = useId();
  const p = effectivePhysiology(def, state);
  const u = urineState(p, p.water, p.glucose);
  const f = u.filtration, w = u.water;
  const set = (v: Partial<typeof p>) => dispatch({ type: 'set-physiology', value: v });
  const touring = state.mode === 'tour';
  return (
    <section className="sheet filtering-panel" aria-labelledby={`${id}-title`}>
      <div className="detail-head"><h2 id={`${id}-title`} className="panel-title">Filtering and urine</h2><button type="button" className="secondary" disabled={touring} onClick={() => dispatch({ type: 'reset-physiology' })}>Reset</button></div>
      <p className="small">The glomerulus of the long-loop nephron, with its afferent (in) and efferent (out) arterioles.</p>
      <fieldset className="plain" disabled={touring}>
        <Slider label="Mean blood pressure" min={30} max={220} step={1} value={p.map} unit="mmHg" onChange={(v) => set({ map: v })} />
        <Slider label="Narrow the afferent arteriole" min={0} max={1} step={0.05} value={p.afferent} unit="" text={p.afferent ? `${Math.round(p.afferent * 100)} %` : 'no'} onChange={(v) => set({ afferent: v })} />
        <Slider label="Narrow the efferent arteriole" min={0} max={1} step={0.05} value={p.efferent} unit="" text={p.efferent ? `${Math.round(p.efferent * 100)} %` : 'no'} onChange={(v) => set({ efferent: v })} />
      </fieldset>
      <table className="starling small" aria-label="Starling forces across the glomerulus">
        <tbody>
          <tr><th scope="row">Blood pressure in the glomerulus</th><td data-pgc={f.glomerularPressure.toFixed(1)}>+{f1(f.glomerularPressure)} mmHg</td></tr>
          <tr><th scope="row">Pressure in Bowman’s capsule</th><td>−{f1(f.capsularPressure)} mmHg</td></tr>
          <tr><th scope="row">Pull of the blood proteins (oncotic)</th><td>−{f1(f.oncoticPressure)} mmHg</td></tr>
          <tr className="total"><th scope="row">Net filtration pressure</th><td data-nfp={f.netPressure.toFixed(2)}>{f1(f.netPressure)} mmHg</td></tr>
        </tbody>
      </table>
      <dl className="readout" aria-live="polite">
        <div><dt>Filtration rate (GFR)</dt><dd data-gfr={f.gfr.toFixed(1)} className={f.gfr < 60 ? 'warn' : 'ok'}>{f0(f.gfr)} mL/min · {f0(f.gfrPerDay)} L/day</dd></div>
        <div><dt>Blood flow (both kidneys)</dt><dd>{f0(f.rbf)} mL/min</dd></div>
        <div><dt>Share of plasma filtered</dt><dd>{Math.round(f.filtrationFraction * 100)} %</dd></div>
        <div><dt>Autoregulation</dt><dd>{f.autoregulated ? 'holding the flow steady' : p.map < 80 ? 'below its range (80–180 mmHg)' : p.map > 180 ? 'above its range' : 'overridden by the narrowed arterioles'}</dd></div>
      </dl>

      <h3 className="group-title">Water and ADH</h3>
      <fieldset className="plain" disabled={touring}>
        <Slider label="Water taken in" min={0.5} max={8} step={0.1} value={p.water} unit="L/day" onChange={(v) => set({ water: v })} />
      </fieldset>
      <div className="urine-row">
        <span className="urine-cup" style={{ background: urineColour(w.urineOsm) }} aria-hidden="true" />
        <dl className="readout" aria-live="polite">
          <div><dt>Urine</dt><dd data-urine={w.urineL.toFixed(2)}>{w.urineL.toFixed(1)} L/day · {f0(w.urineOsm)} mOsm/kg</dd></div>
          <div><dt>ADH</dt><dd data-adh={w.adh.toFixed(2)}>{w.adh > 0.66 ? 'high' : w.adh > 0.2 ? 'moderate' : 'low'}{w.adh > 0.5 ? ': water channels open, urine concentrated' : ': collecting ducts let little water out'}</dd></div>
        </dl>
      </div>
      {w.dehydrating && <p className="small warn">Not enough water: the kidneys cannot make less than about 0.5 L a day to carry the body’s wastes, so the body is drying out. Thirst rises.</p>}
      {w.overloaded && <p className="small warn">More water than the kidneys can excrete (urine cannot be more dilute than about 50 mOsm/kg): the blood would become dilute.</p>}
      <p className="muted small">Steady state with about 600 mOsm of solute to excrete a day and 0.7 L of other water losses (skin, breath, faeces, minus water made by metabolism).</p>

      <h3 className="group-title">Glucose</h3>
      <fieldset className="plain" disabled={touring}>
        <Slider label="Blood glucose" min={50} max={500} step={5} value={p.glucose} unit="mg/dL" text={`${p.glucose} mg/dL (${(p.glucose / 18).toFixed(1)} mmol/L)`} onChange={(v) => set({ glucose: v })} />
      </fieldset>
      <p className="small" aria-live="polite" data-glucosuria={u.glucose.inUrine ? 'yes' : 'no'}>
        {u.glucose.inUrine ? <><strong>Glucose in the urine</strong> ({f0(u.glucose.excreted)} mg/min): the carriers in the proximal tubule are full (about 375 mg/min). This happens in uncontrolled diabetes.</> : <>No glucose in the urine: the proximal tubule takes it all back.</>}
      </p>
      {p.map !== RESTING_PHYSIOLOGY.map || p.afferent || p.efferent ? null : <p className="muted small">Try lowering the blood pressure below 80 mmHg, or narrowing the efferent arteriole as angiotensin II does.</p>}
    </section>
  );
}

/** Urine: the route, peristalsis, and filling and emptying the bladder. */
export function UrinePanel() {
  const { def, state, dispatch } = useLab();
  const id = useId();
  const p = effectivePhysiology(def, state);
  const u = urineState(p, p.water, p.glucose);
  const flow = flowMlMin(u.water.urineL);
  const waves = peristalsisPerMin(u.water.urineL);
  const ml = state.bladderMl;
  const sens = sensation(ml);
  // Fill at 10 simulated minutes per second; empty at about 20 mL/s during voiding.
  const last = useRef<number | null>(null);
  useEffect(() => {
    if (!state.playing || state.mode === 'tour') return;
    const t = setInterval(() => {
      const now = performance.now(), dt = last.current === null ? 0.1 : Math.min(0.5, (now - last.current) / 1000);
      last.current = now;
      if (state.voiding) {
        const next = ml - 20 * dt;
        dispatch({ type: 'set-bladder', value: Math.max(0, next) });
        if (next <= 5) dispatch({ type: 'set-voiding', value: false });
      } else if (ml < BLADDER.capacityMl) {
        dispatch({ type: 'set-bladder', value: ml + flow * 10 * dt });
      }
    }, 100);
    return () => { clearInterval(t); last.current = null; };
  }, [state.playing, state.voiding, state.mode, ml, flow, dispatch]);
  const step = state.voiding ? Math.min(VOIDING_STEPS.length - 1, 2 + Math.floor(((400 - ml) / 400) * 3)) : ml >= BLADDER.firstUrgeMl ? 1 : 0;
  return (
    <section className="sheet urine-panel" aria-labelledby={`${id}-title`}>
      <div className="detail-head"><h2 id={`${id}-title`} className="panel-title">The path of urine</h2><PlayButton /></div>
      <p className="small">{def.urineRoute.description}</p>
      <dl className="readout" aria-live="polite">
        <div><dt>Urine made</dt><dd>{u.water.urineL.toFixed(1)} L/day · {flow.toFixed(1)} mL/min</dd></div>
        <div><dt>Ureter waves</dt><dd data-waves={waves.toFixed(1)}>{waves.toFixed(1)} a minute (watch the ureters)</dd></div>
      </dl>
      <h3 className="group-title">The bladder</h3>
      <div className="bladder-gauge" role="meter" aria-label="Bladder volume" aria-valuemin={0} aria-valuemax={600} aria-valuenow={Math.round(ml)} data-ml={Math.round(ml)}>
        <span className="bar" style={{ width: `${Math.min(100, (ml / 600) * 100)}%`, background: urineColour(u.water.urineOsm) }} />
        <span className="mark" style={{ left: `${(BLADDER.firstUrgeMl / 600) * 100}%` }} title="First urge" />
        <span className="mark" style={{ left: `${(BLADDER.strongUrgeMl / 600) * 100}%` }} title="Strong urge" />
      </div>
      <p className="small" aria-live="polite"><strong>{Math.round(ml)} mL</strong> · pressure {f1(state.voiding ? BLADDER.voidingPressureCmH2O : fillingPressure(ml))} cmH₂O · {state.voiding ? 'emptying' : sens === 'none' ? 'no urge yet' : sens === 'first-urge' ? 'first urge to urinate' : sens === 'strong-urge' ? 'strong urge: hard to hold on' : 'full'}</p>
      <div className="button-row">
        <button type="button" className="secondary" disabled={state.voiding} onClick={() => dispatch({ type: 'set-bladder', value: BLADDER.strongUrgeMl })}>Fill to 400 mL</button>
        <button type="button" disabled={state.voiding || ml < 50} onClick={() => dispatch({ type: 'set-voiding', value: true })}>Empty the bladder</button>
      </div>
      <ol className="flow-steps small" aria-label="The micturition reflex">
        {VOIDING_STEPS.map((s, i) => (
          <li key={s.id} className={i === step ? 'is-current' : undefined}>
            <span className="dot" aria-hidden="true" style={{ background: i <= step ? URINE : 'transparent', borderColor: URINE }} />
            <strong>{s.label}</strong>
            <span className="muted block">{s.text}</span>
          </li>
        ))}
      </ol>
      <h3 className="group-title">Route</h3>
      <Steps route={def.urineRoute} colour={URINE} />
      <p className="muted small">The bladder fills 10 times faster than in life here. Its pressure stays low as it fills because the wall relaxes; the stretch of the dome is drawn from the volume. {def.urineRoute.assumptions[0]}</p>
    </section>
  );
}

const SIZES = [2, 4, 5, 7, 9, 12];

/** Kidney stones: drop one in; where it stops; the chance it passes. */
export function StonesPanel() {
  const { def, state, dispatch } = useLab();
  const id = useId();
  const size = effectiveStone(def, state);
  const o = size !== null ? stoneOutcome(size) : null;
  const n = ureters.left.narrow;
  return (
    <section className="sheet stones-panel" aria-labelledby={`${id}-title`}>
      <div className="detail-head"><h2 id={`${id}-title`} className="panel-title">Kidney stones</h2></div>
      <p className="small">Stones form when salts in the urine (most often calcium oxalate) crystallise. A stone that leaves the kidney can stick at one of the ureter’s <span style={{ color: NARROW }}>three narrow points</span>, shown as rings:</p>
      <ol className="small narrow-list">
        {n.map((x) => <li key={x.id}><strong>{x.name}</strong> <span className="muted">({Math.round(x.arcMm / 10)} cm down the left ureter)</span></li>)}
      </ol>
      <h3 className="group-title">Drop a stone into the left kidney</h3>
      <div className="seg-toggle wrap" role="group" aria-label="Stone size">
        {SIZES.map((s) => (
          <button key={s} type="button" aria-pressed={size === s} disabled={state.mode === 'tour'} onClick={() => dispatch({ type: 'drop-stone', size: s })}>{s} mm</button>
        ))}
      </div>
      {o && (
        <div aria-live="polite" data-stops={o.stopsAt ?? 'bladder'}>
          <p className="small"><strong>{o.sizeMm} mm stone:</strong> {o.stopsAt ? <>stops at the {n.find((x) => x.id === o.stopsAt)!.name.toLowerCase()}.</> : <>reaches the bladder and is passed in the urine.</>}</p>
          <p className="small">{o.passText}</p>
          <p className="small"><strong>Pain:</strong> {o.stopsAt ? PAIN[o.stopsAt] : 'Often colicky pain while it moves, which settles once it reaches the bladder.'}</p>
        </div>
      )}
      <p className="muted small">Pass rates from the EAU/AUA guideline (Preminger et al. 2007). Where a stone stops differs between people: here stones over 10 mm stop at the pelviureteric junction and stones over 5 mm at the vesicoureteric junction, usually the narrowest point. The HuBMAP ureter is drawn thinner (about {f1(ureters.left.medianWidthMm)} mm) than a living one (about 3–5 mm), so the stone looks large against it.</p>
      <p className="muted small">Drinking enough water to make over 2 L of urine a day is the main way to prevent stones.</p>
    </section>
  );
}

/** Kidney function: eGFR from creatinine (CKD-EPI 2021) and the KDIGO stages. */
export function FunctionPanel() {
  const { state, dispatch } = useLab();
  const id = useId();
  const e = state.egfr;
  const mgdl = e.unit === 'mg/dL' ? e.creatinine : e.creatinine / CREATININE_UMOL_PER_MGDL;
  const g = egfr(mgdl, e.age, e.sex);
  const st = Number.isFinite(g) ? stageOf(g) : null;
  const set = (v: Partial<typeof e>) => dispatch({ type: 'set-egfr', value: v });
  return (
    <section className="sheet function-panel" aria-labelledby={`${id}-title`}>
      <div className="detail-head"><h2 id={`${id}-title`} className="panel-title">Testing kidney function</h2></div>
      <p className="small">Muscles make creatinine at a steady rate and the glomeruli filter it out, so when filtration falls, creatinine in the blood rises. Doctors estimate the filtration rate (eGFR) from it.</p>
      <form className="egfr-form" onSubmit={(ev) => ev.preventDefault()}>
        <label className="field"><span className="small">Creatinine</span>
          <span className="input-row">
            <input type="number" inputMode="decimal" min={0.1} max={e.unit === 'mg/dL' ? 20 : 1800} step={e.unit === 'mg/dL' ? 0.01 : 1} value={e.creatinine} onChange={(ev) => set({ creatinine: Number(ev.target.value) })} aria-label={`Creatinine in ${e.unit}`} />
            <select value={e.unit} onChange={(ev) => set({ unit: ev.target.value as typeof e.unit })} aria-label="Unit">
              <option value="mg/dL">mg/dL</option>
              <option value="µmol/L">µmol/L</option>
            </select>
          </span>
        </label>
        <label className="field"><span className="small">Age (years)</span>
          <input type="number" min={18} max={110} step={1} value={e.age} onChange={(ev) => set({ age: Number(ev.target.value) })} aria-label="Age in years" />
        </label>
        <Radios label="Sex" options={[{ id: 'female', label: 'Female' }, { id: 'male', label: 'Male' }] as const} value={e.sex} onChange={(s) => set({ sex: s })} />
      </form>
      <p className="egfr-result" aria-live="polite" data-egfr={Number.isFinite(g) ? g.toFixed(1) : 'none'}>
        {Number.isFinite(g) ? <>eGFR <strong>{Math.round(g)}</strong> mL/min/1.73 m² · stage <strong>{st!.id}</strong>: {st!.label.toLowerCase()}</> : 'Enter a creatinine above 0 and an age of 18 or more.'}
      </p>
      <div className="stage-bar" role="img" aria-label="KDIGO stages from G1 (90 and over) to G5 (under 15)">
        {[...STAGES].reverse().map((s) => <span key={s.id} className={st?.id === s.id ? 'is-current' : undefined} data-stage={s.id}>{s.id}<small>{s.min === 0 ? '<15' : `≥${s.min}`}</small></span>)}
      </div>
      <p className="muted small">CKD-EPI 2021 equation (no race term): 142 × min(Scr/κ, 1)^α × max(Scr/κ, 1)^−1.2 × 0.9938^age × 1.012 if female, with κ = 0.7 (female) or 0.9 (male) and α = −0.241 or −0.302. Stages from KDIGO 2012. Chronic kidney disease also needs signs of kidney damage, or an eGFR under 60 for three months.</p>
      <p className="small warn">For learning only: not for medical decisions.</p>
    </section>
  );
}

/** Hormones: step through each loop; the 3D view lights the organs at each step. */
export function HormonesPanel() {
  const { def, state, dispatch } = useLab();
  const id = useId();
  const h = effectiveHormone(def, state);
  const hormone = hormoneById(h.id);
  const touring = state.mode === 'tour';
  const stepNow = hormone.steps[h.step]!;
  return (
    <section className="sheet hormones-panel" aria-labelledby={`${id}-title`}>
      <div className="detail-head"><h2 id={`${id}-title`} className="panel-title">Kidney hormones</h2></div>
      <Radios label="Hormone" options={HORMONES.map((x) => ({ id: x.id, label: x.label.replace(' (antidiuretic hormone)', '').replace(' (calcitriol)', '').replace(' (EPO)', '').replace('Atrial natriuretic peptide (ANP)', 'ANP') }))} value={h.id} onChange={(x: HormoneId) => !touring && dispatch({ type: 'set-hormone', value: x })} />
      <p className="small"><strong>When:</strong> {hormone.trigger}. <strong>Result:</strong> {hormone.effect}.</p>
      <ol className="flow-steps small hormone-steps">
        {hormone.steps.map((s, i) => (
          <li key={s.label} className={i === h.step ? 'is-current' : undefined}>
            <span className="dot" aria-hidden="true" style={{ background: i <= h.step ? '#f0a020' : 'transparent', borderColor: '#f0a020' }} />
            <span className="step-label">
              <button type="button" className="link" disabled={touring} aria-current={i === h.step ? 'step' : undefined} onClick={() => dispatch({ type: 'hormone-step', value: i })}>{s.label}</button>
              {s.offModel && <span className="tag">{s.offModel.replace('-', ' ')}: not in the model</span>}
            </span>
            {i === h.step && <span className="block">{s.text}</span>}
          </li>
        ))}
      </ol>
      <div className="button-row">
        <button type="button" className="secondary" disabled={touring || h.step === 0} onClick={() => dispatch({ type: 'hormone-step', value: h.step - 1 })}>Back</button>
        <button type="button" disabled={touring || h.step === hormone.steps.length - 1} onClick={() => dispatch({ type: 'hormone-step', value: h.step + 1 })}>Next step</button>
      </div>
      {stepNow.nephron && <p className="muted small">In the Nephron view: {stepNow.nephron === 'jg-cells' ? 'the juxtaglomerular cells sit in the wall of the afferent arteriole, by the macula densa.' : stepNow.nephron === 'collecting' ? 'the collecting duct, in green.' : stepNow.nephron === 'pct' ? 'the proximal tubule, in orange.' : stepNow.nephron === 'dct' ? 'the distal tubule, in purple.' : stepNow.nephron === 'macula-densa' ? 'the macula densa, in the thick ascending limb by the glomerulus.' : 'the tissue between the tubules.'}</p>}
    </section>
  );
}
