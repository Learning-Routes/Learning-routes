import { describe, expect, it } from "vitest";
import { AUTHORED_BLOCK_TYPES, BLOCK_TYPES, importV1Block, SYSTEM_BLOCK_TYPES } from "../src/index";
import blockGrader from "./golden/block_grader.json" with { type: "json" };
import blockRegistry from "./golden/block_registry.json" with { type: "json" };
import lessonParser from "./golden/lesson_parser.json" with { type: "json" };

// The fixtures are v1's behaviour, captured by `rake characterize:all` in the Rails
// repository (README.md here). They prove the schemas fit reality: every recorded
// section crosses the v1 import boundary into a stored Block.

async function failures(sections: unknown[]) {
  const failed = [];
  for (const [position, section] of sections.entries()) {
    try {
      await importV1Block(section, {
        routeId: "golden",
        lessonId: "golden",
        position,
        locale: "es",
      });
    } catch (error) {
      failed.push({ position, section, error: String(error) });
    }
  }
  return failed;
}

describe("golden fixtures", () => {
  it("every section the v1 parser produced imports as a Block", async () => {
    const sections = lessonParser.cases.flatMap((c): unknown[] =>
      Array.isArray(c.output) ? c.output : [],
    );

    expect(sections.length).toBeGreaterThan(500);
    expect(await failures(sections)).toEqual([]);
  });

  it("every section v1 recorded in a lesson imports as a Block", async () => {
    const sections = blockGrader.cases
      .filter((c) => c.input.origin === "recorded")
      .map((c) => c.input.section);

    expect(sections.length).toBeGreaterThan(100);
    expect(await failures(sections)).toEqual([]);
  });

  it("the v1 registry lists exactly the types the union defines", () => {
    const registry = blockRegistry.cases[0]?.output;

    expect(registry?.types).toEqual([...BLOCK_TYPES].sort());
    expect(registry?.authored_types).toEqual([...AUTHORED_BLOCK_TYPES].sort());
    expect(registry?.system_types).toEqual([...SYSTEM_BLOCK_TYPES].sort());
  });
});
