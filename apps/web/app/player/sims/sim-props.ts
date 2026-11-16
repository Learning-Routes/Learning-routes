import type { BeatProps } from "../shared";

// What every simulator is given (Platform STEP 12).

export interface SimProps {
  sim: Record<string, unknown>;
  /** The learner's state to grade, or null while it is not ready. */
  setState: (state: Record<string, unknown> | null) => void;
  /** The server's verdict, once checked. */
  result: BeatProps["result"];
}
