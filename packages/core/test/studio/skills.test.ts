import { describe, expect, it } from "vitest";
import {
  loadSkill,
  MOST_LOADED,
  parseSkill,
  type Skill,
  skillIndex,
  skillTail,
} from "../../src/studio/skills";

const skill = (name: string, area: Skill["area"]): Skill => ({
  name,
  description: `Use for ${name}.`,
  area,
  tags: [],
  version: 1,
  cost: "small",
  body: `How to do ${name}.`,
});

const LIBRARY = [
  skill("discovery-questions", "entrevista"),
  skill("retrieval-practice", "pedagogia"),
  skill("worked-examples", "pedagogia"),
  skill("concept-block", "formatos"),
  skill("fractions", "materias"),
  skill("factual-accuracy", "calidad"),
  skill("tagline", "pagina"),
];

describe("the skills library", () => {
  it("reads a SKILL.md: its frontmatter and its body", () => {
    const read = parseSkill(
      `---\nname: retrieval-practice\ndescription: When students should recall, not reread.\narea: pedagogia\ntags: [memoria, practica]\nversion: 2\ncost: small\n---\n\nAsk them to recall.\n`,
    );
    expect(read).toEqual({
      name: "retrieval-practice",
      description: "When students should recall, not reread.",
      area: "pedagogia",
      tags: ["memoria", "practica"],
      version: 2,
      cost: "small",
      body: "Ask them to recall.",
    });
  });

  it("refuses a SKILL.md without its fields, or with an unknown area or cost", () => {
    expect(() => parseSkill("no frontmatter")).toThrow();
    expect(() =>
      parseSkill(
        "---\nname: x\ndescription: y\narea: magia\ntags: []\nversion: 1\ncost: small\n---\nbody",
      ),
    ).toThrow();
  });

  it("shows the model only the names and descriptions that fit the step", () => {
    const meet = skillIndex(LIBRARY, "meet");
    expect(meet).toContain("discovery-questions: Use for discovery-questions.");
    expect(meet).not.toContain("retrieval-practice");
    expect(meet).not.toContain("How to do");
    const build = skillIndex(LIBRARY, "build");
    expect(build).toContain("retrieval-practice");
    expect(build).toContain("concept-block");
    expect(build).not.toContain("tagline");
  });

  it("loads at most four, letting the oldest go, and refuses a name it does not have", () => {
    let loaded: string[] = [];
    for (const name of ["retrieval-practice", "worked-examples", "concept-block", "fractions"]) {
      loaded = (loadSkill(loaded, name, LIBRARY, "build") as { loaded: string[] }).loaded;
    }
    expect(loaded).toHaveLength(MOST_LOADED);
    const fifth = loadSkill(loaded, "factual-accuracy", LIBRARY, "build");
    expect(fifth).toEqual({
      loaded: ["worked-examples", "concept-block", "fractions", "factual-accuracy"],
    });
    expect(loadSkill(loaded, "made-up", LIBRARY, "build")).toEqual({
      error: "There is no skill made-up for this step.",
    });
    expect(loadSkill(loaded, "fractions", LIBRARY, "build")).toEqual({ loaded });
  });

  it("loads only a skill the step's index shows", () => {
    expect(loadSkill([], "tagline", LIBRARY, "build")).toEqual({
      error: "There is no skill tagline for this step.",
    });
    expect(loadSkill([], "tagline", LIBRARY, "page")).toEqual({ loaded: ["tagline"] });
  });

  it("puts the loaded skills' full text after the instructions", () => {
    const tail = skillTail(["fractions"], LIBRARY);
    expect(tail).toContain("How to do fractions.");
    expect(skillTail([], LIBRARY)).toBe("");
  });
});
