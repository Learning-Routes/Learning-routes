// The headers every answer carries, on every host (Platform STEP 7 §2). Pages add their own CSP in
// entry.server.tsx. HSTS starts at one day, without preload, while the hosts are new.

const HEADERS = {
  "Strict-Transport-Security": "max-age=86400",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "camera=(), geolocation=(), microphone=(), payment=(), usb=()",
} as const;

/** The same answer, with the headers. A page that set its own Referrer-Policy keeps it. */
export function withSecurityHeaders(response: Response): Response {
  const secured = new Response(response.body, response);
  for (const [name, value] of Object.entries(HEADERS)) {
    if (!secured.headers.has(name)) {
      secured.headers.set(name, value);
    }
  }
  return secured;
}
