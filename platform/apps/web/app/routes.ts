import { index, type RouteConfig, route } from "@react-router/dev/routes";

export default [
  index("routes/locale-redirect.tsx"),
  route("studio", "routes/studio.tsx"),
  route("studio/_design", "routes/design.tsx"),
  route("theme", "routes/theme.ts"),
  route("empezar", "routes/empezar.tsx"),
  route("mis-rutas", "routes/mis-rutas.tsx"),
  route("mis-rutas/:enrollmentId", "routes/seguir.tsx"),
  route("quiero-ensenar", "routes/quiero-ensenar.tsx"),
  route("admin", "routes/admin.tsx"),
  route("admin/crear-espacio", "routes/admin-create-space.tsx"),
  route("conectar", "routes/conectar.tsx"),
  route("ensenar/conexiones", "routes/conexiones.tsx"),
  route("sign-in", "routes/sign-in.tsx"),
  route("sign-in/confirm", "routes/sign-in-confirm.tsx"),
  route("explorar", "routes/catalog-redirect.tsx"),
  route("_brand/:file", "routes/brand-css.ts"),
  route("sitemap.xml", "routes/storefront/sitemap.ts", { id: "platform-sitemap" }),
  // What a creator's host renders from (workers/hosts.ts); nobody asks for these directly.
  route("_creador/:slug", "routes/storefront/creator-page.tsx"),
  route("_creador/:slug/sitemap.xml", "routes/storefront/sitemap.ts", { id: "creator-sitemap" }),
  route("_creador/:slug/:routeSlug", "routes/storefront/route-page.tsx"),
  route(":lang", "routes/storefront/home.tsx"),
  route(":lang/explorar", "routes/storefront/catalog.tsx"),
] satisfies RouteConfig;
