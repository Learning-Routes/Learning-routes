import type { SpendLedger } from "./ledger";

// The assistant's Worker (Platform STEP 10, wrangler.agent.jsonc): the API's bindings it shares, and
// its own. Numbers come as text from the config and are read with Number().
export interface AgentEnv extends Env {
  /** The Studio class's namespace; index.ts names its type, which would import it here in a loop. */
  Studio: DurableObjectNamespace;
  LEDGER: DurableObjectNamespace<SpendLedger>;
  CREATOR_DOMAIN: string;
  /** With no provider named: unset means the assistant is not switched on, and calls no model. */
  OPENROUTER_API_KEY?: string;
  /**
   * "anthropic": Anthropic's own API answers, with ANTHROPIC_API_KEY, in any environment (ADR 0014).
   * "scripted": the committed scripts answer, in development only (STEP 11-prep); refused elsewhere.
   */
  MODEL_PROVIDER?: string;
  /** For MODEL_PROVIDER "anthropic": a Worker secret in production, the Keychain in a local run. */
  ANTHROPIC_API_KEY?: string;
  /** Development only: "small" sends every call to the cheap tier. */
  MODEL_TIER_OVERRIDE?: string;
  /** Each space's assistant, a month, in microcents. */
  AGENT_SPACE_MONTHLY_MICROCENTS: string;
  /** Each creator, a day, in one space, in microcents. */
  AGENT_USER_DAILY_MICROCENTS: string;
  /** Every assistant together, a day, in microcents. */
  AGENT_DAILY_MICROCENTS: string;
  /** Model calls each space's assistant may make in a minute. */
  AGENT_CALLS_PER_MINUTE: string;
}

/** The header the Worker sets for the object: who is connecting, after it checked the session. */
export const USER_HEADER = "x-lr-studio-user";
