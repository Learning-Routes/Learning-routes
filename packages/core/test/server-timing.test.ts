import { describe, expect, it } from "vitest";
import { ServerTiming } from "../src/server-timing";

const ONE_BROKEN_PHASE = /^broken;dur=\d+\.\d$/;

describe("ServerTiming (Platform STEP 15)", () => {
  it("names each phase as a token, and nests another server's phases under a call", () => {
    const timing = new ServerTiming();
    timing.add("api-lesson.play", 12.345);
    timing.addFrom("api-lesson.play", "session;dur=3.0, db;dur=7.5");
    timing.add("odd name/with:bits", 1);
    expect(timing.header).toBe(
      "api-lesson.play;dur=12.3, api-lesson.play.session;dur=3.0, api-lesson.play.db;dur=7.5, odd-name-with-bits;dur=1.0",
    );
  });

  it("records a phase that throws, and passes the error on", async () => {
    const timing = new ServerTiming();
    await expect(timing.measure("broken", () => Promise.reject(new Error("no")))).rejects.toThrow(
      "no",
    );
    expect(timing.header).toMatch(ONE_BROKEN_PHASE);
  });
});
