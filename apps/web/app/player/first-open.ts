import type { PlayView } from "@learning-routes/core/actions/player";

/** Where to start: the first beat that still gates the topic, else the beginning. */
export const firstOpen = (view: PlayView) => {
  const started = view.beats.some((b) => b.state !== null);
  const at = view.beats.findIndex((b) => b.gating && !b.state?.done);
  return view.done || !started || at < 0 ? 0 : at;
};
