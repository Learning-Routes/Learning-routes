import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseJsonc } from "./jsonc";

// biome-ignore lint/suspicious/noExplicitAny: a parsed config, checked field by field below
const config: any = parseJsonc(readFileSync(new URL("../wrangler.jsonc", import.meta.url), "utf8"));

const LR_APP_LOCAL = /^postgres:\/\/lr_app:[^@]+@localhost:54318\//;
const LR_PUBLIC_LOCAL = /^postgres:\/\/lr_public:[^@]+@localhost:54318\//;
const HYPERDRIVE_ID = /^[0-9a-f]{32}$/;

describe("the API Worker's configuration (Platform STEP 2 §1.3)", () => {
  it("reaches the database through Hyperdrive, as lr_app locally, never the migrator", () => {
    expect(config.hyperdrive).toHaveLength(1);
    const [db] = config.hyperdrive;
    expect(db.binding).toBe("DB");
    expect(db.localConnectionString).toMatch(LR_APP_LOCAL);
    expect(db.id).toMatch(HYPERDRIVE_ID);
  });

  it("runs with nodejs_compat, which pg needs", () => {
    expect(config.compatibility_flags).toContain("nodejs_compat");
  });

  it("is minified: the bundle counts against a 300 KiB budget", () => {
    expect(config.minify).toBe(true);
  });

  it("is placed in the database's region", () => {
    expect(config.placement).toEqual({ mode: "targeted", region: "aws:us-east-1" });
  });

  it("sends sign-in links through the send_email binding, only from its configured address", () => {
    expect(config.vars.ENVIRONMENT).toBe("production");
    expect(config.vars.EMAIL_DELIVERY).toBeUndefined();
    expect(config.send_email).toEqual([
      { name: "EMAIL", allowed_sender_addresses: [config.vars.EMAIL_FROM] },
    ]);
  });

  it("purges the edge cache from a queue it both feeds and consumes, one consumer at a time", () => {
    const [producer] = config.queues.producers;
    const [consumer] = config.queues.consumers;
    expect(producer.binding).toBe("PURGE_QUEUE");
    expect(consumer.queue).toBe(producer.queue);
    expect(consumer.max_concurrency).toBe(1);
    expect(config.secrets.required).toContain("CLOUDFLARE_PURGE_TOKEN");
  });

  it("the web Worker reads only through DB_PUBLIC, as lr_public, never as lr_app", () => {
    const web = parseJsonc(
      readFileSync(new URL("../../web/wrangler.jsonc", import.meta.url), "utf8"),
      // biome-ignore lint/suspicious/noExplicitAny: a parsed config, checked field by field below
    ) as any;
    expect(web.hyperdrive).toHaveLength(1);
    expect(web.hyperdrive[0].binding).toBe("DB_PUBLIC");
    expect(web.hyperdrive[0].localConnectionString).toMatch(LR_PUBLIC_LOCAL);
    expect(web.compatibility_flags).toContain("nodejs_compat");
  });

  it("keeps no invocation log, which would carry each request's full URL", () => {
    expect(config.observability.logs.invocation_logs).toBe(false);
  });
});

const ANTHROPIC_PROVIDER = /MODEL_PROVIDER\W+anthropic/i;

describe("the assistant Worker's configuration (STEP 11-prep §A1)", () => {
  it("never names MODEL_PROVIDER: production has only the real provider, or none", () => {
    // The file's top-level vars are production's; it has no other environment.
    const text = readFileSync(new URL("../wrangler.agent.jsonc", import.meta.url), "utf8");
    expect((parseJsonc(text) as { env?: unknown }).env).toBeUndefined();
    expect(text).not.toContain("MODEL_PROVIDER");
    expect(text).not.toContain("MODEL_TIER_OVERRIDE");
    expect(text).not.toContain("ANTHROPIC_API_KEY");
  });

  it("never runs a real model in CI: no workflow names Anthropic's provider or key", () => {
    const folder = new URL("../../../.github/workflows/", import.meta.url);
    for (const file of readdirSync(folder)) {
      const text = readFileSync(new URL(file, folder), "utf8");
      expect(text, file).not.toMatch(ANTHROPIC_PROVIDER);
      expect(text, file).not.toContain("ANTHROPIC_API_KEY");
      expect(text, file).not.toContain("MODEL_TIER_OVERRIDE");
    }
    const browser = readFileSync(
      new URL("../../web/playwright.config.ts", import.meta.url),
      "utf8",
    );
    expect(browser).not.toMatch(ANTHROPIC_PROVIDER);
  });

  it("caps each space's assistant at 12 model calls a minute", () => {
    const agent = parseJsonc(
      readFileSync(new URL("../wrangler.agent.jsonc", import.meta.url), "utf8"),
    ) as { vars: Record<string, string> };
    expect(agent.vars.AGENT_CALLS_PER_MINUTE).toBe("12");
    expect(agent.vars.ENVIRONMENT).toBe("production");
  });
});
