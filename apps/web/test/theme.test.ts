import { describe, expect, it } from "vitest";
import { safeNext, themeCookie, themeFromCookie } from "../app/theme";

describe("the theme cookie", () => {
  it("reads a valid choice, and nothing else", () => {
    expect(themeFromCookie("a=b; lr_theme=dark")).toBe("dark");
    expect(themeFromCookie("lr_theme=light")).toBe("light");
    expect(themeFromCookie("lr_theme=<script>")).toBeUndefined();
    expect(themeFromCookie(null)).toBeUndefined();
  });

  it("stays on the host that set it", () => {
    const cookie = themeCookie("dark");
    expect(cookie).toContain("lr_theme=dark");
    expect(cookie).toContain("Secure");
    expect(cookie).toContain("SameSite=Lax");
    expect(cookie).not.toContain("Domain");
  });
});

describe("where the toggle goes back to", () => {
  it("is a path on this site", () => {
    expect(safeNext("/creador?a=1")).toBe("/creador?a=1");
  });

  it.each([
    "https://elsewhere.example",
    "//elsewhere.example",
    "/\\elsewhere.example",
    "/\t/elsewhere.example",
    "/\n/elsewhere.example",
    "\t//elsewhere.example",
    null,
  ])("never %s", (next) => {
    expect(safeNext(next)).toBe("/creador");
  });
});
