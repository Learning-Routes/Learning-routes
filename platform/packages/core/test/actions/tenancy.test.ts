import { describe, expect, it } from "vitest";
import { z } from "zod";
import { defineAction, runAction } from "../../src/actions/define";
import { ACTIONS } from "../../src/actions/registry";
import { memoryStore, memoryTenancy, testCtx } from "./memory-store";

// The space comes from the row, never from the input (Platform STEP 2 §3.2). An
// actor outside the space gets not_found; forbidden is only for a member whose
// role, or way in, is not enough.

const E_A = "0192d3a0-0000-7000-8000-0000000000a1";
const E_B = "0192d3a0-0000-7000-8000-0000000000b1";
const tenancy = memoryTenancy({
  rows: { [`enrollment:${E_A}`]: "space-a", [`enrollment:${E_B}`]: "space-b" },
  roles: {
    "space-a:student-1": "student",
    "space-b:student-2": "student",
    "space-b:student-1": "assistant",
  },
});
const review = (enrollmentId: string) => ({
  enrollmentId,
  reviewId: "0192d3a0-0000-7000-8000-000000000001",
  cardId: "card-hello",
  rating: 3,
  at: 0,
});

describe("runAction finds the space from the target row", () => {
  it("runs for a member whose role and way in are allowed", async () => {
    const result = await runAction(
      ACTIONS,
      "review.submit",
      review(E_A),
      testCtx("ui", memoryStore(), "student-1", tenancy),
    );
    expect(result.ok).toBe(true);
  });

  it("answers not_found, and changes nothing, outside the space", async () => {
    const store = memoryStore();
    const result = await runAction(
      ACTIONS,
      "review.submit",
      review(E_A),
      testCtx("ui", store, "student-2", tenancy),
    );
    expect(result).toEqual({ ok: false, code: "not_found", message: "not found" });
    expect(await store.get("card:student-2:card-hello")).toBeUndefined();
  });

  it("answers not_found for a row the actor cannot see, the same as one that does not exist", async () => {
    const missing = "0192d3a0-0000-7000-8000-0000000000ff";
    const result = await runAction(
      ACTIONS,
      "review.submit",
      review(missing),
      testCtx("ui", memoryStore(), "student-1", tenancy),
    );
    expect(result).toEqual({ ok: false, code: "not_found", message: "not found" });
  });

  it("answers forbidden to a member whose way in is not allowed", async () => {
    const result = await runAction(
      ACTIONS,
      "review.submit",
      review(E_A),
      testCtx("agent", memoryStore(), "student-1", tenancy),
    );
    expect(result).toEqual({ ok: false, code: "forbidden", message: "not allowed" });
  });

  it("answers not_found when the input names another space than the row's, even the actor's own", async () => {
    const touch = defineAction({
      name: "test.touch",
      kind: "mutation",
      description: "Names a space and an enrollment.",
      input: z.object({ spaceId: z.string(), enrollmentId: z.string() }),
      target: (input) => ({ kind: "enrollment", id: input.enrollmentId }),
      run: async (_ctx, _input, scope) => scope,
    });
    const allowAll = () => true;
    const ctx = testCtx("ui", memoryStore(), "student-1", tenancy);
    // student-1 belongs to both spaces, and names their own space A with B's row.
    expect(
      await runAction(
        { "test.touch": touch },
        "test.touch",
        { spaceId: "space-a", enrollmentId: E_B },
        ctx,
        allowAll,
      ),
    ).toEqual({ ok: false, code: "not_found", message: "not found" });
    expect(
      await runAction(
        { "test.touch": touch },
        "test.touch",
        { spaceId: "space-b", enrollmentId: E_B },
        ctx,
        allowAll,
      ),
    ).toEqual({ ok: true, output: { spaceId: "space-b", role: "assistant" } });
  });
});
