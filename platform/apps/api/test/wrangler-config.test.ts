import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseJsonc } from "./jsonc";

// biome-ignore lint/suspicious/noExplicitAny: a parsed config, checked field by field below
const config: any = parseJsonc(readFileSync(new URL("../wrangler.jsonc", import.meta.url), "utf8"));

const LR_APP_LOCAL = /^postgres:\/\/lr_app:[^@]+@localhost:54318\//;
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

  it("keeps no invocation log, which would carry each request's full URL", () => {
    expect(config.observability.logs.invocation_logs).toBe(false);
  });
});
