import type { Connections } from "@learning-routes/core/repos/ports";
import { and, eq, inArray, lt } from "drizzle-orm";
import {
  connectionUses,
  oauthAccessToken,
  oauthClient,
  oauthConsent,
  oauthRefreshToken,
} from "../schema/oauth";
import { memberships } from "../schema/tenancy";
import type { Db } from "./shared";

// A person's connected assistants (Platform STEP 5 §2). The OAuth tables have no row-level
// security, like the rest of Better Auth's, so every query here names the user.

const TEACHES = ["owner", "coeditor", "assistant"] as const;

const A_MINUTE_MS = 60_000;

/** When this person said yes to this client, or null: what makes a token still good. */
export async function consentedAt(db: Db, userId: string, clientId: string) {
  const [row] = await db
    .select({ createdAt: oauthConsent.createdAt })
    .from(oauthConsent)
    .where(and(eq(oauthConsent.userId, userId), eq(oauthConsent.clientId, clientId)));
  return row?.createdAt ?? null;
}

/** "Último uso", at most one write a minute for each connection. */
export async function noteUse(db: Db, userId: string, clientId: string, now: Date) {
  await db
    .insert(connectionUses)
    .values({ userId, clientId, lastUsedAt: now })
    .onConflictDoUpdate({
      target: [connectionUses.userId, connectionUses.clientId],
      set: { lastUsedAt: now },
      setWhere: lt(connectionUses.lastUsedAt, new Date(now.getTime() - A_MINUTE_MS)),
    });
}

export function connectionsRepo(db: Db): Connections {
  return {
    async canConnect(userId) {
      const rows = await db
        .select({ role: memberships.role })
        .from(memberships)
        .where(and(eq(memberships.userId, userId), inArray(memberships.role, [...TEACHES])))
        .limit(1);
      return rows.length > 0;
    },
    async list(userId) {
      const rows = await db
        .select({
          clientId: oauthConsent.clientId,
          clientName: oauthClient.name,
          scopes: oauthConsent.scopes,
          lastUsedAt: connectionUses.lastUsedAt,
        })
        .from(oauthConsent)
        .innerJoin(oauthClient, eq(oauthClient.clientId, oauthConsent.clientId))
        .leftJoin(
          connectionUses,
          and(
            eq(connectionUses.clientId, oauthConsent.clientId),
            eq(connectionUses.userId, userId),
          ),
        )
        .where(eq(oauthConsent.userId, userId));
      return rows.map((row) => ({
        clientId: row.clientId,
        clientName: row.clientName ?? row.clientId,
        scopes: row.scopes,
        lastUsedAt: row.lastUsedAt?.toISOString() ?? null,
      }));
    },
    async revoke(userId, clientId) {
      const mine = (
        table: typeof oauthConsent | typeof oauthRefreshToken | typeof oauthAccessToken,
      ) => and(eq(table.userId, userId), eq(table.clientId, clientId));
      const gone = await db.delete(oauthConsent).where(mine(oauthConsent)).returning({
        id: oauthConsent.id,
      });
      await db.delete(oauthAccessToken).where(mine(oauthAccessToken));
      await db.delete(oauthRefreshToken).where(mine(oauthRefreshToken));
      await db
        .delete(connectionUses)
        .where(and(eq(connectionUses.userId, userId), eq(connectionUses.clientId, clientId)));
      return gone.length > 0;
    },
  };
}
