# CI-2 handoff: CI back to green

**Branch:** `ci-green` from `main` at `f929de5b`. **Brief:** `PROMPT 32`.

## 0. What CI and production have been

- **CI on `main` has never been green.** `gh run list --workflow CI --branch main --limit 200`
  shows 167 runs, all `failure`. The oldest run in the list is from March. There is no "last
  green commit" to restore.
- **`Deploy to Production` has never deployed.** It has 148 runs, all `skipped`, because it
  only runs when CI succeeds. The last one is from 2026-08-04. Its state today is
  `disabled_manually` (`gh workflow list --all`).
- **So production is deployed by hand from the workstation** (see `0b72e983`, "build the image
  on the workstation"). Which commit it runs is not knowable from here: the owner's
  `bin/kamal app details` settles it, and the answer goes in §4.
- **A green CI does not deploy on its own.** That needs `gh workflow enable "Deploy to
  Production"`. This is the owner's decision, because it changes how production ships (images
  would be built on GitHub's runners again). This branch does not enable it.

## 1. Root cause per job (run #223, `38001910663`, for `f929de5b`)

| Job | Failed at | Root cause |
|---|---|---|
| `test`, `system-test` | `db:test:prepare` | `LoadError: Could not open library 'libvips.so.42'`. `ruby-vips` is in the Gemfile, so `Bundler.require` (`config/application.rb:7`) loads it at boot. The Dockerfile installs `libvips`; the CI jobs installed only `libpq-dev`. |
| `test`, `system-test`, second cause (hidden behind the first) | first page render | `The asset 'tailwind.css' was not found`. `app/assets/builds` is gitignored, and `tailwindcss-rails` builds the file from `test:prepare`. Rails runs that task only from the `test` **command** and only without path arguments (railties `test_command.rb#perform`). CI's `bin/rails db:test:prepare test` goes through rake and never runs it. Reproduced in a fresh worktree: `admin/dashboard_test.rb` raises the same error. |
| `scan_js` | `bin/importmap audit` | Same `libvips.so.42` LoadError: `bin/importmap` boots the app. Behind it, three vulnerable pins (8 advisories). |
| `scan_ruby` | `bin/brakeman` | Exit 5: Rails' `bin/brakeman` passes `--ensure-latest`, and 8.0.4 was behind 8.1.0. **Behind that, a real warning:** exit 3 on both 8.0.4 and 8.1.0 for `permit!` in `BlockAttemptsController#block_payload`. The brief's "brakeman clean" does not hold on `main`. |
| `lint` | (green) | |

### Second round: what the PR's own CI found once the jobs could run

| Job | Run | Root cause | Fix |
|---|---|---|---|
| `test` | `38307645012` | `VoiceEvaluatorMeteringTest`: every test wrote and deleted one fixed `storage/voice_responses/metering.mp3`. Under parallel workers, one teardown deleted the file another test was reading (3 failures: ENOENT, "Audio file not found"). | One file name per test. Red: 10 failing tests over 10 concurrent runs of the class. Green: 0. |
| `test` | `38308553969` | `MotionBuildFreshnessTest`: two tests edited the real `app/motion` (a dotfile, `main.ts`) and compared digests. A parallel worker's edit was another test's input, so the digest did not come back. **A concurrent run also left `main.ts` dirty** with `// touched by a test`, one commit away from shipping. | Each edits a private copy of the build inputs, with `Rails.root` pointed at it in that process only. It also asserts the copy's digest equals the real one, so the copy is complete. Red: 9 of 10 concurrent runs failed. Green: 0, and `app/motion` stays clean. |
| (no CI failure yet) | | `AudioNarrationTest`'s teardown `rm_rf`'d all of `storage/audio`. Under parallel workers that deletes other tests' files, and in a developer's checkout it deletes their real narration audio. | It now deletes only the files the tool returned to it. Red: a bystander file was deleted. Green: it survives. |
| `test` (engines) | `38312402102` | `AudioStorageTest`, `AudioControllerTest`, `SectionAudioControllerTest`: their teardowns checked `directory? && empty?` and then `rmdir`'d the shared `storage/audio-escape` (and its siblings). Another worker removed it between the check and the `rmdir` (ENOENT), or it was refilled in between (ENOTEMPTY). | The teardowns delete only their own files. The empty directories under the gitignored `storage/` stay, and every setup recreates them. Red: 9 failing tests over 10 concurrent runs. Green: 1 over the next 10 runs, then 0 over 12. The one I could not capture is most likely my reproduction's own artefact: it runs the same test in two processes against one test database, which CI never does. |
| `scan_ruby` | `38307645012` | `bundler-audit`'s database updated on 2026-10-10, after the owner's local check. **rubyzip 3.2.2** has a High path traversal, fixed in 3.4.0. **ruby_llm 1.11.0** has three High ReDoS advisories, fixed only in 2.x. | rubyzip → 3.7.0 (released 2026-09-18; only `selenium-webdriver` uses it). ruby_llm: see §2a. |

## 2a. The one exemption: ruby_llm, by the owner's ruling (12 October)

The three advisories (GHSA-5m38-526f-3498, GHSA-57hg-jgw4-wcqw, GHSA-42r3-x6vx-x49x; CVE-2026-67987/67989/67991) are each scoped "on Ruby 3.1.x". The app runs **Ruby 3.3.8** everywhere: `.ruby-version`, the Dockerfile's `ARG RUBY_VERSION`, and CI's setup-ruby, which reads `.ruby-version`. Ruby ≥ 3.2 memoizes regexp matching, which bounds this kind of backtracking. The only listed fix is ruby_llm 2.x, a new major version used by 13 files, including `AiClient`, which every paid AI call goes through.

The owner chose to record the three as not applicable rather than take the major upgrade inside a CI package:
- They are listed in `config/bundler-audit.yml`, each with its reason.
- `test/config/bundler_audit_exemptions_test.rb` holds the exemption to that reason. It fails if:
  - the ignore list holds anything else;
  - the running Ruby, `.ruby-version` or the Dockerfile's Ruby drops below 3.2;
  - ruby_llm is on 2.x while the exemption is still there.
- Red: the placeholder ignore list failed the test. Each guard was mutated and failed.

**Follow-up package:** upgrade ruby_llm to 2.x with its own tests, then delete the exemption and the test.

## 2. What changed

- **`.github/workflows/ci.yml`:**
  - The `test`, `system-test` and `scan_js` jobs install `libvips42t64`, which is the Ubuntu
    24.04 package providing `libvips.so.42` (checked in an `ubuntu:24.04` container). There is
    no plain `libvips` package on 24.04. Those three jobs pin `runs-on: ubuntu-24.04` because
    the package name is release-specific.
  - The `test` and `system-test` jobs build Tailwind before running.
  - The `test` job pins Node 24 (`actions/setup-node@v6`). `motion_cues_test.rb` needs Node
    23.6 or later and skips below that; the runner's default Node would have skipped it
    silently.
- **`config/importmap.rb`:** the three pins move to the latest patch inside their current line.
  None of them changes a major version.
  - `dompurify` 3.4.12 → **3.4.17**
  - `katex` 0.16.21 → **0.18.11** (0.18.2 is the first clean version; 0.19.0 exists and is
    not taken)
  - `mermaid` 11.16.0 → **11.16.1** (the first clean version; 12.x is a major and not this
    package)
- **`app/views/layouts/learning.html.erb`:** the KaTeX stylesheet moves to 0.18.11 with the JS.
  The CSS and its font metrics must match the JS version.
- **`Gemfile.lock`:** brakeman 8.0.4 → 8.1.0 (only that line).
- **`BlockAttemptsController#block_payload`:** `permit!` is replaced by the keys the block
  controllers actually send: `option_index`, `timed_out`, `interacted`, `rated_count`,
  `submission_complete`, `answers: []`, `matches: {}` and `ratings: {}`. A `block` that is not
  an object returns 400 instead of 500.
  - Test: `test/integration/learning_routes_engine/block_payload_params_test.rb`. It was red
    first: the stored payload kept the client's `correct: true`, `score: 100` and `user_id`, and
    a string `block` raised `NoMethodError`.
  - It also checks that every one of the six real payload shapes still arrives intact.
- **`lib/tasks/wp40_funnel_census.rake`** (from the audit, see §3): stage 5 now prints every
  status in `LearningRoute::GENERATION_STATUSES`, including `pending`, which `RouteGenerator`
  creates every route with and the census silently dropped. Stage 4 prints every status in
  `RouteRequest::STATUSES`. Both stages print a total. The enum values now come from the models
  instead of literals, and `google_unverified` counts only `google_oauth2`. Red first: a pending
  route appeared in no bucket.

Verification, run locally in a fresh worktree with CI's exact commands (`tmp/ci2/run.sh`):

| Check | Result |
|---|---|
| App suite | 1137 runs, 0 failures |
| Engine suite | 385 runs, 0 failures |
| System suite | 100 runs, 0 failures |
| `bin/importmap audit` | no vulnerable packages |
| `bin/brakeman` | exit 0, 0 warnings |
| `bin/bundler-audit` | clean with a fresh advisory database (the ruby_llm exemption in §2a) |
| RuboCop on the touched files | clean |

The new pins were also exercised in a browser against `bin/rails server -p 9999`:
- the page's importmap resolves the three new URLs;
- KaTeX renders display math and returns a `katex-error` span on bad input with
  `throwOnError: false`;
- the 0.18.11 stylesheet loads and `KaTeX_Main` loads;
- DOMPurify strips `onerror` and `<script>`;
- Mermaid renders a flowchart and throws on a bad diagram;
- the console shows no CSP refusal.

## 3. Audit of what ships (`7396de2f..f929de5b` plus this branch)

A fresh reviewer read every change that ships. It found no Critical finding. Its findings and
what was done about each:

| Finding | Severity | Done |
|---|---|---|
| Census drops `pending` routes and prints no totals | Important | Fixed, red first (§2) |
| Node not pinned, so cue tests skip | Important | Fixed (§2) |
| `ubuntu-latest` with a 24.04 package name | Minor | Fixed: pinned to 24.04 |
| `{}` permits nested values at any depth | Minor | Comment corrected; the readers tolerate it (BlockGrader stringifies, `flashcard_rating` maps unknowns to nil) |
| A non-hash `block` returns 500 | Minor | Fixed, red first |
| Census uses literal enum values | Minor | Fixed |
| New test file untracked | Minor | Committed |

The reviewer verified as sound:
- the census is SELECT-only, its SQL matches `db/structure.sql`, and it prints no PII;
- every `submitBlock` caller and every payload reader;
- KaTeX 0.17/0.18's breaking changes (an internal API, and prefixed CSS classes) touch nothing
  this app uses;
- the CSP covers the new pins.

## 4. To finish (owner)

1. Merge the PR once its CI is green, fast-forward `main`, and push.
2. Deploy as production is deployed today, by hand from the workstation. Or enable the workflow
   (`gh workflow enable "Deploy to Production"`) if that is the decision.
3. `bin/kamal app details` tells us which commit runs now. Record it here.
4. `source .env.deploy && bin/kamal app exec -r job 'bin/rails wp40:funnel_census'` (WP-40
   waits on it).
