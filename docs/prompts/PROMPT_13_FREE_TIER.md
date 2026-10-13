# PROMPT 13 — WP-20: what the free module actually includes

> Run from `~/Documents/Learning-routes`. Branch off `main` as `wp20-free-tier`, **after**
> `wp18-route-purchases` and `wp19-spend-leaks` are merged. Merge `wp18` first: it carries the
> test-isolation fix `98e2fd1` that `wp19` does not.
> Reference: `ROADMAP_v3.md`, `WP19_HANDOFF.md`, `WP18_RESUME.md` §5.

---

## The rule the owner decided

**The free module gives you the content we already generated, plus a small taste of the thing
you would be buying. Everything else asks you to buy the route.**

Concretely, three decisions, already made. Do not re-litigate them:

1. **Preview, reading:** every lesson, quiz and assessment already generated for module 1 stays
   free and unchanged.
2. **Preview, on demand:** the student gets **3 tutor messages and 1 generated image** on the
   free module. After that, any request for new AI work returns the buy prompt.
3. **Preview, audio:** stop pre-generating narration for the free module. Generate it when the
   student presses play. Paid modules keep pre-generating.
4. **Purchased:** unchanged — everything unlocked, exactly as `generation_allowed?` already does.

### Why, in numbers, so the thresholds are not arbitrary

Measured from the WP-7 ledger (lesson 2.33¢, quiz 0.11¢, narration 3.07¢, image 4.26¢, observed
3.0 narrations and 0.09 images per lesson), a 3-step free module costs:

| | per signup | per 1000 signups who never buy |
|---|---|---|
| Today | **36.1¢** | **$361** |
| After §C (audio on demand) | **7.3¢** | **$73** |
| Worst case, taste fully used | **18.6¢** | **$186** |

Two things fall out of that table and they are the reason for the design:

- **Audio is 80% of what a free signup costs today** — 28.8¢ of 36.1¢ — and it is pre-generated
  whether or not anyone presses play. That is the big lever, not the tutor.
- **The taste costs 11.25¢ and breaks even at a 1.4 percentage-point conversion lift** (11.25¢ ×
  1000 = $112.50 against $8.02 net per sale). The tutor is the product's differentiator; a demo
  that hides it is a demo of a document reader.

---

## §A — Split the predicate. This is the actual work.

`ModuleAccessPolicy` has **one** method answering **two different questions**:

```ruby
# module_access_policy.rb:45
return true if step[:access_state] == "preview"
```

That line is correct for "may this step's own lesson be generated?" and wrong for "may this
student commission extra AI work?". Today both go through it.

Split it:

- **`may_pregenerate?`** — the route's own content: `ContentPipelineJob`, `StepQuizGenerationJob`,
  `AssessmentGenerationJob`. Free on preview, and bounded by the route's shape rather than by
  anything the student does. Behaviour unchanged from today.
- **`may_generate_on_demand?`** — anything the student asks for: tutor chat, explain differently /
  give example / simplify / deepen / diagram / image / code, section images, section audio, voice
  evaluation, gap analysis and reinforcement. Preview: allowed only inside the taste. Purchased:
  allowed.

Two consequences to handle deliberately:

1. **`LessonsController` and `ExercisesController` still use the READ gate** — the audit found
   this and it was left open. They are precisely the AI-tools row. They move to
   `may_generate_on_demand?`, and that closes the finding.
2. **Reinforcement on a preview module.** WP-19 made a reinforcement step inherit its trigger's
   module. Under this rule, reinforcement triggered on a preview module is on-demand generation
   by a free user. Decide whether it is inside the taste, outside it, or not inserted at all, and
   defend the choice — a free user looping an assessment was the §B leak of WP-19 and must not
   come back through this door.

**Task 8 needs this same split** (its job is widening `preview_access?` to reach `purchased`).
Building it here makes Task 8 smaller. Do not build Task 8.

## §B — Where the taste counter lives

**`ai_orchestrator_ai_interactions` has no `learning_route_id`** — only `user_id` and a jsonb
`metadata`. Confirmed against `db/schema.rb`. So "how many tutor messages has this user spent on
this route" cannot be answered from the ledger today at any reasonable cost.

The recommendation, which you should evaluate and may overrule with a reason: **add
`learning_route_id` to `ai_interactions`, nullable, with an index**. It is one column and it
unlocks three things the project already needs:

- this taste counter,
- the per-purchase generation allowance the owner has asked for twice (the "$5 token"),
- the estimated-vs-actual reconciliation the audit found missing — `estimated_ai_cost_microcents`
  and `actual_fee_cents` are written and read nowhere, so nothing can tell whether a route's
  price covered what it cost to serve.

If you choose a counter column on the route instead, say why, and say what it costs the two
future uses above.

Hard requirements either way:

- **Server-enforced.** The count is checked where the work is authorized, not in JavaScript. The
  answer key being in the DOM is a known, accepted weakness of this codebase; the paywall must not
  join it.
- **Cheap.** One bounded query on an indexed column. This runs before every tutor message.
- **A refused request costs nothing.** The check happens before the provider call, and a refusal
  writes no `AiInteraction` row and no `cost_microcents`.
- **Cached hits are not spends.** A cache hit costs nothing and must not consume the taste — the
  same rule `cached: true` already establishes for billing.

## §C — Preview audio on demand

`ContentPipelineJob` enqueues `MediaPrefetchJob`, which generates narration for every section of
every generated lesson. On a preview module that is 28.8¢ per signup for audio nobody has asked
for.

Skip narration prefetch for preview modules. Generate on the play action, through the existing
`SectionAudioController#generate` path, which already caches. Paid modules keep pre-generating —
a customer who paid should not wait.

State in the handoff what the first play now costs in latency, measured, not estimated.

## §D — The buy prompt

Server first, UI second. The endpoint must refuse and say why before anything renders a modal.

- One reason code the client can act on, distinct from an error: this is a business decision, not
  a failure — the same distinction `SpendGuard::LimitExceeded` already draws in WP-19. Follow it.
- Both locales, no hardcoded strings. The last sweep removed eighteen; do not add any.
- Theme variables, not hex. Seven partials shipped invisible on dark once.
- The modal is a small part of Task 11 (customer purchase panel). Build the smallest honest
  version — a clear message and a link to buy — and note in the handoff what Task 11 should
  replace.

---

## Note in `FINDINGS_WP20.md`, do NOT build

**Bot protection.** The owner has flagged this as important and deferred it. Record the current
state precisely so the next package starts from facts:

- `config/initializers/rack_attack.rb:48` throttles signups to **5 per hour per IP**. That is the
  only barrier. There is no CAPTCHA, no proof-of-work, no device signal.
- With a proxy pool, 5/hour/IP is not a bound.
- After this package, every signup that creates a route costs **7.3¢** floor, **18.6¢** if the
  taste is fully used. That is the per-bot cost of an unprotected free tier.
- Establish and record whether route creation currently requires a verified email:
  `Core::ApplicationController:14` has an `email_verified?` guard, but `RouteWizardController`
  lives in `app/controllers/` and only declares `authenticate_user!` — confirm which base class it
  actually inherits and whether the guard applies to it. **If an unverified account can create a
  route, that is the hole, and it is one `before_action`.** Report the answer; do not fix it here.

## Hard constraints

1. **Do not deploy.**
2. **Do not build Task 8, Task 9, or the per-purchase allowance.** If you find yourself designing
   a wallet, stop and write it in `FINDINGS_WP20.md`.
3. Do not "fix" the four known engine failures. Report the count before and after, intersection of
   3 runs.
4. `env -u RAILS_MASTER_KEY` before every `bin/rails test`, one suite per process.
5. Every new query eager-loads. Every new string goes through I18n in both locales.

## Tests

- A free user gets 3 tutor messages and the 4th is refused with the buy reason, not an error.
- A free user gets 1 image and the 2nd is refused.
- A cached response does not consume the taste.
- A refused request creates no `AiInteraction` and spends no `cost_microcents`.
- Reading already-generated preview content is unaffected by an exhausted taste.
- A purchased route is unaffected by all of the above.
- Preview lessons still pre-generate; preview narration does not.
- Whatever §A decides about reinforcement: that a free user cannot loop an assessment into
  unbounded generation.

## Reporting back

Print only: the two predicates and which call sites moved to which; the counter seam you chose and
why; the measured first-play latency from §C; the answer to the verified-email question in the
note above; and both test counts. Everything else to `WP20_HANDOFF.md`.

**Verify your report against the code before printing it.**
