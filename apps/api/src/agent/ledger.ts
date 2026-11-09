import { DurableObject } from "cloudflare:workers";

// The whole platform's model spend today (Platform STEP 10 §1.2), for the gate's daily ceiling: each
// space's assistant is its own object, so the day's total lives in one more, named "global".

export class SpendLedger extends DurableObject {
  /** Today's spend in microcents, UTC. */
  async today(): Promise<number> {
    return (await this.ctx.storage.get<number>(dayOf(Date.now()))) ?? 0;
  }

  async add(microcents: number): Promise<void> {
    if (!(Number.isSafeInteger(microcents) && microcents > 0)) {
      return;
    }
    const day = dayOf(Date.now());
    await this.ctx.storage.put(day, ((await this.ctx.storage.get<number>(day)) ?? 0) + microcents);
  }
}

const dayOf = (at: number) => new Date(at).toISOString().slice(0, 10);
