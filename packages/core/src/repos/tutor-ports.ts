// The learner's tutor's questions (Platform STEP 20 §A): how many a person asked today, and what
// each answer used. Never what was asked or answered.

export interface TutorUsage {
  model: string;
  promptTokens: number;
  completionTokens: number;
  /** null when OpenRouter did not report a cost: unknown, never 0. */
  microcents: number | null;
}

export interface TutorQuestions {
  /**
   * Takes one of the person's questions for the day, under their own lock until the transaction
   * ends, so two questions at once cannot both take the last. null once the day's share is spent.
   */
  take(
    spaceId: string,
    userId: string,
    enrollmentId: string,
    since: number,
    perDay: number,
    at: number,
  ): Promise<string | null>;
  /** What the answer used. */
  settle(id: string, usage: TutorUsage): Promise<void>;
  /** Gives the question back when no model could answer it: no key, no credit. */
  release(id: string): Promise<void>;
  /** What the person's answers cost since a time, in microcents, for the gate's per-person ceiling. */
  spentSince(userId: string, since: number): Promise<number>;
}
