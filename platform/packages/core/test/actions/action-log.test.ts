import { describe, expect, it } from "vitest";
import { runAction } from "../../src/actions/define";
import { redact } from "../../src/actions/redact";
import { ACTIONS } from "../../src/actions/registry";
import { ENROLLMENT, NOW, ROUTE, SPACE, testCtx, testWorld } from "./test-ctx";

// Every action writes the action log in its own transaction (Platform STEP 2
// §2.15, §6): who, how, what, with the input redacted by core, and the outcome.

describe("redact", () => {
  it("keeps ids, numbers, flags and short codes, and drops free text and secrets", () => {
    expect(
      redact({
        routeId: "0192d3a0-0000-7000-8000-000000000001",
        rating: 3,
        isFree: true,
        locale: "en",
        slug: "first-route",
        title: { en: "Hola" },
        body: "Saludar",
        token: "s3cret-value-that-must-not-be-logged",
        list: ["0192d3a0-0000-7000-8000-000000000002", "a long sentence with spaces"],
        nothing: null,
      }),
    ).toEqual({
      routeId: "0192d3a0-0000-7000-8000-000000000001",
      rating: 3,
      isFree: true,
      locale: "en",
      slug: "first-route",
      title: { en: "[redacted]" },
      body: "[redacted]",
      token: "[redacted]",
      list: ["0192d3a0-0000-7000-8000-000000000002", "[redacted]"],
      nothing: null,
    });
  });
});

describe("runAction and the action log", () => {
  it("writes one entry for an action that ran, in the target's space", async () => {
    const world = testWorld();
    const input = {
      enrollmentId: ENROLLMENT,
      reviewId: "0192d3a0-0000-7000-8000-000000000001",
      itemId: "0192d3a0-0000-7000-8000-0000000000c1",
      rating: 3,
      at: NOW,
      elapsedMs: 900,
    };
    await runAction(ACTIONS, "review.submit", input, testCtx("mcp", world));
    expect(world.log).toEqual([
      {
        spaceId: SPACE,
        actorUserId: "student-1",
        actorVia: "mcp",
        agentRunId: null,
        action: "review.submit",
        input,
        outcome: "ok",
        routeRevision: null,
      },
    ]);
  });

  it("writes the refusal of a member, and nothing for an actor outside the space", async () => {
    const world = testWorld();
    const input = {
      enrollmentId: ENROLLMENT,
      reviewId: "0192d3a0-0000-7000-8000-000000000001",
      itemId: "0192d3a0-0000-7000-8000-0000000000c1",
      rating: 3,
      at: NOW,
      elapsedMs: 900,
    };
    await runAction(ACTIONS, "review.submit", input, testCtx("ui", world), () => false);
    await runAction(ACTIONS, "review.submit", input, testCtx("ui", world, "stranger"));
    expect(world.log.map((entry) => [entry.actorUserId, entry.outcome])).toEqual([
      ["student-1", "forbidden"],
    ]);
  });

  it("logs a member's refused enrollment in the route's space", async () => {
    const world = testWorld();
    const draft = world.drafts.get(ROUTE);
    if (draft) {
      draft.route = { ...draft.route, pricing: "paid" };
    }
    const result = await runAction(
      ACTIONS,
      "enrollment.create",
      { routeId: ROUTE },
      testCtx("ui", world, "student-1"),
    );
    expect(result).toMatchObject({ ok: false, code: "invalid" });
    expect(world.log.map((entry) => [entry.spaceId, entry.action, entry.outcome])).toEqual([
      [SPACE, "enrollment.create", "invalid"],
    ]);
  });

  it("logs the draft revision a publish froze", async () => {
    const world = testWorld();
    await runAction(
      ACTIONS,
      "route.publish",
      { routeId: ROUTE, expectedRevision: 0 },
      testCtx("ui", world, "owner-1"),
    );
    expect(world.log.at(-1)).toMatchObject({
      action: "route.publish",
      outcome: "ok",
      routeRevision: 0,
    });
  });
});
