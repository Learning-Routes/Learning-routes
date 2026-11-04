// The one file in browser code that calls fetch. Every browser write goes through
// here, to an action in core's registry. Only types come from the registry, so zod
// and server code stay out of the browser bundle.

import type { ActionInput, ActionResponse } from "@learning-routes/core/actions/registry";
import { ACTION_NAMES, type ActionName } from "@learning-routes/core/browser";

/** Runs an action through the API. A network error rejects; a refusal is a result. */
export async function callAction<N extends ActionName>(
  name: N,
  input: ActionInput<N>,
): Promise<ActionResponse<N>> {
  const response = await fetch(`/api/a/${name}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
  return (await response.json()) as ActionResponse<N>;
}

type Client = { [N in ActionName]: (input: ActionInput<N>) => Promise<ActionResponse<N>> };

/** One method per registered action. */
export const api = Object.fromEntries(
  ACTION_NAMES.map((name) => [name, (input: ActionInput<typeof name>) => callAction(name, input)]),
) as Client;

const REFUSALS: Record<number, "invalid" | "challenge" | "limited"> = {
  400: "invalid",
  403: "challenge",
  429: "limited",
};

const JSON_POST = { method: "POST", headers: { "content-type": "application/json" } };

/** What came of asking for a sign-in link, in terms a screen can say. */
export async function requestSignInLink(
  email: string,
): Promise<"sent" | "invalid" | "limited" | "failed"> {
  try {
    const response = await fetch("/api/auth/sign-in/magic-link", {
      ...JSON_POST,
      body: JSON.stringify({ email }),
    });
    if (response.ok) {
      return "sent";
    }
    if (response.status === 429) {
      return "limited";
    }
    return response.status === 400 ? "invalid" : "failed";
  } catch {
    return "failed";
  }
}

/** The address a pending link signs in; "gone" when it expired or was used. */
export async function peekSignInLink(
  token: string,
): Promise<{ email: string } | "gone" | "limited" | "failed"> {
  try {
    const response = await fetch("/api/auth/magic-link/peek", {
      ...JSON_POST,
      body: JSON.stringify({ token }),
    });
    if (response.ok) {
      return (await response.json()) as { email: string };
    }
    if (response.status === 429) {
      return "limited";
    }
    return response.status === 404 ? "gone" : "failed";
  } catch {
    return "failed";
  }
}

/** "Quiero enseñar": what came of it, in terms the form can say. */
export async function sendApplication(
  application: object,
): Promise<"sent" | "invalid" | "challenge" | "limited" | "failed"> {
  try {
    const response = await fetch("/api/apply", {
      ...JSON_POST,
      body: JSON.stringify(application),
    });
    if (response.ok) {
      return "sent";
    }
    return REFUSALS[response.status] ?? "failed";
  } catch {
    return "failed";
  }
}

/** Saves the toggle's choice without leaving the page. The page has already changed. */
export async function saveTheme(theme: string): Promise<void> {
  await fetch("/theme", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ theme, next: "/" }),
    redirect: "manual",
  }).catch(() => undefined);
}
