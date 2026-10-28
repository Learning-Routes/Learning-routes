import { BRAND } from "@learning-routes/core/locales";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { Route } from "../app/routes/storefront/+types/home";
import StorefrontHome, { meta } from "../app/routes/storefront/home";

const loaderData = { lang: "es", origin: "https://learningroutes.com" } as const;

describe("the storefront home", () => {
  it("shows the name and the line", () => {
    const html = renderToString(<StorefrontHome {...({ loaderData } as Route.ComponentProps)} />);

    expect(html).toContain(BRAND);
    expect(html).toContain("Lo que sabes, convertido en una ruta.");
  });

  it("titles the page", () => {
    expect(meta({ loaderData } as Route.MetaArgs)).toContainEqual({ title: BRAND });
  });
});
