import { describe, expect, it } from "vitest";
import { Block } from "../../src/blocks/schema";
import {
  AUTHORED_BLOCK_TYPES,
  BLOCK_TYPES,
  blockRole,
  defaultTitle,
  fenceTypes,
  headingMap,
  isKnownBlockType,
  SYSTEM_BLOCK_TYPES,
} from "../../src/blocks/types";
import registry from "../golden/block_registry.json" with { type: "json" };
import gating from "../golden/gating.json" with { type: "json" };

const v1 = registry.cases[0]?.output;

describe("registry (block_registry.json)", () => {
  it("lists v1's types, authored and system", () => {
    expect([...BLOCK_TYPES].sort()).toEqual(v1?.types);
    expect([...AUTHORED_BLOCK_TYPES].sort()).toEqual(v1?.authored_types);
    expect([...SYSTEM_BLOCK_TYPES].sort()).toEqual(v1?.system_types);
  });

  it("has v1's fences and headings", () => {
    expect([...fenceTypes()].sort()).toEqual(v1?.fence_types);
    expect(headingMap()).toEqual(v1?.heading_map);
  });

  it("knows exactly v1's types, case-sensitively", () => {
    for (const [type, known] of Object.entries(v1?.known ?? {})) {
      expect(isKnownBlockType(type), type).toBe(known);
    }
  });

  it("has v1's default titles in en and es", () => {
    for (const [locale, titles] of Object.entries(v1?.default_titles ?? {})) {
      for (const [type, title] of Object.entries(titles)) {
        expect(defaultTitle(type, locale as "en" | "es")).toBe(title);
      }
    }
    expect(defaultTitle("tap_pairs", "en")).toBeNull();
  });

  it("is the vocabulary the Block union defines", () => {
    const unionTypes = Block.options.map((option) => option.shape.type.value).sort();
    expect(unionTypes).toEqual([...BLOCK_TYPES].sort());
  });
});

describe("gating (gating.json)", () => {
  it.each(gating.cases)("$input", ({ input, output }) => {
    const role = blockRole(input);
    expect({
      gradable: role.gradable,
      gating: role.gating,
      engagement_only: role.engagementOnly,
    }).toEqual(output);
  });
});
