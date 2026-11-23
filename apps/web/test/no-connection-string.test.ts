import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

// The build puts this stand-in in pg-connection-string's place: the storefront connects with
// Hyperdrive's fields, so a connection string reaching pg is a mistake, and says so.

const require = createRequire(import.meta.url);

describe("the web Worker's stand-in for pg-connection-string", () => {
  it("refuses to parse a connection string, plainly", () => {
    const { parse } = require("../workers/no-connection-string.cjs") as {
      parse: (text: string) => unknown;
    };
    expect(() => parse("postgres://someone@somewhere/db")).toThrow(/Hyperdrive's fields/);
  });
});
