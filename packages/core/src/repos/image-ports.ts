// Route images (Platform STEP 20 §B): how many a creator made this month, and what each one used.
// Never what was asked for.

export interface ImageUsage {
  model: string;
  promptTokens: number;
  completionTokens: number;
  /** null when OpenRouter did not report a cost: unknown, never 0. */
  microcents: number | null;
  /** The asset the image became. */
  assetKey: string;
}

export interface ImageGenerations {
  /**
   * Takes one of the creator's images for the month, under their own lock until the transaction
   * ends, so two requests at once cannot both take the last. null once the month's are spent.
   */
  take(
    spaceId: string,
    userId: string,
    since: number,
    perMonth: number,
    at: number,
  ): Promise<string | null>;
  /** What the image used, and the asset it became. */
  settle(id: string, usage: ImageUsage): Promise<void>;
  /** Gives the image back when no model made it: no key, no credit, a refusal. */
  release(id: string): Promise<void>;
}
