import type { Invitations } from "@learning-routes/core/repos/ports";
import { sql } from "drizzle-orm";
import { type Db, fail, ok } from "./shared";

// Invitations (Platform STEP 10, pulled forward). Everything goes through security definer
// functions, which check who is asking: lr_app holds no privilege on the table.

export const invitationsRepo = (db: Db): Invitations => ({
  invite: async ({ applicationId, tokenHash, expiresAt }) => {
    const { rows } = await db.execute(
      sql`select * from app.invite_applicant(${applicationId}::uuid, ${tokenHash}, ${new Date(expiresAt).toISOString()}::timestamptz)`,
    );
    const row = rows[0] as { outcome: string; email: string; name: string; locale: never };
    return row?.outcome === "ok"
      ? ok({ applicationId, email: row.email, name: row.name, locale: row.locale })
      : fail("not_found");
  },
  preview: async (tokenHash) => {
    const { rows } = await db.execute(sql`select * from app.invitation_state(${tokenHash})`);
    return rows[0] as never;
  },
  accept: async ({ tokenHash, slug }) => {
    const { rows } = await db.execute(
      sql`select * from app.accept_invitation(${tokenHash}, ${slug})`,
    );
    const row = rows[0] as { outcome: string; space_id: string };
    if (row?.outcome === "ok") {
      return ok({ spaceId: row.space_id, slug });
    }
    return fail(row?.outcome === "slug_taken" ? "conflict" : "not_found");
  },
});
