import { test } from "vitest";
import { decideSpend, V1_LIMITS } from "../src/credits/spend";
import { type Card, review } from "../src/learning/fsrs";
import { grade } from "../src/learning/grader";
import grader from "../test/golden/block_grader.json" with { type: "json" };
import parser from "../test/golden/lesson_parser.json" with { type: "json" };
import { runParser } from "../test/runners";

// The hot pure functions (STEP 46 §2.8), over the golden fixtures' real inputs.
// `pnpm bench` compares each with bench/baseline/<name>.json and prints the table;
// it never fails. `VITE_WRITE_BENCH=1 pnpm bench` records a new baseline; the
// committed one was recorded on a GitHub ubuntu-latest runner, where CI compares,
// since a laptop's numbers differ from a runner's by more than the 30% we watch.

const REFRESH = import.meta.env.VITE_WRITE_BENCH === "1";
// Slower than the baseline by more than this is called out in the pull request.
const REGRESSION = 1.3;

const NOW = Date.parse("2026-10-28T12:00:00Z");
const DAY = 86_400_000;
const NEW_CARD: Card = {
  state: null,
  reps: 0,
  lapses: 0,
  stability: 0,
  difficulty: 0,
  lastReviewAt: null,
};
const RATINGS = [3, 3, 1, 4, 3, 2, 3, 3, 4, 1];

// Local bindings skip the module runner's export getters on the outer calls.
const _grade = grade;
const _review = review;
const _runParser = runParser;
const _decideSpend = decideSpend;

const HOT: Record<string, () => void> = {
  grade: () => {
    for (const { input } of grader.cases) _grade(input.section, input.payload);
  },
  review: () => {
    let card = NEW_CARD;
    let now = NOW;
    for (const rating of RATINGS) {
      now += 3 * DAY;
      card = _review(card, rating, now).card;
    }
  },
  parseLesson: () => {
    for (const { input } of parser.cases) _runParser(input);
  },
  decideSpend: () => {
    const consumedAt: number[] = [];
    for (let i = 0; i < 200; i++) {
      const decision = _decideSpend({
        limits: { ...V1_LIMITS, ratePerMinute: 120 },
        spend: { globalToday: 0, userToday: 0 },
        consumedAt,
        estimate: { kind: "known", microcents: 1_000 },
        now: NOW + i * 100,
      });
      if (decision.consumesRateSlot) consumedAt.push(NOW + i * 100);
    }
  },
};

for (const [name, fn] of Object.entries(HOT)) {
  test(name, async ({ bench, annotate }) => {
    const baseline = `bench/baseline/${name}.json`;
    if (REFRESH) {
      await bench(name, { writeResult: baseline }, fn).run();
      return;
    }
    const result = await bench.compare(bench("current", fn), bench.from("baseline", baseline));
    const slower = result.get("baseline").throughput.mean / result.get("current").throughput.mean;
    if (slower > REGRESSION) {
      await annotate(
        `${name}: ${Math.round((slower - 1) * 100)}% slower than the baseline`,
        "warning",
      );
    }
  });
}
