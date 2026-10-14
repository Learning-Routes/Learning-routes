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

Not changed: the profile header's overall "Precisión" still reads "0%" when there is no
assessment, and the generation job still titles a route from the topic tile rather than the
typed detail ("teoria musica").

### Suites (worktree `step38-wizard-route`)
- app: 1889 runs, 509994 assertions, 0 failures, 0 errors, 0 skips
- system: 107 runs, 2216 assertions, 0 failures, 0 errors, 0 skips
- RuboCop: 645 files, no offenses
- engine suites: not run locally (no engine code changed); CI runs them.
