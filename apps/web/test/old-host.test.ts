import { describe, expect, it } from "vitest";
import { fromOldHost } from "../workers/old-host";

// One address (Platform STEP 19): every request to app.learningroutes.com answers 308 to the same
// path on learningroutes.com, and a signed-in page open goes through the hand-off first.

const ORIGINS = {
  appOrigin: "https://learningroutes.com",
  oldAppOrigin: "https://app.learningroutes.com",
};
const SESSION = "__Host-lr_session=abc.def";

function api(answer: Response | null) {
  const seen: Request[] = [];
  const fetcher = async (request: Request) => {
    seen.push(request);
    if (answer === null) {
      throw new Error("down");
    }
    return answer.clone();
  };
  return { seen, fetcher };
}

const at = (path: string, init: RequestInit = {}) =>
  new Request(`https://app.learningroutes.com${path}`, init);

describe("the old app host", () => {
  it("is left alone on every other host", async () => {
    const { fetcher } = api(null);
    for (const url of ["https://learningroutes.com/mis-rutas", "https://ana.learningroutes.com/"]) {
      expect(await fromOldHost(new Request(url), ORIGINS, fetcher)).toBeNull();
    }
    expect(await fromOldHost(at("/"), { appOrigin: ORIGINS.appOrigin }, fetcher)).toBeNull();
  });

  it("answers 308 to the same path and query, for any method, without a session", async () => {
    const { seen, fetcher } = api(null);
    for (const [path, method] of [
      ["/mis-rutas?tab=1", "GET"],
      ["/api/a/route.get", "POST"],
      ["/mcp", "POST"],
      ["/.well-known/oauth-authorization-server", "GET"],
    ] as const) {
      const moved = await fromOldHost(at(path, { method }), ORIGINS, fetcher);
      expect(moved?.status).toBe(308);
      expect(moved?.headers.get("location")).toBe(`https://learningroutes.com${path}`);
    }
    expect(seen).toHaveLength(0);
  });

  it("hands a signed-in page open to the new host, with the person's cookie, address and browser", async () => {
    const { seen, fetcher } = api(Response.json({ code: "c0de" }));
    const moved = await fromOldHost(
      at("/creador?x=1", {
        headers: {
          cookie: `a=b; ${SESSION}`,
          "user-agent": "Navegador",
          "cf-connecting-ip": "203.0.113.9",
          "sec-fetch-mode": "navigate",
        },
      }),
      ORIGINS,
      fetcher,
    );
    expect(moved?.status).toBe(308);
    expect(moved?.headers.get("location")).toBe(
      "https://learningroutes.com/api/handoff?code=c0de&next=%2Fcreador%3Fx%3D1",
    );
    expect(moved?.headers.get("set-cookie")).toContain("__Host-lr_session=; Path=/; Max-Age=0");
    const [asked] = seen;
    expect(asked?.url).toBe("https://learningroutes.com/api/handoff");
    expect(asked?.method).toBe("POST");
    expect(Object.fromEntries(asked?.headers ?? [])).toMatchObject({
      origin: "https://learningroutes.com",
      cookie: `a=b; ${SESSION}`,
      "user-agent": "Navegador",
      "cf-connecting-ip": "203.0.113.9",
    });
  });

  it("still moves the person when there is no code: a script's fetch, a POST, or the API down", async () => {
    const down = api(null);
    const refused = api(new Response(null, { status: 401 }));
    const cases: [RequestInit, typeof down][] = [
      [{ headers: { cookie: SESSION } }, down],
      [{ headers: { cookie: SESSION } }, refused],
      [{ headers: { cookie: SESSION, "sec-fetch-mode": "cors" } }, refused],
      [{ method: "POST", headers: { cookie: SESSION } }, refused],
    ];
    for (const [init, { fetcher }] of cases) {
      const moved = await fromOldHost(at("/mis-rutas", init), ORIGINS, fetcher);
      expect(moved?.headers.get("location")).toBe("https://learningroutes.com/mis-rutas");
    }
  });
});
