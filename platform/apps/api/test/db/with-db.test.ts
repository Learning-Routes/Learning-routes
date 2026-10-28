import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { withDb } from "../../src/db/with-db";
import { query, URLS } from "./connect";

// A stand-in for the Worker's env and ctx: Hyperdrive's connection string is the
// local lr_app URL, and waitUntil collects what the Worker would keep alive.
function worker() {
  const background: Promise<unknown>[] = [];
  return {
    env: { DB: { connectionString: URLS.app } as Hyperdrive },
    ctx: { waitUntil: (promise: Promise<unknown>) => background.push(promise) },
    background,
  };
}

const status = async (txid: string) =>
  (await query(URLS.app, "select txid_status($1::bigint) as status", [txid]))[0]?.status;

describe("withDb (Platform STEP 2 §1.6)", () => {
  it("commits before it returns, and closes the client in waitUntil", async () => {
    const { env, ctx, background } = worker();
    const txid = await withDb(env, ctx, null, async (tx) => {
      const rows = await tx.execute<{ id: string }>(sql`select txid_current()::text as id`);
      return rows.rows[0]?.id as string;
    });

    expect(await status(txid)).toBe("committed");
    expect(background).toHaveLength(1);
    await Promise.all(background);
  });

  it("sets the acting user first, for this transaction only", async () => {
    const { env, ctx, background } = worker();
    const user = "0190f3a0-0000-7000-8000-000000000001";
    const seen = await withDb(env, ctx, user, async (tx) => {
      const rows = await tx.execute<{ user: string }>(
        sql`select current_setting('app.user_id', true) as user`,
      );
      return rows.rows[0]?.user;
    });

    expect(seen).toBe(user);
    await Promise.all(background);
  });

  it("rolls back and rethrows when the work throws", async () => {
    const { env, ctx, background } = worker();
    let txid = "";
    await expect(
      withDb(env, ctx, null, async (tx) => {
        const rows = await tx.execute<{ id: string }>(sql`select txid_current()::text as id`);
        txid = rows.rows[0]?.id as string;
        throw new Error("decided against it");
      }),
    ).rejects.toThrow("decided against it");

    expect(await status(txid)).toBe("aborted");
    await Promise.all(background);
  });

  it("still closes the client when it cannot connect", async () => {
    const { ctx, background } = worker();
    const env = {
      DB: {
        connectionString: "postgres://lr_app:wrong@localhost:54318/learning_routes",
      } as Hyperdrive,
    };
    await expect(withDb(env, ctx, null, async () => "unreachable")).rejects.toThrow();

    expect(background).toHaveLength(1);
    await Promise.allSettled(background);
  });
});
