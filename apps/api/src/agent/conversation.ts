import type { LocaleCode } from "@learning-routes/core/locales";
import type { StudioEvent } from "@learning-routes/core/studio/session";

// What the assistant's object and its effects share (Platform STEP 10 §1), so neither imports the other.

/** One page's connection: who, in which conversation, in which language. */
export interface Seat {
  userId: string;
  conversationId: string;
  locale: LocaleCode;
}

export interface ConversationRow {
  id: string;
  user_id: string;
  locale: string;
  step: string;
  options: string;
  route_id: string | null;
  shown_lessons: string | null;
  pending_publish: string | null;
  warned_month: string | null;
}

/** What the effects need of the object. */
export interface StudioPlace {
  /** The space's id: the object's name. */
  readonly name: string;
  conversation(id: string): ConversationRow;
  setConversation(id: string, change: Partial<Omit<ConversationRow, "id" | "user_id">>): void;
  emit(conversationId: string, event: StudioEvent, keep: boolean): void;
  /** The skills loaded in a conversation, oldest first (Platform STEP 10 §3). */
  loadedSkills(conversationId: string): string[];
  setLoadedSkills(conversationId: string, names: readonly string[]): void;
}

/** "YYYY-MM" in UTC: the month a spend counts in. */
export const monthOf = (at: number) => new Date(at).toISOString().slice(0, 7);
/** "YYYY-MM-DD" in UTC. */
export const dayOf = (at: number) => new Date(at).toISOString().slice(0, 10);
