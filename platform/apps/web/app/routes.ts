import { index, type RouteConfig, route } from "@react-router/dev/routes";

export default [
  index("routes/home.tsx"),
  route("studio", "routes/studio.tsx"),
  route(":lang", "routes/storefront/landing.tsx"),
] satisfies RouteConfig;
