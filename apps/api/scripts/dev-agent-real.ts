import { execFileSync, spawn } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

// The assistant's Worker on this Mac with a real model (STEP 11-prep §A1b): Anthropic's API, with
// the owner's key read from the macOS Keychain at start. The key goes to wrangler only through
// this process's environment: never to disk, never into .dev.vars, never to the screen. Local
// development only: the Worker refuses MODEL_PROVIDER anywhere else, and no workflow sets it.
// pnpm dev:agent:real [wrangler dev arguments, such as --port 8790 --var MODEL_TIER_OVERRIDE:small]

const SERVICE = "learning-routes-anthropic";
// Any Anthropic key, should one reach the output some other way.
const KEY_SHAPE = /sk-ant-[A-Za-z0-9_-]+/g;

const CONFIG = "wrangler.agent.jsonc";
const LOCAL_CONFIG = ".wrangler/agent-real.jsonc";

/**
 * The agent's config for this run, written under .wrangler (ignored by git): the same Worker, its
 * main seen from there, with ANTHROPIC_API_KEY among the secrets it requires. With secrets declared,
 * wrangler takes a value from the environment only for a name it requires, and a --var would win
 * over it. Names only: the key is never in this file.
 */
export function realConfig(text: string): string {
  const main = '"main": "src/agent/index.ts"';
  const secrets = '"secrets": { "required": ["BETTER_AUTH_SECRET"] }';
  if (!(text.includes(main) && text.includes(secrets))) {
    throw new Error(`${CONFIG} changed: update dev-agent-real.ts`);
  }
  return text
    .replace(main, '"main": "../src/agent/index.ts"')
    .replace(secrets, '"secrets": { "required": ["BETTER_AUTH_SECRET", "ANTHROPIC_API_KEY"] }');
}

/** A line of output with the key, and anything shaped like one, taken out. */
export function redacted(text: string, key: string): string {
  return (key ? text.split(key).join("[redacted]") : text).replace(KEY_SHAPE, "[redacted]");
}

/** Output redacted a whole line at a time: a key split across two pieces is still one line. */
export function redactedLines(key: string, write: (text: string) => void) {
  let rest = "";
  return {
    write(piece: string) {
      const lines = (rest + piece).split("\n");
      rest = lines.pop() ?? "";
      for (const line of lines) {
        write(`${redacted(line, key)}\n`);
      }
    },
    end() {
      if (rest) {
        write(redacted(rest, key));
      }
      rest = "";
    },
  };
}

function keyFromKeychain(): string {
  try {
    return execFileSync("security", ["find-generic-password", "-s", SERVICE, "-w"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    throw new Error(`no Keychain item for the service ${SERVICE}`);
  }
}

if (process.argv[1]?.endsWith("dev-agent-real.ts")) {
  const key = keyFromKeychain();
  mkdirSync(".wrangler", { recursive: true });
  writeFileSync(LOCAL_CONFIG, realConfig(readFileSync(CONFIG, "utf8")));
  // Only what wrangler needs: the Worker sees this environment as its own vars.
  const env = {
    PATH: process.env.PATH ?? "",
    HOME: process.env.HOME ?? "",
    TMPDIR: process.env.TMPDIR ?? "",
    CLOUDFLARE_INCLUDE_PROCESS_ENV: "true",
    ANTHROPIC_API_KEY: key,
  };
  const args = [
    "exec",
    "wrangler",
    "dev",
    "--config",
    LOCAL_CONFIG,
    "--inspector-port",
    "0",
    "--var",
    "ENVIRONMENT:development",
    "--var",
    "MODEL_PROVIDER:anthropic",
    ...process.argv.slice(2),
  ];
  // The generated Worker types make ProcessEnv require the Worker's vars; this one is wrangler's own.
  const wrangler = spawn("pnpm", args, {
    env: env as unknown as NodeJS.ProcessEnv,
    stdio: ["inherit", "pipe", "pipe"],
  });
  const out = redactedLines(key, (text) => process.stdout.write(text));
  const errors = redactedLines(key, (text) => process.stderr.write(text));
  wrangler.stdout.on("data", (piece: Buffer) => out.write(String(piece)));
  wrangler.stderr.on("data", (piece: Buffer) => errors.write(String(piece)));
  wrangler.on("exit", (code: number | null) => {
    out.end();
    errors.end();
    process.exit(code ?? 1);
  });
}
