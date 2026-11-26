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

  it("leaves every other address to the pages, and refuses to be written to", async () => {
    const elsewhere = ["/voz/", "/voz/../secret.mp3", "/voz/abc.mp3", "/inicio"];
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
