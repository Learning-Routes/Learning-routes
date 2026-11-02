// Who calls an action, and how they came in: the app, MCP, or an agent run.

export const ACTOR_KINDS = ["ui", "mcp", "agent"] as const;
export type ActorKind = (typeof ACTOR_KINDS)[number];

export interface Actor {
  via: ActorKind;
  userId: string;
}
