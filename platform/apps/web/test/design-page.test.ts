import type { RouterContextProvider } from "react-router";
import { describe, expect, it } from "vitest";
import { pageContext } from "../app/context";
import type { Route } from "../app/routes/+types/design";
import { loader } from "../app/routes/design";

const args = (isDevelopment: boolean) =>
  ({
    context: {
      get: (key: unknown) =>
        key === pageContext ? { nonce: "n", appOrigin: "https://a.example", isDevelopment } : null,
    } as unknown as RouterContextProvider,
  }) as unknown as Route.LoaderArgs;

describe("/studio/_design", () => {
  it("exists in development", () => {
    expect(loader(args(true))).toBeNull();
  });

  it("does not exist anywhere else", () => {
    expect(() => loader(args(false))).toThrow();
    try {
      loader(args(false));
    } catch (error) {
      expect((error as { init?: { status?: number } }).init?.status).toBe(404);
    }
  });
});
