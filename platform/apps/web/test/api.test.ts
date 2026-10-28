import { afterEach, describe, expect, it, vi } from "vitest";
import { api, callAction } from "../app/api";

const INPUT = {
  reviewId: "0192d3a0-0000-7000-8000-000000000001",
  cardId: "card-hello",
  rating: 3,
  at: 1_000,
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("the API client", () => {
  it("posts an action's input to its endpoint and returns the result", async () => {
    const result = { ok: false, code: "unknown_action" };
    const fetch = vi.fn(async () => Response.json(result, { status: 404 }));
    vi.stubGlobal("fetch", fetch);

    expect(await callAction("review.submit", INPUT)).toEqual(result);
    expect(fetch).toHaveBeenCalledWith("/api/a/review.submit", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(INPUT),
    });
  });

  it("has one method per action", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({ ok: true, output: {} })),
    );
    expect(await api["review.submit"](INPUT)).toEqual({ ok: true, output: {} });
  });

  it("lets a network error reach the caller, which keeps the item queued", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("Failed to fetch");
      }),
    );
    await expect(callAction("review.submit", INPUT)).rejects.toThrow("Failed to fetch");
  });
});
