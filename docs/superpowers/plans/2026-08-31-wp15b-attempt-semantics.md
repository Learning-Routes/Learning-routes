# WP-15B Attempt Semantics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make a deliberate, completed block answer count as an attempt while recording partial interactions without allowing three misplaced tiles to release navigation.

**Architecture:** Add one `submission_complete` boolean to the shared block submission envelope. The server always stores and grades the latest payload, but increments `BlockAttempt#attempts` and evaluates `RELEASE_AFTER` only when that boolean is exactly true. Controllers identify complete answers consistently: one selected option is complete for `check` and `scenario`, a fully entered set is complete for `fill_blank`, and one pass across every term is complete for `drag_drop`; a single wrong placement is incomplete.

**Tech Stack:** Rails 8.1, PostgreSQL, Minitest integration/system tests, Stimulus, browser Fetch API

**Spec:** `docs/superpowers/specs/2026-08-31-route-commerce-owner-dashboard-design.md`

## Global Constraints

- Work on `wp15-match-variants` after commit `265189e`; do not merge or deploy.
- Preserve WP-10's distinction between `correct`, `released`, and `satisfied`.
- Preserve WP-15's original-index permutations and deterministic `BlockVariant` seed.
- `submission_complete` is metadata about intent, never a correctness claim; the server still re-grades the raw answer.
- Missing `submission_complete` is incomplete. Do not retain the unsafe legacy behavior where every POST increments attempts.
- Run every Rails test command through `env -u RAILS_MASTER_KEY`.
- Do not fix or rebaseline the known full-suite failures in this package.
- New UI copy must use I18n; this package should not need new copy.
- A Rails integration test does not execute Stimulus. Browser verification is required for the JavaScript behavior.

---

### Task 1: Make attempt counting explicit on the server

**Files:**
- Modify: `test/controllers/learning_routes_engine/block_attempts_test.rb`
- Modify: `engines/learning_routes_engine/app/controllers/learning_routes_engine/block_attempts_controller.rb`

**Interfaces:**
- Consumes: JSON `block.submission_complete` as the literal boolean `true` or `false`.
- Produces: `BlockAttemptsController#complete_submission? -> Boolean`; attempt JSON retains the existing response shape, with `attempts` and `attempts_remaining` based only on completed submissions.

- [ ] **Step 1: Change the test helper so every existing deliberate answer is explicit**

Change the helper to default to a completed answer while allowing tests to submit an incomplete interaction:

```ruby
def submit(section_index, payload, complete: true)
  post learning_routes_engine.route_step_block_attempt_path(@route, @step, section_index),
       params: { block: payload.merge(submission_complete: complete) }, as: :json
end
```

For direct `post` calls that represent a complete answer, add `submission_complete: true` inside `block`. Keep the ownership-forgery request complete so it continues to prove authorization rather than relying on the new default.

- [ ] **Step 2: Add failing server tests for incomplete interactions**

Add these tests under the release-valve section:

```ruby
test "incomplete interactions are stored and graded without consuming an attempt" do
  3.times { submit(2, { matches: { "0" => "1" } }, complete: false) }

  a = attempt_for(2)
  assert_equal 0, a.attempts
  assert_equal false, a.correct
  assert_equal({ "matches" => { "0" => "1" }, "submission_complete" => false }, a.payload)
  assert_not a.released?
  assert_not a.satisfied?

  assert_equal 3, response.parsed_body["attempts_remaining"]
end

test "only completed wrong answers consume the release counter" do
  7.times { submit(2, { matches: { "0" => "1" } }, complete: false) }
  2.times { submit(2, { matches: { "0" => "1", "1" => "0" } }, complete: true) }

  a = attempt_for(2)
  assert_equal 2, a.attempts
  assert_not a.released?

  submit(2, { matches: { "0" => "1", "1" => "0" } }, complete: true)
  assert_equal 3, a.reload.attempts
  assert a.released?
  assert_equal false, a.correct
end

test "a forged correctness claim is ignored even on a completed submission" do
  submit(1, { option_index: 1, correct: true, score: 100, passed: true }, complete: true)

  a = attempt_for(1)
  assert_equal 1, a.attempts
  assert_equal false, a.correct
  assert_not a.satisfied?
end

test "missing submission_complete is incomplete rather than legacy-complete" do
  post learning_routes_engine.route_step_block_attempt_path(@route, @step, 1),
       params: { block: { option_index: 1 } }, as: :json

  assert_response :success
  assert_equal 0, attempt_for(1).attempts
  assert_not attempt_for(1).released?
end
```

- [ ] **Step 3: Run the focused tests and verify the unsafe counter fails**

Run:

```bash
env -u RAILS_MASTER_KEY bin/rails test test/controllers/learning_routes_engine/block_attempts_test.rb
```

Expected before implementation: failures show incomplete submissions incrementing `attempts` and eventually setting `released_at`.

- [ ] **Step 4: Implement exact-boolean completion semantics**

In `BlockAttemptsController#create`, keep grading and payload storage for every POST, but replace the unconditional increment and release call:

```ruby
attempt.block_type = section["type"]
attempt.payload    = block_payload
attempt.attempts   = attempt.attempts.to_i + 1 if complete_submission?

if result.gradable?
  attempt.correct = result.correct
  attempt.score   = result.score
  attempt.completed_at = Time.current if result.correct
  maybe_release!(attempt) if complete_submission?
else
  attempt.correct = nil
  attempt.score   = nil
  attempt.completed_at = Time.current
  Rails.logger.debug { "[BlockAttempt] #{result.reason}" } if result.reason
end
```

Add a private predicate that accepts only the JSON boolean, not truthy strings:

```ruby
def complete_submission?
  params.dig(:block, :submission_complete) == true
end
```

Do not remove `submission_complete` from `block_payload`: preserving the submitted flag alongside the raw answer makes the stored event explainable. Do not allow this flag to influence `BlockGrader` correctness.

- [ ] **Step 5: Run the server tests**

Run:

```bash
env -u RAILS_MASTER_KEY bin/rails test \
  test/controllers/learning_routes_engine/block_attempts_test.rb \
  test/controllers/learning_routes_engine/block_navigation_gate_test.rb \
  test/controllers/learning_routes_engine/block_variant_rendering_test.rb
```

Expected: the new attempt tests pass. Existing tests that post directly without the flag must be updated only when they clearly represent a complete answer; do not restore an implicit server default.

- [ ] **Step 6: Commit the server contract**

```bash
git add engines/learning_routes_engine/app/controllers/learning_routes_engine/block_attempts_controller.rb \
        test/controllers/learning_routes_engine/block_attempts_test.rb \
        test/controllers/learning_routes_engine/block_navigation_gate_test.rb \
        test/controllers/learning_routes_engine/block_variant_rendering_test.rb
git commit -m "fix(blocks): count only completed answers as attempts"
```

---

### Task 2: Send one completion signal consistently from Stimulus

**Files:**
- Modify: `app/javascript/controllers/block_submission.js`
- Modify: `app/javascript/controllers/drag_drop_controller.js`
- Modify: `app/javascript/controllers/fill_blank_controller.js`
- Modify: `app/javascript/controllers/scenario_controller.js`
- Modify: `app/javascript/controllers/lesson_check_controller.js`

**Interfaces:**
- Consumes: `submitBlock(element, payload, { complete: Boolean })`; omission defaults to `false`.
- Produces: JSON `{ block: { ...rawPayload, submission_complete: Boolean } }`.
- Produces: `drag_drop_controller#roundMatches`, a map of original term index to the latest definition attempted during the current completed-answer round.

- [ ] **Step 1: Extend the shared submission envelope**

Change the signature and request body in `block_submission.js`:

```javascript
export async function submitBlock(element, payload, { complete = false } = {}) {
  // existing URL and CSRF handling remains unchanged
  const block = { ...payload, submission_complete: complete === true }

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Accept": "application/json",
      "X-CSRF-Token": token || ""
    },
    body: JSON.stringify({ block })
  })
  // existing response/error handling remains unchanged
}
```

Update the file comment to define a complete submission as an answer the student intended the server to judge as a whole. A pointer movement, keystroke, or single misplaced tile is incomplete.

- [ ] **Step 2: Mark one-choice blocks complete**

In `scenario_controller.js`, a selected option is the whole answer:

```javascript
submitBlock(this.element, { option_index: idx === undefined ? null : Number(idx) }, { complete: true })
  .then((r) => announceResult(this.element, r))
```

In `lesson_check_controller.js`, use the same option:

```javascript
submitBlock(this.element, { option_index: optionIndex }, { complete: true })
  .then((result) => announceResult(this.element, result))
```

Do not send client-side `isCorrect`; the server remains authoritative.

- [ ] **Step 3: Make fill-blank submit a complete wrong board**

Add state in `connect`:

```javascript
this.correct = new Set()
this.lastSubmittedSnapshot = null
```

After every answer check, call a new method. A board is complete only when every field has reached the expected answer's normalized length; this follows the controller's existing point at which it treats an entry as a finished wrong answer and avoids counting the first character as an attempt:

```javascript
_submitCompletedBoard() {
  const inputs = Array.from(this.inputTargets || [])
  const complete = inputs.length === this.answersValue.length && inputs.every((input, index) => {
    const expected = String(this.answersValue[index] || "").trim()
    return input.value.trim().length >= expected.length
  })
  if (!complete) return

  const answers = inputs.map((input) => input.value)
  const snapshot = JSON.stringify(answers)
  if (snapshot === this.lastSubmittedSnapshot) return

  this.lastSubmittedSnapshot = snapshot
  submitBlock(this.element, { answers }, { complete: true })
    .then((result) => announceResult(this.element, result))
}
```

Call `_submitCompletedBoard()` at the end of `checkAnswer`. Remove the old correct-only `submitBlock` call, while preserving its success feedback. If an input changes after being correct, remove its index from `this.correct` before re-evaluating it so stale client state cannot announce success.

- [ ] **Step 4: Make drag-drop distinguish interaction from completed round**

Initialize a round map:

```javascript
connect() {
  this.matched = new Set()
  this.selectedTerm = null
  this.roundMatches = {}
}
```

On both correct and wrong placement, record original indices:

```javascript
this.roundMatches[termIndex] = defIndex
```

Add helpers:

```javascript
_roundComplete() {
  return this.termTargets.every((term) => this.roundMatches[term.dataset.termIndex] !== undefined)
}

_placedMatches() {
  return this.termTargets.reduce((matches, term) => {
    if (term.dataset.placedDef !== undefined && term.dataset.placedDef !== "") {
      matches[term.dataset.termIndex] = term.dataset.placedDef
    }
    return matches
  }, {})
}

_submitRoundInteraction() {
  const complete = this._roundComplete()
  const matches = { ...this._placedMatches(), ...this.roundMatches }

  submitBlock(this.element, { matches }, { complete })
    .then((result) => announceResult(this.element, result))

  if (complete) this.roundMatches = this._placedMatches()
}
```

Call `_submitRoundInteraction()` after a wrong placement. For a correct placement, call it only when `_roundComplete()` or every term is matched. Replace `_submitMatches` with this one shared path so the final all-correct board carries `complete: true`. The wrong tile still bounces and is not written to `placedDef`; its attempted pairing exists only in `roundMatches` and the stored submission.

- [ ] **Step 5: Inspect all callers and make omission intentional**

Run:

```bash
rg -n "submitBlock\(" app/javascript/controllers
```

Expected classification:

| Controller | Completion rule |
|---|---|
| `drag_drop` | `true` only after every term has an entry in the current round |
| `fill_blank` | `true` when every blank contains a finished-length answer, correct or wrong |
| `scenario` | `true` for the selected option |
| `lesson_check` | `true` for the selected option |
| `flashcards` | preserve engagement behavior; mark complete only at its existing final rating submission |
| `simulation` | preserve engagement behavior; mark complete at its existing explicit interaction submission |

Update the last two callers with `{ complete: true }` at the exact point they already submit their engagement event. `code_playground_controller.js` imports `submitBlock` but never calls it; record that pre-existing WP-10 gap in `FINDINGS_WP15.md` and leave it out of this attempt-semantics package.

- [ ] **Step 6: Run importmap and focused Rails regression tests**

Run:

```bash
bin/importmap audit
env -u RAILS_MASTER_KEY bin/rails test \
  test/controllers/learning_routes_engine/block_attempts_test.rb \
  test/controllers/learning_routes_engine/block_navigation_gate_test.rb \
  test/controllers/learning_routes_engine/block_variant_rendering_test.rb
```

Expected: importmap audit succeeds and focused tests pass.

- [ ] **Step 7: Commit the client protocol**

```bash
git add app/javascript/controllers/block_submission.js \
        app/javascript/controllers/drag_drop_controller.js \
        app/javascript/controllers/fill_blank_controller.js \
        app/javascript/controllers/scenario_controller.js \
        app/javascript/controllers/lesson_check_controller.js \
        app/javascript/controllers/flashcards_controller.js \
        app/javascript/controllers/simulation_controller.js
git commit -m "fix(blocks): distinguish answers from partial interactions"
```

---

### Task 3: Prove the gate and variant behavior end to end

**Files:**
- Create: `test/system/block_attempt_semantics_test.rb`
- Create if absent: `test/application_system_test_case.rb`
- Modify: `test/controllers/learning_routes_engine/block_variant_rendering_test.rb`

**Interfaces:**
- Consumes: the real rendered drag-drop DOM, real Stimulus controllers, real Fetch request, and `BlockAttempt` persistence.
- Produces: browser evidence that incomplete drops do not release and complete failed rounds do.

- [ ] **Step 1: Add system-test infrastructure only if the repository lacks it**

Create `test/application_system_test_case.rb`:

```ruby
require "test_helper"

class ApplicationSystemTestCase < ActionDispatch::SystemTestCase
  driven_by :selenium, using: :headless_chrome, screen_size: [1440, 1000]
end
```

Do not add another browser framework or JavaScript package.

- [ ] **Step 2: Add a real-browser regression for three wrong placements**

Create `test/system/block_attempt_semantics_test.rb` with the same real route/step shape used by `BlockVariantRenderingTest`. Sign in through the UI, visit the step, and use JavaScript to dispatch three wrong drop interactions through the connected Stimulus controller. After the fetches settle, assert through a Rails runner-visible record (or a small test-only polling helper) that:

```ruby
attempt = LearningRoutesEngine::BlockAttempt.find_by!(
  user: @user, route_step: @step, section_index: DRAG_DROP_INDEX
)
assert_equal 0, attempt.attempts
assert_not attempt.released?
assert_not attempt.satisfied?
assert page.has_css?(".lesson-nav-footer", text: /Responde para continuar|Answer to continue/)
```

The test must trigger the controller, not call the Rails endpoint directly. Use original `data-term-index` and `data-def-index` values from the rendered DOM to choose a mismatched pair.

- [ ] **Step 3: Add a real-browser completed-round regression**

In the same test, attempt one definition for every term while ensuring at least one pairing is wrong. Repeat three complete rounds. Assert:

```ruby
attempt.reload
assert_equal 3, attempt.attempts
assert attempt.released?
assert_equal false, attempt.correct
assert attempt.satisfied?
```

Then assert the page receives a `block:graded` result with `released: true`, `satisfied: true`, and `correct: false`. Do not assert that release is a pass.

- [ ] **Step 4: Update deterministic variant tests**

Replace the pre-fix test that says a single failure changes the board. Pin both sides of the corrected contract:

```ruby
test "incomplete placements keep the same variant and a completed failure advances it" do
  first = page.css("[data-drag-drop-target='term']").map { |n| n["data-term-index"] }

  submit(DRAG_DROP_INDEX, { matches: { "0" => "1" }, submission_complete: false })
  assert_equal 0, attempt_for(DRAG_DROP_INDEX).attempts
  assert_equal first, page.css("[data-drag-drop-target='term']").map { |n| n["data-term-index"] }

  submit(DRAG_DROP_INDEX, {
    matches: PAIRS.each_index.to_h { |i| [i.to_s, ((i + 1) % PAIRS.size).to_s] },
    submission_complete: true
  })
  assert_equal 1, attempt_for(DRAG_DROP_INDEX).reload.attempts
  assert_not_equal first, page.css("[data-drag-drop-target='term']").map { |n| n["data-term-index"] }
end
```

Update the old three-failed-submissions tests so each payload is a complete mismatched board with `submission_complete: true`. Add a separate assertion that three partial payloads keep `data-block-satisfied="false"`.

- [ ] **Step 5: Run system and focused tests**

Run:

```bash
env -u RAILS_MASTER_KEY bin/rails test test/system/block_attempt_semantics_test.rb
env -u RAILS_MASTER_KEY bin/rails test \
  test/controllers/learning_routes_engine/block_attempts_test.rb \
  test/controllers/learning_routes_engine/block_navigation_gate_test.rb \
  test/controllers/learning_routes_engine/block_variant_rendering_test.rb
```

Expected: all pass. If Chrome cannot start because of local toolchain state, record the exact failure and run the flow manually in the existing browser; do not replace the browser proof with an integration test.

- [ ] **Step 6: Commit end-to-end coverage**

```bash
git add test/application_system_test_case.rb \
        test/system/block_attempt_semantics_test.rb \
        test/controllers/learning_routes_engine/block_variant_rendering_test.rb
git commit -m "test(blocks): cover completed-attempt semantics in browser"
```

---

### Task 4: Verify, document, and prepare WP-15 for review

**Files:**
- Modify: `WP15_HANDOFF.md`
- Create or modify: `FINDINGS_WP15.md`
- Add: `PROMPT_09B_WHAT_COUNTS_AS_AN_ATTEMPT.md`
- Add: `PROMPT_09_MATCH_VARIANTS_LAYOUT.md`

**Interfaces:**
- Consumes: completed Tasks 1-3 and their test evidence.
- Produces: a truthful WP-15 handoff and tracked source prompts.

- [ ] **Step 1: Run the main suite**

Run three times with different seeds:

```bash
env -u RAILS_MASTER_KEY bin/rails db:test:prepare test TESTOPTS="--seed=15001"
env -u RAILS_MASTER_KEY bin/rails test test TESTOPTS="--seed=15002"
env -u RAILS_MASTER_KEY bin/rails test test TESTOPTS="--seed=15003"
```

Expected: zero failures and errors in every run. Record each run/assertion count.

- [ ] **Step 2: Measure the known full-suite failures rather than assuming the old count**

Run three times and save outputs outside the repository:

```bash
env -u RAILS_MASTER_KEY bin/rails test test engines/*/test --seed 15101
env -u RAILS_MASTER_KEY bin/rails test test engines/*/test --seed 15102
env -u RAILS_MASTER_KEY bin/rails test test engines/*/test --seed 15103
```

Expected baseline from 2026-08-31: 550 runs, 1623 assertions, 3 failures, 9 errors on one observed seed. Compare failing test names across all three runs and report the stable intersection plus any flaky names. Do not change those tests in this package.

- [ ] **Step 3: Run static/security checks relevant to the changed surface**

Run:

```bash
RUBOCOP_CACHE_ROOT=tmp/rubocop bin/rubocop \
  engines/learning_routes_engine/app/controllers/learning_routes_engine/block_attempts_controller.rb \
  test/controllers/learning_routes_engine/block_attempts_test.rb \
  test/controllers/learning_routes_engine/block_variant_rendering_test.rb \
  test/system/block_attempt_semantics_test.rb
bin/importmap audit
```

Expected: no RuboCop offenses and no importmap vulnerabilities.

- [ ] **Step 4: Update the handoff with an explicit before/after table**

Add this table with measured evidence filled from the implementation:

```markdown
| Block | Before WP-15B | After WP-15B |
|---|---|---|
| drag_drop | every wrong placement incremented; three drops released | partial drops recorded with attempts=0; a full attempted board increments once |
| fill_blank | only an entirely correct board submitted | a complete correct or wrong board submits once |
| scenario | one option submitted and incremented | one option is explicitly complete and increments once |
| lesson_check | one option submitted and incremented | one option is explicitly complete and increments once |
```

Document the exact `submission_complete` field, every place it is set, focused/main/full-suite counts, browser evidence, and any manual verification still pending. Correct WP-15's earlier claim that a wrong placement itself should increment attempts.

- [ ] **Step 5: Track the two source prompts and commit the final handoff**

```bash
git add PROMPT_09_MATCH_VARIANTS_LAYOUT.md \
        PROMPT_09B_WHAT_COUNTS_AS_AN_ATTEMPT.md \
        WP15_HANDOFF.md FINDINGS_WP15.md
git commit -m "docs(wp15): define and verify completed attempts"
```

- [ ] **Step 6: Final ancestry and cleanliness check**

Run:

```bash
git log --oneline main..HEAD
git status --short
git diff --check main...HEAD
```

Expected: WP-15 and WP-15B commits are visible, the working tree is clean, and `git diff --check` prints nothing. Do not merge, push, or deploy; hand the branch to the owner for review.
