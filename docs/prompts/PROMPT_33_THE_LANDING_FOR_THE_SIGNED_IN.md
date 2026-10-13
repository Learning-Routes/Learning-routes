# PROMPT 33 — the landing page for someone who is signed in

**Package:** small, one sitting. **Base:** `main` once PROMPT 32 has it green and deployed.
**Branch:** `landing-signed-in`. **Ships alone**, before WP-37b's merge.

## 0. What the owner hit, and what the code does
On 12 October the owner opened `https://learningroutes.com/` while signed in and was sent to
`/learning/routes/60452d4b-…` — his route. That is WP-35 §5 working as written
(`app/controllers/landing_controller.rb:22`, `destination_for`, tested in
`test/integration/landing_redirects_signed_in_students_test.rb`, deployed 8 September): a
signed-in student with a route is sent to it, because the "personalised" landing drew empty
circles. Two consequences nobody intended:

1. **A signed-in person can never see the landing** — not to show it to someone, not to check
   it. The owner cannot review his own marketing page without signing out.
2. **The navbar logo is a loop**: `app/views/shared/_navbar.html.erb:6` links to
   `main_app.root_path`, which bounces straight back to the route. A click that does nothing.

## 1. The fix (owner's ruling: keep the redirect for students, stop the loop, let the owner in)
- `LandingController#index`: the redirect applies to **students only**. A user whose role is
  `owner` or `teacher` sees the landing as a visitor would (no personalisation, same
  `default_translated_nodes`, no `fresh_when` public cache for them — `stale_check_enabled?`
  already guards that). Red test first: "the owner, signed in, sees the landing"; "a teacher,
  signed in, sees the landing"; the three existing student cases stay green unchanged.
- A visitor who arrives with `?from=nav` is **not** redirected either: that is the escape
  hatch the navbar uses (below). Test: a signed-in student at `/?from=nav` sees the landing;
  the plain `/` still redirects.
- `_navbar.html.erb`: for a signed-in user the logo links to `destination_for`'s target (their
  route, else the dashboard) — expose that through a helper (`signed_in_home_path`) shared by
  the controller and the view, so the rule lives once. A small text link "Inicio" /
  "Home" in the navbar goes to `root_path(from: "nav")`. Tests: the logo's `href` for a
  student with a route, for a student without one, for a visitor; the "Inicio" link's `href`.
- Both locales for the new string.

## 2. Not in this package
A signed-in variant of the landing (hero with "Continuar tu ruta →", real progress) is a
feature, not this fix — roadmap, after WP-40. No change to `destination_for`'s rule.

## 3. Constraints
As always: `env -u RAILS_MASTER_KEY bin/rails test`; red first; no `git add -A`; nothing
outside `landing_controller.rb`, the helper, the navbar partial, the locales and the tests.
Handoff: three lines in the PR description — what changed, the tests, and that the owner
should open `/` signed in and see the landing.
