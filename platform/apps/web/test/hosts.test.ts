import { RESERVED_SLUGS } from "@learning-routes/core/reserved-slugs";
import { describe, expect, it } from "vitest";
import {
  creatorSlugOf,
  INTERNAL_PREFIX,
  internalRequest,
  isAppPathElsewhere,
} from "../workers/hosts";

// A creator's pages live on their own host (Platform STEP 4 §5): one Worker, so the host
// picks the route. Everything else keeps its path.

const HOSTS = { appOrigin: "https://app.learningroutes.com", creatorDomain: "learningroutes.com" };

describe("which host belongs to a creator", () => {
  it("takes the one label under the creators' domain", () => {
    expect(creatorSlugOf("mariana.learningroutes.com", HOSTS)).toBe("mariana");
    expect(creatorSlugOf("MARIANA.learningroutes.com", HOSTS)).toBe("mariana");
  });

  it("never takes an address the platform keeps", () => {
    for (const slug of RESERVED_SLUGS) {
      expect(creatorSlugOf(`${slug}.learningroutes.com`, HOSTS), slug).toBeNull();
    }
  });

  it("works with a port, in a local run", () => {
    expect(
      creatorSlugOf("mariana.localhost:4174", {
        appOrigin: "http://localhost:4174",
        creatorDomain: "localhost:4174",
      }),
    ).toBe("mariana");
  });

  it.each([
    "learningroutes.com",
    "app.learningroutes.com",
    "new.learningroutes.com",
    "www.learningroutes.com",
    "api.learningroutes.com",
    "a.b.learningroutes.com",
    "xlearningroutes.com",
    "mariana.example.com",
  ])("%s is nobody's", (host) => {
    expect(creatorSlugOf(host, HOSTS)).toBeNull();
  });
});

describe("the request a page is rendered from", () => {
  const rewritten = (url: string) => new URL(internalRequest(new Request(url), HOSTS)?.url ?? "");

  it("moves a creator's paths under the creator's slug, keeping the query", () => {
    const url = rewritten("https://mariana.learningroutes.com/guitarra?lang=en");
    expect(url.host).toBe("mariana.learningroutes.com");
    expect(url.pathname).toBe(`${INTERNAL_PREFIX}/mariana/guitarra`);
    expect(url.search).toBe("?lang=en");
    expect(rewritten("https://mariana.learningroutes.com/").pathname).toBe(
      `${INTERNAL_PREFIX}/mariana`,
    );
  });

  it("leaves the creator's colour where it is, on their host too", () => {
    expect(rewritten("https://mariana.learningroutes.com/_brand/127c76.css").pathname).toBe(
      "/_brand/127c76.css",
    );
  });

  it("leaves every other host's paths as they are", () => {
    expect(rewritten("https://app.learningroutes.com/sign-in").pathname).toBe("/sign-in");
  });

  it("gives nobody the internal paths directly", () => {
    expect(
      internalRequest(new Request(`https://learningroutes.com${INTERNAL_PREFIX}/a`), HOSTS),
    ).toBeNull();
    // On a creator's host they fall under that creator's slug, where no route matches.
    expect(rewritten(`https://mariana.learningroutes.com${INTERNAL_PREFIX}/ana`).pathname).toBe(
      `${INTERNAL_PREFIX}/mariana${INTERNAL_PREFIX}/ana`,
    );
  });

  it("keeps the request's method and headers", () => {
    const request = new Request("https://mariana.learningroutes.com/", {
      headers: { "accept-language": "fr" },
    });
    expect(internalRequest(request, HOSTS)?.headers.get("accept-language")).toBe("fr");
  });
});

describe("pages with a session", () => {
  const elsewhere = (url: string) => isAppPathElsewhere(new URL(url), HOSTS);

  it("exist only on the app's host", () => {
    for (const path of [
      "/empezar?ruta=1",
      "/mis-rutas",
      "/mis-rutas/1",
      "/quiero-ensenar",
      "/admin",
      "/api/a/x",
    ]) {
      expect(elsewhere(`https://new.learningroutes.com${path}`), path).toBe(true);
      expect(elsewhere(`https://app.learningroutes.com${path}`), path).toBe(false);
    }
  });

  it("do not catch a route whose name merely starts the same", () => {
    expect(elsewhere("https://new.learningroutes.com/administrar")).toBe(false);
  });
});
