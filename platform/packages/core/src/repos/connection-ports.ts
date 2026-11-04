import type { SpaceRole } from "../domain";
import type { LocalizedText } from "../localized-text";

export interface OwnSpace {
  id: string;
  slug: string;
  name: LocalizedText;
  role: SpaceRole;
}

/** An assistant connected to a person's account. */
export interface ConnectionRecord {
  clientId: string;
  clientName: string;
  scopes: string[];
  lastUsedAt: string | null;
}

export interface Connections {
  /** Whether they teach anywhere: owner, coeditor or assistant of a space. */
  canConnect(userId: string): Promise<boolean>;
  list(userId: string): Promise<ConnectionRecord[]>;
  /** Ends it at once: its consent and every token. False when there was nothing to end. */
  revoke(userId: string, clientId: string): Promise<boolean>;
}
