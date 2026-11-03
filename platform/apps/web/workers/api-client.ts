// How the web Worker reaches the API: the service binding, so one host serves both and no
// request leaves Cloudflare. A local preview cannot reach another Worker through it, so
// there, and only where ENVIRONMENT is "development", it goes over HTTP to wrangler dev,
// which runs with --local-upstream and sees the app's host (playwright.config.ts).

type ApiEnv = Pick<Env, "API" | "ENVIRONMENT"> & { API_DEV_ORIGIN?: string };

export type ApiFetch = (request: Request) => Promise<Response>;

export function apiClient(env: ApiEnv, fetcher: typeof fetch = fetch): ApiFetch {
  const devOrigin = env.API_DEV_ORIGIN;
  if (String(env.ENVIRONMENT) === "development" && devOrigin) {
    return async (request) => {
      const { origin, pathname, search } = new URL(request.url);
      const response = await fetcher(new Request(`${devOrigin}${pathname}${search}`, request));
      // wrangler dev's proxy writes its own port into a redirect: put the app's back.
      const location = response.headers.get("location");
      if (!location?.startsWith(devOrigin)) {
        return response;
      }
      const restored = new Response(response.body, response);
      restored.headers.set("location", `${origin}${location.slice(devOrigin.length)}`);
      return restored;
    };
  }
  return (request) => env.API.fetch(request);
}
