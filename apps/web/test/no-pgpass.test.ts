import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

// pg asks pgpass for a password only when the connection has none; a Worker's connection string
// always carries one, and a Worker has no ~/.pgpass. The build puts this stand-in in its place.

const require = createRequire(import.meta.url);

describe("the web Worker's stand-in for pgpass", () => {
  it("answers as pgpass does when it finds no password: the callback, with nothing", () => {
    const pgPass = require("../workers/no-pgpass.cjs") as (
      params: unknown,
      done: (password?: string) => void,
    ) => void;
    const answers: unknown[][] = [];
    pgPass({ host: "localhost" }, (...given) => answers.push(given));
    expect(answers).toEqual([[]]);
  });
});
