import { LANDING_TEXT } from "@learning-routes/core/copy/landing";
import { BRAND } from "@learning-routes/core/locales";
import { renderToStaticMarkup, renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { HeroRoute } from "../app/landing/hero-route";
import type { Route } from "../app/routes/storefront/+types/home";
import StorefrontHome, { meta } from "../app/routes/storefront/home";

const H1 = /<h1[ >]/g;
const ROUTE = {
  routeId: "r1",
  spaceSlug: "ana",
  slug: "guitarra",
  title: { es: "Guitarra" },
  sourceLocale: "es",
  modules: [],
  moduleCount: 4,
  lessonCount: 18,
  spaceName: { es: "Ana" },
  spaceBrandColor: null,
};
const loaderData = {
  lang: "es",
  origin: "https://learningroutes.com",
  routes: [],
  appOrigin: "https://app.learningroutes.com",
  creatorDomain: "learningroutes.com",
} as const;
const render = (data: object = loaderData) =>
  renderToString(<StorefrontHome {...({ loaderData: data } as unknown as Route.ComponentProps)} />);

describe("the storefront home", () => {
  it("shows the name and the line", () => {
    const html = render();

    expect(html).toContain(BRAND);
    expect(html).toContain("Aprende con quien mejor lo enseña.");
  });

  it("has one h1, and no script of its own", () => {
    const html = render();
    expect(html.match(H1)).toHaveLength(1);
    expect(html).not.toContain("<script");
  });

  it("has a description and an Open Graph image in the page's language", () => {
    const tags = meta({ loaderData } as unknown as Route.MetaArgs);
    expect(tags).toContainEqual({
      property: "og:image",
      content: "https://learningroutes.com/og-es.png",
    });
    expect(tags.some((tag) => "name" in tag && tag.name === "description")).toBe(true);
  });

  it("draws the route inline, under its 6 KB budget, naming what it shows", () => {
    const svg = renderToStaticMarkup(<HeroRoute words={LANDING_TEXT.es} />);
    expect(new TextEncoder().encode(svg).length).toBeLessThan(6 * 1024);
    for (const words of [
      LANDING_TEXT.es.mapHere,
      LANDING_TEXT.es.mapExtra,
      LANDING_TEXT.es.mapExam,
    ]) {
      expect(svg).toContain(words);
    }
    expect(svg).toContain("aria-label");
  });

  it('links to the catalog, and to "Quiero enseñar" on the app host', () => {
    const html = render();
    expect(html).toContain('href="/es/explorar"');
    expect(html).toContain('href="https://app.learningroutes.com/quiero-ensenar"');
    expect(html).toContain("¿Enseñas algo que sabes bien?");
  });

  it('hides "Rutas para empezar" when there are none', () => {
    expect(render()).not.toContain("Rutas para empezar");
  });

  it("shows the routes to start with, linked to their creators' hosts", () => {
    const html = render({ ...loaderData, routes: [ROUTE] });
    expect(html).toContain("Rutas para empezar");
    expect(html).toContain('href="https://ana.learningroutes.com/guitarra"');
    expect(html).toContain("Con Ana");
  });

  it("titles the page", () => {
    expect(meta({ loaderData } as unknown as Route.MetaArgs)).toContainEqual({ title: BRAND });
  });
});
