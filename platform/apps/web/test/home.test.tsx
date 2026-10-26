import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import Home, { meta } from "../app/routes/home";

describe("home", () => {
  it("shows the name and the line", () => {
    const html = renderToString(<Home />);

    expect(html).toContain("Learning Routes");
    expect(html).toContain("Lo que sabes, convertido en una ruta.");
  });

  it("titles the page", () => {
    expect(meta()).toContainEqual({ title: "Learning Routes" });
  });
});
