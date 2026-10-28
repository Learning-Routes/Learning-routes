import { createContext } from "react-router";

/** Set by the Worker for every request: this response's CSP nonce. */
export const pageContext = createContext<{ nonce: string }>();
