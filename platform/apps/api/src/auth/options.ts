import type { BetterAuthOptions } from "better-auth";

// The Better Auth options that shape its tables (Platform STEP 2 §2.1). The Worker's
// auth (§5) builds on these, and `pnpm db:auth-schema` generates the tables from
// them, so the two never disagree.
export const authOptions = {
  advanced: {
    // Postgres makes user ids, as uuid columns; the migration sets uuidv7().
    database: { generateId: "uuid" },
  },
  rateLimit: { enabled: true, storage: "database" },
  emailAndPassword: { enabled: false },
  telemetry: { enabled: false },
} satisfies BetterAuthOptions;
