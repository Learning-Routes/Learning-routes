import type { ActorKind } from "@learning-routes/core/actions/actor";
import { mcpTools, runAction } from "@learning-routes/core/actions/define";
import { ACTIONS } from "@learning-routes/core/actions/registry";
import { ENROLLMENT, NOW, testCtx } from "@learning-routes/core/testing/actions/test-ctx";
import { describe, expect, it } from "vitest";
import { api } from "../app/api";

// STEP 46 §4: a button and an agent reach the same actions the same way. The
// registry, the MCP tools and the browser client are one list, and the gate treats
// every way in alike, except where the permission table sets one apart.

const ACTORS: ActorKind[] = ["ui", "mcp", "agent"];

// Each actor gets its own world: one space, where the caller is an enrolled student.
const ctx = (via: ActorKind) => testCtx(via);

const REVIEW = {
  enrollmentId: ENROLLMENT,
  reviewId: "0192d3a0-0000-7000-8000-000000000001",
  itemId: "0192d3a0-0000-7000-8000-0000000000c1",
  rating: 3,
  at: NOW,
  elapsedMs: 900,
};

describe("action parity", () => {
  it("the registry, the MCP tools and the client name exactly the same actions", () => {
    const registered = Object.keys(ACTIONS).sort();
    expect(registered.length).toBeGreaterThan(0);
    expect(
      mcpTools(ACTIONS)
        .map((tool) => tool.name)
        .sort(),
    ).toEqual(registered);
    expect(Object.keys(api).sort()).toEqual(registered);
  });

  it("gives the same result whichever actor calls", async () => {
    const results = await Promise.all(
      ACTORS.map((via) => runAction(ACTIONS, "review.submit", REVIEW, ctx(via))),
    );
    expect(results[0]).toMatchObject({ ok: true });
    for (const result of results) {
      expect(result).toEqual(results[0]);
    }
  });

  it("refuses invalid input the same way for every actor", async () => {
    const invalid = { ...REVIEW, rating: 9, extra: true };
    const results = await Promise.all(
      ACTORS.map((via) => runAction(ACTIONS, "review.submit", invalid, ctx(via))),
    );
    expect(results[0]).toMatchObject({ ok: false, code: "invalid_input" });
    for (const result of results) {
      expect(result).toEqual(results[0]);
    }
  });

  it("refuses an unknown action the same way for every actor", async () => {
    const results = await Promise.all(
      ACTORS.map((via) => runAction(ACTIONS, "route.delete", {}, ctx(via))),
    );
    for (const result of results) {
      expect(result).toEqual({ ok: false, code: "unknown_action" });
    }
  });
});
