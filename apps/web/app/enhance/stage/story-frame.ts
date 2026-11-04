import { at } from "@learning-routes/route-map/at-index";
import { PANELS, type RestingCamera } from "@learning-routes/route-map/landing-cameras";
import type { Point } from "@learning-routes/route-map/landing-curves";
import type { LandingModel } from "@learning-routes/route-map/landing-model";
import type { PerspectiveCamera } from "three";
import { type Leg, type SceneParts, showTube } from "./scene";
import { clamp, lerp, smoothstep, tokenPosition, tokenProgress } from "./story";

// One frame of the model: what the scroll has done to the route, the stops and the pin.

const DONE_AT = [0, 1, 4, 5, 6, 7];
const VISITED = [[0], [1], [2, 4], [5], [6], [7]];

export type StoryState = {
  q: number;
  u: number;
  token: ReturnType<typeof tokenPosition>;
  isSweeping: boolean;
  sweepHead: number;
  extraReveal: number;
  doneInFirst: number;
};

function legProgress(model: LandingModel, legs: Leg[], u: number) {
  const of = (moduleIndex: number, curveIndex: number) =>
    legs.find((leg) => leg.curve === at(at(model.modules, moduleIndex).legs, curveIndex));
  const spine = legs.filter((leg) => model.route.some((r) => r.isSpine && r.curve === leg.curve));
  const order: [Leg | undefined, number][] = [
    [of(0, 1), 0],
    [of(0, 2), 1],
    [of(0, 3), 4],
    [of(0, 4), 5],
    [of(0, 5), 6],
    [spine[1], 7],
    [of(1, 0), 8],
  ];
  return (leg: Leg) => {
    if (leg === spine[0] || leg === of(0, 0)) {
      return 1;
    }
    const entry = order.find(([candidate]) => candidate === leg);
    return entry ? clamp(u - entry[1]) : 0;
  };
}

function setStop(step: SceneParts["steps"][number], state: "todo" | "cur" | "done") {
  if (step.state === state) {
    return;
  }
  step.state = state;
  const isDone = state === "done";
  const isCurrent = state === "cur";
  step.fill.visible = isDone;
  step.check.visible = isDone;
  step.current.visible = isCurrent;
  step.ring.visible = !isDone && !isCurrent;
}

function updateStops(parts: SceneParts, u: number) {
  const [firstSteps, secondSteps] = [
    parts.steps.filter(({ moduleIndex }) => moduleIndex === 0),
    parts.steps.filter(({ moduleIndex }) => moduleIndex === 1),
  ];
  let done = 0;
  firstSteps.forEach((step, i) => {
    const isDone = u >= at(DONE_AT, i) + 0.5;
    done += isDone ? 1 : 0;
    const isHere = at(VISITED, i).some((x) => Math.abs(u - x) < 0.5);
    setStop(step, isDone ? "done" : isHere ? "cur" : "todo");
  });
  secondSteps.forEach((step, i) => {
    setStop(step, i === 0 && u >= 8.5 ? "cur" : "todo");
  });
  return done;
}

function updateExtra(parts: SceneParts, q: number, u: number) {
  const reveal = q >= 3 ? 1 : q < 2 ? 0 : smoothstep(0.02, 0.26, q - 2);
  for (const dots of parts.extraDots) {
    dots.visible = reveal > 0.02;
  }
  parts.extraStops.forEach((stop, k) => {
    const size = clamp(reveal * 1.4 - k * 0.2);
    stop.group.visible = size > 0.01;
    stop.group.scale.setScalar(Math.max(0.001, size));
  });
  at(parts.extraStops, 0).fill.visible = u >= 2.5;
  parts.extraLine.mesh.visible = u >= 2.05 && reveal > 0.5;
  if (parts.extraLine.mesh.visible) {
    showTube(parts.extraLine, 0, clamp(u - 2));
  }
  return reveal;
}

/** Moves everything in the model for this story time. `s` is the eased scroll. */
export function updateStory(
  parts: SceneParts,
  model: LandingModel,
  s: number,
  now: number,
): StoryState {
  const q = Math.max(0, s - 1);
  const u = tokenProgress(q);
  const token = tokenPosition(model, u);
  const isSweeping = q > 0.02 && q < 1;
  const sweepHead = isSweeping ? lerp(-6, parts.routeLength + 4, clamp((q - 0.1) / 0.6)) : -1;
  const progress = legProgress(model, parts.legs, u);
  for (const leg of parts.legs) {
    const done = progress(leg);
    const a =
      isSweeping && done < 1 && leg.moduleIndex < 2 ? (sweepHead - 8 - leg.start) / leg.length : 0;
    const b =
      isSweeping && done < 1 && leg.moduleIndex < 2 ? (sweepHead - leg.start) / leg.length : done;
    showTube(leg.bright, a, b);
    showTube(leg.glow, a, b);
  }
  const extraReveal = updateExtra(parts, q, u);
  const doneInFirst = updateStops(parts, u);
  for (const { mesh, leg } of parts.chevrons) {
    mesh.visible = progress(leg) < 0.5;
  }
  parts.pin.visible = s >= 0.9;
  parts.pin.position.set(token.x, token.y + 0.06, token.z);
  const phase = (now % 1600) / 1600;
  parts.pulse.scale.setScalar(1 + phase * 1.6);
  parts.materials.signalFlat.opacity = 0.45 * (1 - phase);
  return { q, u, token, isSweeping, sweepHead, extraReveal, doneInFirst };
}

/** The ring that opens as the exam is passed. Returns the q to compare with next frame. */
export function updateDoneRing(
  { doneRing, materials }: SceneParts,
  ring: { time: number },
  previousQ: number,
  q: number,
  delta: number,
) {
  if (previousQ < 3.47 && q >= 3.47) {
    ring.time = 0;
  }
  if (ring.time >= 0) {
    ring.time += delta;
    const k = clamp(ring.time / 1.1);
    doneRing.scale.setScalar(1 + k * 2.2);
    materials.doneRing.opacity = 0.6 * (1 - k);
    if (k >= 1) {
      ring.time = -1;
    }
  }
  return q;
}

/** The camera rests at the panel's shot, and moves only in the panel's last 28%. */
export function aimCamera(
  camera: PerspectiveCamera,
  rest: RestingCamera[],
  s: number,
  aspect: number,
) {
  const i = Math.min(PANELS - 1, Math.floor(s));
  const j = Math.min(PANELS - 1, i + 1);
  const k = i === j ? 0 : smoothstep(0.72, 1, s - i);
  const a = at(rest, i);
  const b = at(rest, j);
  const mix = (from: Point, to: Point) =>
    [lerp(from.x, to.x, k), lerp(from.y, to.y, k), lerp(from.z, to.z, k)] as const;
  camera.aspect = aspect;
  camera.updateProjectionMatrix();
  camera.position.set(...mix(a.position, b.position));
  camera.lookAt(...mix(a.target, b.target));
  camera.updateMatrixWorld();
}
