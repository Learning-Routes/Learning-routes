import type { ActorKind } from "../actions/actor";
import type { RepoResult } from "./repo-result";

// The action log's port (Platform STEP 2 §2.15): append only.

export interface ActionLogEntry {
  actorUserId: string;
  actorVia: ActorKind;
  agentRunId: string | null;
  /** The OAuth client behind a call through the MCP. */
  oauthClientId?: string | null;
  action: string;
  /** Already redacted: no secrets, no free text. */
  input: unknown;
  outcome: string;
  routeRevision: number | null;
}

export interface ActionLog {
  /** not_found when the actor may not write in the space. Null: an operator's, in no space. */
  append(spaceId: string | null, entry: ActionLogEntry): Promise<RepoResult<void>>;
}
