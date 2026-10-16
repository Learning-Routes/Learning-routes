# STEP 38 handoff

## §1 — the wizard built the wrong route

### Root cause: the first topic survived the change
The topic tiles were checkboxes: clicking "Música" after "Desarrollo web" left both
selected. Production request `6a9f16c9-fa58-4930-85f8-99c8eb8d7d37` (14 Oct 16:40 UTC) was saved
with `topics: ["web_dev", "music"]`, `custom_topic: "teoria musica"`. AI generation is down, so
`WizardRouteGenerationJob` used its template fallback, which titles the route from
`topics.first`: **"Ruta de Desarrollo Web"**.

Fix: the tiles are single-choice (`role="radio"` in a `radiogroup`); picking a tile replaces the
previous one, and picking it again clears it. The subtitle now says "Elige un tema" / "Choose a
topic" (it was hardcoded English; it now reads `wizard.step0.subtext`).
Test: `test/system/wizard_topic_choice_test.rb` walks the whole wizard (web_dev → music → … →
submit), runs the job, and asserts the request's topics are `["music"]` and the route title says
Música. Red before the fix (`web_dev` still `aria-checked="true"`).

### The "duplicate": two routes, two requests, two days apart
Nothing was created twice and nothing renders twice. They are two different routes:

| route id | created_at (UTC) | stored title | request |
|---|---|---|---|
| `d8ee314c-83ab-4c83-b35b-83728e592643` | 2026-10-12 22:21:15 | "Web Development Route" (en, detail "react") | `e3893166-…` |
| `bac5bf7e-7ac2-42eb-a89c-a795e7d5d4ed` | 2026-10-14 16:40:39 | "Ruta de Desarrollo Web" (es, meant to be music) | `6a9f16c9-…` |

In Spanish the profile shows both titles as "Ruta de Desarrollo Web". One wizard submission
created one route, so no test was added for duplicates. The wrong one is **`bac5bf7e…`** (the 14 Oct
route). The owner can delete it from the UI: open the route → delete → enter the code sent by
email. The UI already supports this, so this PR adds no deletion.

### "35.2 % precisión" on a route with zero lessons
`ProfilesController#show` gave every route card `accuracy: @avg_accuracy`, which is the user's
average over **all** assessment results. The 35.2 came from another route's exams. Each card
now averages only its own route's scored attempts (open attempts with a nil score are left out)
and shows "—" until there is one. A real 0 % now shows "0.0%" instead of "—".
Test: `test/integration/profile_route_card_accuracy_test.rb`. It was red before the fix (the
fresh card showed "35.2%").

### Review additions (PR #57)
- **The server enforces one topic.** A wizard page loaded before the deploy still sends
  checkboxes. `RouteRequest` now rejects more than one entry in `topics` with a whole-sentence base
  error, `route_request.errors.one_topic` ("Elige un solo tema: una ruta tiene un único tema." /
  "Choose a single topic: a route has one subject."), which the wizard's error banner shows.
  Model test with `%w[web_dev music]` in both locales (`raise: true`, so a missing key fails). It
  was red before (the record was valid). The controller test that posted two topics now posts one.
- **The header's overall "Precisión" shows "—"** until the user has a scored assessment. An open
  attempt (nil score) no longer counts: `COUNT(score)`, not `COUNT(*)`, so "0%" no longer shows
  for an unfinished exam. `@avg_accuracy` stays numeric (0 when unscored) for the high-accuracy
  badge and the achievements, which compare against it. Integration test, three states: none, open
  attempt only, scored 35.2. It was red against the old header ("0%").

Not changed: the generation job still titles a route from the topic tile rather than the typed
detail ("teoria musica").

### Suites (worktree `step38-wizard-route`)
- app: 1891 runs, 510006 assertions, 0 failures, 0 errors, 0 skips (after the review additions)
- system: 107 runs, 2216 assertions, 0 failures, 0 errors, 0 skips
- RuboCop: 645 files, no offenses
- engine suites: not run locally (no engine code changed); CI runs them.

## §2 — the journey header that repeated itself

**Cause.** `journey.html.erb` built its own sentence ("Camino personalizado · N etapas · M temas")
and then appended the route's `localized_subject_area`. Routes built by the wizard's template
fallback (all of them while AI generation is down) store a full sentence there:
`WizardRouteGenerationJob` writes "Camino personalizado · 8 etapas · nivel beginner" as
`subject_area`. The two sentences were glued together, and their numbers counted different
things: the header's "etapas" were modules, the stored "8 etapas" were steps. The header's "temas"
also counted only readable steps (`@steps`), while the map draws the locked module's masked topics
too.

**Fix.** One sentence: "Camino personalizado · %{stages} · %{topics}". Both counts come from
`@stages`, the JSON the map draws (modules, and every topic in them, locked ones included), with
singular forms (`stage_count` / `topic_count`, es/en). The subject is dropped from the line,
because the route's name is already the map's `<h1>`.
Tests: two new tests in `test/integration/learning_routes_engine/journey_map_data_test.rb`, red before the fix:
- one sentence, counted from the map's stages and topics. Before: "… 2 etapas · 2 temas · Camino
  personalizado · 8 etapas · nivel beginner · Arrastra para explorar".
- singular forms. Before: "1 etapas · 1 temas · Map".

The existing "counts the purchased module's steps" test now reads the header element. It still
passes.

Not changed:
- "Arrastra para explorar" stays on `main`; §4 drops it inside `wp37b-cp2`.
- The fallback still stores that sentence as `subject_area`, and the profile card and dashboard
  still show it ("… nivel beginner", with the level untranslated). That is outside §2; a fix
  would change the job and existing rows.
- The `stages_topics` key was already unused before this change.

Suites: app 1901, engines 385, system 108, all 0 failures; RuboCop clean.
