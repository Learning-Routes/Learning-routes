import { execFileSync, spawn } from "node:child_process";

// The assistant's Worker on this Mac with a real model (STEP 11-prep §A1b): Anthropic's API, with
// the owner's key read from the macOS Keychain at start. The key goes to wrangler only through
// this process's environment: never to disk, never into .dev.vars, never to the screen. Local
// development only: the Worker refuses MODEL_PROVIDER anywhere else, and no workflow sets it.
// pnpm dev:agent:real [wrangler dev arguments, such as --port 8790 --var MODEL_TIER_OVERRIDE:small]

const SERVICE = "learning-routes-anthropic";
// Any Anthropic key, should one reach the output some other way.
const KEY_SHAPE = /sk-ant-[A-Za-z0-9_-]+/g;

/** A line of output with the key, and anything shaped like one, taken out. */
export function redacted(text: string, key: string): string {
  return (key ? text.split(key).join("[redacted]") : text).replace(KEY_SHAPE, "[redacted]");
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
    "wrangler.agent.jsonc",
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
  wrangler.stdout.on("data", (piece: Buffer) => process.stdout.write(redacted(String(piece), key)));
  wrangler.stderr.on("data", (piece: Buffer) => process.stderr.write(redacted(String(piece), key)));
  wrangler.on("exit", (code: number | null) => process.exit(code ?? 1));
}
