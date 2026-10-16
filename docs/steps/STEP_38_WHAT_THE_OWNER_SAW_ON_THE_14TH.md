# STEP 38 — what the owner saw on 14 October: the wizard, the palette, the map's leash, a password

**Mandate from the owner (14 October, after the deploy of `b2c2b771`+):** AI generation is parked for
now (the OpenAI key is dead and will be rotated later); fix what he saw with his own eyes, in this
order. **Branch per section**, from `main`. Bugs before features; every fix with the test that
closes its class, seen red first. Stop for the reviewer at each PR.

## 1. The wizard built the wrong route (bug, first)
He chose "Desarrollo web" in the wizard, changed his mind to "Música", finished — and got a
**"Ruta de Desarrollo Web"**. His profile then showed **two** identical "Ruta de Desarrollo Web"
cards (0 %, 8 stages, "35.2 % precisión" with 0 lessons).
- Read `route_wizard_controller.js` and `route_wizard_controller.rb`: find where the topic chosen
  first survives a later change (a hidden field written once, a Stimulus value not updated, or the
  server taking the first `topic` param). Red test first: a system test that picks one topic, picks
  another, continues to the end, and asserts the created route's `topic` is the **last** choice.
- The duplicate: find out whether two routes were created (two submits, a retry, Turbo double
  submission, or the job creating one per attempt) or one route rendered twice (the profile's
  query joining through something that doubles rows). Red test for whichever it is: "one wizard
  submission creates exactly one route" or "the profile lists each route once".
- "35.2 % precisión" with zero lessons: find what the number is (a default, a seed, a division
  by a nil guarded wrong) and make it show "—" until there is an assessment. Test.
- Say in the handoff what the two web-dev routes were (ids, created_at) so the owner can delete
  the extra one from the UI, or add that deletion to this PR if the UI has no way.

## 2. The journey header repeats itself (bug)
On `/learning/routes/:id/journey` the subtitle reads "Camino personalizado · 3 etapas · 3 temas ·
Camino personalizado · 8 etapas · nivel beginner · Arrastra para explorar": two descriptions glued
together, with numbers that disagree (3 stages vs 8). One sentence, one source of truth (the
module/step counts the map itself draws). Red test on the rendered header.

## 3. Dark-mode palette pass (bugs; the owner's words: "colores y paletas que no están bien")
Evidence from his screenshots: on the profile the two identical route cards render in two
different accents (teal, then gold) for no reason a user can read; the journey map's ring,
spine and labels mix tones. Do a full pass in both themes over: landing, profile/routes list,
journey, lesson, exam, settings, admin. Method, not taste: every color on those pages comes from
the token set in `application.css` (`--color-*`), no literal hex in views or controllers'
inline styles (there are inline `style="…"` attributes with hex in the navbars and community
views — sweep them), semantic colors (ok/warn/risk) separate from the level accents (NV1/NV2/NV3),
and one accent per route card chosen by a rule the user can see (the route's level, or none).
Deliverables: a sweep test that fails on a literal hex color in any `.erb` outside
`app/assets`; screenshots of each page in light and dark at 1440 and 390 in `tmp/step38/`; and a
one-page `docs/design/palette.md` naming each token and where it is used. Ask the owner, with the
screenshots side by side, before changing any color he did not mention.

## 4. The map on a leash (product ruling for WP-37b checkpoint 2)
"The map has too much freedom; that causes confusion." Ruling, to fold into `wp37b-cp2`:
- The camera is **bounded**: the content box plus a margin is the world; a drag can never push
  the map off-screen; zoom between fit-to-width and 2× fit, nothing beyond; no inertia.
- The page opens **fitted** with the current step centred; "Encajar" returns to that; the
  scroll wheel does not zoom (it scrolls the page) unless the pointer is on the map and Ctrl/⌘ is
  held — the system test already covers the camera rules, extend it: "a drag of 10,000 px leaves
  the map within bounds", "wheel without a modifier does not change the camera".
- Drop "Arrastra para explorar" from the header; the affordance is the map itself.
- The owner still sees the old drawing because checkpoint 1 shipped only the pure modules; the
  page is checkpoint 2, which is this branch. Say so in the PR so he knows what to expect.

## 5. Change password from the dashboard (small feature)
Settings page: a "Contraseña" block with current password, new, confirmation — and for an account
that signs in with Google and has no password of its own (random since sign-up), a "Crear
contraseña" variant that asks only for the new one (the account is already verified by Google).
`has_secure_password` does the checks. Red tests: wrong current password refused; Google account
sets a password and can then sign in with it; sessions elsewhere are not touched. Both locales.
No email required.

## 6. The automatic deploy stays off (ruling)
`.github/workflows/deploy.yml`: trigger `workflow_dispatch` only (no `workflow_run`), so merges stop
producing red runs; keep the job intact for the day the owner wants it. One-line change; CI must
still run on push and PR.

## 7. A demo lesson with a motion scene, without AI (the owner runs it today)
Production generation is down, and the owner wants to see a motion scene in the dark theme. The
reviewer gives him a one-off `rails runner` that appends a step "Demo: escena animada" with the
`transform` example scene to his preview module. Make it a proper, tested task here:
`bin/rails demo:motion_step EMAIL=…` (idempotent: one demo step per route, titled so it is
recognisable, deletable with `demo:motion_step:remove`), guarded so it never runs on a route with
paid modules the user has not bought. Tests red first. It ships in the next deploy; until then the
runner is the way.

## Handoff
`docs/handoffs/STEP38_HANDOFF.md`: the wizard's root cause, what the two routes were, the palette
sweep's before/after counts, the camera bounds' measured values, suite numbers. PRs: §1 · §2+§3 ·
§4 (inside `wp37b-cp2`) · §5 · §6 · §7.
