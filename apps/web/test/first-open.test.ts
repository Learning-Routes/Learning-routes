import type { PlayView } from "@learning-routes/core/actions/player";
import { describe, expect, it } from "vitest";
import { firstOpen } from "../app/player/first-open";

// The server's tema shell and the player both start the bar here (Platform STEP 15), so the
// segment marked "now" on load is the one the player opens.
const viewOf = (done: boolean, beats: { gating: boolean; state: { done: boolean } | null }[]) =>
  ({ done, beats }) as unknown as PlayView;

describe("firstOpen", () => {
  it("starts a new topic at the beginning", () => {
    expect(
      firstOpen(
        viewOf(false, [
          { gating: true, state: null },
          { gating: true, state: null },
        ]),
      ),
    ).toBe(0);
  });

  it("starts a topic in progress at the first gating beat not yet done", () => {
    const beats = [
      { gating: true, state: { done: true } },
      { gating: false, state: null },
      { gating: true, state: null },
    ];
    expect(firstOpen(viewOf(false, beats))).toBe(2);
  });

  it("starts a finished topic at the beginning", () => {
    expect(firstOpen(viewOf(true, [{ gating: true, state: { done: true } }]))).toBe(0);
  });
});
