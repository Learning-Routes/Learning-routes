import type { PublicRoute } from "@learning-routes/public-read/reads";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CatalogPage, type CatalogView, catalogHref } from "../app/storefront/catalog-page";

// The catalog, from v2's Catalogo (Platform STEP 4 §3): plain links and a plain form.

const SCRIPT = /<script/;
const ROUTE: PublicRoute = {
  routeId: "0192d3a0-0000-7000-8000-000000000001",
  spaceId: "0192d3a0-0000-7000-8000-000000000002",
  spaceSlug: "mariana-ortega",
  slug: "portugues-para-viajar",
  version: 1,
  title: { es: "Portugués para viajar" },
  description: null,
  sourceLocale: "es",
  access: "open",
  pricing: "free",
  modules: [{ id: "m1", title: { es: "Uno" }, lessons: [{ es: "a" }, { es: "b" }] }],
  moduleCount: 1,
  lessonCount: 2,
  topic: "idiomas",
  level: "inicial",
  priceMinor: null,
  currency: null,
  spaceName: { es: "Mariana Ortega" },
  spaceBrandColor: "#127c76",
};

const view = (over: Partial<CatalogView> = {}): CatalogView => ({
  locale: "es",
  appOrigin: "https://app.learningroutes.com",
  creatorOrigin: (slug) => `https://${slug}.learningroutes.com`,
  topic: null,
  search: null,
  page: 1,
  routes: [ROUTE],
  hasNext: false,
  ...over,
});
const render = (over?: Partial<CatalogView>) => renderToString(<CatalogPage view={view(over)} />);

describe("the catalog page", () => {
  it("says who teaches a route and what it holds, in words", () => {
    const html = render();
    expect(html).toContain("Portugués para viajar");
    expect(html).toContain("Con Mariana Ortega");
    expect(html).toContain("1 módulo y 2 temas, en español");
  });

  it("links each card to the route's one page, on its creator's host", () => {
    expect(render()).toContain(
      'href="https://mariana-ortega.learningroutes.com/portugues-para-viajar"',
    );
  });

  it("searches with a plain GET form, and filters with plain links, with no script", () => {
    const html = render({ search: "guitarra", topic: "musica" });
    expect(html).toContain('method="get"');
    expect(html).toContain('action="/es/explorar"');
    expect(html).toContain('name="tema" value="musica"');
    expect(html).toContain('href="/es/explorar?q=guitarra&amp;tema=idiomas"');
    // The one script only adds motion, and never blocks: without it all of this still works.
    expect(html.match(SCRIPT)).toHaveLength(1);
    expect(html).toContain('<script type="module"');
  });

  it("marks the chosen topic", () => {
    expect(render({ topic: "musica" })).toContain(
      'aria-current="true" href="/es/explorar?tema=musica"',
    );
  });

  it("says when a search finds nothing, with a link that clears the filters", () => {
    const html = render({ routes: [], search: "<b>x</b>", topic: "musica" });
    expect(html).toContain("No encontramos rutas para «&lt;b&gt;x&lt;/b&gt;»");
    expect(html).toContain('href="/es/explorar"');
    expect(html).toContain("Quitar los filtros");
  });

  it("an empty catalog asks who wants to teach", () => {
    const html = render({ routes: [] });
    expect(html).toContain("¿Enseñas algo que sabes bien?");
    expect(html).toContain('href="https://app.learningroutes.com/ser-creador"');
  });

  it("links to the next and the previous page", () => {
    const html = render({ page: 2, hasNext: true });
    expect(html).toContain('rel="prev"');
    expect(html).toContain('rel="next"');
    expect(html).toContain("pagina=3");
    expect(html).toContain('href="/es/explorar"');
  });

  it("builds a link from what is set, and only that", () => {
    expect(catalogHref({ locale: "fr", topic: null, search: null, page: 1 })).toBe("/fr/explorar");
    expect(catalogHref({ locale: "fr", topic: "arte", search: "a b", page: 2 })).toBe(
      "/fr/explorar?q=a+b&tema=arte&pagina=2",
    );
  });
});
