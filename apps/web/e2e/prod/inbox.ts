import { execFileSync } from "node:child_process";

// The proof inbox (Platform STEP 10 §6), read for the production student check (STEP 11-prep §A3):
// Email Routing keeps our own mail to the test addresses in KV for a day, under "<to>:<ms>:<id>".
// Read with wrangler: the owner's login on this Mac, a KV-read token in CI. The token it finds is a
// sign-in link's: never printed.

const TOKEN = /[#&]token=([A-Za-z0-9_-]+)/;
const BASE64_BLOCK = /\r?\n\r?\n((?:[A-Za-z0-9+/=]{4,}\r?\n?)+)/g;
const POLLS = 30;
const POLL_MS = 2000;

const softBreaks = /=\r?\n/g;
const escaped = /=([0-9A-F]{2})/g;

/** A raw mail's text as quoted-printable and as each base64 part, so the link is found in either. */
function bodiesOf(raw: string): string[] {
  const quoted = raw
    .replace(softBreaks, "")
    .replace(escaped, (_, hex: string) => String.fromCharCode(Number.parseInt(hex, 16)));
  const parts = [...raw.matchAll(BASE64_BLOCK)].map((match) =>
    Buffer.from((match[1] ?? "").replace(/\s/g, ""), "base64").toString("utf8"),
  );
  return [quoted, ...parts];
}

/** The sign-in token in a raw mail, or null. */
export function tokenIn(raw: string): string | null {
  for (const body of bodiesOf(raw)) {
    const token = TOKEN.exec(body)?.[1];
    if (token) {
      return token;
    }
  }
  return null;
}

const kv = (args: string[]) =>
  execFileSync(
    "pnpm",
    [
      "exec",
      "wrangler",
      "kv",
      ...args,
      "--config",
      "wrangler.inbox.jsonc",
      "--binding",
      "INBOX",
      "--remote",
    ],
    {
      cwd: new URL("../../../api/", import.meta.url),
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    },
  );

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** The token of the newest sign-in mail to `address` that arrived after `since` (ms). */
export async function signInToken(address: string, since: number): Promise<string> {
  for (let poll = 0; poll < POLLS; poll++) {
    const keys = (JSON.parse(kv(["key", "list", "--prefix", `${address}:`])) as { name: string }[])
      .map((key) => key.name)
      .filter((name) => Number(name.split(":")[1]) >= since)
      .sort((a, b) => Number(b.split(":")[1]) - Number(a.split(":")[1]));
    const newest = keys[0];
    if (newest) {
      const token = tokenIn(kv(["key", "get", newest, "--text"]));
      if (token) {
        return token;
      }
    }
    await wait(POLL_MS);
  }
  throw new Error(`no sign-in mail reached ${address}`);
}
