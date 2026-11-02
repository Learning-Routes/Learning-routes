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
}>();
