import { UI_COPY } from "@learning-routes/core/copy/ui";
import { BRAND } from "@learning-routes/core/locales";
import { data } from "react-router";
import { pageContext } from "../context";
import { Button, ButtonLink } from "../ui/button";
import { Badge, Card, EmptyState, Notice, TextLink } from "../ui/parts";
import { NavLink, SiteHeader } from "../ui/site-header";
import { TextField } from "../ui/text-field";
import { ThemeToggle } from "../ui/theme-toggle";
import type { Route } from "./+types/design";
import "./design.css";

// Every component in every state, for people and for the visual tests. Development
// only: anywhere else it does not exist (Platform STEP 3 §2.5).

export function loader({ context }: Route.LoaderArgs) {
  if (!context.get(pageContext).isDevelopment) {
    throw data(null, { status: 404 });
  }
  return null;
}

export function meta() {
  return [{ title: `Componentes · ${BRAND}` }, { name: "robots", content: "noindex" }];
}

const copy = UI_COPY.es;

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="design-section">
      <h2 className="design-heading">{title}</h2>
      <div className="design-row">{children}</div>
    </section>
  );
}

export default function DesignPage() {
  return (
    <>
      <SiteHeader brand={BRAND} brandHref="/studio/_design" navLabel={copy.primaryNav}>
        <ThemeToggle toDark={copy.toDark} toLight={copy.toLight} />
        <NavLink href="#botones">Botones</NavLink>
        <ButtonLink href="#botones" size="small">
          Crear mi ruta
        </ButtonLink>
      </SiteHeader>
      <main className="design-page">
        <h1 className="design-title">Componentes</h1>
        <Section title="Botones">
          <Button>Enviar enlace</Button>
          <Button emphasis="secondary">Cambiar correo</Button>
          <Button emphasis="quiet">Volver</Button>
          <Button size="small">Enviar enlace</Button>
          <Button loading loadingLabel={copy.loading}>
            Enviar enlace
          </Button>
          <Button disabled>Enviar enlace</Button>
          <ButtonLink href="#botones">Crear mi ruta</ButtonLink>
        </Section>
        <Section title="Enlace">
          <TextLink href="#enlace">Usar otro correo</TextLink>
        </Section>
        <Section title="Campo de texto">
          <TextField label="Tu correo" name="a" type="email" placeholder="tu@ejemplo.com" />
          <TextField label="Tu correo" name="b" hint="Te enviamos un enlace para entrar." />
          <TextField
            label="Tu correo"
            name="c"
            defaultValue="sin arroba"
            error="Escribe un correo con @, como tu@ejemplo.com."
          />
          <TextField label="Tu correo" name="d" disabled defaultValue="lector@example.com" />
        </Section>
        <Section title="Tarjeta">
          <Card className="design-card">
            <h3 className="design-card-title">Portugués para viajar</h3>
            <p className="design-card-body">2 módulos, 22 temas.</p>
            <Badge tone="accent">Gratis</Badge>
          </Card>
        </Section>
        <Section title="Insignia">
          <Badge tone="accent">Gratis</Badge>
          <Badge>Bloqueado</Badge>
        </Section>
        <Section title="Avisos">
          <Notice tone="success" title="Enlace enviado.">
            Revisa tu correo; dura 5 minutos.
          </Notice>
          <Notice tone="info" title="Tu sesión terminó." />
          <Notice tone="error" title="No pudimos enviar el enlace.">
            Inténtalo de nuevo en un minuto.
          </Notice>
        </Section>
        <Section title="Estado vacío">
          <EmptyState
            title="Todavía no tienes rutas."
            action={<ButtonLink href="#botones">Crear mi ruta</ButtonLink>}
          >
            Cuéntanos qué quieres aprender y la armamos módulo a módulo.
          </EmptyState>
        </Section>
      </main>
    </>
  );
}
