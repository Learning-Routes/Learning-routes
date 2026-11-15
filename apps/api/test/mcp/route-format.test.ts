import { SIM_KINDS } from "@learning-routes/core/blocks/sims";
import { problemsIn } from "@learning-routes/core/content/route-document";
import { describe, expect, it } from "vitest";
import { PLAYER_BLOCK_EXAMPLES } from "../../src/mcp/block-examples";
import { routeFormat } from "../../src/mcp/guides";

// Platform STEP 12 PR 1: get_route_format teaches every block the player brings, and every example
// it gives passes import_route's own check.

const lessonOf = (blocks: unknown[]) => ({
  slug: "ejemplos",
  title: { es: "Ejemplos" },
  source_locale: "es",
  modules: [{ title: { es: "Uno" }, lessons: [{ title: { es: "Todo" }, blocks }] }],
});

describe("the route format guide", () => {
  it("gives an example of each new block, and each one imports", () => {
    const types = PLAYER_BLOCK_EXAMPLES.map((block) => block.type);
    expect(types).toEqual([
      "order",
      "true_false",
      "estimate",
      "hotspot",
      "worked_example",
      "speak",
      "code_check",
      "open_answer",
      "sim",
    ]);
    for (const block of PLAYER_BLOCK_EXAMPLES) {
      expect(problemsIn(lessonOf([block])), String(block.type)).toMatchObject({ ok: true });
    }
  });

  it("names every sim kind, and shows the examples as JSON a model can copy", () => {
    const { guide } = routeFormat();
    for (const kind of SIM_KINDS) {
      expect(guide).toContain(`- ${kind}: {`);
    }
    const shown = guide.split("One of each:\n\n```json\n")[1]?.split("\n```")[0] ?? "";
    expect(JSON.parse(shown)).toEqual(PLAYER_BLOCK_EXAMPLES);
  });

  it("drops a field a sim setup does not know, like any unknown field", () => {
    const sim = {
      ...PLAYER_BLOCK_EXAMPLES.at(-1),
      setup: { kind: "fraction_pie", parts: 8, target: 3, color: "red" },
    };
    const checked = problemsIn(lessonOf([sim]));
    expect(checked).toMatchObject({ ok: true });
    const block = checked.ok ? checked.document.modules[0]?.lessons[0]?.blocks[0] : null;
    expect(block).toMatchObject({ setup: { kind: "fraction_pie", parts: 8, target: 3 } });
    expect(JSON.stringify(block)).not.toContain("color");
  });
});
