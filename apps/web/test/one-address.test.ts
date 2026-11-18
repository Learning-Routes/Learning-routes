import { LOCALES } from "@learning-routes/core/locales";
import { describe, expect, it } from "vitest";
import routes from "../app/routes";
import { creatorSlugOf, isAppPathElsewhere, isMcpPath } from "../workers/hosts";

// One address (Platform STEP 19): the public pages and the app share learningroutes.com, so no
// app path may take a locale's place, and the creators' hosts keep only their public pages.

const HOSTS = { appOrigin: "https://learningroutes.com", creatorDomain: "learningroutes.com" };
const firstSegments = routes
  .map((entry) => entry.path?.split("/")[0])
  .filter((segment): segment is string => !!segment && !segment.startsWith(":"));

describe("one address for the public pages and the app", () => {
  it("has no app path where a locale's pages are", () => {
    for (const locale of LOCALES) {
      expect(firstSegments).not.toContain(locale);
    }
  });

  it("serves the app and the MCP on the apex, and is no creator's host", () => {
    for (const path of ["/mis-rutas", "/creador", "/sign-in", "/admin", "/api/a/route.get"]) {
      expect(isAppPathElsewhere(new URL(`https://learningroutes.com${path}`), HOSTS)).toBe(false);
    }
    expect(isMcpPath(new URL("https://learningroutes.com/mcp"), HOSTS)).toBe(true);
    expect(creatorSlugOf("learningroutes.com", HOSTS)).toBeNull();
  });

  it("keeps the app off a creator's host", () => {
    for (const path of ["/mis-rutas", "/api/a/route.get", "/mcp"]) {
      expect(isAppPathElsewhere(new URL(`https://ana.learningroutes.com${path}`), HOSTS)).toBe(
        true,
      );
    }
    expect(isMcpPath(new URL("https://ana.learningroutes.com/mcp"), HOSTS)).toBe(false);
  });
});
