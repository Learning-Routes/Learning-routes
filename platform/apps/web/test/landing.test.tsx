import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { Route } from "../app/routes/+types/landing";
import Landing, { meta } from "../app/routes/landing";

const loaderData = { lang: "es", origin: "https://learningroutes.com" } as const;

describe("landing", () => {
  it("shows the name and the line", () => {
    const html = renderToString(<Landing {...({ loaderData } as Route.ComponentProps)} />);

    expect(html).toContain("Learning Routes");
    expect(html).toContain("Lo que sabes, convertido en una ruta.");
  });

  it("titles the page", () => {
    expect(meta({ loaderData } as Route.MetaArgs)).toContainEqual({ title: "Learning Routes" });
  });
});
