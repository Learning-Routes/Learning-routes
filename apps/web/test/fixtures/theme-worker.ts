import { withAccount } from "../../workers/account";
import { withTheme } from "../../workers/theme";

// A page and a JSON answer, each passed through withTheme and withAccount in workerd, where
// HTMLRewriter runs.
const PAGE =
  '<!doctype html><html lang="es"><head><title>Ruta</title></head><body><a class="nav-link" href="https://learningroutes.com/sign-in" data-account="Mis rutas">Entrar</a></body></html>';

export default {
  fetch(request: Request) {
    const json = new URL(request.url).pathname === "/json";
    const answer = new Response(json ? '{"html":"<html>"}' : PAGE, {
      headers: { "content-type": json ? "application/json" : "text/html; charset=utf-8" },
    });
    const cookie = request.headers.get("cookie");
    return withAccount(withTheme(answer, cookie), cookie);
  },
};
