import { describe, expect, it } from "vitest";
import pkg from "../package.json" with { type: "json" };
import app from "../src/index";

describe("GET /health", () => {
  it("answers ok with the version", async () => {
    const response = await app.request("/health");

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, version: pkg.version });
  });
});
