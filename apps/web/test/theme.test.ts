import { describe, expect, it } from "vitest";
import { nextOnOurHosts, themeCookie, themeFromCookie } from "../app/theme";
import { isOurHost, themePost } from "../workers/theme";

const HOSTS = { appOrigin: "https://app.learningroutes.com", creatorDomain: "learningroutes.com" };
const ours = (host: string) => isOurHost(host, HOSTS);

describe("the theme cookie", () => {
  it("reads a valid choice, and nothing else", () => {
    expect(themeFromCookie("a=b; lr_theme=dark")).toBe("dark");
    expect(themeFromCookie("lr_theme=light")).toBe("light");
    expect(themeFromCookie("lr_theme=<script>")).toBeUndefined();
    expect(themeFromCookie(null)).toBeUndefined();
  });

  it("is one cookie for every host we serve, that only the Worker reads", () => {
    const cookie = themeCookie("dark", "learningroutes.com");
    expect(cookie).toContain("lr_theme=dark");
    expect(cookie).toContain("Domain=learningroutes.com");
    expect(cookie).toContain("Secure");
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("SameSite=Lax");
  });

  it("stays on its host where the domain has one label, which a browser refuses as a Domain", () => {
    expect(themeCookie("dark", "localhost")).not.toContain("Domain");
  });
});

describe("our hosts", () => {
  it("are the app, the platform and each creator's", () => {
    expect(ours("app.learningroutes.com")).toBe(true);
    expect(ours("learningroutes.com")).toBe(true);
    expect(ours("mariana-ortega.learningroutes.com")).toBe(true);
  });

  it.each([
    "elsewhere.example",
    "learningroutes.com.elsewhere.example",
    "evil-learningroutes.com",
    "a.b.learningroutes.com",
  ])("never %s", (host) => {
    expect(ours(host)).toBe(false);
  });
});

describe("where the toggle goes back to", () => {
  const from = new URL("https://mariana-ortega.learningroutes.com/theme");

  it("is the page it came from, on any of our hosts", () => {
    expect(nextOnOurHosts("/portugues?a=1", from, ours)).toBe(
      "https://mariana-ortega.learningroutes.com/portugues?a=1",
    );
    expect(nextOnOurHosts("https://learningroutes.com/es", from, ours)).toBe(
      "https://learningroutes.com/es",
    );
    expect(nextOnOurHosts("https://app.learningroutes.com/mis-rutas", from, ours)).toBe(
      "https://app.learningroutes.com/mis-rutas",
    );
  });

  it.each([
    "https://elsewhere.example",
    "//elsewhere.example",
    "/\\elsewhere.example",
    "/\t/elsewhere.example",
    "/\n/elsewhere.example",
    "\t//elsewhere.example",
    "http://learningroutes.com/es",
    "javascript:alert(1)",
    "https://learningroutes.com.elsewhere.example/",
    "",
    null,
  ])("never %s", (next) => {
    expect(nextOnOurHosts(next, from, ours)).toBe("https://mariana-ortega.learningroutes.com/");
  });
});

const post = (url: string, body: Record<string, string>, method = "POST") =>
  themePost(
    new Request(url, {
      method,
      ...(method === "POST" ? { body: new URLSearchParams(body) } : {}),
    }),
    HOSTS,
  );

describe("the toggle's post", () => {
  it("is answered on a creator's host, back to the page, with the cookie for every host", async () => {
    const response = await post("https://mariana-ortega.learningroutes.com/theme", {
      theme: "dark",
      next: "/portugues-para-viajar",
    });
    expect(response?.status).toBe(303);
    expect(response?.headers.get("location")).toBe(
      "https://mariana-ortega.learningroutes.com/portugues-para-viajar",
    );
    const cookies = response?.headers.getSetCookie() ?? [];
    expect(cookies).toContainEqual(expect.stringContaining("Domain=learningroutes.com"));
    expect(cookies).toContainEqual(expect.stringContaining("lr_theme=; Path=/; Max-Age=0"));
  });

  it("never sends anyone off our hosts", async () => {
    const response = await post("https://learningroutes.com/theme", {
      theme: "light",
      next: "https://elsewhere.example/",
    });
    expect(response?.headers.get("location")).toBe("https://learningroutes.com/");
  });

  it("refuses what is not a theme, and anything but a post", async () => {
    expect((await post("https://learningroutes.com/theme", { theme: "red" }))?.status).toBe(400);
    expect((await post("https://learningroutes.com/theme", {}, "GET"))?.status).toBe(405);
  });

  it("leaves every other request, and every other host, to the pages", async () => {
    expect(await post("https://learningroutes.com/es", { theme: "dark" })).toBeNull();
    expect(await post("https://elsewhere.example/theme", { theme: "dark" })).toBeNull();
  });
});
