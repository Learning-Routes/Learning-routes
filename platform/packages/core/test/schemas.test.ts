import { describe, expect, it } from "vitest";
import { Block } from "../src/blocks";
import {
  Change,
  CreditLedgerEntry,
  Lesson,
  Membership,
  Offer,
  Progress,
  Route,
} from "../src/domain";
import { newBlockId } from "../src/ids";
import { AUTHORED_BLOCK_TYPES, BLOCK_TYPES, SYSTEM_BLOCK_TYPES } from "../src/learning/registry";
import { LocalizedText } from "../src/text";

const now = "2026-10-26T12:00:00.000Z";
const blockId = "0192f6d0-7c3e-7cc0-8a1b-2b3c4d5e6f70";

describe("LocalizedText", () => {
  it("is a per-locale map, and never a plain string once stored", () => {
    expect(LocalizedText.parse({ es: "Hola", en: "Hello" })).toEqual({ es: "Hola", en: "Hello" });
    expect(LocalizedText.safeParse("Hola").success).toBe(false);
  });

  it("refuses an unknown locale and an empty map", () => {
    expect(LocalizedText.safeParse({ de: "Hallo" }).success).toBe(false);
    expect(LocalizedText.safeParse({}).success).toBe(false);
  });
});

describe("Block", () => {
  it("has 13 authored and 3 system types", () => {
    expect(AUTHORED_BLOCK_TYPES).toHaveLength(13);
    expect(SYSTEM_BLOCK_TYPES).toEqual(["audio", "audio_explainer", "video"]);
    expect(BLOCK_TYPES).toHaveLength(16);
  });

  it("parses a check with localized text", () => {
    const check = {
      id: blockId,
      type: "check",
      title: null,
      question: { es: "¿Capital de Portugal?", en: "Capital of Portugal?" },
      options: [
        { label: { es: "Lisboa" }, correct: true },
        { label: { es: "Madrid" }, correct: false },
      ],
      explanation: null,
    };
    expect(Block.parse(check)).toEqual(check);
  });

  it("refuses an unknown type, a missing field and a field it does not know", () => {
    expect(Block.safeParse({ id: blockId, type: "tap_pairs" }).success).toBe(false);
    expect(Block.safeParse({ id: blockId, type: "check", options: [] }).success).toBe(false);
    const tip = { id: blockId, type: "tip", title: null, body: { es: "x" } };
    expect(Block.safeParse(tip).success).toBe(true);
    expect(Block.safeParse({ ...tip, correct: true }).success).toBe(false);
  });

  it("requires a UUIDv7 id", () => {
    const tip = { type: "tip", title: null, body: { es: "Practica." } };
    expect(Block.safeParse({ ...tip, id: blockId }).success).toBe(true);
    expect(Block.safeParse(tip).success).toBe(false);
    expect(Block.safeParse({ ...tip, id: "0192f6d0-7c3e-4cc0-8a1b-2b3c4d5e6f70" }).success).toBe(
      false,
    );
    const now = Date.parse("2026-10-26T12:00:00Z");
    expect(Block.safeParse({ ...tip, id: newBlockId(now, new Uint8Array(10)) }).success).toBe(true);
    expect(newBlockId(now, new Uint8Array(10))).not.toBe(
      newBlockId(now, new Uint8Array(10).fill(1)),
    );
  });

  it("stores drag_drop pairs as objects only", () => {
    const base = { id: blockId, type: "drag_drop", title: null };
    const pair = { term: { es: "uno" }, definition: { en: "one" } };
    expect(Block.safeParse({ ...base, pairs: [pair] }).success).toBe(true);
    expect(Block.safeParse({ ...base, pairs: [[{ es: "uno" }, { en: "one" }]] }).success).toBe(
      false,
    );
  });
});

describe("domain", () => {
  it("makes a route a graph of lessons", () => {
    const lesson = Lesson.parse({
      id: "l2",
      routeId: "r1",
      moduleId: "m1",
      position: 1,
      prerequisites: ["l1"],
      title: { es: "Dos" },
      blocks: [{ id: blockId, type: "tip", title: null, body: { es: "Practica." } }],
    });
    expect(lesson.prerequisites).toEqual(["l1"]);
  });

  it("versions routes and records what they were forked from", () => {
    const route = Route.parse({
      id: "r2",
      spaceId: "s1",
      slug: "portugues",
      title: { es: "Portugués" },
      sourceLocale: "es",
      access: "open",
      pricing: "paid",
      version: 3,
      forkedFrom: { routeId: "r1", version: 2 },
      createdAt: now,
      updatedAt: now,
    });
    expect(route.forkedFrom).toEqual({ routeId: "r1", version: 2 });
    expect(Route.safeParse({ ...route, version: 0 }).success).toBe(false);
  });

  it("requires the route's text in its source locale", () => {
    const route = {
      id: "r1",
      spaceId: "s1",
      slug: "portugues",
      title: { en: "Portuguese" },
      sourceLocale: "es",
      access: "open",
      pricing: "free",
      version: 1,
      forkedFrom: null,
      createdAt: now,
      updatedAt: now,
    };
    expect(Route.safeParse(route).success).toBe(false);
    expect(
      Route.safeParse({ ...route, title: { es: "Portugués", en: "Portuguese" } }).success,
    ).toBe(true);
    expect(
      Route.safeParse({ ...route, title: { es: "Portugués" }, description: { en: "Learn it" } })
        .success,
    ).toBe(false);
  });

  it("scopes a membership to a space, except the platform operator", () => {
    expect(
      Membership.parse({ scope: "space", spaceId: "s1", userId: "u1", role: "coeditor" }).role,
    ).toBe("coeditor");
    expect(Membership.parse({ scope: "platform", userId: "u1", role: "operator" }).role).toBe(
      "operator",
    );
    expect(
      Membership.safeParse({ scope: "space", spaceId: "s1", userId: "u1", role: "operator" })
        .success,
    ).toBe(false);
  });

  it("prices offers in integer minor units with a currency", () => {
    const base = { id: "o1", spaceId: "s1", routeId: "r1", active: true, createdAt: now };
    expect(
      Offer.parse({ ...base, kind: "one_time", price: { amountMinor: 1900, currency: "EUR" } })
        .kind,
    ).toBe("one_time");
    expect(
      Offer.safeParse({ ...base, kind: "one_time", price: { amountMinor: 19.5, currency: "EUR" } })
        .success,
    ).toBe(false);
    expect(
      Offer.safeParse({
        ...base,
        kind: "group_price",
        price: { amountMinor: 900, currency: "eur" },
        seats: 5,
      }).success,
    ).toBe(false);
  });

  it("keeps progress per student, apart from the content", () => {
    const progress = Progress.parse({
      studentId: "u1",
      routeId: "r1",
      lessonId: "l1",
      status: "in_progress",
      completedAt: null,
      blocks: [
        { blockId, attempts: 3, correct: false, score: 0, releasedAt: now, completedAt: now },
      ],
      review: null,
    });
    expect(progress.blocks[0]?.releasedAt).toBe(now);
  });

  it("records every change with who, before and after", () => {
    const change = Change.parse({
      id: "c1",
      spaceId: "s1",
      actor: { kind: "agent", id: "session-1" },
      action: "lesson.update",
      target: { kind: "block", id: blockId },
      before: { title: "Uno" },
      after: { title: "Una" },
      status: "proposed",
      createdAt: now,
    });
    expect(change.status).toBe("proposed");
  });

  it("keeps credits as signed integers", () => {
    const entry = { id: "e1", spaceId: "s1", amount: -1500, reason: "usage", createdAt: now };
    expect(CreditLedgerEntry.parse(entry).amount).toBe(-1500);
    expect(CreditLedgerEntry.safeParse({ ...entry, amount: 1.5 }).success).toBe(false);
  });
});
