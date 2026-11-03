// Turnstile, verified on the server with Siteverify (Platform STEP 4 §6.3, checked against
// Cloudflare's docs on 2 November 2026). It fails closed: only a clear yes for this form,
// on one of our hosts, passes. Cloudflare's test keys answer with no action and another
// host, and say so; they count only in a local run.

const SITEVERIFY = "https://challenges.cloudflare.com/turnstile/v0/siteverify";
const MAX_TOKEN_LENGTH = 2048;
const TIMEOUT_MS = 10_000;

interface Answer {
  success?: boolean;
  action?: string;
  hostname?: string;
  metadata?: { result_with_testing_key?: boolean };
}

async function siteverify(
  env: Env,
  token: string,
  clientIp: string | null,
  fetcher: typeof fetch,
): Promise<Answer | null> {
  try {
    const body = new URLSearchParams({ secret: env.TURNSTILE_SECRET, response: token });
    if (clientIp !== null) {
      body.set("remoteip", clientIp);
    }
    const response = await fetcher(SITEVERIFY, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: body.toString(),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    return response.ok ? ((await response.json()) as Answer) : null;
  } catch {
    return null;
  }
}

export async function verifyTurnstile(
  env: Env,
  token: string,
  clientIp: string | null,
  action: string,
  fetcher: typeof fetch = fetch,
): Promise<boolean> {
  const hostnames = String(env.TURNSTILE_HOSTNAMES)
    .split(",")
    .map((host) => host.trim())
    .filter(Boolean);
  if (token.length === 0 || token.length > MAX_TOKEN_LENGTH || hostnames.length === 0) {
    return false;
  }
  const answer = await siteverify(env, token, clientIp, fetcher);
  if (answer?.success !== true) {
    return false;
  }
  if (answer.metadata?.result_with_testing_key === true) {
    return String(env.ENVIRONMENT) === "development";
  }
  return answer.action === action && hostnames.includes(answer.hostname ?? "");
}
