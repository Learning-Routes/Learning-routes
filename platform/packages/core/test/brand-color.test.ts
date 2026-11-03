import { describe, expect, it } from "vitest";
import { checkBrandColor, contrastWithWhite } from "../src/brand-color";

describe("a space's brand colour (Platform STEP 4 §2.1)", () => {
  it("measures white text on a colour as WCAG does", () => {
    expect(contrastWithWhite("#000000")).toBeCloseTo(21, 5);
    expect(contrastWithWhite("#ffffff")).toBeCloseTo(1, 5);
    // A known pair: #767676 on white is the classic 4.54:1.
    expect(contrastWithWhite("#767676")).toBeCloseTo(4.54, 2);
  });

  it("accepts a colour white text can be read on", () => {
    expect(checkBrandColor("#6A2EA0")).toEqual({ ok: true, color: "#6a2ea0" });
  });

  it("refuses one that fails, says why, and suggests the nearest that passes", () => {
    const answer = checkBrandColor("#ffcc00");
    expect(answer.ok).toBe(false);
    if (answer.ok) {
      return;
    }
    expect(answer.message).toContain("4.5:1");
    expect(answer.message).toContain("#ffcc00");
    expect(answer.message).toContain(answer.suggestion);
    expect(contrastWithWhite(answer.suggestion)).toBeGreaterThanOrEqual(4.5);
    // Nearest: one step lighter would fail.
    const channels = [1, 3, 5].map((at) =>
      Number.parseInt(answer.suggestion.slice(at, at + 2), 16),
    );
    const lighter = `#${channels
      .map((c) =>
        Math.min(255, c + 4)
          .toString(16)
          .padStart(2, "0"),
      )
      .join("")}`;
    expect(contrastWithWhite(lighter)).toBeLessThan(4.5);
  });

  it("keeps a colour's hue when it suggests another", () => {
    const answer = checkBrandColor("#ff0000");
    expect(answer.ok).toBe(false);
    if (!answer.ok) {
      expect(answer.suggestion.slice(3)).toBe("0000");
    }
  });

  it("refuses what is not a six-digit hex colour", () => {
    for (const color of ["red", "#fff", "#12345g", "", "#1234567"]) {
      expect(checkBrandColor(color).ok, color).toBe(false);
    }
  });
});
