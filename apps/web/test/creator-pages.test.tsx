import type { PublicRoute, PublicSpace } from "@learning-routes/public-read/reads";
import { renderToStaticMarkup, renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { courseData } from "../app/storefront/course-data";
import { priceInWords } from "../app/storefront/creator-frame";
import { CreatorPage, CreatorWeave } from "../app/storefront/creator-pages";
import { pageLocale, withLang } from "../app/storefront/page-locale";
import { RoutePage } from "../app/storefront/route-page-view";
import { sitemapXml } from "../app/storefront/sitemap-xml";

const WOVEN = /weave-over/g;
const SPACE: PublicSpace = {
  id: "s1",
  slug: "mariana-ortega",
  name: { es: "Mariana Ortega" },
  defaultLocale: "es",
  locales: ["es", "en"],
  tagline: { es: "Habla portugués en tu próximo viaje." },
  bio: { es: "Enseño portugués a viajeros." },
  brandColor: "#127c76",
};
const ROUTE: PublicRoute = {
  routeId: "0192d3a0-0000-7000-8000-000000000001",
  spaceId: "s1",
  spaceSlug: "mariana-ortega",
  slug: "portugues",
  version: 1,
  title: { es: "Portugués para viajar" },
  description: { es: "Del aeropuerto al restaurante." },
  sourceLocale: "es",
  access: "open",
  pricing: "free",
  modules: [
    { id: "m1", title: { es: "Llegar" }, lessons: [{ es: "Saludos" }, { es: "Números" }] },
    { id: "m2", title: { es: "Moverte" }, lessons: [{ es: "El hotel" }] },
  ],
  moduleCount: 2,
  lessonCount: 3,
  topic: "idiomas",
  level: "inicial",
  priceMinor: 2900,
  currency: "EUR",
  spaceName: { es: "Mariana Ortega" },
  spaceBrandColor: "#127c76",
};
const LINKS = { appOrigin: "https://app.test", platformOrigin: "https://platform.test" };

describe("a creator's page", () => {
  const html = renderToString(
    <CreatorPage space={SPACE} routes={[ROUTE]} locale="es" {...LINKS} />,
  );

  it("says who they are, with an initial until photos arrive", () => {
    expect(html).toContain("Mariana Ortega");
    expect(html).toContain("Habla portugués en tu próximo viaje.");
    expect(html).toContain("Enseño portugués a viajeros.");
    expect(html).toContain(">M<");
  });

  it("lists their routes, and is made with the platform", () => {
    expect(html).toContain('href="/portugues"');
    expect(html).toContain("2 módulos y 3 temas");
    expect(html).toContain("El primer módulo es gratis");
    expect(html).toContain("Hecho con");
  });

  it("is not a dead end with no routes yet", () => {
    const empty = renderToString(<CreatorPage space={SPACE} routes={[]} locale="es" {...LINKS} />);
    expect(empty).toContain("Pronto habrá rutas aquí.");
  });
});

describe("a route's page", () => {
  const render = (route = ROUTE) =>
    renderToString(<RoutePage space={SPACE} route={route} locale="es" {...LINKS} />);

  it("says its facts in words", () => {
    expect(render()).toContain("2 módulos y 3 temas. Para empezar desde cero. En español.");
  });

  it("shows the modules as stations, module 1 free, then the final exam", () => {
    const html = render();
    expect(html).toContain("Módulo 1");
    expect(html).toContain("Llegar");
    expect(html).toContain("Gratis");
    expect(html).toContain("1. Saludos");
    expect(html).toContain("2. Números");
    expect(html).toContain("Módulo 2");
    expect(html).toContain("Moverte");
    // No exam the creator didn't write.
    expect(html).not.toContain("Examen final");
  });

  it("says the price in words, and that you pay once", () => {
    const html = render({ ...ROUTE, pricing: "paid" });
    expect(html).toContain("Empieza gratis, hoy.");
    expect(html).toContain("pagas una vez por la ruta");
    expect(html).toContain("29,00");
    expect(render({ ...ROUTE, priceMinor: null, currency: null })).not.toContain("pagas una vez");
  });

  it('"Empezar gratis" carries only the route\'s id', () => {
    expect(render()).toContain(`href="https://app.test/empezar?ruta=${ROUTE.routeId}"`);
  });
});

describe("what surrounds them", () => {
  it("writes a price the way its currency does", () => {
    expect(priceInWords(2900, "EUR", "en")).toBe("€29.00");
    expect(priceInWords(2900, "JPY", "en")).toBe("¥2,900");
  });

  it("takes a locale only if the space has text in it", () => {
    const at = (query: string) => new URL(`https://a.test/${query}`);
    expect(pageLocale(at("?lang=en"), SPACE)).toBe("en");
    expect(pageLocale(at("?lang=fr"), SPACE)).toBe("es");
    expect(pageLocale(at("?lang=<x>"), SPACE)).toBe("es");
    expect(pageLocale(at(""), SPACE)).toBe("es");
    // And only if the route has it too.
    expect(pageLocale(at("?lang=en"), SPACE, ROUTE.title)).toBe("es");
  });

  it("gives the space's own language the plain URL", () => {
    expect(withLang("/portugues", "es", SPACE)).toBe("/portugues");
    expect(withLang("/portugues", "en", SPACE)).toBe("/portugues?lang=en");
  });

  it("describes the route as a schema.org Course", () => {
    const data = courseData({
      route: { ...ROUTE, pricing: "paid" },
      space: SPACE,
      locale: "es",
      canonical: "https://c/p",
    });
    expect(data).toMatchObject({
      "@type": "Course",
      name: "Portugués para viajar",
      url: "https://c/p",
      provider: { name: "Mariana Ortega" },
      offers: { price: "29.00", priceCurrency: "EUR" },
    });
  });

  it("escapes a sitemap's URLs", () => {
    expect(sitemapXml(["https://a.test/?a=1&b=2"])).toContain("https://a.test/?a=1&amp;b=2");
  });
});

describe("the creator's woven hero", () => {
  const route = (routeId: string, lessons: number) =>
    ({
      routeId,
      modules: [{ lessons: Array.from({ length: lessons }, () => ({ es: "t" })) }],
    }) as never;

  it("is one bold line for a creator with one route", () => {
    const html = renderToStaticMarkup(<CreatorWeave routes={[route("a", 3)]} />);
    expect(html).toContain("creator-weave-one");
    expect(html.match(WOVEN)).toHaveLength(1);
  });

  it("braids a line per route", () => {
    const html = renderToStaticMarkup(<CreatorWeave routes={[route("a", 3), route("b", 5)]} />);
    expect(html).not.toContain("creator-weave-one");
    expect(html.match(WOVEN)).toHaveLength(2);
  });

  it("draws nothing for a creator with no routes yet", () => {
    expect(renderToStaticMarkup(<CreatorWeave routes={[]} />)).toBe("");
  });
});
