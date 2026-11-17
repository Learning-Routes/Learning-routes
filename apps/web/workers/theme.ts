import {
  isTheme,
  nextOnOurHosts,
  oldThemeCookieGone,
  themeCookie,
  themeFromCookie,
} from "../app/theme";
import { creatorSlugOf } from "./hosts";

// Day and night on every host (Platform STEP 16). The toggle posts here from any of our pages, and
// the choice is put on <html> on the way out, after the edge cache: a cached page stays one page
// for everyone, and the reader's theme is there before the first paint, with no script.

interface Hosts {
  appOrigin: string;
  creatorDomain: string;
}

/** The app, the platform's own pages, and each creator's host. Nothing else. */
export function isOurHost(host: string, hosts: Hosts): boolean {
  const lower = host.toLowerCase();
  return (
    lower === new URL(hosts.appOrigin).host ||
    lower === hosts.creatorDomain.toLowerCase() ||
    creatorSlugOf(lower, hosts) !== null
  );
}

/** The answer to the toggle's post, or null when the request is something else. */
export async function themePost(request: Request, hosts: Hosts): Promise<Response | null> {
  const url = new URL(request.url);
  if (url.pathname !== "/theme" || !isOurHost(url.host, hosts)) {
    return null;
  }
  if (request.method !== "POST") {
    return new Response(null, { status: 405, headers: { Allow: "POST" } });
  }
  const form = await request.formData().catch(() => null);
  const theme = form?.get("theme");
  if (!isTheme(theme)) {
    return new Response(null, { status: 400 });
  }
  const headers = new Headers({
    Location: nextOnOurHosts(form?.get("next"), url, (host) => isOurHost(host, hosts)),
    "Cache-Control": "no-store",
  });
  headers.append("Set-Cookie", oldThemeCookieGone());
  headers.append(
    "Set-Cookie",
    themeCookie(theme, new URL(`https://${hosts.creatorDomain}`).hostname),
  );
  return new Response(null, { status: 303, headers });
}

/** The page with the reader's theme on <html>, when they chose one; any other answer as it is. */
export function withTheme(response: Response, cookieHeader: string | null): Response {
  const theme = themeFromCookie(cookieHeader);
  if (!theme || !response.headers.get("content-type")?.startsWith("text/html")) {
    return response;
  }
  return new HTMLRewriter()
    .on("html", {
      element(html) {
        html.setAttribute("data-theme", theme);
      },
    })
    .transform(response);
}
