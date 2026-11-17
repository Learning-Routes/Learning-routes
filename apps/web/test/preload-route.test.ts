import { describe, expect, it } from "vitest";
import { filesOf } from "../app/ui/preload-route";

// The player's files, read from React Router's manifest (Platform STEP 15).
describe("filesOf", () => {
  it("names a route's module and what it imports, and nothing for a route it does not know", () => {
    const manifest = {
      routes: { "routes/tema": { module: "/assets/tema-1.js", imports: ["/assets/chunk-2.js"] } },
    };
    expect(filesOf(manifest, "routes/tema")).toEqual(["/assets/tema-1.js", "/assets/chunk-2.js"]);
    expect(filesOf(manifest, "routes/elsewhere")).toEqual([]);
    expect(filesOf(undefined, "routes/tema")).toEqual([]);
  });
});
