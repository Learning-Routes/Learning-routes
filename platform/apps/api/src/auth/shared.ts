import { authOptions } from "./options";

// What both Workers' Better Auth share, so a session made by one is read by the other: the
// API signs people in, and the MCP Worker's OAuth provider needs to know who is asking.

export const AUTH_PATH = "/api/auth";

/** The session cookie: __Host- pins it to the app's own origin (Secure, Path=/, no Domain). */
export const SESSION_COOKIE = "__Host-lr_session";

export function sharedAuthOptions(env: Pick<Env, "APP_ORIGIN" | "BETTER_AUTH_SECRET">) {
  return {
    ...authOptions,
    baseURL: env.APP_ORIGIN,
    basePath: AUTH_PATH,
    trustedOrigins: [env.APP_ORIGIN],
    secret: env.BETTER_AUTH_SECRET,
    // Off, so a revoked session ends at once instead of living on in a cookie.
    session: { cookieCache: { enabled: false } },
    advanced: {
      ...authOptions.advanced,
      // Better Auth would prefix __Secure- itself; the name below carries __Host-
      // instead, and the attributes it needs are set here.
      useSecureCookies: false,
      defaultCookieAttributes: {
        secure: true,
        httpOnly: true,
        sameSite: "lax" as const,
        path: "/",
      },
      cookies: { session_token: { name: SESSION_COOKIE } },
      crossSubDomainCookies: { enabled: false },
      // Cloudflare sets cf-connecting-ip; X-Forwarded-For is whatever the client sends.
      ipAddress: { ipAddressHeaders: ["cf-connecting-ip"] },
    },
  };
}
