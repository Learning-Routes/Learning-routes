// The creator studio: a full React app, hydrated in the browser.
import { BRAND } from "@learning-routes/core/locales";

export function meta() {
  return [{ title: `Enseñar · ${BRAND}` }];
}

export default function Studio() {
  return (
    <main>
      <h1>Enseñar</h1>
      <p>
        <a href="/ensenar/conecta">Conecta tu asistente</a>
      </p>
      <p>
        <a href="/ensenar/conexiones">Conexiones</a>
      </p>
    </main>
  );
}
