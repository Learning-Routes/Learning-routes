# WP-35 — What the student sees is not what the server made

Branch: `wp35-what-the-student-sees`, off `main` after `wp32-gate-side-door` is merged.

On 7 September the owner walked the live site as the test student and sent seven screenshots.
Every one of them is a defect that was already in the code, and this brief traces each to the
lines that decide it. They share a shape this project keeps meeting: the server does its job
and the page does not show it — the tutor's reply is saved and never delivered, the AI tool's
error is rendered as markup, an exercise's blocks are parsed, counted by the gate, and never
drawn. The seventh screenshot (a fill-in-the-blank with a mermaid fence inside it) is the
persisted-cache problem WP-33 owns; it is not in this package.

House rules: bugs before features; every fix ships with the test that prevents its whole class,
shown red first; every claim in your handoff is something you ran. English throughout. Use the
app's CSS tokens (`var(--color-*)`) in anything you touch — no new hex literals — and every
string a student can read goes through I18n in both locales.

Two things the owner will have run before you start, and will paste into the branch's issue:
`kamal app logs --since 24h | grep -E "TutorReplyJob|Agent interaction failed"` (the real
exception messages behind §1 and §2 — the code below only logs `e.message`, so add `e.class`
while you are there), and `\l` from `kamal pg-shell` (whether `learning_routes_production_cable`
exists — if it does not, no Turbo broadcast has ever reached a browser in production, and §1
has a second half that is deploy configuration, not code).

---

## §1 — The tutor's reply is saved and never delivered

`tutor_reply_job.rb:70-75` broadcasts the reply with
`Turbo::StreamsChannel.broadcast_append_to("tutor_chat_step_#{step.id}", target: "tutor-messages-#{step.id}", …)`.

Nothing subscribes to that stream. `grep -rn turbo_stream_from app engines` finds
`learning_route_*`, `step_content_*`, `route_request_*`, `notifications_*`, `comments_*` — and
no `tutor_chat_step_*`. `_chat_panel.html.erb` has no `turbo_stream_from`. What the panel does
instead is `tutor_chat_controller.js:126-132`:

```js
const source = new EventSource("/turbo-stream?stream=" + encodeURIComponent(streamName))
```

`/turbo-stream` is not a route (`config/routes.rb`), so this is a 404 every few seconds per open
lesson (WP-23 §2) and delivers nothing. The student types "hola", `send()` renders their own
bubble from the controller's turbo_stream response, shows a skeleton, and the answer — which the
job wrote to `tutor_messages` — never arrives. The panel also renders only the greeting on
load (`_chat_panel.html.erb:52-58`): the transcript `index` action exists (`tutor_chats_controller.rb:12-15`)
and nothing calls it, so a reload loses the conversation from view.

Three more in the same file. `send()` checks `response.ok` and has no `else` (`:75-78`): a 403
from `authorize_module_generation!` (refunded route) or a 422 leaves the skeleton pulsing
forever. `tutor_reply_job.rb:76-77` rescues everything after the paid call and logs
`e.message`; when `Orchestrate` raises (`SpendGuard::LimitExceeded` included) no reply row is
written and nothing is broadcast, so the student waits on a skeleton that will never resolve.
And `showSkeleton()` builds its markup with hardcoded colours (`#887F72`, `rgba(44, 38, 30…)`)
while the panel uses `#2C261E`, `#FEFDFB`, `#E8E4DC` inline — none of them tokens.

### What to do

- `turbo_stream_from "tutor_chat_step_#{step.id}"` inside the panel (it must be inside the
  panel's DOM so it lives and dies with it), and delete `subscribeToChannel` and the
  `EventSource`. Render the transcript on load through the existing `messages` partial.
- The job must always end in a message on the page: on any failure — including a refused
  budget — create an assistant `TutorMessage` whose content is a localized "I could not answer
  right now" and broadcast it, so the skeleton resolves. Keep the `rescue`, but it must not be
  the end of the story. Log `e.class` with the message.
- `send()`: any non-2xx removes the skeleton and shows a localized line in the thread
  (403 → the generation-gate message the server sends; 429 → rate limited; else → generic),
  and re-enables the input. Read `message` from a JSON body when the server sends one — make
  the controller's refusals send one, like `answers_controller#refuse` does.
- Tokens for every colour in the panel and the skeleton.

Owner check, not yours: if the cable database is missing in production, the fix above is
necessary but not sufficient; `db:prepare` on boot should create it (`database.yml` `cable:`),
and the handoff must say what to look for in the logs if it did not.

## §2 — The AI tools show their error as markup, and hide the failure behind a 200

Screenshot: under HERRAMIENTAS IA the student reads, literally,
`<p style='color:var(--color-error); padding:0.75rem;'>La generación de IA falló. Inténtalo de nuevo.</p>`.

The four legacy buttons (`_ai_buttons.html.erb:6-31`) call `ai_interaction#request`, which
fetches with `Accept: text/vnd.turbo-stream.html` and, `if (response.ok)`, hands the body to
`Turbo.renderStreamMessage` (`ai_interaction_controller.js:17-47`). On failure the controller
answers (`lessons_controller.rb:82-96`):

```ruby
format.turbo_stream do
  render turbo_stream: turbo_stream.update(
    "ai_supplementary_#{@step.id}",
    html: "<p style='color:var(--color-error); padding:0.75rem;'>#{ERB::Util.html_escape(error_msg)}</p>"
  )
end
```

Two defects in five lines. `turbo_stream.update(target, html: string)` renders through
`ActionView::Template::HTML`, which escapes a plain `String` — so the `<p>` arrives as
`&lt;p …&gt;` and Turbo prints it as text. And this branch has no `status:`, so the failure is
a **200**; the JSON branch above it says 500, the turbo_stream branch says nothing went wrong.
The rate-limit branch at `:71-80` has the same shape. `request()` has no `else` for a non-ok
response, so if you fix the status alone the student sees nothing at all.

Then the failure itself. `LessonAssistantAgent#interact` (`lesson_assistant_agent.rb:58`) calls
`RubyLLM.chat(model: "gpt-4.1-mini")` directly; the controller rescues `=> e` and logs only
`e.message`. The owner's log line tells you what actually failed in production; reproduce it in
a test and fix the cause if it is in the code (a missing tool argument, a schema mismatch, a
nil `Thread.current[:lesson_agent_user]`), or name it precisely in the handoff if it is
configuration. Do not add `SpendGuard` here — that is WP-34 — but do not make it harder either.

### What to do

- One partial, `content_engine/lessons/_agent_error.html.erb`, rendered in both failure
  branches with an I18n message and tokens; no HTML-in-a-string anywhere in the controller.
- Failure responses carry the right status (429, 502 for an upstream failure, 422 for a
  refusal) in **every** format, and `request()` renders the stream on any response that has a
  turbo-stream body, ok or not — then re-enables the buttons.
- `_renderError`'s English literals ("Something went wrong…", "Too many requests…") and the
  "AI Assistant" label go to locale keys passed through data attributes, like `_lesson.html.erb`
  already does with `lesson_i18n`.

## §3 — Every exercise step is a JavaScript editor, and its real blocks are never drawn

Screenshot: an English-for-beginners exercise renders a header reading JAVASCRIPT, an empty
editor, "Enviar respuesta" and "Pista".

`_step_content_frame.html.erb:20-24` routes `content_type: exercise` to `_exercise.html.erb`,
which renders `@rendered_html` — the whole exercise body as flat markdown — and then a
`code-editor` whose language is `@step.metadata&.dig('language') || 'javascript'`
(`_exercise.html.erb:25-33`), Ace from jsdelivr with a grey `<textarea>` fallback. Nothing in
the route generator writes `metadata.language`; every exercise, in every subject, is a
JavaScript editor.

Meanwhile the exercise's content is generated by the **same** `lesson_content` prompt as a
lesson (`content_pipeline_job.rb:106-136`), with the same `## Match`, `## Complete`,
`## Scenario` blocks; `stage_section_parsing!` (`:167-180`) parses and persists them for every
step type; and `RouteStep#outstanding_blocks_for` (`route_step.rb:120-145`) counts their gating
blocks. `steps_controller.rb#load_step_content` (`:329-333`) never resolves `@sections` for an
exercise, and `_exercise.html.erb` never renders them. So the student sees `## Match: …` as a
heading followed by raw `term ==> definition` lines, `BLANK--word--BLANK` as text, and a code
editor — and `steps#complete` refuses with `blocks_required` for blocks the page does not
contain. `exercises_controller#submit_answer` grades the editor's contents with a paid
`quick_grading` call and completes nothing (`exercises/submit_answer.turbo_stream.erb`). In the
owner's route that is three original exercise steps and twelve reinforcement "Guided Practice"
steps (`adaptive_difficulty.rb:277`), all unfinishable without the WP-32 side door.

### What to do

An exercise step **is** a lesson whose blocks are practice. Render it through the same path:
resolve `@sections` with `SectionResolver` in the exercise branch and render the exercise
through the `_lesson` machinery (the `interactive-lesson` controller, the sections, the gate
footer, the check modal) — either by making `_exercise.html.erb` a thin wrapper that reuses
`_lesson`'s section loop, or by routing exercises to `_lesson` with an exercise badge. The Ace
editor, `code_editor_controller.js` and the `/content/exercises/:id/submit_answer` path retire:
a coding exercise is a `## Playground` block, which the block vocabulary already has
(`lesson_content.yml`, `_code_playground.html.erb`), grades itself against expected output,
and gates like every other block. Keep `get_hint` only if a block calls it; otherwise remove
the route and the controller action, and the JS that fetched them. Say in the commit which
you did and why.

Do not change what the generator produces. The contract was already right — the exercise view
was the thing that ignored it.

## §4 — The journey view collapses above seven steps

Screenshot: forty-three overlapping circles in one ring around "Fundamentos", labels stacked
into an unreadable knot.

`route_journey_controller.js:48-58` places every topic of a stage on **one arc**:

```js
const arcSpan = Math.PI * 0.9
const angle = startAngle + (i / (count - 1)) * arcSpan
const dist = 185 + (…) * 30
```

with a satellite radius of 40–48 px (`:271`). The arc is ~565 px long; a satellite is ~90 px
wide; the layout has room for about six or seven and no rule for what happens after that.
`routes_controller.rb#build_journey_stages` (`:72-110`) makes one stage per **level**
(`nv1/nv2/nv3`), not per module — so a route whose modules all sit at `nv1` is one ring —
and `journey` (`:20-22`) shows only `preview` modules. The reinforcement flood (WP-29, cleanup
pending) makes this 43 today, but the layout fails at 8 on a perfectly healthy route.

### What to do

- Stages are **modules** (`route_modules`, WP-17) — the product's real structure, the thing the
  student buys, and what the list view already groups by. Level is a tag on the stage, not the
  grouping.
- The layout gets a capacity rule and a fallback: up to N satellites on the ring (compute N from
  the measured ring length and the satellite diameter — never a magic seven); beyond N, either a
  second ring or a vertical spine below the ring, but **never** two satellites whose boxes
  intersect. Names elide to fit with the full title in `aria-label` and on hover/focus.
- Reinforcement steps inserted by `AdaptiveDifficulty` cluster visually with the step that
  triggered them (they carry `triggering_module_id` and a position right after it) rather
  than reading as forty independent topics.
- Keyboard: every satellite is focusable in order and the rail dots announce the stage.
- Respect `prefers-reduced-motion` for the scroll-driven transitions.

Extract the geometry (`getSatPositions` and the new capacity/spine rules) into a pure module
so it can be tested without a browser.

## §5 — The landing shows a signed-in student circles with nothing in them

Screenshot: dark canvas, "Vocabulario de … / LEC / 01 / Completado", three empty circles
attached to it.

`landing_controller.rb#build_route_nodes` (`:41-54`) takes the student's first six steps by
position and gives each `sats: satellite_pattern(i)` — geometry only. `default_translated_nodes`
(`:58-76`) gives the marketing version `topic` and `desc` per satellite; the real version has
neither, so `path_viz_controller.js:250` renders a label of `undefined`-ness: nothing. The
first six steps by position are, today, two lessons and four reinforcement steps.
`content_type_tag` (`:94-101`) is hardcoded Spanish (`LEC`, `EJR`, `EXM`, `REP`).

### What to do

For a signed-in student the nodes are the route's **modules** (name, lock/purchase state,
progress), and the satellites are that module's steps with their titles — or there are no
satellites. Nothing decorative that pretends to be data. Tags through I18n. If the student has a
route, consider whether the landing should redirect to it at all; if you keep the page, it must
not lie.

## §6 — The words on the screen

Only what the sections above touch, plus the two the screenshots show: `_check.html.erb:45,64,90`
("DESAFÍO RÁPIDO", "+5 XP BONUS si respondes en <10s", "Explicación:") and
`lesson_quiz_controller.js:83,184`, which are Spanish for every English student. Locale keys,
both files, and the JS strings arrive through data attributes. The parser's persisted default
titles (`"Match"`, `"Concepto"`, …) are WP-33's, because fixing them means re-parsing.

---

## The tests that prevent the classes

Three classes, three sweeps.

**"A gate counts a block the page does not show."**
`test/system/every_gating_block_is_rendered_test.rb`: for each `content_type` that persists
`parsed_sections` (`lesson`, `exercise`), build a step whose content has one of every gating
block type, open the page, and assert that for every `section_index` in
`outstanding_blocks_for` there is a `[data-section-index="i"]` element carrying that block's
`data-controller`. The exercise case must fail today. Then complete the step through the page.

**"The client shows what the server said."**
System tests that intercept the network: tutor `send` with 403/429/500 → a visible localized
line in the thread and no skeleton left; AI tool with 429/502 → a visible message, no `&lt;p`
anywhere in the DOM text, buttons re-enabled. A controller test that every failure format of
`LessonsController` carries a non-2xx status and, for turbo_stream, a body whose `<template>`
contains an element, not escaped markup.

**"A broadcast without a subscriber."**
A view test that the lesson page contains a `turbo-cable-stream-source` for
`tutor_chat_step_#{step.id}`; a job test with `assert_turbo_stream_broadcasts` that a reply —
and a failure — both append to that stream. And a sweep: for every
`Turbo::StreamsChannel.broadcast_*` call in the codebase, some view calls `turbo_stream_from`
with the same stream name pattern. This one is `grep`-shaped and belongs in
`test/services/content_engine/lesson_block_contract_test.rb`'s family.

Also: the geometry module — for 1, 7, 8, 20 and 43 topics no two satellite boxes intersect and
every satellite lies inside the stage box; a system test on a 43-step route asserting the same
from measured `getBoundingClientRect`s; a landing test that a signed-in student's nodes are
modules and no satellite lacks a label.

## Order

1. §3 — it is the one that traps students, and the sweep is red today.
2. §1, §2 — with the owner's log lines in hand.
3. §4, §5.
4. §6.

## Verification

Before and after, three runs each: main, browser, combined with engines — before column from
your own run. RuboCop clean. In a browser against dev: an exercise step with a Match and a
Complete block can be finished; the tutor answers and the answer survives a reload; an AI tool
failure reads as a sentence; a 43-step route's journey has no overlapping circles and every
label is readable or elided with a title; the landing for a signed-in student shows modules.
Screenshots of each in the handoff.

Write `WP35_HANDOFF.md`: what changed and why, the red-then-green output of every new test, the
retired code (Ace, `submit_answer`, `EventSource`), what the owner must check in production
(the cable database, the log lines), and what you did not do.

## Not in this package

Re-parsing persisted sections and the parser's default titles (WP-33). `SpendGuard` on the
lesson assistant and the voice evaluator (WP-34). Grading scenarios. The tutor's prompt
quality. A full design-token sweep of the remaining views — note in the handoff how many hex
literals you saw and where, for the roadmap.
