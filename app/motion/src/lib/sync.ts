// The controller compares the narration audio's currentTime (ground truth —
// the voice) against the player's own clock on every `timeupdate`, and this
// is the one function that decides whether the picture has drifted far
// enough to warrant a hard seek. Pure on purpose: no Motion Canvas import, no
// DOM, no Audio element — node-tested the same way lib/cues.ts is (see
// test/javascript/motion_sync_test.rb), which is a stronger guarantee than
// only ever exercising this through a browser's `timeupdate` events.
//
// 120ms is the threshold WP-36 §16 settled on: below it a listener cannot
// reliably perceive a beat landing early or late, and seeking on every
// sub-threshold jitter would itself be the visible stutter this exists to
// prevent.
export const DRIFT_THRESHOLD_SECONDS = 0.12;

// Returns the absolute time to seek the PICTURE to, or null when no
// correction is needed. `audioTime` is ground truth; `playerTime` is where
// the animation currently sits. The result is always "go to audioTime",
// never a signed delta — so a caller can never accidentally apply the
// correction twice, and never has to reason about which side of zero it fell
// on. Drift is measured as a magnitude: the picture running ahead of the
// voice is exactly as wrong as running behind it.
export function driftSeek(
  playerTime: number,
  audioTime: number,
  threshold: number = DRIFT_THRESHOLD_SECONDS,
): number | null {
  if (!Number.isFinite(playerTime) || !Number.isFinite(audioTime) || !Number.isFinite(threshold)) return null;
  return Math.abs(audioTime - playerTime) > threshold ? audioTime : null;
}
