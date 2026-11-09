# The assistant's skills

What the creator's assistant knows how to do well (Platform STEP 10 §3). Each skill is a folder:

```
skills/<area>/<name>/
  SKILL.md
  evals/<case>.json   (at least two)
```

They are text, not code, and ship with the agent: `pnpm skills:bundle` writes them into `packages/core/src/studio/skills.gen.ts`, and a test fails when that file is stale.

## How the assistant uses them

- It always sees a short index: each skill's `name` and `description`, only for the areas that help in the step it is in.
- It calls `load_skill` when the creator's words call for one. The skill's full text then follows its instructions.
- At most four are loaded at once; the oldest goes first. Changing step unloads them all.
- Every load is logged, so we learn which skills earn their place.

## SKILL.md

```markdown
---
name: retrieval-practice
description: When lessons should make students recall what they learned instead of rereading it.
area: pedagogia
tags: [memoria, practica]
version: 1
cost: small
---

The instructions, in English, addressed to the assistant.
```

- `name`: lowercase words joined by hyphens, the same as the folder.
- `description`: one sentence, 10 to 240 characters, saying **when** to load it. The index shows only this.
- `area`: one of `entrevista`, `pedagogia`, `formatos`, `materias`, `importar`, `calidad`, `pagina`.
- `tags`: a list, maybe empty.
- `version`: a whole number, raised on every change.
- `cost`: `small` when the cheap model can follow it, `strong` when it needs the strong one.

The body is at most about 700 tokens (2,800 characters). It says what to do and what never to do, with a short example when one helps. It ends with **Sources**: the research it rests on, as author, year and title. Cite only work that exists.

These are our own words. The education-agent-skills plugin (CC BY-SA 4.0) was read as reference only; nothing is copied from it.

## Evals

Each `evals/<case>.json` is one golden moment of a conversation. `pnpm skills:eval` sends it to the cheap model with the assistant's instructions and the skill loaded, and checks the first answer:

```json
{
  "step": "meet",
  "conversation": [{ "role": "user", "content": "Quiero mi app de matemáticas" }],
  "expect": {
    "oneQuestion": true,
    "mustNotContain": ["Juan"],
    "mustMatchAny": ["nombre|llamas|alumnos"],
    "calls": ["ask_creator"],
    "noCalls": ["create_route"]
  }
}
```

- `step`: the guided step the conversation is in.
- `conversation`: the messages so far, ending with the creator's. Only `user` and `assistant` roles.
- `expect`, every field optional:
  - `oneQuestion`: the visible words (the message and the question asked) hold at most one question mark.
  - `mustNotContain`: none of these appear, ignoring case, in the visible words or in any tool call's arguments. This is how an eval catches invented content: list what the creator never said.
  - `mustMatchAny`: at least one of these regular expressions matches, ignoring case, the visible words or the tool calls' arguments.
  - `calls`: each of these tools is called in the answer.
  - `noCalls`: none of these tools is called.

The tools the model can call: `ask_creator`, `set_step`, `show_lesson`, `ask_to_publish`, `load_skill`, `get_route_format`, `list_routes`, `get_route`, `create_route`, `update_route_details`, `add_module`, `add_lesson`, `add_blocks`, `upload_document`, `import_route`.

The evals run nightly in CI, not on every pull request. A regression in a key behaviour fails the run: inventing what the creator did not give, or asking more than one question at a time.
