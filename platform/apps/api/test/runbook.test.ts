import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// The owner's database runbook (Platform STEP 2 §7): every secret comes from the
// macOS Keychain, never a command line or shell history.

const runbook = readFileSync(
  new URL("../../../docs/runbooks/database.md", import.meta.url),
  "utf8",
);
const commands = [...runbook.matchAll(/```[a-z]*\n([\s\S]*?)```/g)].map((match) => match[1] ?? "");
const CREDENTIALS_IN_URL = /:\/\/[^:@\s/]+:[^@\s$]+@/;
const SAVE_SECRET = /security add-generic-password\b.*/g;
const STEP = /^(\d+)\. /gm;
const PROMPTS_LAST = / -w$/;
const USES_A_URL = /(?:psql |--connection-string=)("\$\([^)]*\)"|\S+)/g;
const FROM_KEYCHAIN = /^"\$\(security find-generic-password -s [a-z-]+ -w\)"?$/;
const READ_SECRET = /\$\(security find-generic-password -s [a-z-]+ -w\)/g;

describe("the database runbook", () => {
  it("has its ten steps, in order", () => {
    const numbers = [...runbook.matchAll(STEP)].map((match) => Number(match[1]));
    expect(numbers.slice(0, 10)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });

  it("puts no credential in a command", () => {
    expect(commands.length).toBeGreaterThan(5);
    expect(commands.filter((command) => CREDENTIALS_IN_URL.test(command))).toEqual([]);
  });

  it("saves each secret with -w last and no value, so the Keychain prompts for it", () => {
    const saves = commands.flatMap((command) => command.match(SAVE_SECRET) ?? []);
    expect(saves.length).toBeGreaterThan(0);
    for (const save of saves) {
      expect(save.trimEnd()).toMatch(PROMPTS_LAST);
    }
  });

  it("reads each secret it uses from the Keychain", () => {
    const uses = commands.join("\n").match(READ_SECRET) ?? [];
    expect(uses.length).toBeGreaterThanOrEqual(3);
  });

  it("gives every psql and every Hyperdrive connection its URL from the Keychain", () => {
    const urls = [...commands.join("\n").matchAll(USES_A_URL)].map((match) => match[1] ?? "");
    expect(urls.length).toBeGreaterThanOrEqual(4);
    expect(urls.filter((url) => !FROM_KEYCHAIN.test(url))).toEqual([]);
  });

  it("checks the default role bypasses row-level security, before the seed relies on it", () => {
    expect(runbook).toContain("rolbypassrls");
  });

  it("deploys the API Worker and routes the app's /api to it before checking it", () => {
    expect(runbook).toContain("wrangler deploy");
    expect(runbook).toContain("new.learningroutes.com/api/*");
  });
});
