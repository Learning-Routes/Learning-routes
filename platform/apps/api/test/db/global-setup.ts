import { migrate } from "../../scripts/migrate";
import { URLS } from "./connect";

// Every database test runs against the migrated schema: apply the migrations once,
// as the migrator, before any test file starts.
export default async function setup() {
  await migrate(URLS.migrator, new URL("../../drizzle/", import.meta.url));
}
