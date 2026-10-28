import { defineConfig } from "drizzle-kit";

// drizzle-kit generates the migrations under drizzle/ from the schema, split by
// context (Platform STEP 2 §1.4). It connects directly as the migrator, never
// through Hyperdrive; locally the default is platform/docker-compose.yml's.
const CONTEXTS = ["auth", "content", "learning", "log", "tenancy", "versions"];

export default defineConfig({
  dialect: "postgresql",
  schema: CONTEXTS.map((name) => `./src/db/schema/${name}.ts`),
  out: "./drizzle",
  casing: "snake_case",
  strict: true,
  dbCredentials: {
    url:
      process.env.DATABASE_URL_MIGRATOR ??
      "postgres://lr_migrator:local-only-migrator@localhost:54318/learning_routes",
  },
});
