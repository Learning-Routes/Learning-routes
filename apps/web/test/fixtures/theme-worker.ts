import { withTheme } from "../../workers/theme";

// A page and a JSON answer, each passed through withTheme in workerd, where HTMLRewriter runs.
const PAGE =
  '<!doctype html><html lang="es"><head><title>Ruta</title></head><body>Hola</body></html>';

export default {
  fetch(request: Request) {
    const json = new URL(request.url).pathname === "/json";
    const answer = new Response(json ? '{"html":"<html>"}' : PAGE, {
      headers: { "content-type": json ? "application/json" : "text/html; charset=utf-8" },
    });
    return withTheme(answer, request.headers.get("cookie"));
  },
};
