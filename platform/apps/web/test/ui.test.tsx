import type { ReactNode } from "react";
import { renderToString } from "react-dom/server";
import { createMemoryRouter, RouterProvider } from "react-router";
import { describe, expect, it } from "vitest";
import { Button, ButtonLink } from "../app/ui/button";
import { Badge, Card, EmptyState, Notice, TextLink } from "../app/ui/parts";
import { NavLink, SiteHeader } from "../app/ui/site-header";
import { TextField } from "../app/ui/text-field";
import { ThemeToggle } from "../app/ui/theme-toggle";

// The design system's components (Platform STEP 3 §2.3), and the rules on all of them.

const SOURCES = import.meta.glob<string>("../app/ui/*.tsx", {
  query: "?raw",
  import: "default",
  eager: true,
});
const STYLESHEET = import.meta.glob<string>("../app/ui/ui.css", {
  query: "?raw",
  import: "default",
  eager: true,
});
const RAW_COLOUR = /#[0-9a-f]{3,8}\b|\brgba?\(|\bhsla?\(/i;
const RAW_SIZE = /(?<![\w.-])(?:[3-9]|\d{2,})(?:\.\d+)?(?:px|rem|em)\b/;
const COMMENT = /\/\*.*?\*\//gs;
const MEDIA_QUERY = /@media[^{]+\{/g;
const INPUT_ID = /<input[^>]* id="([^"]+)"/;
const INLINE_STYLE = /\bstyle=/;
const BANNED_PROP = /\b(red|green|blue|big|small-text)=/;

const inRouter = (element: ReactNode) =>
  renderToString(
    <RouterProvider
      router={createMemoryRouter([{ path: "/", element }], { initialEntries: ["/"] })}
    />,
  );

describe("Button", () => {
  it("is a real button that never submits by accident, with its emphasis and size", () => {
    const html = renderToString(
      <Button emphasis="secondary" size="small">
        Enviar enlace
      </Button>,
    );
    expect(html).toContain('type="button"');
    expect(html).toContain("button-secondary");
    expect(html).toContain("button-small");
  });

  it("while loading is disabled, says so, and keeps its label's place", () => {
    const html = renderToString(
      <Button loading loadingLabel="Cargando">
        Enviar enlace
      </Button>,
    );
    // Not disabled: that would drop keyboard focus from the button on every send.
    expect(html).not.toContain(" disabled");
    expect(html).toContain('aria-disabled="true"');
    expect(html).toContain('aria-busy="true"');
    expect(html).toContain('aria-label="Cargando"');
    expect(html).toContain("Enviar enlace");
  });

  it("disabled is disabled, and not busy", () => {
    const html = renderToString(<Button disabled>Enviar</Button>);
    expect(html).toContain("disabled");
    expect(html).not.toContain("aria-busy");
  });

  it("as a link is an anchor", () => {
    expect(renderToString(<ButtonLink href="/es">Crear mi ruta</ButtonLink>)).toContain(
      'href="/es"',
    );
  });
});

describe("TextField", () => {
  it("ties its label and hint to the input", () => {
    const html = renderToString(<TextField label="Tu correo" name="email" hint="Una pista" />);
    const id = html.match(INPUT_ID)?.[1];
    expect(html).toContain(`for="${id}"`);
    expect(html).toContain(`aria-describedby="${id}-note"`);
    expect(html).toContain("Una pista");
    expect(html).not.toContain("aria-invalid");
  });

  it("an error replaces the hint and marks the input invalid", () => {
    const html = renderToString(
      <TextField label="Tu correo" name="email" hint="Una pista" error="Falta la arroba." />,
    );
    expect(html).toContain('aria-invalid="true"');
    expect(html).toContain("Falta la arroba.");
    expect(html).toContain('aria-live="polite"');
    expect(html).not.toContain("Una pista");
  });
});

describe("the small pieces", () => {
  it("TextLink is a link, Card holds its children, Badge says what it is", () => {
    expect(renderToString(<TextLink href="/x">Ir</TextLink>)).toContain('class="text-link"');
    expect(renderToString(<Card>Dentro</Card>)).toContain("Dentro");
    expect(renderToString(<Badge tone="accent">Gratis</Badge>)).toContain("badge-accent");
  });

  it("Notice speaks up in proportion: an error is an alert, the rest a status", () => {
    expect(renderToString(<Notice tone="error" title="No se pudo" />)).toContain('role="alert"');
    expect(renderToString(<Notice tone="success" title="Listo" />)).toContain('role="status"');
    expect(renderToString(<Notice tone="info" title="Aviso" />)).toContain('role="status"');
  });

  it("EmptyState says what belongs here and offers the next step", () => {
    const html = renderToString(
      <EmptyState title="Sin rutas" action={<a href="/x">Crear</a>}>
        Cuéntanos
      </EmptyState>,
    );
    expect(html).toContain("Sin rutas");
    expect(html).toContain("Crear");
  });
});

describe("SiteHeader and ThemeToggle", () => {
  it("names its nav and links the brand home", () => {
    const html = renderToString(
      <SiteHeader brand="Marca" brandHref="/es" navLabel="Principal">
        <NavLink href="/a">Una</NavLink>
      </SiteHeader>,
    );
    expect(html).toContain('aria-label="Principal"');
    expect(html).toContain('href="/es"');
    expect(html).toContain('aria-hidden="true"');
  });

  it("posts the choice, with no script, and says where to come back to", () => {
    const html = inRouter(<ThemeToggle toDark="A oscuro" toLight="A claro" />);
    expect(html).toContain('method="post"');
    expect(html).toContain('action="/theme"');
    expect(html).toContain('name="next"');
    expect(html).toContain('aria-label="A oscuro"');
    expect(html).toContain('aria-label="A claro"');
  });
});

describe("the rules on every component", () => {
  it("the stylesheet uses only tokens: no raw colour, no size off the scale", () => {
    const css = (Object.values(STYLESHEET)[0] as string)
      .replace(COMMENT, "")
      .replace(MEDIA_QUERY, "{");
    expect(css.match(RAW_COLOUR)).toBeNull();
    expect(css.match(RAW_SIZE)).toBeNull();
  });

  it.each(Object.keys(SOURCES))(
    "%s has no inline style and no prop named for how it looks",
    (file) => {
      const source = SOURCES[file] as string;
      expect(source).not.toMatch(INLINE_STYLE);
      expect(source).not.toMatch(BANNED_PROP);
    },
  );
});
