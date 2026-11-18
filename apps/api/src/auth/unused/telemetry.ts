// Better Auth's telemetry, left out of the Workers (wrangler.jsonc "alias"). It is turned off in
// options.ts, and with no telemetry endpoint its own createTelemetry only returns a no-op; its code
// is dead weight in a size budget. A Better Auth release that imports another name fails the build.

/** Same answer as Better Auth's own when telemetry is off: publish does nothing. */
export async function createTelemetry(_options?: unknown, _context?: unknown) {
  return { publish: async (_event?: unknown) => {} };
}

export function getTelemetryAuthConfig(_options?: unknown, _context?: unknown) {
  return {};
}
