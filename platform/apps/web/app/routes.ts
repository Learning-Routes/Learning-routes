import { index, type RouteConfig, route } from "@react-router/dev/routes";

export default [
  index("routes/locale-redirect.tsx"),
  route("studio", "routes/studio.tsx"),
  route(":lang", "routes/storefront/home.tsx"),
] satisfies RouteConfig;
