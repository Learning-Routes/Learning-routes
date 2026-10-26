// UUIDv7: 48 bits of Unix milliseconds, then random bits, so ids sort by creation.
// globalThis.crypto is the Web Crypto API, present in Workers and Node 22.

function format(bytes: Uint8Array): string {
  const bytesWithVersion = bytes.slice(0, 16);
  bytesWithVersion[6] = ((bytesWithVersion[6] as number) & 0x0f) | 0x70;
  bytesWithVersion[8] = ((bytesWithVersion[8] as number) & 0x3f) | 0x80;
  const hex = Array.from(bytesWithVersion, (b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function newBlockId(now: number = Date.now()): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  let ms = now;
  for (let i = 5; i >= 0; i--) {
    bytes[i] = ms % 256;
    ms = Math.floor(ms / 256);
  }
  return format(bytes);
}

// A UUIDv7-shaped id from a SHA-256 of the name: the same name always gives the
// same id. Its time field holds hash bits, not a time.
export async function deterministicId(name: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(name));
  return format(new Uint8Array(digest));
}
