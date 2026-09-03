# PROMPT 11 — WP-18 follow-up: the refund hole that stayed open, and the quote dead end

> Run from `~/Documents/Learning-routes`, on `wp18-route-purchases` (HEAD `51b0b45`).
> Reference: `WP18_RESUME.md` §2 (`ae62268`) and §5.
>
> The audit pass was good and verifies clean. This is one gap it left and the decision it
> deferred. **Do not merge `wp18-route-purchases` until §A lands** — it is the same defect
> `ae62268` was written to close, on the single largest paid call in the system.

---

## §A — Lesson generation is still authorized by the READ policy

`ae62268` split read entitlement from generation spend and wired `generation_allowed?` into
five endpoints: tutor chat, voice responses, audio, section audio, section images. Verified —
all five call it, as a `before_action` scoped `only: :generate`, not merely defined. That half
is right.

`ModuleAccessPolicy.generation_allowed?` documents its own scope as:

```ruby
# Every endpoint that enqueues an AI job — tutor replies, voice
# evaluation, TTS, image generation — asks THIS, not `allowed?`.
```

**`lesson_content` is not in that list, and `StepsController` does not ask.** That enumeration
appears to have been copied from the finding's own description rather than derived from a sweep
of what actually enqueues an AI job.

`engines/learning_routes_engine/app/controllers/learning_routes_engine/steps_controller.rb`:

```ruby
before_action :authorize_module_access!        # → ModuleAccessPolicy.allowed?  (READ policy)

def show
  ...
  prefetch_upcoming_steps!                     # → ContentPrefetcher.prefetch → ContentPipelineJob
end
```

and a second path:

```ruby
def load_audio_content
  ...
  ContentPipelineJob.perform_later(@step.id, { pregenerate_audio: true })
end
```

`ModuleAccessPolicy.allowed?` resolves through `RoutePurchase.entitled?`, which counts
`refunded` **by design** — the approved spec defers post-refund read revocation. So a refunded
customer opening steps still commissions `lesson_content`, the most expensive call the app
makes, plus audio pre-generation on the audio path.

**Bound the claim honestly in your report.** `ContentPipelineJob` guards on `content_ready` /
`content_generating` and `ContentPrefetcher` holds an atomic claim, so this is bounded by the
number of ungenerated steps in the route, not unbounded like tutor chat. Measure it: for a
route of typical length, what is the worst-case spend a refunded customer can still cause?
Use the real per-call figures from WP-7, not the February constants.

**What to build.** Ask `generation_allowed?` before enqueuing, on both paths, without breaking
the deliberate policy that reads survive a refund:

- A refunded customer must still be able to open and read every step whose content already
  exists. That is the approved spec; do not narrow `entitled?`.
- A refunded customer must not cause a new `ContentPipelineJob`.
- A step with no content yet, on a refunded route, needs a real answer rather than an
  infinite skeleton. Decide what the student sees and say why — `@content_failed` with a
  truthful message is a candidate; a spinner that never resolves is not.
- The free preview module keeps working for everyone, refunded or never purchased.

Then sweep, rather than enumerating from memory: find every site that enqueues a job which
makes a paid provider call, and report which policy each one asks. That list is the fix's
acceptance criterion, and it is what `ae62268` needed and did not have.

## §B — A discount code would charge the customer and refuse the route

Not a defect — a deliberate choice, correctly reasoned, with an operational consequence that
belongs somewhere the operator will see it. `providers/lemon_squeezy.rb`:

```ruby
# `discount_total` is subtracted rather than ignored, so a store-wide
# or dashboard discount code leaves the customer paying less than
# quoted and still fails the equality check instead of entitling for
# a price we never offered.
```

and `order_processor.rb:191` is an equality:

```ruby
return "amount_mismatch" unless @event.amount_cents == quote.final_price_cents
```

So the day the owner creates a discount code in the Lemon Squeezy dashboard, every discounted
order is charged, rejected as `amount_mismatch`, and 202'd. The customer pays and gets nothing.
The reasoning for refusing an unoffered price is sound; the failure mode is silent and the
trigger is a button in a dashboard, not a code change.

Do not change the policy on your own. Do two things:

1. Surface it where it can be acted on: `amount_mismatch` with a non-zero `discount_total`
   is a distinct, diagnosable condition, not the same event as a tampered amount. Name it
   separately in the rejection ladder and in the admin screen.
2. Write the operator note into `WP18_RESUME.md` and the admin quotes screen: discount codes
   are not supported, and creating one breaks purchases until the policy is decided.

## §C — The quote dead end (§5 of the resume)

The owner's call, with one fact the write-up did not weigh.

`RouteQuoteBuilder` computes `final = max(cost_based_price, minimum_price)` from
`RouteCostEstimator` over the route's shape, `LemonSqueezyFeeEstimator`, and
`PricingConstants`. For a route that already exists and is not changing shape, **re-quoting is
deterministic**: the number only moves when the owner changes `PricingConstants`, ships a new
`estimator_version`, or provider rates change — all his own deploys, none of them customer-visible
drift between two checkout attempts minutes apart.

So the risk that quote immutability exists to prevent barely exists today. That makes option 3
— reuse while unexpired, re-quote after — cheap now and correctly ordered before Task 11.

Build it with the guard the determinism does not cover:

1. Reuse an unexpired `checkout`-state quote when it carries no paid purchase. The returning
   customer gets exactly the price they were shown.
2. Re-quote when there is no usable quote. `CheckoutCreator` must be able to obtain a quote;
   `RouteQuoteBuilder` having exactly one caller at route creation is the structural cause of
   every dead end here, and the symptom will keep reappearing until that is true.
3. When a re-quote comes out **higher** than a quote the same user was previously shown for
   the same route, honour the lower one. Quotes are already versioned snapshots, so this is a
   lookup, not new machinery. Say what window you chose and why.
4. Fix the copy regardless of the above: `quote_expired` currently tells the user to refresh
   the page, which cannot help, and `no_quote` says the route has no price "yet" when the
   truth is that it had one and it is stranded. Untrue error copy is its own defect.

## Hard constraints

1. **Do not deploy.**
2. Do not narrow `RoutePurchase.entitled?` — post-refund read revocation is deferred by an
   approved spec, and §A must not smuggle it in.
3. Do not "fix" the four known engine failures. Report the count before and after, intersection
   of 3 runs.
4. `env -u RAILS_MASTER_KEY` before every `bin/rails test`.
5. Run the suites in ONE process. `98e2fd1` root-caused the intermittent failures as two
   `bin/rails test` processes sharing a database; do not reintroduce a parallel run.
6. Every new query eager-loads. `strict_loading_by_default` is on and only logs in production.

## Tests

- A refunded route's step view does **not** enqueue `ContentPipelineJob`, on both the prefetch
  path and the audio path, and **does** still render content that already exists.
- The free preview still generates for a user with no purchase at all.
- An order carrying a non-zero `discount_total` is rejected under its own reason, not
  `amount_mismatch`.
- An abandoned checkout can be resumed at the original price while unexpired.
- After expiry, a new quote is minted, and a higher one does not raise the price the customer
  was already shown.

## Reporting back

Print only: the sweep table of every paid-job enqueue site and the policy it asks, before and
after; the worst-case refunded spend in cents with the WP-7 figures behind it; the §C window
you chose; and both test counts. Everything else to `WP18_RESUME.md`.

**Verify your report against the code before printing it.**
