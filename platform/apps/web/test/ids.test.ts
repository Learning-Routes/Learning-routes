import { afterEach, describe, expect, it, vi } from "vitest";
import { newId } from "../app/ids";

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const RANDOM_UUID = /\brandomUUID\b/;

// Every browser source file, as text.
const sources = import.meta.glob<string>("../app/**/*.{ts,tsx}", {
  query: "?raw",
  import: "default",
  eager: true,
});

describe("newId", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("works on a plain http page, where crypto.randomUUID does not exist", () => {
    vi.stubGlobal("crypto", { getRandomValues: crypto.getRandomValues.bind(crypto) });

    expect(newId()).toMatch(UUID_V4);
  });

  it("does not repeat", () => {
    const ids = new Set(Array.from({ length: 1000 }, newId));
    expect(ids.size).toBe(1000);
  });

  it("is the only way browser code makes ids", () => {
    const files = Object.entries(sources);
    expect(files.length).toBeGreaterThan(5);
    const offenders = files.filter(([, text]) => RANDOM_UUID.test(text)).map(([file]) => file);
    expect(offenders).toEqual([]);
  });
});
