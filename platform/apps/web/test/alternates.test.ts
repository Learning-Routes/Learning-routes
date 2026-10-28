import { describe, expect, it } from "vitest";
import { alternates } from "../app/alternates";

const ORIGIN = "https://creator.example";
const path = (locale: string) => `/${locale}`;

describe("alternates", () => {
  it("links every locale with text, itself included, by full URL, plus x-default", () => {
    expect(alternates(ORIGIN, ["es", "en"], path)).toEqual([
      { tagName: "link", rel: "alternate", hrefLang: "es", href: "https://creator.example/es" },
      { tagName: "link", rel: "alternate", hrefLang: "en", href: "https://creator.example/en" },
      {
        tagName: "link",
        rel: "alternate",
        hrefLang: "x-default",
        href: "https://creator.example/",
      },
    ]);
  });

  it("gives no link to a locale without text", () => {
    const hrefLangs = alternates(ORIGIN, ["es"], path).map((link) => link.hrefLang);
    expect(hrefLangs).toEqual(["es", "x-default"]);
  });

  it("is reciprocal: every page in the set lists the same set", () => {
    // The set depends only on which locales have text, never on the page asking.
    const fromEs = alternates(ORIGIN, ["es", "pt", "it"], path);
    const fromIt = alternates(ORIGIN, ["es", "pt", "it"], path);
    expect(fromIt).toEqual(fromEs);
  });
});
