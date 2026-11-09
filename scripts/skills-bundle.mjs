#!/usr/bin/env node
// The assistant's skills, bundled for the agent (Platform STEP 10 §3): every skills/<area>/<name>/SKILL.md
// as text in packages/core/src/studio/skills.gen.ts. A Worker cannot read the repo's files, so the
// skills ship inside it. A core test fails when the bundle is stale: run `pnpm skills:bundle`.
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
export const SKILLS_DIR = join(ROOT, "skills");
export const BUNDLE = join(ROOT, "packages/core/src/studio/skills.gen.ts");

const folders = (dir) =>
  readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();

/** Each skill's SKILL.md path, by area then name. */
export function skillFiles(dir = SKILLS_DIR) {
  return folders(dir).flatMap((area) =>
    folders(join(dir, area)).map((name) => join(dir, area, name, "SKILL.md")),
  );
}

/** The bundle's source for these files. */
export function renderBundle(files = skillFiles()) {
  const texts = files.map((file) => JSON.stringify(readFileSync(file, "utf8")));
  return `// Written by \`pnpm skills:bundle\` from skills/*/*/SKILL.md (Platform STEP 10 §3). Do not edit.\n\nexport const SKILL_FILES: readonly string[] = [\n${texts.map((text) => `  ${text},`).join("\n")}\n];\n`;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  writeFileSync(BUNDLE, renderBundle());
  console.log(`${skillFiles().length} skills written to ${BUNDLE.slice(ROOT.length + 1)}`);
}
