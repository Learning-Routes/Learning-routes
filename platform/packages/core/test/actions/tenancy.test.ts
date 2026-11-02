import { describe, expect, it } from "vitest";
import { z } from "zod";
import { defineAction, runAction } from "../../src/actions/define";
import { ACTIONS } from "../../src/actions/registry";
import { ENROLLMENT, memoryTenancy, NOW, testCtx, testWorld } from "./test-ctx";

// The space comes from the row, never from the input (Platform STEP 2 §3.2). An
// actor outside the space gets not_found; forbidden is only for a member whose
// role, or way in, the permission table refuses.

const review = (enrollmentId: string) => ({
  enrollmentId,
  reviewId: "0192d3a0-0000-7000-8000-000000000001",
  itemId: "0192d3a0-0000-7000-8000-0000000000c1",
  rating: 3,
  at: NOW,
  elapsedMs: 500,
});
const NOT_FOUND = { ok: false, code: "not_found", message: "not found" };

const E_A = "0192d3a0-0000-7000-8000-0000000000a1";
const E_B = "0192d3a0-0000-7000-8000-0000000000b1";
const twoSpaces = memoryTenancy({
  rows: { [`enrollment:${E_A}`]: "space-a", [`enrollment:${E_B}`]: "space-b" },
  roles: { "space-a:student-1": "student", "space-b:student-1": "assistant" },
});
const touch = defineAction({
  name: "test.touch",
  kind: "query",
  description: "Names a space and an enrollment.",
  input: z.object({ spaceId: z.string(), enrollmentId: z.string() }),
  target: (input) => ({ kind: "enrollment", id: input.enrollmentId }),
  run: async (_ctx, _input, scope) => scope,
});
const allowAll = () => true;

describe("runAction finds the space from the target row", () => {
  it("runs for a member whose role and way in are allowed", async () => {
    expect((await runAction(ACTIONS, "review.submit", review(ENROLLMENT), testCtx("ui"))).ok).toBe(
      true,
    );
  });

  it("answers not_found, and changes nothing, outside the space", async () => {
    const world = testWorld();
    expect(
      await runAction(
        ACTIONS,
        "review.submit",
        review(ENROLLMENT),
        testCtx("ui", world, "stranger"),
      ),
    ).toEqual(NOT_FOUND);
    expect(world.reviews.size).toBe(0);
  });

  it("answers not_found for a row the actor cannot see, the same as one that does not exist", async () => {
    const missing = "0192d3a0-0000-7000-8000-0000000000ff";
    expect(await runAction(ACTIONS, "review.submit", review(missing), testCtx("ui"))).toEqual(
      NOT_FOUND,
    );
  });

  it("answers forbidden to a member the permission table refuses", async () => {
    const refuse = () => false;
    expect(
      await runAction(ACTIONS, "review.submit", review(ENROLLMENT), testCtx("ui"), refuse),
    ).toEqual({
      ok: false,
      code: "forbidden",
      message: "not allowed",
    });
  });

  it("answers not_found when the input names another space than the row's, even the actor's own", async () => {
    const ctx = testCtx("ui", testWorld(), "student-1", { tenancy: twoSpaces });
    // student-1 belongs to both spaces, and names their own space A with B's row.
    const run = (spaceId: string) =>
      runAction(
        { "test.touch": touch },
        "test.touch",
        { spaceId, enrollmentId: E_B },
        ctx,
        allowAll,
      );
    expect(await run("space-a")).toEqual(NOT_FOUND);
    expect(await run("space-b")).toEqual({
      ok: true,
      output: { spaceId: "space-b", role: "assistant" },
    });
  });

  it("compares a uuid spaceId whatever its letter case", async () => {
    const space = "0192d3a0-0000-7000-8000-0000000000aa";
    const tenancy = memoryTenancy({
      rows: { [`enrollment:${E_A}`]: space },
      roles: { [`${space}:student-1`]: "student" },
    });
    const ctx = testCtx("ui", testWorld(), "student-1", { tenancy });
    const input = { spaceId: space.toUpperCase(), enrollmentId: E_A };
    expect(await runAction({ "test.touch": touch }, "test.touch", input, ctx, allowAll)).toEqual({
      ok: true,
      output: { spaceId: space, role: "student" },
    });
  });
});
