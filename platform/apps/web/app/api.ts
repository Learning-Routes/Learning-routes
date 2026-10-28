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
