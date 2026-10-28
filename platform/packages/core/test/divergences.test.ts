import { describe, expect, it } from "vitest";
import attemptRating from "./golden/attempt_rating.json" with { type: "json" };
import blockGrader from "./golden/block_grader.json" with { type: "json" };
import blockRegistry from "./golden/block_registry.json" with { type: "json" };
import costEstimate from "./golden/cost_estimate.json" with { type: "json" };
import divergences from "./golden/divergences.json" with { type: "json" };
import fsrs from "./golden/fsrs.json" with { type: "json" };
import gating from "./golden/gating.json" with { type: "json" };
import lessonParser from "./golden/lesson_parser.json" with { type: "json" };
import spendLimits from "./golden/spend_limits.json" with { type: "json" };

// The fixtures are v1's behaviour. The only edits ever made to them are the fixes
// ADR 0003 decided, each listed in divergences.json with its v1 and new output.
// Undo the listed edits and every file must be exactly what v1 recorded.

type Case = { input: unknown; output: unknown };
type Fixture = { unit: string; source: string; captured_at: string; cases: Case[] };
type Change = { file: string; input: unknown; v1: unknown; new: unknown };
type Added = { file: string; case: Case };

const FILES: Record<string, Fixture> = {
  "attempt_rating.json": attemptRating as Fixture,
  "block_grader.json": blockGrader as Fixture,
  "block_registry.json": blockRegistry as Fixture,
  "cost_estimate.json": costEstimate as Fixture,
  "fsrs.json": fsrs as Fixture,
  "gating.json": gating as Fixture,
  "lesson_parser.json": lessonParser as Fixture,
  "spend_limits.json": spendLimits as Fixture,
};

function canonical(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(canonical).join(",")}]`;
  }
  if (value !== null && typeof value === "object") {
    const entries = Object.entries(value).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

async function sha256(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

const fixes = divergences.fixes as { id: string; changed: Change[]; added: Added[] }[];

describe("divergences from v1", () => {
  it("pins a v1 digest for every fixture", () => {
    expect(Object.keys(divergences.v1).sort()).toEqual(Object.keys(FILES).sort());
  });

  it("lists each change once, and each one really changes the case", () => {
    const keys = fixes.flatMap((fix) =>
      fix.changed.map((change) => `${change.file} ${canonical(change.input)}`),
    );
    expect(new Set(keys).size).toBe(keys.length);
    for (const fix of fixes) {
      for (const change of fix.changed) {
        expect(canonical(change.new), fix.id).not.toBe(canonical(change.v1));
      }
    }
  });

  it.each(Object.keys(FILES))("%s is v1's file plus the listed changes, no more", async (file) => {
    const fixture = FILES[file] as Fixture;
    const changed = new Map(
      fixes
        .flatMap((fix) => fix.changed.filter((c) => c.file === file))
        .map((c) => [canonical(c.input), c]),
    );
    const added = new Set(
      fixes
        .flatMap((fix) => fix.added.filter((a) => a.file === file))
        .map((a) => canonical(a.case)),
    );

    const seen = new Set<string>();
    const v1Cases = fixture.cases.flatMap((c) => {
      if (added.has(canonical(c))) {
        seen.add(`added ${canonical(c)}`);
        return [];
      }
      const change = changed.get(canonical(c.input));
      if (!change) {
        return [c];
      }
      expect(canonical(c.output), "the fixture holds the new output").toBe(canonical(change.new));
      seen.add(`changed ${canonical(c.input)}`);
      return [{ input: c.input, output: change.v1 }];
    });
    expect(seen.size, "every listed case is in the fixture").toBe(changed.size + added.size);

    const v1 = { ...fixture, cases: v1Cases };
    expect(await sha256(canonical(v1))).toBe((divergences.v1 as Record<string, string>)[file]);
  });
});
