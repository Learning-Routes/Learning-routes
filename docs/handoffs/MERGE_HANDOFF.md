# MERGE_HANDOFF — PROMPT 35, merge what is stuck

13 October 2026. Everything that was ahead of `main` is either in `main` or is an open PR, and the
Dependabot queue is empty. `main` is at `a54a5d30`.

This file lives in `docs/handoffs/`, not at the root as §6 asked: the same day, #52 moved every
handoff there to keep the root down to `README.md`.

## 1. The branches: before and after

Measured with `git rev-list --count` against the local clone, before and after.

| Branch | Before (§0) | After | PR · CI run | Merge commit |
|---|---|---|---|---|
| `wp36-narrated-scenes` | 12 ahead / 82 behind | merged, branch deleted (local and origin) | #50 · 38446748010 ✓ | `bd1a60ad` |
| `deploy-guard` (§3b, new) | — | merged, branch deleted on origin | #51 · 38447772182 ✓ | `b75dd92e` |
| `wp37b-journey-map-drawn` | 6 ahead / 13 behind | merged, branch deleted on origin | #49 · 38444122096 ✓ | `bcd0b62d` |
| `mail-resend` | **§0 said 0 ahead; it was 1** (the Resend work, done that day) | merged; branch **kept** (§5) | #48 · 38445076626 ✓ | `9ad4bcb7` |
| `repo-tidy` (new) | — | merged, branch deleted on origin | #52 · 38451809734 ✓ | `982457fe` |
| `landing-for-everyone` (new, owner's ruling) | — | merged, branch deleted on origin | #53 · 38472722297 ✓ | `b2c2b771` |
| `landing-signed-in` | 0 ahead | **§0 said merged as #47; #47 was closed** because it was already on `main` by fast-forward (`e8e63a1f`) | — | — |
| `ci-green` | 0 ahead | deleted on origin; local branch kept while its worktree exists | #46 (before this prompt) | `d4ed2d35` |
| `wp40-owner-panel` | 0 ahead | kept (§5); spec and plan only, census on `main` | — | — |
| `wp38-pre-purge` | 28 ahead | tagged `backup/wp38-pre-purge` (`aca88065`), branch deleted | — | — |
| `wp38-backup-before-motion-purge` | 18 ahead | tagged `backup/wp38-before-motion-purge` (`6fae8b20`), branch deleted | — | — |
| `codex/security-reliability-hardening` | 0 ahead / 359 behind | deleted; its worktree pruned | — | — |
| `wp15-match-variants`, `wp17-route-commerce-foundation` | merged long ago | deleted (local and origin) | — | — |
| 28 other merged local branches (`audit-*`, `security-*`, `wp2`…`wp38-video-lessons`, one old Dependabot) | merged | deleted | — | — |
| Root `PROMPT_30` … `PROMPT_35` | untracked | committed in #52 under `docs/prompts/`; root copies removed after checking they were byte-identical | — | — |

**The two `backup/` tags are local only, on purpose.** Their commits hold the tree from *before*
WP-38's history purge. Pushing them would put the purged content back on GitHub. If they need to
leave this machine, use a private bundle (`git bundle create`), not `git push`.

**Deploys.** The owner reported #48–#51 merged and deployed. The deploy commits that
`bin/kamal app details` printed were not quoted to me, so they are not recorded here. Since then
`main` has gained #52, #53 and the Dependabot sweep below, and none of it is deployed yet. **One
deploy of `a54a5d30` (or later) is owed** (§4.3).

## 2. The Dependabot sweep (§4)

One at a time: each PR was rebased on the `main` of that moment, merged only when the rebase's
CI was green on all five jobs, and merged with a merge commit. Majors got their breaking changes
written into the PR before merging.

| PR | Bump | Outcome | Why | CI run |
|---|---|---|---|---|
| #42 | omniauth-google-oauth2 1.2.2 → 1.2.3 | merged first (security-relevant) | patch; brings rack 3.2.7, jwt 3.3.0, oauth2 2.0.25, faraday 2.14.4 | 38471154551 |
| #44 | selenium-webdriver 4.48.0 → 4.51.0 | merged | minor | 38471755370 |
| #45 | simplecov 1.2.0 → 1.3.2 | merged | minor. #48/#49/#52 landed while its CI ran; none touches `Gemfile*` or `.github`, so the run still held | 38472387504 |
| #38 | webmock 3.26.2 → 3.27.0 | merged | minor | 38473019438 |
| #39 | tailwindcss-rails 4.4 → 4.6 (tailwindcss-ruby 4.2.0 → 4.3.3) | merged | minor; the system suite exercised the new compiler | 38473639176 |
| #37 | lograge 0.14.0 → 0.15.1 | merged | minor; production-only, API unchanged | 38474356784 |
| #43 | rouge 4.7.0 → 5.1.0 | merged (**major**) | notes on the PR: Ruby 2.7 dropped, formatter delegation reworked, output for our `Formatters::HTML` subclass unchanged | 38475092084 |
| #41 | solid_cable 3.0.12 → **4.1.0** | merged (**major**) | notes on the PR; the rebase resolved to 4.1.0, checked against `config/cable.yml`. **No suite exercises it** (test uses `adapter: test`) | 38475784782 |
| #26 | actions/checkout v6 → v7 | merged (**major**) | the fork-PR guard doesn't apply to our triggers; `deploy.yml` uses no `ref` | 38476499071 |
| #25 | actions/cache v4 → v6 | merged (**major**) | node24, ESM; one RuboCop cache step | 38477370505 |
| #40 | brakeman 8.0.4 → 8.0.6 | closed, superseded | `main` already carries 8.1.0 (#46) | — |
| #33 | ruby_llm 1.11.0 → 1.16.0 | closed, superseded by **#54** | stale lockfile with conflicts, and 1.16 breaks one test; #54 does the bump with the fix | — |
| #54 (ours) | ruby_llm 1.11.0 → 1.16.0 | **open, waits for the reviewer** | a code change, not a Dependabot merge: `with_schema` now stores `{ name:, schema:, strict: }`. 1.16 does **not** fix the three exempted CVEs (≥ 2.0.0.rc1 does) | 38479575576 ✓ |

**§0 said "~30 on origin"; there were 12 open.** The other 23 Dependabot PRs (#1–#24, #27–#32,
#34–#36: puma 8, rails 8.1.3, bootsnap 1.25, solid_queue, kamal, bcrypt, upload-artifact 7 and
others) had been closed before this prompt, between February and 4 September. Their 13 stale local
branches are deleted. Dependabot has not reopened them; the ones still behind show up in
`bundle outdated` below.

### After the sweep, from a clean tree at `a54a5d30`

- `bin/bundler-audit`: **No vulnerabilities found** (the three ruby_llm exemptions apply; their guard test passes).
- `bin/importmap audit`: **No vulnerable packages found** (`mc` is skipped: vendored, no version).
- `bin/brakeman --no-pager`: **0 security warnings**, 2 ignored (both reviewed in `.brakeman.ignore`), 0 errors.
- `bundle outdated --strict`: 48 gems have a newer version allowed by their constraints. The direct ones:

  | Gem | Current | Latest | Group |
  |---|---|---|---|
  | rails | 8.1.3.1 | 8.1.4 | default |
  | pg | 1.6.3 | 1.7.0 | default |
  | ruby_llm | 1.11.0 | 1.16.0 | default (→ #54) |
  | thruster | 0.1.26 | 0.1.27 | default |
  | image_processing | 2.1.0 | 2.2.0 | default |
  | httparty | 0.24.2 | 0.24.3 | default |
  | webmock | 3.27.0 | 3.31.0 | test |
  | pg_query | 6.2.3 | 6.2.5 | development |
  | listen | 3.10.0 | 3.10.1 | development |

  Dependabot didn't propose these; they were left for its next run rather than added to this sweep.

## 3. Branch hygiene (§5)

- Local: 31 merged branches deleted (28 in one pass, then `wp15`, `wp17` and `codex/…`), plus the two `wp38` branches (tagged first) and 13 stale
  Dependabot copies. `git worktree prune` removed the dead `/private/tmp/learning-routes-security-hardening`.
- Origin: 9 merged branches deleted. Origin now holds `main`, `mail-resend` (kept) and `deps-ruby-llm-1.16` (#54).
- **Owner, one click:** GitHub → *Settings → General → Pull Requests →* **Automatically delete head branches**.
- **Owner, worktree folders you can remove** (their branches are merged; `git worktree remove <dir>` from the main checkout, then `git branch -d <branch>`):
  `../Learning-routes-ci` (`ci-green`), `../Learning-routes-guard` (`deploy-guard`),
  `../Learning-routes-landing` (`landing-signed-in`), `../Learning-routes-everyone` (`landing-for-everyone`),
  `../Learning-routes-tidy` (`repo-tidy`), `../Learning-routes-wp36` (`wp36-narrated-scenes`),
  `../Learning-routes-wp37` (`wp37-journey-map`), `../Learning-routes-wp37b` (`wp37b-journey-map-drawn`),
  `../Learning-routes-mail` (`mail-resend`; the branch itself stays).
  Keep `../Learning-routes-wp40`, `../Learning-routes-cp2` (WP-37b checkpoint 2, in progress) and
  `../Learning-routes-llm` (until #54 merges). The local server on port 9999 is stopped.

## 4. What remains open, and why

1. **The deploy of `main`** (§4.3): #52, #53 and the ten Dependabot merges. After it:
   - the tutor chat works (solid_cable 4.1);
   - `bin/kamal app logs -r web | grep -i cable` shows no connection errors;
   - signed in, `/` shows the landing (#53).
2. **#54** (ruby_llm 1.16) waits for the reviewer.
3. **WP-40 census** (`bin/kamal app exec -r job 'bin/rails wp40:funnel_census'`): needs the deploy above.
4. **WP-37b checkpoints 2–3**: in progress on `wp37b-cp2`.
5. **Owner's security actions**, unchanged:
   - rotate the Docker Hub token, the Postgres password and the OpenAI key;
   - make `gilberga/learning_routes` private on Docker Hub.
