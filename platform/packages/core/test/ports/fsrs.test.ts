import { describe, expect, it } from "vitest";
import fixture from "../golden/fsrs.json" with { type: "json" };
import { runFsrs } from "../runners";

// Ruby and V8 both use IEEE doubles, but Math.exp and ** may differ from Ruby's
// libm in the last bit, and a review feeds its output into the next one, so tiny
// differences can grow along a sequence. 1e-9 relative is far below anything a
// learner's schedule could notice, and far above that noise.
function close(actual: unknown, expected: unknown, path = "$"): void {
  if (typeof expected === "number" && typeof actual === "number") {
    const scale = Math.max(Math.abs(expected), Math.abs(actual));
    expect(Math.abs(actual - expected), path).toBeLessThanOrEqual(1e-9 * scale);
  } else if (expected !== null && typeof expected === "object") {
    expect(Object.keys(actual as object).sort(), path).toEqual(Object.keys(expected).sort());
    for (const [key, value] of Object.entries(expected)) {
      close((actual as Record<string, unknown>)[key], value, `${path}.${key}`);
    }
  } else {
    expect(actual, path).toEqual(expected);
  }
}

const byKind = (kind: string) => fixture.cases.filter((c) => c.input.kind === kind);

describe("fsrs (fsrs.json)", () => {
  it("has v1's case counts", () => {
    expect(byKind("review_sequence")).toHaveLength(147);
    expect(byKind("retrievability")).toHaveLength(48);
    expect(byKind("next_interval")).toHaveLength(16);
  });

  it.each(fixture.cases)("$input.kind #%#", ({ input, output }) => {
    close(runFsrs(input), output);
  });
});
