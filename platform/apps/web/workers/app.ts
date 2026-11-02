import { createRequestHandler, RouterContextProvider } from "react-router";
import { pageContext } from "../app/context";

const requestHandler = createRequestHandler(
  () => import("virtual:react-router/server-build"),
  import.meta.env.MODE,
);

export default {
  async fetch(request, env) {
    const nonce = btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(16))));
    const context = new RouterContextProvider();
    context.set(pageContext, {
      nonce,
      appOrigin: env.APP_ORIGIN,
      isDevelopment: String(env.ENVIRONMENT) === "development",
    });
    return requestHandler(request, context);
  },
} satisfies ExportedHandler<Env>;
