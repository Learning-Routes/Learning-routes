# FINDINGS — WP-7

Things found while making the cost numbers true that are **out of this package's scope**.
None are fixed. Each says where it is and what it costs to leave alone.

---

## 1. Speech-to-text is never billed

`AiOrchestrator::AiClient#transcribe_audio` sends audio to a transcription endpoint and no
`AiInteraction` row is written for it. `VoiceEvaluator` then bills the *evaluation* text
tokens, so the row exists and looks complete — which is worse than a missing row, because
the meter reads as if it covered the whole interaction.

At $0.22/hour this is small today (voice practice is barely used), but it is the same
failure mode as the ElevenLabs zero: a path that costs money and writes nothing.

**Scope:** a `transcription` task type, a duration on the row, a price entry. Half a day.

---

## 2. `AiRequestJob` is dead code with a cost path in it

Every caller reaches `AiClient` with `async: false`. The job still exists and still
contains its own cost handling, which no longer matches the service path. It will drift
silently and then be wrong the day someone re-enables async.

**Scope:** delete it, or route it through the same tracker. An hour either way.

---

## 3. `cost_dollars` reads the rounded column

`AiInteraction#cost_dollars` is `cost_cents / 100.0`. Every sub-cent call now rounds to 0
there, so anything summing `cost_dollars` under-reports. `cost_microcents` is the exact
column; `cost_dollars` should read it.

Left alone because changing it touches display code outside this package, and the
dashboard already reads microcents directly.

---

## 4. Spend caps still count in cents

`ModelRouter#check_cost_limit!` sums `cost_cents`. Before WP-7 that over-counted (ceil), so
the cap fired early and safely. Now it rounds, so a user making many sub-cent calls
accumulates less recorded spend than they cost — the cap is **looser** than it was.

This is the one finding here with a live risk attached. The cap should sum
`cost_microcents`. It is a one-line change plus a test, deliberately not made in this
package because spend caps are a safety control and changing one alongside a pricing
rewrite makes both harder to review.

**Recommend doing this next, before the dashboard is deployed.**

---

## 5. Nine production image rows can never be priced

Documented in `WP7_HANDOFF.md` §A. They hold `prompt.length` where tokens should be. The
backfill refuses them. Their true cost is between 38¢ and 150¢ and no code change recovers
it — it can only come from the OpenAI invoice.

---

## 6. The OpenAI key cannot read its own usage

`/v1/organization/costs` and `/v1/organization/usage/*` return 403; the key lacks
`api.usage.read`. So no automated reconciliation against the actual invoice is possible,
in this package or a future one, until a key with that scope exists. Every figure in the
handoff is derived from per-call `usage` the API returned at request time.

---

## 7. Image quality was never a decision

Until this package the app sent no `quality` parameter, so OpenAI chose — and chose
differently between identical calls (one medium, two high out of three). That is a 4×
cost spread with no product reason behind it. `AiClient` now sends it explicitly, but
**which** tier the product should use is a product question nobody has answered. It is
the largest single lever on per-route cost.
