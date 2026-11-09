import type { SpendLedger } from "./ledger";

// The assistant's Worker (Platform STEP 10, wrangler.agent.jsonc): the API's bindings it shares, and
// its own. Numbers come as text from the config and are read with Number().
export interface AgentEnv extends Env {
  /** The Studio class's namespace; index.ts names its type, which would import it here in a loop. */
  Studio: DurableObjectNamespace;
  LEDGER: DurableObjectNamespace<SpendLedger>;
  CREATOR_DOMAIN: string;
  /** Unset means the assistant is not switched on: it says so, and calls no model. */
  OPENROUTER_API_KEY?: string;
  /** Each space's assistant, a month, in microcents. */
  AGENT_SPACE_MONTHLY_MICROCENTS: string;
  /** Each creator, a day, in one space, in microcents. */
  AGENT_USER_DAILY_MICROCENTS: string;
  /** Every assistant together, a day, in microcents. */
  AGENT_DAILY_MICROCENTS: string;
}

/** The header the Worker sets for the object: who is connecting, after it checked the session. */
export const USER_HEADER = "x-lr-studio-user";
