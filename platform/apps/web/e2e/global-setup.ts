import { execFileSync } from "node:child_process";

// The browser tests read the local database through DB_PUBLIC: the migrated schema, and
// the storefront's invented fixtures (apps/api/scripts/seed-storefront.ts).
export default function setup() {
  for (const script of ["db:migrate", "db:seed-storefront"]) {
    execFileSync("pnpm", ["--filter", "@learning-routes/api", script], { stdio: "inherit" });
  }
}
