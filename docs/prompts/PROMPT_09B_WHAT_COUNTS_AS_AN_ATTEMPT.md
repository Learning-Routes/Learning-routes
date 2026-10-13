# PROMPT 09B — Execute WP-15B: what counts as an attempt?

> Run from `~/Documents/Learning-routes`, on `wp15-match-variants`.
> Required planning base: commit `8672602` (`docs: plan WP-15B attempt semantics`).
> **Do not deploy `wp15-match-variants` until this lands.** A3 as built re-opens the gate
> the owner has reported three times.

## Execution contract

You are implementing an approved plan, not redesigning the feature.

Before editing anything:

1. Read `docs/superpowers/specs/2026-08-31-route-commerce-owner-dashboard-design.md` completely.
2. Read `docs/superpowers/plans/2026-08-31-wp15b-attempt-semantics.md` completely.
3. Read this prompt completely.
4. Run `git status --short --branch`, `git log -5 --oneline`, and
   `git merge-base --is-ancestor 8672602 HEAD`.
5. Stop and report the mismatch if the branch is not `wp15-match-variants`, commit `8672602`
   is not an ancestor, or the working tree contains changes other than the two existing
   prompt files. Do not discard, reset, stash, or overwrite user work.

Use `superpowers:executing-plans` and execute the WP-15B plan task by task in this same
terminal session. Follow its TDD order and commit boundaries. After each task, compare the
actual diff with that task before continuing.

The plan is authoritative where this older diagnostic prompt only describes the bug. If a
premise in either document disagrees with the current code, do not guess: print the exact
file/line evidence and pause for the owner.

Do not merge, push, deploy, change branches, enable Stripe, or begin WP-7/WP-16. The terminal
condition is a reviewed, clean `wp15-match-variants` branch with WP-15B implemented and the
handoff updated truthfully.

WP-15 is good work and the rest of it verifies clean. This is one defect it introduced and
one it revealed.

---

## §A — Three wrong drops release the block

Verified against the code, both halves:

`drag_drop_controller.js` `checkMatch()`, else branch — every wrong drop now posts:

```js
this._submitMatches({ [termIndex]: defIndex })
```

`block_attempts_controller.rb#create` — every post increments, unconditionally:

```ruby
attempt.attempts = attempt.attempts.to_i + 1
...
maybe_release!(attempt)   # releases once attempts >= BlockAttempt::RELEASE_AFTER (3)
```

`maybe_release!` sets `released_at` **and** `completed_at`, and `satisfied? = completed_at.present?`,
which is the only thing navigation asks about. So:

**Third wrong drop → block released → gate opens.**

On a five-pair board, three wrong drops is ordinary exploration, not three failed attempts.
This is the owner's recurring symptom — *"me deja pasar sin rellenar"*, *"sigue dejándome
pasar"* — arriving through a new door. A3 was meant to make the escape valve *reachable*; it
made it trivial.

`RELEASE_AFTER` was designed against a **wrong answer key**: the student submits a complete
answer, the key rejects it, three times. A partial exploratory placement is not that.

A second, smaller consequence of the same line: `attempts` seeds `BlockVariant`, so the board
now re-permutes after every mistake. Nothing breaks today (no re-render happens mid-exercise),
but "stable within an attempt" is only true until the student's first wrong drop, which is not
what the design says.

## §B — The mirror defect, pre-existing, revealed by A3

`fill_blank_controller.js` submits **only** when every blank is already correct:

```js
if (this.correct.size === this.answersValue.length) { submitBlock(...) }
```

So `attempts` never increments on a failure, `maybe_release!` can never fire, and a student
facing a wrong answer key in a fill-blank block is trapped with no way out. That is exactly
the trap A3 was written to remove — it was only ever removed for one of the two block types.

Check `scenario` and `lesson_check` for which side of this line they fall on, and report it.

## §C — Answer the question once

Three block types currently answer "what is an attempt?" three different ways. Decide it once
and apply it everywhere.

The answer to defend, unless you can argue a better one: **an attempt is a submission the
student intended as an answer.** A complete board that graded wrong is an attempt. A single
misplaced tile is not — it is a keystroke.

Implementation sketch, keep it this small:

1. The submission carries whether it was a complete answer. `block_submission.js` already owns
   the payload shape; add one flag rather than teaching each controller a new protocol.
2. `BlockAttemptsController` records every submission (payload, `updated_at`, the misplacement
   if you want it for gap analysis) but increments `attempts` — the counter `RELEASE_AFTER`
   reads — only for a complete one.
3. `fill_blank` submits on a completed board too, not only on a correct one, so its valve
   becomes reachable.
4. `BlockVariant`'s seed keeps reading `attempts`, so it inherits the fix: the board now stays
   stable for the whole exercise and re-permutes on a real retry, which is what §B of PROMPT 09
   specified.

Do not solve this by raising `RELEASE_AFTER`. That trades one arbitrary number for another and
leaves the two block types disagreeing.

## Hard constraints

1. **Do not deploy.**
2. Do not touch the WP-10 grading policy or the meaning of `released_at` — a released block
   still must not read as a pass.
3. Do not "fix" the 12 red engine tests. Report the count before and after, intersection of
   3 runs.
4. `env -u RAILS_MASTER_KEY` before every `bin/rails test`.

## Tests

- Three wrong **placements** do **not** release a drag_drop block, and the gate stays closed.
- Three wrong **completed boards** do release it, set `released_at`, satisfy navigation, and
  leave `correct` false.
- A fill_blank block completed wrongly three times releases — the case that is unreachable today.
- `BlockVariant` returns the same permutation across wrong placements within one attempt, and a
  different one after a completed failed attempt.
- Both suites, before and after.

## Reporting back

Print only: the flag you added and where it is set, the three-different-answers table for
drag_drop / fill_blank / scenario / lesson_check before and after, and both test counts.
