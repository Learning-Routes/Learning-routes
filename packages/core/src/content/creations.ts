// What a creator brings as files (Platform STEP 9 §2): an interactive creation, one HTML file
// kept exactly as given, and assets: images, sound and short video. Each is named by its
// SHA-256, so a new upload is a new file and nothing stored ever changes.

const MB = 1024 * 1024;

/** The largest creation one call takes. */
export const CREATION_MOST_BYTES = 2 * MB;

/** The largest asset of each kind. */
export const ASSET_MOST_BYTES = { image: 5 * MB, audio: 15 * MB, video: 25 * MB } as const;

/**
 * Each space's storage. R2 charges about US$0.015 per GB a month past its free 10 GB, so a
 * full space costs about a cent and a half a month: the owner's to raise.
 */
export const SPACE_QUOTA_BYTES = 1024 * MB;

export type AssetKind = keyof typeof ASSET_MOST_BYTES;

export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = new Uint8Array(
    await crypto.subtle.digest("SHA-256", bytes as Uint8Array<ArrayBuffer>),
  );
  return Array.from(digest, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

/** Where a creation lives in R2: a draft's copy, and the published one made on publishing. */
export const creationKey = (
  place: "draft" | "pub",
  spaceId: string,
  routeId: string,
  hash: string,
) => `${place}/${spaceId}/${routeId}/${hash}.html`;

export const assetKey = (spaceId: string, hash: string, extension: string) =>
  `a/${spaceId}/${hash}.${extension}`;

/** The distinct creations a route's blocks point at. */
export function creationsIn(blocks: readonly { kind: string; data: unknown }[]): string[] {
  const hashes = blocks
    .filter((block) => block.kind === "interactive")
    .map((block) => (block.data as { creation: string }).creation);
  return [...new Set(hashes)];
}

interface Sniffed {
  kind: AssetKind;
  contentType: string;
  extension: string;
}

const ascii = (bytes: Uint8Array, from: number, to: number) =>
  String.fromCharCode(...bytes.subarray(from, to));

const startsWith = (bytes: Uint8Array, signature: readonly number[]) =>
  signature.every((byte, index) => bytes[index] === byte);

/** An SVG's first tag, past a BOM, an XML declaration, comments and a doctype. */
const SVG_START =
  /^(?:\u00EF\u00BB\u00BF)?\s*(<\?xml[^>]*>\s*)?(?:<!--(?:[^-]|-(?!->))*-->\s*)*(<!DOCTYPE svg[^>]*>\s*)?<svg[\s>]/i;

const SIGNATURES: [(bytes: Uint8Array) => boolean, Sniffed][] = [
  [
    (b) => startsWith(b, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    { kind: "image", contentType: "image/png", extension: "png" },
  ],
  [
    (b) => startsWith(b, [0xff, 0xd8, 0xff]),
    { kind: "image", contentType: "image/jpeg", extension: "jpg" },
  ],
  [
    (b) => ascii(b, 0, 6) === "GIF87a" || ascii(b, 0, 6) === "GIF89a",
    { kind: "image", contentType: "image/gif", extension: "gif" },
  ],
  [
    (b) => ascii(b, 0, 4) === "RIFF" && ascii(b, 8, 12) === "WEBP",
    { kind: "image", contentType: "image/webp", extension: "webp" },
  ],
  [
    (b) => ascii(b, 0, 4) === "RIFF" && ascii(b, 8, 12) === "WAVE",
    { kind: "audio", contentType: "audio/wav", extension: "wav" },
  ],
  [
    (b) => ascii(b, 0, 3) === "ID3" || (b[0] === 0xff && ((b[1] ?? 0) & 0xe0) === 0xe0),
    { kind: "audio", contentType: "audio/mpeg", extension: "mp3" },
  ],
  [(b) => ascii(b, 0, 4) === "OggS", { kind: "audio", contentType: "audio/ogg", extension: "ogg" }],
  [
    (b) => ascii(b, 4, 8) === "ftyp" && ascii(b, 8, 11) === "M4A",
    { kind: "audio", contentType: "audio/mp4", extension: "m4a" },
  ],
  [(b) => ascii(b, 4, 8) === "ftyp", { kind: "video", contentType: "video/mp4", extension: "mp4" }],
  [
    (b) => startsWith(b, [0x1a, 0x45, 0xdf, 0xa3]),
    { kind: "video", contentType: "video/webm", extension: "webm" },
  ],
  [
    // Read as Latin-1: an SVG's opening is ASCII, past a UTF-8 BOM.
    (b) => SVG_START.test(ascii(b, 0, Math.min(b.length, 4096))),
    { kind: "image", contentType: "image/svg+xml", extension: "svg" },
  ],
];

/**
 * The type a file's bytes say it is, never its name. Null for anything else: we serve only
 * what we can name. An SVG is served as an image, with every script refused (the content host).
 */
export function sniffAsset(bytes: Uint8Array): Sniffed | null {
  return SIGNATURES.find(([matches]) => matches(bytes))?.[1] ?? null;
}

// The hosts a creation may load from: the content host's policy (apps/content).
const SCRIPT_HOSTS = new Set(["cdnjs.cloudflare.com", "cdn.jsdelivr.net", "unpkg.com"]);
const STYLE_HOSTS = new Set([...SCRIPT_HOSTS, "fonts.googleapis.com", "fonts.gstatic.com"]);

const LIMITS: [RegExp, string][] = [
  [
    /\bfetch\s*\(|XMLHttpRequest|new\s+WebSocket\b|\bEventSource\b|sendBeacon/,
    "Pide datos a internet: aquí no puede.",
  ],
  [
    /\blocalStorage\b|\bsessionStorage\b|\bindexedDB\b|document\.cookie/,
    "Guarda datos en el navegador: aquí no puede, y si no lo prevé puede fallar.",
  ],
  [/\bwindow\.open\s*\(|target\s*=\s*["']?_blank/, "Abre ventanas nuevas: aquí no puede."],
  [
    /\b(?:top|parent)\s*\.\s*(?:location|document)|window\.top\b/,
    "Cambia o lee la página que la contiene: aquí no puede.",
  ],
  [/<form\b/i, "Envía formularios a otra dirección: aquí no puede."],
  [
    /\b(?:alert|confirm|prompt)\s*\(/,
    "Muestra avisos con alert, confirm o prompt: aquí no aparecen.",
  ],
  [
    /getUserMedia|navigator\.geolocation|requestMIDIAccess|navigator\.clipboard/,
    "Pide cámara, micrófono, ubicación o portapapeles: aquí no puede.",
  ],
  [/<iframe\b/i, "Incluye otra página dentro: aquí no puede."],
];

// What a host name looks like: anything else in the source is never echoed back.
const HOSTNAME = /^[a-z0-9.-]{1,253}(?::[0-9]{1,5})?$/;
const LOADED =
  /<(script|link|img|audio|video|source)\b[^<>]{0,2048}?\s(?:src|href)\s*=\s*["']?(https?:)?\/\/([^/"'\s>]+)/gi;

/**
 * What a creation will not be able to do here, from a static reading of its source. Advice for
 * the creator, never a control: the content host's policy is what holds the box.
 */
export function limitsOf(source: string): string[] {
  const found = LIMITS.filter(([pattern]) => pattern.test(source)).map(([, line]) => line);
  const hosts = new Set<string>();
  for (const [, tag, , host] of source.matchAll(LOADED)) {
    const name = (host ?? "").toLowerCase();
    if (!HOSTNAME.test(name)) {
      continue;
    }
    const allowed =
      tag?.toLowerCase() === "script"
        ? SCRIPT_HOSTS
        : tag?.toLowerCase() === "link"
          ? STYLE_HOSTS
          : new Set<string>();
    if (!allowed.has(name)) {
      hosts.add(name);
    }
  }
  for (const host of [...hosts].sort().slice(0, 10)) {
    found.push(`Carga archivos de ${host}: aquí no puede. Súbelos con upload_asset.`);
  }
  return found;
}
