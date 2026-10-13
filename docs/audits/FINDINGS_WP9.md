# Findings deferred out of WP-9

---

## 1. 🔴 STOP — a live OpenAI key is committed, and the repo is public

Not part of WP-9. Found on arrival at HEAD and it outranks everything else here.

`config/initializers/ai_services.rb:5-6` carries, in plaintext comments:

```ruby
#   OPENAI_API_KEY=sk-proj-nzSNR2Bn…            <- a LIVE key
#   ELEVENLABS_API_KEY=722497d4d04e…            <- the invalid key-ID from FINDINGS_WP6 §1
```

Verified, without printing the secrets:

| Fact | Value |
|---|---|
| File tracked by git | yes |
| Committed in | **`96e8cce`** (HEAD when this session started) |
| Pushed to a remote | **no** — `git branch -r --contains 96e8cce` is empty |
| GitHub repo visibility | **public** (`Learning-Routes/Learning-routes`, `private=false`) |
| Does the key match production? | **yes** — byte-identical to `credentials/production.yml.enc → openai.api_key` |
| Is the key live? | yes — it is the key used for the real generations in WP-5, WP-6 and this session |

**So: not leaked yet, one `git push` away from being leaked.** Exactly the shape of the
WP-2 P2-1 finding, and the same window to act.

I have not pushed anything, and WP-9's commits sit on a local branch.

**Do this before pushing anything:**

1. **Rotate the OpenAI key first**, on the assumption the window closes badly. It is
   the production key, so rotating means updating
   `config/credentials/production.yml.enc` and redeploying.
2. Remove the keys from the file — they are documentation examples and should be
   placeholders (`sk-proj-…`), not values.
3. Drop them from history. WP-9's two commits sit on top of `96e8cce`, so:
   ```
   git rebase -i 96e8cce~1     # edit the ai_services.rb commit, or
   git filter-repo --path config/initializers/ai_services.rb --invert-paths  # heavier
   ```
   Then force-push only if `96e8cce` has already gone out.
4. The ElevenLabs value there is *not* the production one and is the same invalid
   key-ID shape flagged in `FINDINGS_WP6.md` §1 — that credential still needs rotating
   for TTS to work at all.

## 2. The locale schema is inconsistent, and it is Spanish-first in only one place

Recorded per the brief; **not** changed here.

| Column | Default | Null? |
|---|---|---|
| `core_users.locale` | `"en"` | — |
| `learning_routes_engine_learning_routes.locale` | `"en"` | **NOT NULL** |
| `route_requests.route_locale` | `"es"` | — |

The wizard captures `route_locale: "es"` and the route it creates defaults to `"en"`.
Anywhere the wizard's value is not explicitly copied across, a Spanish-first product
silently produces an English route — and since `learning_routes.locale` is NOT NULL, the
`LocaleResolver` chain always stops at the route, so a wrong default there is never
rescued by the user's own locale.

Worth deciding deliberately: either the defaults become `"es"`, or they become
`I18n.default_locale` and `config.i18n.default_locale` becomes `:es`. Both are schema
changes with a backfill, which is why they are not in this PR.

## 3. `localized_*` still defaults to `I18n.locale` in four more places

WP-9 fixed every site that feeds an AI prompt. These remain, and are lower risk because
they run in a request where `I18n.locale` is set from the user:

| Site | Assessment |
|---|---|
| `landing_controller.rb:46` | fine — the landing page should follow the UI language |
| `section_images_controller.rb:35` | fine — request context |
| `media_prefetch_job.rb:155` | **job context** — feeds image-generation prompts; same defect, smaller blast radius |
| `lesson_assistant_agent.rb:79` | builds an agent prompt; the agent already sets a thread-local locale, worth aligning |

A stronger fix than chasing call sites would be to make the default explicit —
`localized_title(locale)` with no default — so a caller has to state what it means. That
is a wider refactor than this package.

## 4. `LanguageInstructions` says "lesson" for every task type

Carried from `FINDINGS_WP6.md` §4 and now more visible, since the directive reaches all
17 templates from every call site. A quiz prompt says "Write the ENTIRE **lesson** in
Spanish". Unambiguous about language, wrong about the noun. One `task_noun:` parameter
would fix it; out of scope because constraint 3 forbids touching the directive text.

## 5. Still open

| Ref | Item |
|---|---|
| `FINDINGS_WP6.md` §1 | ElevenLabs credential invalid — all TTS failing |
| `FINDINGS_WP6.md` §2 | resolved in `96e8cce` (lesson_content timeout) |
| `AUDIT.md` §P1-9 | no server-side grading — WP-10 |
| `AUDIT.md` §P1-6 | ElevenLabs priced `flat: 0` |
| `AUDIT.md` §P2-3..P2-6 | password reset `forget!`, `/cable` auth, tutor XSS, XP replay |
| `AUDIT.md` §P3-1 | CI runs 173 of 466 tests and auto-deploys on green |
| `FINDINGS_WP2.md` §1 | the remaining 12 engine strict-loading failures — WP-4 |
