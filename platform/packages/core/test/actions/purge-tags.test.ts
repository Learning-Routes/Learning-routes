import { describe, expect, it } from "vitest";
import { purgeTagsAfter } from "../../src/actions/purge-tags";

const ids = { spaceId: "space-1", routeId: "route-1" };

describe("which cached pages an action makes stale", () => {
  it("publishing purges the route's pages and its space's page", () => {
    expect(purgeTagsAfter("route.publish", { ...ids, version: 2 })).toEqual([
      "route:route-1",
      "space:space-1",
    ]);
  });

  it("changing a creator's page purges their pages", () => {
    expect(purgeTagsAfter("space.update", ids)).toEqual(["space:space-1"]);
  });

  it("every other action purges nothing", () => {
    expect(purgeTagsAfter("route.get", ids)).toEqual([]);
    expect(purgeTagsAfter("no.such.action", ids)).toEqual([]);
  });
});
