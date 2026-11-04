import { createContext } from "react-router";

/**
 * Set by the Worker for every request: this response's CSP nonce, the host the app
 * lives on, and whether this is a development run. Anything but "development" is
 * treated as production, so a missing setting closes dev-only pages.
 */
export const pageContext = createContext<{
  nonce: string;
  appOrigin: string;
  isDevelopment: boolean;
  /** Where the landing and the catalog live. */
  platformOrigin: string;
  /** The domain creators' hosts sit under, with its port in a local run. */
  creatorDomain: string;
  /** Public: Turnstile's widget shows it to everyone. */
  turnstileSiteKey: string;
  /** For loaders: what the storefront's reads need from this request. */
  runtime: {
    env: Pick<Env, "DB_PUBLIC">;
    ctx: Pick<ExecutionContext, "waitUntil">;
    api: (request: Request) => Promise<Response>;
    /** The MCP Worker, which holds the OAuth provider (Platform STEP 5 §2). */
    mcp: (request: Request) => Promise<Response>;
  };
}>();
