import { index, type RouteConfig, route } from "@react-router/dev/routes";

export default [
  index("routes/locale-redirect.tsx"),
  route("studio", "routes/studio.tsx"),
  route("studio/_design", "routes/design.tsx"),
  route("theme", "routes/theme.ts"),
  route("sign-in", "routes/sign-in.tsx"),
  route("sign-in/confirm", "routes/sign-in-confirm.tsx"),
  route(":lang", "routes/storefront/home.tsx"),
] satisfies RouteConfig;
