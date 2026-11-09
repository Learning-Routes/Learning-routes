import { readdirSync, readFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import { BUNDLE, renderBundle, skillFiles } from "../../../scripts/skills-bundle.mjs";
import { SKILLS } from "@learning-routes/core/studio/skill-library";
import { MOST_BODY_CHARS, parseSkill, SkillEval } from "@learning-routes/core/studio/skills";

const files: string[] = skillFiles();

describe("the skills library in skills/", () => {
  it("has the skills the assistant starts with", () => {
    expect(files.length).toBeGreaterThanOrEqual(38);
  });

  it.each(files.map((file) => [file.split("/skills/")[1], file]))("%s is valid", (_name, file) => {
    const skill = parseSkill(readFileSync(file, "utf8"));
    const folder = dirname(file);
    expect(skill.name).toBe(basename(folder));
    expect(skill.area).toBe(basename(dirname(folder)));
    expect(skill.body.length).toBeLessThanOrEqual(MOST_BODY_CHARS);
    expect(skill.body).toMatch(/\*\*Sources\*\*|## Sources|Sources:/);
    const evals = readdirSync(join(folder, "evals")).filter((each) => each.endsWith(".json"));
    expect(evals.length).toBeGreaterThanOrEqual(2);
    for (const each of evals) {
      const golden = SkillEval.parse(JSON.parse(readFileSync(join(folder, "evals", each), "utf8")));
      for (const pattern of golden.expect.mustMatchAny ?? []) {
        expect(() => new RegExp(pattern, "i")).not.toThrow();
      }
    }
  });

  it("gives every skill its own name", () => {
    const names = SKILLS.map((skill) => skill.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it("is bundled as it is now: run pnpm skills:bundle after changing a skill", () => {
    expect(readFileSync(BUNDLE, "utf8")).toBe(renderBundle());
  });
});
