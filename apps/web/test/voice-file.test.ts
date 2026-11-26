import { voicePath } from "@learning-routes/core/voice";
import { describe, expect, it } from "vitest";
import { voiceFile } from "../workers/voice";

const bucket = (files: Record<string, string>) => ({
  get: async (key: string) => {
    const words = files[key];
    return words === undefined
      ? null
      : { body: new Response(words).body as ReadableStream, size: words.length };
  },
});

describe("a phrase's recording", () => {
  it("is served from the bucket by its hash, to keep for a year", async () => {
    const path = await voicePath("en-US", "Hi! Good morning.");
    const key = path.replace("/voz/", "");
    const answer = await voiceFile(
      new Request(`https://learningroutes.com${path}`),
      bucket({ [key]: "mp3 bytes" }),
    );
    expect(answer?.status).toBe(200);
    expect(answer?.headers.get("content-type")).toBe("audio/mpeg");
    expect(answer?.headers.get("cache-control")).toContain("immutable");
    expect(await answer?.text()).toBe("mp3 bytes");
  });

  it("answers 404, briefly kept, for a phrase nobody recorded", async () => {
    const path = await voicePath("en-US", "Never recorded.");
    const answer = await voiceFile(new Request(`https://learningroutes.com${path}`), bucket({}));
    expect(answer?.status).toBe(404);
    expect(answer?.headers.get("cache-control")).toBe("public, max-age=300");
  });

  it("serves a route's cover by the route's id, kept an hour since it can be replaced", async () => {
    const id = "01a1e5c5-6147-7e72-978c-ac1fceb1cff4";
    const files = bucket({ [`cover/${id}.webp`]: "webp bytes" });
    const answer = await voiceFile(
      new Request(`https://learningroutes.com/portada/${id}.webp`),
      files,
    );
    expect(answer?.status).toBe(200);
    expect(answer?.headers.get("content-type")).toBe("image/webp");
    expect(answer?.headers.get("cache-control")).toContain("max-age=3600");
    const none = await voiceFile(
      new Request("https://learningroutes.com/portada/01a1e5c5-6147-7e72-978c-000000000000.webp"),
      files,
    );
    // No cover: one clear pixel, so the drawn cover shows and nothing is logged as missing.
    expect(none?.status).toBe(200);
    expect(none?.headers.get("content-type")).toBe("image/webp");
    expect((await none?.arrayBuffer())?.byteLength).toBeLessThan(100);
  });

  it("serves a lesson's picture by the hash of its bytes, for a year, and 404 when unknown", async () => {
    const hash = "ab".repeat(32);
    const files = bucket({ [`img/${hash}.webp`]: "webp bytes" });
    const answer = await voiceFile(
      new Request(`https://learningroutes.com/imagen/${hash}.webp`),
      files,
    );
    expect(answer?.status).toBe(200);
    expect(answer?.headers.get("content-type")).toBe("image/webp");
    expect(answer?.headers.get("cache-control")).toContain("immutable");
    const none = await voiceFile(
      new Request(`https://learningroutes.com/imagen/${"cd".repeat(32)}.webp`),
      files,
    );
    expect(none?.status).toBe(404);
  });

  it("leaves every other address to the pages, and refuses to be written to", async () => {
    const elsewhere = ["/voz/", "/voz/../secret.mp3", "/voz/abc.mp3", "/inicio", "/portada/x.webp"];
    for (const path of elsewhere) {
      expect(await voiceFile(new Request(`https://learningroutes.com${path}`), bucket({}))).toBe(
        null,
      );
    }
    const path = await voicePath("en-US", "Hi!");
    const put = await voiceFile(
      new Request(`https://learningroutes.com${path}`, { method: "PUT", body: "x" }),
      bucket({}),
    );
    expect(put?.status).toBe(405);
  });
});
