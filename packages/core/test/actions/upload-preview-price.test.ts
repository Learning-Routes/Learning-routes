import { describe, expect, it } from "vitest";
import { runAction } from "../../src/actions/define";
import { ACTIONS } from "../../src/actions/registry";
import { ROUTE, SPACE, STAFF, testCtx, testWorld } from "./test-ctx";

// route.upload, route.preview and route.set_price (Platform STEP 8 §2-§4), on the in-memory twin.

const DOCUMENT = "# Mi curso\n\n## Uno\n\n### Tema\n\nHola **mundo**.";

describe("route.upload", () => {
  it("makes a draft from the creator's words, and the same document twice is one route", async () => {
    const world = testWorld();
    const via = testCtx("mcp", world, STAFF.owner);
    const input = { spaceId: SPACE, document: DOCUMENT, format: "markdown" };
    const first = await runAction(ACTIONS, "route.upload", input, via);
    expect(first).toMatchObject({ ok: true, output: { repeated: false, counts: { lessons: 1 } } });
    const again = await runAction(ACTIONS, "route.upload", input, via);
    expect(again).toMatchObject({ ok: true, output: { repeated: true } });
    expect((again as { output: { routeId: string } }).output.routeId).toBe(
      (first as { output: { routeId: string } }).output.routeId,
    );
  });

  it("writes nothing from a document with no title, and says so", async () => {
    const world = testWorld();
    const answer = await runAction(
      ACTIONS,
      "route.upload",
      { spaceId: SPACE, document: "Solo texto.", format: "markdown" },
      testCtx("mcp", world, STAFF.owner),
    );
    expect(answer).toMatchObject({ ok: false, code: "invalid" });
  });

  it("reads a pasted page too", async () => {
    const answer = await runAction(
      ACTIONS,
      "route.upload",
      {
        spaceId: SPACE,
        document: "<h1>Página</h1><h2>M</h2><h3>T</h3><p>Texto</p>",
        format: "html",
        title: "Otra",
        locale: "en",
      },
      testCtx("mcp", testWorld(), STAFF.owner),
    );
    expect(answer).toMatchObject({ ok: true, output: { counts: { modules: 1 } } });
  });
});

describe("route.preview", () => {
  it("shows a member every topic of the draft, with nothing locked", async () => {
    const world = testWorld();
    const answer = await runAction(
      ACTIONS,
      "route.preview",
      { routeId: ROUTE },
      testCtx("ui", world, STAFF.assistant),
    );
    expect(answer.ok).toBe(true);
    const output = (answer as { output: { outline: unknown[]; view: { locked: boolean } | null } })
      .output;
    expect(Array.isArray(output.outline)).toBe(true);
    if (output.view) {
      expect(output.view.locked).toBe(false);
    }
  });

  it("is not there for a student", async () => {
    const answer = await runAction(
      ACTIONS,
      "route.preview",
      { routeId: ROUTE },
      testCtx("ui", testWorld(), "student-1"),
    );
    expect(answer.ok).toBe(false);
  });
});

describe("route.set_price", () => {
  it("saves the owner's price, from the app only", async () => {
    const world = testWorld();
    const revision = world.drafts.get(ROUTE)?.revision ?? 0;
    const input = { routeId: ROUTE, expectedRevision: revision, priceMinor: 1500, currency: "USD" };
    const saved = await runAction(
      ACTIONS,
      "route.set_price",
      input,
      testCtx("ui", world, STAFF.owner),
    );
    expect(saved.ok).toBe(true);
    expect(world.drafts.get(ROUTE)?.route).toMatchObject({ priceMinor: 1500, currency: "USD" });
    const fromMcp = await runAction(
      ACTIONS,
      "route.set_price",
      input,
      testCtx("mcp", world, STAFF.owner),
    );
    expect(fromMcp.ok).toBe(false);
    const coeditor = await runAction(
      ACTIONS,
      "route.set_price",
      input,
      testCtx("ui", world, STAFF.coeditor),
    );
    expect(coeditor.ok).toBe(false);
  });

  it("takes a price and a currency together, or neither", async () => {
    const answer = await runAction(
      ACTIONS,
      "route.set_price",
      { routeId: ROUTE, expectedRevision: 0, priceMinor: 1500, currency: null },
      testCtx("ui", testWorld(), STAFF.owner),
    );
    expect(answer).toMatchObject({ ok: false, code: "invalid_input" });
  });
});
