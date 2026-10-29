import { describe, expect, it } from "vitest";
import { runAction } from "../../src/actions/define";
import { redact } from "../../src/actions/redact";
import { ACTIONS } from "../../src/actions/registry";
import { ENROLLMENT, NOW, SPACE, testCtx, testWorld } from "./test-ctx";

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
        title: { en: "My private notes about this student" },
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
});
