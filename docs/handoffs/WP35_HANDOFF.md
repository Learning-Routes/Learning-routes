# WP-35 — What the student sees is not what the server made

**Written:** 2026-09-08 · **Branch:** `wp35-what-the-student-sees`, base `main` @ `85d6f00`
(WP-32 merged). **Tree clean. Not deployed. Nothing run against production.**

**Status: all of §1–§7 are done.** §7 arrived as an addendum after §1–§2 were reviewed. The
closing section says what I deliberately did not do.

---

## SECURITY — stored XSS in the tutor transcript

Not asked for by the brief, found while tokenising the panel for §1, and recorded here under its
own heading because it belongs on the security-debt list rather than inside a paragraph about
colours.

`engines/learning_routes_engine/app/views/learning_routes_engine/tutor_chats/_message.html.erb`
rendered **every** message with `html_safe`:

```erb
<%= message.content.html_safe %>
```

`message.content` is `params[:message]` for a `role: "user"` row — the student's own text, saved
to `tutor_messages` by `TutorChatsController#create` and rendered straight back out of the
database on every page load. That is stored XSS on a field the student controls.

**Severity, stated honestly.** The transcript is scoped to `where(user: current_user, step:)`, so
a student can only serve the payload to themselves; there is no cross-user path today, and the
IDOR gate (`authorize_module_access!`) is intact. It is self-XSS, which is the low end — but it
is script execution from persisted, user-controlled data inside an authenticated session, and the
next feature that shares or moderates a transcript makes it cross-user without anybody
remembering this line.

**Fixed:** the student's words are escaped; the assistant's markdown still renders, through
`MarkdownRenderer`, which sanitizes (it already strips `<script>`, `on*=` and `javascript:` —
audit §4.7).

**The payload and the test.** `test/integration/learning_routes_engine/tutor_chat_panel_test.rb`:

```ruby
test "a student's own message is escaped, not rendered as markup" do
  TutorMessage.create!(user: @user, step: @step, role: "user",
                       content: "<img src=x onerror=alert(1)>")
  get learning_routes_engine.route_step_path(@route, @step)

  assert_no_match(/<img src=x onerror/, response.body,
    "the student's own text was rendered as HTML: stored XSS on a field they control")
  assert_match "&lt;img src=x onerror=alert(1)&gt;", response.body
end

test "an assistant reply keeps its markdown but loses its script tags" do
  # content: "Se dice **olá**.<script>alert(1)</script>"
  assert_match "<strong>olá</strong>", response.body
  assert_no_match(/<script>alert\(1\)<\/script>/, response.body)
end
```

Shown load-bearing by restoring `html_safe`: `<img src=x onerror=alert(1)>` comes back through
verbatim, and the markdown assertion fails too.

```
2 failures
  the student's own text was rendered as HTML: stored XSS on a field they control
  Expected /<strong>olá<\/strong>/ to match …
```

**For the owner's list:** one instance fixed. `MarkdownRenderer`'s permissive allow-list
(`data-controller`, `data-action`, `id`, `style`, `<button>`, `<input>`) is audit §4.7 and is
still open — it is what makes "render the assistant's markdown" a smaller promise than it sounds.
I did not widen this package to cover it. I also did not sweep the rest of the codebase for
`html_safe`; that is a security review of its own and is listed under **What I did not do**.

---

## §3 — every exercise was a JavaScript editor

`_exercise.html.erb` rendered `@rendered_html` flat and then an Ace editor whose language was
`metadata['language'] || 'javascript'`. Nothing writes `metadata['language']`, so every exercise
in every subject was a JavaScript editor. Meanwhile the exercise's body comes from the **same**
`lesson_content` prompt as a lesson, `stage_section_parsing!` persists its blocks, and
`outstanding_blocks_for` counts them — so `steps#complete` refused with `blocks_required` naming
section indices that were not on the page.

Exercises now resolve `@sections` through `SectionResolver` and render through `_lesson`, with an
exercise badge on the title. The generator's contract was already right.

**Retired**, and what happened to each:

| | |
|---|---|
| `_exercise.html.erb` | deleted |
| `exercises#submit_answer` + view | deleted — practice is graded per block by `BlockGrader`, server-side and gated, not by a paid `quick_grading` call over an editor that completed nothing. Removes the `authorize_route_step_access!` spend-under-the-read-gate instance at audit §3.1. |
| `exercises#get_hint` + view | deleted — no block calls it |
| `exercises#run_code` | **kept** — no caller, but it costs nothing and `module_lock_authorization_test` asserts a locked module cannot reach it |
| `code_editor_controller.js` | **kept**, minus `submit()`/`requestHint()`. The EXAM's `code` question type mounts it (`steps/_question_code.html.erb`); deleting it would have broken exam code answers. Caught by grep before it shipped. |
| `learning_engine.exercise.{reset,submit,hint,previous_submissions,score}` | removed from both locales |

### Red

```
exercise: every block the gate counts is on the page
  --- expected: []
  +++ actual:   ["check@0","drag_drop@1","fill_blank@2","flashcards@3","scenario@4"]
exercise: a section element exists for every persisted section
  expected to find css ".lesson-section" 5 times but there were no matches

5 runs, 20 assertions, 2 failures   (the lesson cases passed throughout)
```

Green after: **5 runs, 20 assertions, 0F 0E.**

## §1 — the tutor's reply was delivered to nobody

Your production log settled what was broken: the job performed in 1606 ms with no error and
`SolidCable::TrimJob` ran in the same process, so the cable database exists and broadcasts work.
The panel had never called `turbo_stream_from`; what it had was
`new EventSource("/turbo-stream?stream=…")` against a route this app does not have — a 404 every
few seconds per open lesson, delivering nothing.

- The panel subscribes, **inside** `#tutor-chat-container` so the source dies with the element.
- The transcript renders on load. `tutor_chats#index` could always serve it and nothing called it.
- The job always ends in a message. Both paths go through one `deliver!`; `e.class` is logged.
- `send()` reads refusals: the server's own `message` when it sends one, else 403/429/generic.

### The strict-loading warnings were load-bearing, and deeper than the log showed

Eager-loading `#step` and `#user` was not enough. `step.learning_route`, `route.learning_profile`
and `step.ai_contents` are the same defect one hop further, and in the test environment — where
the violation *raises* — the job's own bare `rescue` swallowed it. **The first version of this fix
looked green and was silently delivering the failure notice on the happy path.** The test caught
it only because it asserts the reply's CONTENT, not merely that something was broadcast.

### Two corrections to my own first attempt

- I gave `authorize_module_access!` a readable JSON body, which turned
  `module_lock_authorization_test` red. That empty body is a deliberate IDOR property: a forged
  step id must learn nothing. The readable refusal belongs on the **generation** gate only (you
  own the step, the route was refunded).
- I put `turbo_stream_from` **above** the container, making the cable source a sibling of the
  panel while the comment beside it claimed otherwise. My own browser probe caught it; the test
  now asserts containment with Nokogiri rather than a regex over the template.

### Red

```
these streams are broadcast to and nothing subscribes
  Expected: []   Actual: ["tutor_chat_step"]
the panel must subscribe to the stream TutorReplyJob broadcasts to
`/turbo-stream` is not a route in this app          (the EventSource)
  4 runs, 6 assertions, 3 failures

TutorReplyJobTest: 4 runs, 5 assertions, 2 failures 1 error
  — no broadcast on the happy path, no message at all on either failure path
```

### A second unsubscribed stream, which the brief did not name

`AiRequestJob` broadcasts `ai_interaction_<id>` and no page renders those partials or subscribes.
It is an unfinished feature rather than a delivery defect — there is no student-visible symptom
and nothing to attach a subscriber to — so it is recorded in `KNOWN_UNSUBSCRIBED` with the reason
and a test that fails if it ever gains a subscriber and stays on the list. **Roadmap, not this
package.**

## §2 — the buttons asked for a format the action did not declare

Your log named it: `ActionController::UnknownFormat`, raised **after** the paid call succeeded.
The four buttons send `Accept: text/vnd.turbo-stream.html`; `agent_interact`'s success
`respond_to` declared only json and html; the `rescue => e` caught the UnknownFormat as a model
failure and answered from its own turbo_stream branch — which built markup in a String, so Rails
escaped it — at HTTP 200.

Four defects, all closed: the missing format (restored as
`format.turbo_stream if turbo_stream_template?`, so `interact` stays JSON-only without a
hardcoded list), markup-in-a-String (one `_agent_error` partial, tokens and I18n), failure-as-
success (429 / 502 in every format), and the client's missing `else` (`request()` renders any
response that carries a stream).

### Two things the sweeps taught me while I wrote them

- Matching `format.turbo_stream` in **source** also matches the comment that says
  "No `format.turbo_stream`: …". The first version of the sweep read the very comment explaining
  the defect and called it a declaration.
- A `respond_to` in a **private** helper renders the template of whatever ACTION called it.
  `RespondToFormatsHaveTemplatesTest` attributed it to the nearest preceding `def` and so judged
  `agent_interact` by its own name — **which is precisely the reasoning that deleted the line in
  WP-25.** It now resolves private helpers to their public callers and skips guarded
  declarations.

### The guarded line is pinned by name, from both directions

Because this line has already been deleted once, two tests stand over it. Mutation-checked:

```
delete the line         -> "agent_interact must keep its guarded turbo_stream declaration"
                           plus 6 findings in the sibling sweep, naming all four actions
make it unconditional   -> "interact (via agent_interact) declares format.turbo_stream
                            with no template"
```

There is also a test that each of the four `*.turbo_stream.erb` templates still exists — if one
goes, the guard quietly answers false and the button stops receiving a stream with nothing going
red.

### Red

```
content_engine/lessons#{deepen,explain_differently,give_example,simplify}
  is fetched with Accept: text/vnd.turbo-stream.html but declares no format.turbo_stream

AiToolsFormatsTest: 8 runs, 17 assertions, 8 failures — including
  Expected /<turbo-stream action="append"/ to match
    "…<template>&lt;p style=&#39;color:var(…"
```

That last line is the owner's screenshot, reproduced in a test.

---

## §4 — the journey collapsed above about six topics

`getSatPositions` put every topic of a stage on ONE arc of `Math.PI * 0.9` at radius 185. That arc
is ~523px long and a satellite ~90px wide, so it holds about six, and there was no rule for what
happens after. Production has a module with 43 steps: forty-three overlapping circles, labels
stacked into a knot.

The geometry is now `app/javascript/lib/journey_layout.js` — pure, no DOM, no Stimulus — so it can
be asserted at 1, 7, 8, 20 and 43 without a browser. Capacity is **measured** (arc length ÷
satellite diameter, never a magic seven), satellites shrink to a floor before overflowing, and the
remainder goes to a spine below the ring, wrapped to the stage's own width so it stays compact
rather than becoming a 3000px column. The stage element is sized from the box the layout reports,
so "every satellite is inside the stage" holds by construction.

| topics | ring | spine | satellite r | box |
|---|---|---|---|---|
| 1 | 1 | 0 | 40 | 80×80 |
| 7 | 7 | 0 | 30 | 425×216 |
| 8 | 8 | 0 | 25 | 415×202 |
| 20 | 9 | 11 | 22 | 624×327 |
| 43 | 9 | 34 | 22 | 682×443 |

(The 20 and 43 boxes are taller than the first version of this table reported —
see "The spine started on top of the hub" below.)

Shown load-bearing by restoring the single-arc version: **collisions at 7, 8, 20 AND 43** — the old
layout failed at seven, not eight.

### Stages are modules, and what that forced

Decision (a) has a consequence worth stating plainly. A route has exactly one `preview` module
(`RouteModule` validates uniqueness on it) and the rest are `locked`, so filtering the journey to
preview would have made "stages are modules" mean **one stage** — fewer than grouping by level, and
not the point of the change.

So the journey now shows **all** modules, which is also what makes the view's locked-stage branch
reachable for the first time. A locked module contributes its SHAPE and nothing else:
`journey_topic` masks the title and drops the link, so the paywall holds. There is a test that a
locked module's step titles never reach the page. **This is a judgement inside the settled
decision, not a re-litigation of it — flagging it because it changes what the page shows.**

Reinforcement clusters because `AdaptiveDifficulty#insert_reinforcement!` already inserts behind
the triggering step in the same module; ordering by position IS the clustering, and satellites
carry `data-reinforcement` so the view can say so. Every satellite is a tab stop in route order
with the full title in both `aria-label` and `title`, and the layout's order is asserted so that
stays true. `prefers-reduced-motion` was already honoured and still is.

### The spine started on top of the hub

Caught in review of `11c9756`, not by me. The first spine row was
`Math.max(ringBottom, ringRadius * Math.sin(-Math.PI / 2)) + slot`, whose second
term is always `-ringRadius` and therefore never won — so it reduced to
`ringBottom + slot`. The ring spans -171° to -9°, so its LOWEST satellites sit at
y ≈ -29, not at the bottom of the circle, and the first spine row landed at
y ≈ +29: **inside the centre circle** (r 52, pulsing to 62) and across the stage
label.

```
n=10  firstSpineY=29.06  overlapping the hub: #9(0,29)
n=20  firstSpineY=29.06  overlapping the hub: #13(-58,29) #14(0,29) #15(58,29)
n=43  firstSpineY=29.06  overlapping the hub: #14(-29,29) #15(29,29)
```

**Every count above ring capacity did it, and nothing in the suite could see it,
because the hub is not a satellite** — both overlap tests compared satellites to
each other. `DEFAULTS.hubRadius` is now 62 (the pulse radius, not the resting
one), the row starts at `Math.max(ringBottom + slot, hubRadius + gap + r)`, and
the layout REPORTS its hub radius so a test cannot keep a second copy that drifts
from the one the controller draws. The centre label gained a
`journey-center-label` class for the same reason: nothing else in the DOM
identified the thing the spine was drawn on top of.

Red first, at 10 — the smallest count that overflows — as well as 20 and 43:

```
satellites overlap the centre circle and the stage label at 10 topics.  Expected: []
satellites overlap the centre circle and the stage label at 20 topics.
satellites overlap the centre circle and the stage label at 43 topics.
the hub radius must come from the layout, or it will drift...  Expected: 62
  31 runs, 710 assertions, 4 failures

a satellite is drawn on top of the stage label — the spine starts inside the hub.
  6 runs, 55 assertions, 1 failure          (the measured system test at 43)
```

## §5 — the landing drew circles with nothing in them

`build_route_nodes` gave each node `sats: satellite_pattern(i)` — geometry only — while the
marketing version gave each satellite a `topic` and a `desc`. So `path_viz_controller.js:250` read
`undefined` and drew empty rings. The six nodes were the first six steps by position, today two
lessons and four reinforcement steps.

Taking the settled default: the landing stays a visitor page, and a signed-in student is redirected
to their route, or the dashboard when they have none. `build_route_nodes`, `satellite_pattern`,
`status_color`, `status_note` and the hardcoded-Spanish `content_type_tag` retire with it. A test
asserts no satellite on the visitor page lacks a label, so the defect cannot return in the half
that remains.

**Left behind on purpose:** `_hero`, `_cta` and `_path_section` still carry
`if current_user && @active_route` branches. They are now unreachable (no signed-in user renders
this page) and they degrade correctly to the visitor copy. I did not delete them because they span
four view files I could not fully re-verify in the time left; the redirect test proves they are
dead. Listed below.

## §6 — the words on the screen

"DESAFÍO RÁPIDO", "+5 XP BONUS si respondes en <10s" and "Explicación:" were hardcoded Spanish
shown to every English student; two are in the screenshots. Locale keys in both languages, and the
two strings the JS writes at runtime arrive through `data-lesson-quiz-i18n-value`, the way
`_lesson.html.erb` already passes `lesson_i18n`. Tested in BOTH locales, plus a sweep that no
Spanish literal remains in the three controllers this package touched. Red without the fix on all
four.

Scope held to what the screenshots showed plus what §1–§5 touched. **The parser's persisted default
titles stay for WP-33**, because fixing those means re-parsing.

## §7 — Mermaid's own error graphic leaked into the page body

Mermaid 11 renders its error SVG into `document.body` when a diagram will not parse, unless
`initialize()` sets `suppressErrorRendering: true`. This controller already had a fallback, so BOTH
appeared: one in place and one orphaned at the end of the page, below the comments, with nothing to
say which diagram it belonged to. One line in the single `initialize()` call.

The fallback is localized, tokenised and collapsed. It read "Diagram could not be rendered" — an
English literal — and dumped the raw Mermaid source under it. The label now comes through a data
attribute and the source sits in a `<details>`.
`.mermaid-fallback__details:not([open]) > .mermaid-fallback__code { display: none }` is what
actually keeps the closed disclosure from laying its content out — my first version trusted the
browser default and the source was 78px tall on screen.

**The fake validation is deleted, not wired up.** `validate_mermaid` checked only that the first
word of a block was a known diagram type — a block beginning `flowchart` with a malformed body
passed — and wrote `mermaid_invalid` into `parsed_sections`, a flag **nothing has ever read**.
Three tests covered it and all three passed while the owner's page showed two error graphics. A
validation that validates nothing is worse than none, because it reads as a guarantee. Those three
tests are replaced by one that pins the removal as a decision.

**Note for WP-33:** `mermaid_invalid` can come off the enrichment-key list in audit §2.5 — nothing
writes it any more.

Shown load-bearing by flipping `suppressErrorRendering` back to `false`: both assertions fire,
reproducing the screenshot.

### The markdown path had no fallback labels at all

Also caught in review. `_visual.html.erb` is not the only way a diagram reaches a student:
`MarkdownRenderer` mounts the same controller for a fenced ```` ```mermaid ```` block, and passed
NO labels — while its own sanitizer allow-list, which is a security boundary (audit §4.7), would
have stripped them anyway. It listed `data-mermaid-diagram-target` and neither `-value` name.

So a diagram inside a **concept body** — or inside the WP-24 §2 aftermath, which renders through
this same path — failed to an icon with an empty sentence and no disclosure. The renderer now emits
both labels from the same two I18n keys, and the allow-list gains exactly those two names (there is
a test asserting it gains nothing else).

Red first, in both locales and on the allow-list itself:

```
Expected /data-mermaid-diagram-fallback-label-value/ to match
  "<p>Intro.</p>\n<div class=\"mermaid-container\" data-controller=\"mermaid-diagram\">…"
the fallback sentence was empty or the sanitizer stripped it.          (en and es)
Expected ["href", "src", …] to include "data-mermaid-diagram-fallback-label-value"
  5 runs, 11 assertions, 4 failures
```

And the system case, with the broken diagram in a concept body and **no `mermaid` key in
`parsed_sections`** — the shape `_visual.html.erb` never sees:

```
expected to find text "Este diagrama no se ha podido dibujar." in "DIAGRAMA"
```

That is the whole defect in one line: the label rendered, the sentence did not.

**One thing this cost me twice, worth writing down:** the committed
`app/assets/builds/tailwind.css` had drifted from `app/assets/tailwind/application.css` and lost
the `:not([open])` rule, so the collapsed-source assertion failed against a stale build. The file is
untracked, so nothing stale ships — but a system test is the only thing in this repo that notices.

## The lazy-load family — swept, not stumbled on

Three instances turned up in two days (WP-32's `step_quiz`, §1's tutor job, §2's lessons
controller), so I stopped finding them one at a time and scanned every job and controller for a
bare `find`/`find_by` followed by an association call on the same variable.

| site | traverses | disposition |
|---|---|---|
| `step_quizzes_controller#set_route_and_step` | `@step.step_quiz` | **fixed here** |
| `reviews_controller#submit_review` | `@step.learning_route` | WP-34 |
| `likes_controller` (`likeable`) | `learning_route`, `learning_profile`, `user` | WP-34 |
| `shared_routes_controller#show` | `learning_route` | WP-34 |
| `voice_evaluation_job` (`voice_response`) | `route_step`, then `@step.learning_route` | WP-34 |

Every other job already eager-loads. `step_quizzes_controller` is fixed because it is on the path
§3 opened: an exercise now gates on its step quiz, so the student who cannot continue is sent
there to take it. It is the same shape WP-32 fixed one controller over. The other four are listed
rather than fixed — none is on a path this package touches, and each needs its own test.

**Why the suite keeps missing these — corrected, and it is the LOAD PATH.** An earlier draft of
this document said development and production both run `:n_plus_one_only`. That is wrong.
`config/environments/production.rb` sets only `action_on_strict_loading_violation = :log` and no
mode, and Rails defaults `strict_loading_mode` to `:all`
(`activerecord-8.1.3.1/lib/active_record/core.rb:91`). So:

| environment | mode | on violation |
|---|---|---|
| production | `:all` (Rails default, unset) | `:log` |
| test | `:all` (explicit) | `:raise` |
| development | `:n_plus_one_only` (explicit) | `:raise` |

Measured in one process, toggling only the mode and holding the load path constant:

| the step was loaded by | `:all` | `:n_plus_one_only` |
|---|---|---|
| `RouteStep.find(id)` | **RAISES** | allowed |
| `route.route_steps.find(id)` | allowed | **RAISES** |

`:all` marks records loaded directly from the model; a record fetched through an association is
marked only under `:n_plus_one_only`. That single fact explains all five instances:

- **Loaded directly** — the tutor job (`TutorMessage.find`) and the lessons controller
  (`RouteStep.find`). Production runs `:all`, so it **did** log these: they are the owner's
  `[StrictLoading] Class#step was lazily loaded` lines. The suite caught them too, once a test
  reached them.
- **Loaded through an association** — `steps_controller` and `step_quizzes_controller`, both
  `@route.route_steps.find(...)`. `:all` does not mark those records, so **production never even
  logged them** and the suite could not see them. Only development's `:n_plus_one_only` refuses
  them, which is how WP-32 found the first one — by driving the dev server, not by reading.

So the tests in this family pin `:n_plus_one_only`, and that is **development's** mode, not a
"deployed" one. The conclusion the earlier draft drew still stands and is worth its own package:
the suite's `:all` is not a superset of `:n_plus_one_only`, the two are complementary, and this
app runs a different one in each of its three environments — so no single suite run can see every
violation.

---

## Verification

Three runs of each, one suite at a time. The **before** column is my own run on a clean checkout of
`aae14b7`.

| Suite | Before (`aae14b7`) | After |
|---|---|---|
| Main (`bin/rails test`) | 708 runs, 2778 assertions, 0F 0E | **751 runs, 3559 assertions, 0F 0E** |
| Browser (`bin/rails test:system`) | 55 runs, 390 assertions, 0F 0E | **66 runs, 483 assertions, 0F 0E** |
| Combined (`bin/rails test test engines/*/test`) | 1107 runs, 4389 assertions, **3F 1E** | **1161 runs, 5263 assertions, 3F 1E** |
| RuboCop | clean, 578 files | **clean, 584 files** |

All nine runs of each column identical. The combined failures are the four known engine ones, the
same four as every baseline in this repo since WP-24:

```
LearningRoutesEngine::RouteGenerationJobTest#test_generates_route_and_creates_steps
  Expected false to be truthy.
LearningRoutesEngine::RouteGeneratorTest#test_route_has_level-up_exams_and_final_exam
  ActiveRecord::StrictLoadingViolationError: `LearningRoute` is marked for strict_loading.
  The RouteStep association named `:route_steps` cannot be lazily loaded.
LearningRoutesEngine::GapAnalysisJobTest#test_enqueues_reinforcement_job_when_gaps_found
  No enqueued job found with {:job=>LearningRoutesEngine::ReinforcementJob}
LearningRoutesEngine::ReinforcementJobTest#test_generates_reinforcement_routes_for_unresolved_gaps
  Expected false to be truthy.
```

**I did not touch them.** New tests: **54** — 31 geometry (24 plus the 6 hub-collision cases and
the hub-radius assertion), 6 journey system, 5 landing, 4 locale, 5 mermaid system and 5 markdown
renderer, minus the 3 mermaid-validation tests removed with the validation itself.

The `after` column is measured at `0079ea5`, which includes the two review fixes below.

### The before column was wrong twice before it was right

My first attempt reported 1131/1136 combined runs at `aae14b7`, which produces 1107. I had launched
the baseline in the background and then written new test files while it ran — the runner re-globs
`test/` on each invocation, so later runs picked up tests that did not exist at the commit being
measured. **This is the second time in two packages** (WP-32's baseline inflated the same way).

The fix is not subtle: the clean baseline was taken from `git checkout aae14b7` with the working
tree committed and nothing else running. If a before column's run count does not equal what that
commit alone produces, it is contaminated and the only remedy is to re-run it.

### In a browser, against the development server

Seeded a lesson with a two-message transcript, **deleted afterwards** (verified to zero, including
the orphaned `tutor_messages` my first purge script missed).

- The subscription is inside `#tutor-chat-container`; no `EventSource`, no `/turbo-stream` 404s
  in the server log.
- The transcript survived a reload, with the assistant's `**olá**` rendered as `<strong>`.
- Clicking a failing AI tool (no API key in dev) renders *"Esa herramienta no ha podido responder
  ahora mismo. Inténtalo de nuevo en un momento."* — `showsEscapedMarkup: false`,
  `showsRawTagText: false`, button re-enabled. That is the owner's screenshot, fixed.
- For §3: the exercise renders its badge, a real drag-drop board and a fill-blank, no Ace editor
  and no "Enviar respuesta"/"Pista"; both blocks answered through the page by keyboard, the
  footer went from "Responde para continuar" to "Continuar", and `POST complete` returned 200 and
  unlocked the next step.
- **§4 at 43** (the owner's screenshot): 47 satellites across 2 stages — 13 on the ring, 34 in the
  spine — **no overlapping pair** by measured `getBoundingClientRect`, every one a tab stop with
  its full title, 4 marked as reinforcement, and the locked module's step titles nowhere on the
  page (`Bloqueado` in their place).
- **§4 at 7**: 8 topics, all on the ring, evenly spaced and readable. No spine.
- **§5**: signing in and visiting `/` lands on `/learning/routes/<id>` — the route, not a page of
  empty circles. Zero unlabelled satellites on the visitor page.
- **§6**: the check modal reads "DESAFÍO RÁPIDO" / "+5 XP BONUS si respondes en menos de 10s" for a
  Spanish student and "QUICK CHALLENGE" / "+5 XP BONUS if you answer in under 10s" for an English
  one, with no Spanish anywhere in the English page. The English screenshot caught the modal
  mid-fade, so the DOM read is the evidence there, not the image.

**A trap worth knowing about:** the running dev server does **not** reload views under
`engines/*/app/views`. An edited partial kept serving old markup across several fresh,
cache-busted requests and only a server restart showed the fix — which made a correct change look
broken for twenty minutes. A positional check on the raw HTML ("the tag appears after the
container's opening tag") also said "inside" about an element that was a sibling; only parsing
the document with Nokogiri was honest.

---

## What I did not do

- **The dead `@active_route` branches in `_hero`, `_cta` and `_path_section`.** They are
  unreachable now that a signed-in student is redirected, and they degrade correctly to the visitor
  copy. Four view files I could not fully re-verify; the redirect test proves they are dead. Small,
  and worth a follow-up.
- **The four known engine failures**, including the `RouteGeneratorTest` strict-loading one, which
  is the same family this package has been chasing — a TEST walking `route.route_steps` on a
  strict_loading record. It belongs with the four app-side sites listed above.
- **The four remaining lazy-load sites** (`reviews_controller`, `likes_controller`,
  `shared_routes_controller`, `voice_evaluation_job`). None is on a path this package touches and
  each needs its own test. WP-34.
- **`config/environments/test.rb`'s strict_loading mode.** `:all` is not a superset of
  `:n_plus_one_only`; the two are complementary and this app runs a different one in each of its
  three environments, so no single suite run can see every violation. Its own package.
- **The rest of the `html_safe` sweep.** One instance is fixed (see the security heading); a real
  review of that class is its own work, and audit §4.7 (`MarkdownRenderer`'s permissive allow-list:
  `data-controller`, `data-action`, `id`, `style`, `<button>`, `<input>`) is the other half of it.
- **The `ai_interaction_` broadcast still has no subscriber.** Recorded in `KNOWN_UNSUBSCRIBED`
  with a test that fails if it ever gains one and stays on the list. Roadmap.
- **The parser's persisted default titles** ("Match", "Concepto", …) stay for WP-33: fixing them
  means re-parsing.
- **`SpendGuard` on `LessonAssistantAgent`** stays for WP-34, and I did not change what the
  generator produces.
- **A full design-token sweep.** For the roadmap, counted while working: the panel and message
  bubble had 5 hex literals and 4 `rgba()` (all now tokens); `_visual.html.erb`,
  `_code_playground.html.erb`, `_simulation.html.erb` and `steps/_navigation.html.erb` still carry
  inline hex in the tens; `lesson_sections/*` collectively is the largest remaining pocket. The
  journey controller reads its colours from CSS vars already, but `LEVEL_COLORS` in
  `routes_controller.rb` is three hex literals in Ruby.
- **Nothing was run against production**, and nothing was deployed.
- **CI is still red** since WP-17 from `scan_ruby` (brakeman exits 5 on the known `permit!`
  warning) and `scan_js` (6 DOMPurify/Mermaid warnings).
- **I still owe the prompt investigation** from several packages ago.
