// The creator studio: a full React app, hydrated in the browser.
import { BRAND } from "@learning-routes/core/locales";

export function meta() {
  return [{ title: `Estudio · ${BRAND}` }];
}

export default function Studio() {
  return (
    <main>
      <h1>Estudio</h1>
    </main>
  );
}
