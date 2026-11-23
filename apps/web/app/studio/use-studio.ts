import type { AssistantText } from "@learning-routes/core/copy/assistant";
import {
  INITIAL_STUDIO_STATE,
  planStations,
  type StudioInput,
  type StudioState,
  studioReducer,
} from "@learning-routes/core/studio/session";
import { type RefObject, useCallback, useEffect, useReducer, useRef, useState } from "react";
import { filled } from "../storefront/words";
import type { StudioTransport } from "./session-transport";
import type { StudioMap } from "./studio-map";
import type { MapStation } from "./studio-map-types";

// The assistant page's two halves (Platform STEP 10): the conversation, folded by the protocol's
// reducer, and the map that follows it. The map is optional: the page works without it.

export function useConversation(connect: () => StudioTransport) {
  const [state, dispatch] = useReducer(studioReducer, INITIAL_STUDIO_STATE);
  const transport = useRef<StudioTransport | null>(null);
  useEffect(() => {
    const opened = connect();
    transport.current = opened;
    const stop = opened.subscribe(dispatch);
    return () => {
      stop();
      opened.close();
    };
  }, [connect]);
  const send = useCallback((input: StudioInput) => transport.current?.send(input), []);
  return { state, send };
}

export interface MapParts {
  canvas: RefObject<HTMLCanvasElement | null>;
  /** The route's list: where it sits, the map does not draw labels. */
  rail: RefObject<HTMLElement | null>;
  overlay: RefObject<HTMLDivElement | null>;
  stage: RefObject<HTMLElement | null>;
}

function isStill() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** Loads the map after the page works, and hands its choices and hover back to the page. */
export function useStudioMap(
  parts: MapParts,
  startLabel: string,
  onChoose: (branch: number) => void,
  onHot: (branch: number) => void,
) {
  const map = useRef<StudioMap | null>(null);
  const [hasMap, setHasMap] = useState(false);
  const [hasFailed, setHasFailed] = useState(false);
  const callbacks = useRef({ onChoose, onHot });
  callbacks.current = { onChoose, onHot };
  useEffect(() => {
    let isCancelled = false;
    // The server never draws the map: without this, the Worker would carry three.js.
    (import.meta.env.SSR
      ? Promise.reject(new Error("no map on the server"))
      : import("./studio-map")
    )
      .then(({ StudioMap }) => {
        const { canvas, overlay, stage, rail } = parts;
        if (isCancelled || !canvas.current || !overlay.current) {
          return;
        }
        map.current = new StudioMap({
          canvas: canvas.current,
          overlay: overlay.current,
          isReducedMotion: isStill(),
          startLabel,
          floor: () => (stage.current?.getBoundingClientRect().top ?? window.innerHeight) - 16,
          // On a phone the route's title spans the width: labels stay below it.
          ceiling: () =>
            window.innerWidth < 720
              ? (document.querySelector(".studio-top")?.getBoundingClientRect().bottom ?? 74)
              : 74,
          inset: () => {
            const list = rail.current;
            return list && list.offsetWidth > 1
              ? window.innerWidth - list.getBoundingClientRect().left
              : 0;
          },
          onChoose: (branch) => callbacks.current.onChoose(branch),
          onHot: (branch) => callbacks.current.onHot(branch),
        });
        setHasMap(true);
      })
      .catch(() => setHasFailed(true));
    return () => {
      isCancelled = true;
      map.current?.dispose();
      map.current = null;
    };
  }, [parts, startLabel]);
  return { map, hasMap, hasFailed };
}

function mapStations(state: StudioState, words: AssistantText): MapStation[] {
  return state.route
    ? planStations(state.route.modules).map((station) => ({
        kind: station.kind,
        label:
          station.kind === "module"
            ? filled(words.moduleN, { n: station.moduleIndex + 1 })
            : words.newLesson,
        sublabel: station.title,
        isNew: station.isNew,
      }))
    : [];
}

/** Draws what changed in the conversation since the map last drew it. */
export function syncMap(
  map: StudioMap,
  before: StudioState,
  state: StudioState,
  words: AssistantText,
  pins: { note: HTMLElement | null; leader: HTMLElement | null },
) {
  if (state.opening && state.opening !== before.opening) {
    map.setOpening(state.opening);
  }
  for (const stop of state.trail.slice(before.trail.length)) {
    map.walk(stop.branch, stop.branches, stop.decision);
  }
  if (state.options !== before.options) {
    if (state.isFork && state.options.length > 0) {
      map.fork(state.options.map((option) => option.label));
    } else {
      map.clearFork();
    }
  }
  if (state.route?.modules !== before.route?.modules) {
    map.setPlan(mapStations(state, words));
  }
  if (state.built !== before.built) {
    map.setBuilt(state.built);
  }
  if (state.preview !== before.preview && pins.note && pins.leader) {
    map.pinNote(pins.note, pins.leader, state.preview?.station ?? null);
  }
}
