# WP-35 — What the student sees is not what the server made

**Written:** 2026-09-08 · **Branch:** `wp35-what-the-student-sees`, base `main` @ `85d6f00`
(WP-32 merged). **Tree clean. Not deployed. Nothing run against production.**

**Status: §3, §1 and §2 are done. §4, §5 and §6 are not started.** This document covers what
landed; the closing section says exactly what is left and why.

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

| Suite | Before (`85d6f00`) | After |
|---|---|---|
| Main (`bin/rails test`) | 679 runs, 2698 assertions, 0F 0E | **708 runs, 2778 assertions, 0F 0E** |
| Browser (`bin/rails test:system`) | 50 runs, 370 assertions, 0F 0E | **55 runs, 390 assertions, 0F 0E** |
| RuboCop | clean, 572 files | **clean, 578 files** |

**The combined run with engines has not been re-taken since §1–§3 landed** — it is in the closing
list below, together with the three-runs-each discipline the brief asks for. What is above is a
single run of each.

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

**A trap worth knowing about:** the running dev server does **not** reload views under
`engines/*/app/views`. An edited partial kept serving old markup across several fresh,
cache-busted requests and only a server restart showed the fix — which made a correct change look
broken for twenty minutes. A positional check on the raw HTML ("the tag appears after the
container's opening tag") also said "inside" about an element that was a sibling; only parsing
the document with Nokogiri was honest.

---

## What I did not do

- **§4 (journey geometry), §5 (landing), §6 (the words on the screen) are not started.** So are
  the two remaining sweeps the brief asks for: the geometry module's no-overlap tests, and the
  landing test that a signed-in student's nodes are modules with no unlabelled satellite.
- **The combined-with-engines suite has not been re-run**, and none of the three suites has been
  run three times as the brief requires. The before column above is a single run at `85d6f00`.
- **I did not sweep the codebase for other `html_safe` uses.** One instance is fixed; a real
  review of that class is its own piece of work, and audit §4.7 (`MarkdownRenderer`'s permissive
  allow-list) is the other half of it.
- **I did not touch `config/environments/test.rb`'s strict_loading mode**, and did not fix the
  four remaining lazy-load sites — see the table above.
- **I did not add `SpendGuard` to `LessonAssistantAgent`** (WP-34), and did not change what the
  generator produces.
- **The `ai_interaction_` broadcast has no subscriber** and is recorded rather than fixed.
- **Nothing was run against production**, and nothing was deployed.
- **CI is still red** since WP-17 from `scan_ruby` (brakeman exits 5 on the known `permit!`
  warning) and `scan_js` (6 DOMPurify/Mermaid warnings).
- **I still owe the prompt investigation** from several packages ago.
