import { redirect } from "react-router";
import type { Route } from "./+types/moved";

// Addresses that moved, kept so that an old link or bookmark still lands.
const MOVED: Record<string, string> = {
  "/studio": "/creador",
  "/quiero-ensenar": "/ser-creador",
  "/ensenar/conecta": "/creador/conecta",
  "/ensenar/conexiones": "/creador/conexiones",
};

export function loader({ request }: Route.LoaderArgs) {
  const url = new URL(request.url);
  return redirect(`${MOVED[url.pathname] ?? "/"}${url.search}`, 301);
}
