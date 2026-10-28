import { describe, expect, it } from "vitest";
import config from "../../drizzle.config";

// Platform STEP 2 §1.4: the schema is split by context from the start, so no file
// grows past the 300-line limit.
const CONTEXTS = ["auth", "content", "learning", "log", "tenancy", "versions"];

describe("the schema's files", () => {
  it("are one per context, and drizzle-kit reads exactly those", () => {
    expect(config.schema).toEqual(CONTEXTS.map((name) => `./src/db/schema/${name}.ts`));
  });
});
