// One address (Platform STEP 19): the landing and the catalog are cached the same for everyone,
// and their header says "Entrar". For someone with a session it says "Mis rutas" instead,
// changed here after the edge cache, as the theme is (theme.ts), so the cached page never varies.

const SESSION = /(?:^|;\s*)__Host-lr_session=/;

/** The page, with "Entrar" turned into "Mis rutas" when the request carries a session. */
export function withAccount(response: Response, cookie: string | null): Response {
  if (
    !SESSION.test(cookie ?? "") ||
    !response.headers.get("content-type")?.startsWith("text/html")
  ) {
    return response;
  }
  return new HTMLRewriter()
    .on("a[data-account]", {
      element(link) {
        link.setInnerContent(link.getAttribute("data-account") ?? "");
        link.setAttribute("href", "/mis-rutas");
        link.removeAttribute("data-account");
      },
    })
    .transform(response);
}
