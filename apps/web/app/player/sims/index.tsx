import { type ComponentType, lazy, Suspense, useCallback } from "react";
import { type BeatProps, obj, usePlayer } from "../shared";
import type { SimProps } from "./sim-props";
import "./sims.css";

// The simulators (Platform STEP 12): each kind is its own chunk, loaded when a topic reaches it.

const SIMS: Record<string, ComponentType<SimProps>> = {
  piano_chord: lazy(() => import("./piano")),
  guitar_chord: lazy(() => import("./guitar")),
  camera_exposure: lazy(() => import("./camera")),
  compound_interest: lazy(() => import("./interest")),
  css_flex: lazy(() => import("./flex")),
  fraction_pie: lazy(() => import("./pie")),
  ohm: lazy(() => import("./ohm")),
  equation_balance: lazy(() => import("./equation")),
  chess_mate_in_one: lazy(() => import("./chess")),
  color_wheel: lazy(() => import("./wheel")),
  roleplay: lazy(() => import("./roleplay")),
  cpr_rhythm: lazy(() => import("./rhythm")),
  step_sequencer: lazy(() => import("./sequencer")),
};

export function SimBeat({ beat, result, setSubmission }: BeatProps) {
  const { words } = usePlayer();
  const sim = obj(beat.data.sim);
  const Sim = SIMS[String(sim.kind)];
  const setState = useCallback(
    (state: Record<string, unknown> | null) => setSubmission(state ? { state } : null),
    [setSubmission],
  );
  if (!Sim) {
    return null;
  }
  return (
    <Suspense
      fallback={
        <div className="p-stage s-loading" aria-busy="true">
          {words.loading}
        </div>
      }
    >
      <div className="p-in d2">
        <Sim sim={sim} setState={setState} result={result} />
      </div>
    </Suspense>
  );
}
