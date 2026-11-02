import { BRAND } from "@learning-routes/core/locales";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { Route } from "../app/routes/storefront/+types/home";
import StorefrontHome, { meta } from "../app/routes/storefront/home";

const H1 = /<h1[ >]/g;
const loaderData = { lang: "es", origin: "https://learningroutes.com" } as const;

describe("the storefront home", () => {
  it("shows the name and the line", () => {
    const html = renderToString(<StorefrontHome {...({ loaderData } as Route.ComponentProps)} />);

    expect(html).toContain(BRAND);
    expect(html).toContain("Aprende lo que quieras, bien.");
  });

  it("has one h1, and no script of its own", () => {
    const html = renderToString(<StorefrontHome {...({ loaderData } as Route.ComponentProps)} />);
    expect(html.match(H1)).toHaveLength(1);
    expect(html).not.toContain("<script");
  });

  it("has a description and an Open Graph image in the page's language", () => {
    const tags = meta({ loaderData } as Route.MetaArgs);
    expect(tags).toContainEqual({
      property: "og:image",
      content: "https://learningroutes.com/og-es.png",
    });
    expect(tags.some((tag) => "name" in tag && tag.name === "description")).toBe(true);
  });

  it("titles the page", () => {
    expect(meta({ loaderData } as Route.MetaArgs)).toContainEqual({ title: BRAND });
  });
});
