#!/usr/bin/env node
// The public-repository rules for workflows (docs/WORKING_AGREEMENT.md): every action is pinned by
// full commit SHA with its version in a comment, and every workflow declares permissions at the
// top, contents: read at most, with a comment above any job that widens them. No workflow uses
// pull_request_target, which runs a fork's pull request with this repository's token and secrets.
// Prints each breach and exits 1 if there is any. Reads the files as lines: it needs no packages.
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const PINNED = /^[\w./-]+@[0-9a-f]{40} # v\d/;
const USES = /^\s*(?:-\s*)?uses:\s*(.+?)\s*$/;
const JOB = /^ {2}([\w-]+):\s*$/;
const TARGET = /^\s*-?\s*pull_request_target\b/;
const READ_ONLY_INLINE = /^\s*permissions:\s*(\{\s*\}|read-all)\s*$/;

/** The lines of a `permissions:` block at this indent, or null when it is empty or inline. */
function blockAfter(lines, index, indent) {
  const block = [];
  for (let at = index + 1; at < lines.length; at++) {
    const line = lines[at];
    if (line.trim() === "" || line.trim().startsWith("#")) {
      continue;
    }
    if (line.length - line.trimStart().length <= indent) {
      break;
    }
    block.push(line.trim());
  }
  return block;
}

const readOnly = (block) => block.length === 1 && block[0] === "contents: read";

export function problemsIn(name, text) {
  const problems = [];
  const lines = text.split("\n");
  lines.forEach((line, index) => {
    const ref = USES.exec(line)?.[1];
    if (ref && !ref.startsWith("./") && !PINNED.test(ref)) {
      problems.push(
        `${name}:${index + 1}: ${ref} is not pinned by commit SHA with its version in a comment`,
      );
    }
    if (TARGET.test(line)) {
      problems.push(`${name}: uses pull_request_target`);
    }
  });

  const top = lines.findIndex((line) => line.startsWith("permissions:"));
  if (top === -1) {
    problems.push(`${name}: declares no permissions at the top`);
  } else if (!READ_ONLY_INLINE.test(lines[top]) && !readOnly(blockAfter(lines, top, 0))) {
    problems.push(`${name}: the top-level permissions are wider than contents: read`);
  }

  let job = null;
  lines.forEach((line, index) => {
    job = JOB.exec(line)?.[1] ?? job;
    if (job === null || !line.startsWith("    permissions:") || READ_ONLY_INLINE.test(line)) {
      return;
    }
    const widens = !readOnly(blockAfter(lines, index, 4));
    if (widens && !lines[index - 1]?.trim().startsWith("#")) {
      problems.push(`${name}: ${job} widens its permissions without a comment saying why`);
    }
  });
  return problems;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const folder = join(dirname(fileURLToPath(import.meta.url)), "..", "workflows");
  const problems = readdirSync(folder)
    .filter((file) => file.endsWith(".yml") || file.endsWith(".yaml"))
    .sort()
    .flatMap((file) => problemsIn(file, readFileSync(join(folder, file), "utf8")));
  for (const problem of problems) {
    console.log(problem);
  }
  process.exit(problems.length === 0 ? 0 : 1);
}
