# ADR 0003: Decisions for the v1 port

**Status:** accepted, 26 October 2026, by the owner, answering the questions in platform#1.

## Localized text

Stored text is always a locale map, `{ es?, en?, pt?, fr?, it? }`, with at least one locale. Every Route has a required `sourceLocale`, and the route's title (and description, when it has one) must have text under that key. A plain string is accepted only at the v1 import boundary (`importV1Block` in `packages/core/src/v1-import/import.ts`), which turns it into `{ [sourceLocale]: text }`. The stored schemas refuse plain strings.

## React Router 8

We moved from React Router 7 to 8. This repository is new, Cloudflare's template is on 8, and 7 only receives security fixes. The pinned version is 8.4.0, the newest 8.x release that was at least two weeks old on 26 October 2026 (8.5.0 was seven days old). On 8 the Workers build runs through `@cloudflare/vite-plugin` with no custom `entry.server.tsx` and no `v8_*` future flags.

## Stable block ids

Every Block has a required `id`, a UUIDv7 string created when the block is created (`newBlockId`). Progress and Change point at block ids, never at positions, because positions move when a lesson is edited. The v1 import derives each id from the source route, lesson and position (`v1BlockId`, a SHA-256 of those three in UUIDv7 layout), so importing the same route twice gives the same ids. The golden fixtures keep v1's shape: the id belongs to the stored schema, not to the v1 capture.

## Reproduce v1 first, then fix on purpose

STEP 45 ports v1 exactly, with every golden case green. Each fix below then lands as its own commit that changes only the fixture cases listed in `packages/core/test/golden/DIVERGENCES.md`.

1. **FSRS with stability 0 on an existing card: fix.** v1 raises `FloatDomainError` (NaN). Repeated lapses shrink stability until the float underflows to 0, so real cards reach this, not only seeded ones. The port clamps stability to a floor before each update and never raises.
2. **The v1 FSRS variant: keep, for now.** v1 departs from FSRS v4: difficulty moves by `(rating - 3) * 0.5` on top of mean reversion, and a lapse uses `s * w7 * d^-0.2 * ((s + 1)^0.2 - 1)`. Moving to standard FSRS changes every learner's schedule, so it needs its own ADR.
3. **Refused calls using up rate-limit slots: fix.** Only an allowed call consumes a slot.
4. **Unknown or under-specified cost: fix.** An unknown model, or a call missing the quantity its price needs (`audio_seconds`), returns an explicit unknown result: never 0 and never a raise. The spend gate refuses a call whose cost is unknown (lesson 10).
5. **A wrong retry after a pass: keep.** The block stays satisfied, the attempt records `correct: false`, and FSRS gets AGAIN: that reflects memory and never locks learning. **A right answer after a release still feeds FSRS nothing: keep.** The release says the answer key was probably wrong, so the attempt carries no signal.
6. **Spanish-only title literals in the parser: fix.** v1 names untitled freeform sections "Introducción", "Lección" and "Continuación", and leaves those names out of a generated summary, whatever the lesson's language. The port uses a literal set per locale (es, en, pt, fr, it), chosen by the lesson's locale.
7. **`audio_explainer`: keep it in the registry.** Nothing produces it yet, because voice is on standby.
8. **`drag_drop` pairs: objects only when stored.** The v1 import turns `[term, definition]` arrays into objects.

## Closed in STEP 45

- **FSRS floor: 0.01**, named `FSRS_STABILITY_FLOOR`. It matches the floor FSRS-5 used. FSRS-6 implementations such as ts-fsrs use 0.001, but our variant is based on v4, and a higher floor keeps cards with many lapses from collapsing to near-zero intervals.
- **Unknown cost covers every under-specified call:** an unknown model, `scribe_v2` without `audio_seconds`, `eleven_multilingual_v2` and `eleven_flash_v2_5` without `characters`, and `tavily` without provider-reported usage. All return the explicit unknown result, and the spend gate refuses them. A pre-call estimate for a tool priced by usage stays unknown until a price is configured; that is decided in STEP 46 or later.
- **Golden fixtures** are recorded against Learning-routes `1e01220`, the merged commit on `main`.

## Answers to platform#2

Decided by the owner on 28 October 2026, answering the questions in platform#2. Each fix landed as its own commit and changed only the fixture cases listed in `DIVERGENCES.md`.

### `fill_blank` grades by position

A blank whose expected value is empty is not graded and does not count toward the score. The other blanks keep their positions, so answer i is compared with blank i. A block whose expected blanks are all empty is not answerable, so it never gates.

### `option_index` is parsed strictly

A value that is not an integer in range is wrong, never option 0. The grader accepts an integer or a string of plain digits, and does not coerce like Ruby's `to_i`.

### Code answers: `match` on `fill_blank`

A `fill_blank` block takes an optional `match`. `"text"` is the default and v1's normalisation, except that it removes only Unicode punctuation (`\p{P}`) and never symbols (`\p{S}`). `"exact"` trims whitespace and compares case-sensitively, for code, formulas and symbols. The v1 import sets `"text"`. A `check` compares the chosen option's index, never text, so it has no `match`. A `match` the grader does not know makes the block ungradable, which fails open.

### A sliding rate window

`decideSpend` already receives the times of the recent calls that used a slot, so it counts the ones from `now - 60 s` up to `now`, and a burst across a window edge is refused. The owner wrote the window as `[now - window, now)`. The port also counts an earlier call made in the same millisecond as `now`: every time it is given is an earlier call, and leaving those out would let simultaneous calls through together.

### The `:::concept` default title per locale

An untitled `:::concept` fence uses the same mechanism as the freeform titles: the lesson's locale picks Concepto (es), Concept (en), Conceito (pt), Concept (fr) or Concetto (it). Being in that set, it is also left out of a generated summary, where v1 listed "Concepto" as a key point.

### The FSRS floor applies on the way in and on the way out

Confirmed. A review clamps the stability it starts from to `FSRS_STABILITY_FLOOR` and never stores a stability below it. That is what keeps "stability stays at or above the floor" true, and it is why the fix changed 66 of the 147 recorded sequences, not the 56 STEP 44 estimated.

### An unknown estimate is refused before anything else

Confirmed, and intended. `decideSpend` refuses an unknown cost first, so a `tavily` call, or an ElevenLabs call made before its character count is known, is refused. Nothing in the platform calls either yet.

**Open item, designed in a later STEP:** pricing before the call. The gate reserves an upper bound for the call before it is made, and settles the reservation with the usage the provider reports afterwards.

### v1's recorded spend situations use a known cost of 0

Confirmed. v1's guard never read a call's cost, so the test harness passes a known cost of 0 for every situation the fixture recorded (`V1_ESTIMATE` in `packages/core/test/runners.ts`).

## Branch protection

`main` requires a pull request and the CI `check` job, refuses force pushes and deletion, and keeps a linear history. Administrators are held to the same rules. Learning-routes `main` has the same rules, with its own CI jobs required (`lint`, `scan_ruby`, `scan_js`, `test`, `system-test`, `no-tool-attribution`). Its deploy is a manual workflow run that pushes nothing to `main`, so the rules do not block it. Linear history means its pull requests now merge by squash or rebase, not with a merge commit.
