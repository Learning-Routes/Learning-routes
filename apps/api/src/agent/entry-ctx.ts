import type { negotiateLocale } from "@learning-routes/core/locales";
import { imagesRepo } from "../db/repos/images";
import { pgRepos } from "../db/repos/index";
import { tutorRepo } from "../db/repos/tutor";
import { pgTenancy } from "../db/tenancy";
import type { Database, Transaction } from "../db/with-db";
import { newId } from "../ids";
import type { AgentEnv } from "./env";

// What the agent Worker's entry points (entries.ts) give core: the person, in the app or through
// their MCP client, inside their own transaction.

/** Every repository, with the two only this Worker carries: the tutor's questions and route images. */
export const entryRepos = (tx: Transaction) => ({
  ...pgRepos(tx),
  tutor: tutorRepo(tx),
  images: imagesRepo(tx),
});

export const entryCtx = (
  tx: Transaction,
  person: { id: string; name: string },
  via: "ui" | "mcp" = "ui",
) => ({
  actor: { via, userId: person.id, name: person.name },
  repos: entryRepos(tx),
  tenancy: pgTenancy(tx),
  clock: { now: () => Date.now() },
  ids: { newId },
});

/** The platform's day of model spend, kept by this Worker (ledger.ts). */
export const ledgerOf = (env: AgentEnv) => env.LEDGER.get(env.LEDGER.idFromName("global"));

/** What an entry point is given once the request is the app's and its session is live. */
export interface Asked {
  request: Request;
  env: AgentEnv;
  ctx: ExecutionContext;
  db: Database;
  person: { id: string; name: string };
  locale: ReturnType<typeof negotiateLocale>;
  body: Record<string, unknown>;
  fetcher: typeof fetch;
}
