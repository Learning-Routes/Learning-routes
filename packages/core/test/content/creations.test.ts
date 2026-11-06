import { describe, expect, it } from "vitest";
import { creationsIn, limitsOf, sha256Hex, sniffAsset } from "../../src/content/creations";

// The type a file's bytes say, and what a creation cannot do here (Platform STEP 9 §2).

const bytes = (...values: (number | string)[]) =>
  Uint8Array.from(
    values.flatMap((value) =>
      typeof value === "number" ? [value] : [...value].map((char) => char.charCodeAt(0)),
    ),
  );
const text = (value: string) => new TextEncoder().encode(value);

describe("sniffAsset", () => {
  it.each([
    [bytes(0x89, "PNG", 0x0d, 0x0a, 0x1a, 0x0a), "image/png"],
    [bytes(0xff, 0xd8, 0xff, 0xe0), "image/jpeg"],
    [bytes("GIF89a"), "image/gif"],
    [bytes("RIFF", 0, 0, 0, 0, "WEBP"), "image/webp"],
    [bytes("RIFF", 0, 0, 0, 0, "WAVE"), "audio/wav"],
    [bytes("ID3", 4), "audio/mpeg"],
    [bytes(0xff, 0xfb, 0x90), "audio/mpeg"],
    [bytes("OggS"), "audio/ogg"],
    [bytes(0, 0, 0, 0x20, "ftypM4A "), "audio/mp4"],
    [bytes(0, 0, 0, 0x20, "ftypisom"), "video/mp4"],
    [bytes(0x1a, 0x45, 0xdf, 0xa3), "video/webm"],
    [
      text('<?xml version="1.0"?>\n<!-- a --><svg xmlns="http://www.w3.org/2000/svg"/>'),
      "image/svg+xml",
    ],
    [bytes(0xef, 0xbb, 0xbf, "<svg>"), "image/svg+xml"],
  ])("names %#", (file, contentType) => {
    expect(sniffAsset(file)?.contentType).toBe(contentType);
  });

  it("names nothing else, whatever it is called", () => {
    expect(sniffAsset(text("<!doctype html><svg>"))).toBeNull();
    expect(sniffAsset(text("<html><body><svg></svg>"))).toBeNull();
    expect(sniffAsset(text("%PDF-1.7"))).toBeNull();
    expect(sniffAsset(new Uint8Array())).toBeNull();
  });
});

describe("limitsOf", () => {
  it("says nothing of a creation that stays in its box", () => {
    const piano = `<script src="https://cdn.jsdelivr.net/npm/tone@15.1.22/build/Tone.js"></script>
      <link href="https://fonts.googleapis.com/css2?family=Inter" rel="stylesheet">
      <button onclick="play()">Do</button>`;
    expect(limitsOf(piano)).toEqual([]);
  });

  it("names each way out it tries, and each host it loads from", () => {
    const limits = limitsOf(`
      <img src="https://images.example.com/a.png"><script src="//evil.example/x.js"></script>
      <script>fetch("/api"); window.open("x"); top.location = "/"; alert("hi")</script>
      <form><iframe src="https://example.org"></iframe>`);
    expect(limits.join("\n")).toContain("internet");
    expect(limits.join("\n")).toContain("ventanas");
    expect(limits.join("\n")).toContain("contiene");
    expect(limits.join("\n")).toContain("alert");
    expect(limits.join("\n")).toContain("formularios");
    expect(limits.join("\n")).toContain("otra página");
    expect(limits).toContain(
      "Carga archivos de images.example.com: aquí no puede. Súbelos con upload_asset.",
    );
    expect(limits).toContain(
      "Carga archivos de evil.example: aquí no puede. Súbelos con upload_asset.",
    );
  });
});

describe("files by their hash", () => {
  it("hashes bytes the way everyone does", async () => {
    expect(await sha256Hex(text("abc"))).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
  });

  it("lists a route's creations once each", () => {
    const blocks = [
      { kind: "interactive", data: { creation: "a" } },
      { kind: "concept", data: {} },
      { kind: "interactive", data: { creation: "a" } },
    ];
    expect(creationsIn(blocks)).toEqual(["a"]);
  });
});
