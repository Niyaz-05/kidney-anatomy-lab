import { Component, Suspense, useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { OrbitControls, useGLTF, useProgress } from '@react-three/drei';
import * as THREE from 'three';
import { useLab } from '../app/LabContext';
import { KidneyModel, MODEL_URL } from './KidneyModel';
import { CameraRig, type ViewInsets } from './CameraRig';
import { BloodFlow, NarrowMarks, RenalVessels, Stone, UrineFlow } from './FlowParticles';
import { NephronView } from './NephronView';
import { Lighting } from './Lighting';
import { LabelLayer } from './LabelLayer';
import { hasWebGL, prefersReducedMotion } from './webgl';
import { homeBounds } from '../kidney/anchors';
import { effectiveHormone, effectiveMode, effectivePhysiology, effectiveStone } from '../app/state';
import { urineState } from '../kidney/tubule';
import { peristalsisPerMin } from '../kidney/bladder';
import { hormoneById } from '../kidney/hormones';

class SceneBoundary extends Component<{ onError: (e: Error) => void; children: ReactNode }, { failed: boolean }> {
  override state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  override componentDidCatch(error: Error) {
    this.props.onError(error);
  }
  override render() {
    return this.state.failed ? null : this.props.children;
  }
}

function LoadingOverlay() {
  const { active, progress } = useProgress();
  if (!active) return null;
  return (
    <div className="viewer-status" role="status">
      <div className="spinner" aria-hidden="true" />
      Loading the kidneys… {Math.round(progress)}%
    </div>
  );
}

/** Keyboard camera control: arrows orbit, +/- zoom. Esc and 0 are handled by the lab shell. */
function KeyboardOrbit({ host }: { host: React.RefObject<HTMLDivElement | null> }) {
  const camera = useThree((s) => s.camera);
  const controls = useThree((s) => s.controls) as unknown as { target: THREE.Vector3; update(): void } | null;
  const invalidate = useThree((s) => s.invalidate);
  useEffect(() => {
    const el = host.current;
    if (!el || !controls) return;
    const onKey = (e: KeyboardEvent) => {
      const step = Math.PI / 18;
      const offset = camera.position.clone().sub(controls.target);
      const sph = new THREE.Spherical().setFromVector3(offset);
      if (e.key === 'ArrowLeft') sph.theta -= step;
      else if (e.key === 'ArrowRight') sph.theta += step;
      else if (e.key === 'ArrowUp') sph.phi = Math.max(0.05, sph.phi - step);
      else if (e.key === 'ArrowDown') sph.phi = Math.min(Math.PI - 0.05, sph.phi + step);
      else if (e.key === '+' || e.key === '=') sph.radius *= 0.85;
      else if (e.key === '-' || e.key === '_') sph.radius /= 0.85;
      else return;
      e.preventDefault();
      camera.position.copy(controls.target).add(new THREE.Vector3().setFromSpherical(sph));
      camera.lookAt(controls.target);
      controls.update();
      invalidate();
    };
    el.addEventListener('keydown', onKey);
    return () => el.removeEventListener('keydown', onKey);
  }, [host, camera, controls, invalidate]);
  return null;
}

const NO_INSETS: ViewInsets = { left: 0, right: 0, top: 0, bottom: 0 };

export function LabViewer({ insets = NO_INSETS }: { insets?: ViewInsets }) {
  const { def, state, dispatch } = useLab();
  const [webgl] = useState(hasWebGL);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [ready, setReady] = useState(false);
  const onReady = useCallback(() => setReady(true), []);
  const [reducedMotion, setReducedMotion] = useState(prefersReducedMotion);
  const host = useRef<HTMLDivElement>(null);
  const labels = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReducedMotion(mq.matches);
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);

  const mode = effectiveMode(def, state);
  const physiology = effectivePhysiology(def, state);
  const urine = urineState(physiology, physiology.water, physiology.glucose);
  const stone = effectiveStone(def, state);
  const hormone = effectiveHormone(def, state);
  const flowOn = mode === 'blood' || mode === 'urine' || mode === 'stones' || mode === 'nephron' || mode === 'filtering';
  const animating = flowOn && state.playing && !reducedMotion;
  const nephronOn = mode === 'nephron' || mode === 'filtering';

  if (!webgl) {
    return (
      <div className="viewer viewer-fallback" role="note">
        <h2>3D view unavailable</h2>
        <p>This browser or device could not start WebGL, which the 3D model needs. You can still use the structure list, search and explanations, and the filtering, kidney test and hormone panels.</p>
        <p className="muted">To get the 3D view, turn on hardware acceleration in your browser settings or try another browser.</p>
      </div>
    );
  }

  const [lo, hi] = homeBounds(def, mode);
  const radius = new THREE.Vector3(...lo).distanceTo(new THREE.Vector3(...hi)) / 2;
  const modelRadius = Math.max(radius, 0.06);

  return (
    <div
      className="viewer"
      ref={host}
      tabIndex={0}
      data-ready={ready && !error ? 'true' : 'false'}
      aria-label="3D model of the kidneys and urinary tract. Drag to rotate, scroll or pinch to zoom, right-drag to pan. Arrow keys rotate, plus and minus zoom."
    >
      {error ? (
        <div className="viewer-status is-error" role="alert">
          <strong>The 3D model could not be loaded.</strong>
          <span className="muted">{error}</span>
          <button
            type="button"
            onClick={() => {
              // The loader caches a failed request; drop it so the retry really fetches again.
              useGLTF.clear(MODEL_URL);
              setError(null);
              setReady(false);
              setAttempt((n) => n + 1);
            }}
          >
            Try again
          </button>
        </div>
      ) : (
        <SceneBoundary key={attempt} onError={(e) => setError(e.message || 'Unknown error')}>
          <Canvas
            frameloop={animating ? 'always' : 'demand'}
            dpr={[1, 2]}
            camera={{ fov: 32, near: 0.0002, far: 5, position: [0, 0, radius * 4] }}
            gl={{ antialias: true, alpha: true, stencil: true, powerPreference: 'high-performance' }}
            onPointerMissed={(e) => { if (e.type === 'click') dispatch({ type: 'hover', id: null }); }}
            onCreated={({ gl }) => {
              gl.localClippingEnabled = true;
              gl.domElement.addEventListener('webglcontextlost', (ev) => {
                ev.preventDefault();
                setError('The graphics context was lost (the GPU may have been reset).');
              });
            }}
            aria-hidden="true"
          >
            <Lighting />
            <Suspense fallback={null}>
              <KidneyModel onReady={onReady} />
            </Suspense>
            {mode === 'blood' && <RenalVessels />}
            {mode === 'blood' && <BloodFlow playing={state.playing} reducedMotion={reducedMotion} />}
            {mode === 'urine' && <UrineFlow playing={state.playing} reducedMotion={reducedMotion} wavesPerMin={peristalsisPerMin(urine.water.urineL)} voiding={state.voiding} />}
            {mode === 'stones' && <NarrowMarks />}
            {mode === 'stones' && stone !== null && <Stone key={`${stone}-${state.stoneNonce}`} sizeMm={stone} nonce={state.stoneNonce} reducedMotion={reducedMotion} />}
            {nephronOn && (
              <NephronView
                segment={state.segment}
                onSegment={(id) => dispatch({ type: 'set-segment', value: id })}
                urineOsm={urine.water.urineOsm}
                flowScale={urine.filtration.gfr / 125}
                afferent={physiology.afferent}
                efferent={physiology.efferent}
                playing={state.playing}
                reducedMotion={reducedMotion}
                labels={state.labels}
                pointOut={mode === 'nephron' && state.mode === 'hormones' ? hormoneById(hormone.id).steps[hormone.step]?.nephron ?? null : null}
              />
            )}
            <OrbitControls
              makeDefault
              enableDamping={!reducedMotion}
              dampingFactor={0.12}
              minDistance={nephronOn ? 0.0015 : radius * 0.25}
              maxDistance={nephronOn ? 0.15 : modelRadius * 6}
              zoomToCursor
              rotateSpeed={0.8}
            />
            <CameraRig reducedMotion={reducedMotion} insets={insets} />
            <KeyboardOrbit host={host} />
            <LabelLayer container={labels} />
          </Canvas>
          <LoadingOverlay />
        </SceneBoundary>
      )}
      <div className="label-layer" ref={labels} />
    </div>
  );
}
