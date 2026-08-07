# Findings deferred out of WP-6

Found while doing WP-6, deliberately not fixed here.

---

## 1. 🔴 The ElevenLabs credential in production is an API key **ID**, not an API key

**All text-to-speech is failing in production right now.** Found while verifying the
audio path (Phase 4 item 5).

```
ElevenLabs API error: 400 — {"type":"authentication_error","code":"invalid_api_key",
 "message":"API key ID used as API key - only valid API keys can be used.
            API keys start with 'sk_' and are shown when the key is created or rotated.",
 "status":"api_key_id_used_as_api_key"}
```

Confirmed without exposing the secret: the stored value is **64 characters and does not
begin with `sk_`**. ElevenLabs key IDs look like that; keys do not.

**Why it matters more after this package.** The replacement map hands the LANGUAGE
family's listening practice to the `audio` block, on the basis that lesson prose is
narrated automatically. That is true of the code and false of the deployment: with this
credential no narration is ever produced. Every `SectionAudioGenerator` call fails, both
the primary and the fallback voice, on every lesson.

Everything downstream of synthesis is verified working — see the handoff §5 — so this is
a credential rotation, not a code change:

1. Create a real key in the ElevenLabs dashboard (starts `sk_`).
2. `bin/rails credentials:edit --environment production`, replace `elevenlabs.api_key`.
3. Redeploy, then confirm an `audio` section appears in a freshly generated language lesson.

Worth also checking whether this credential ever worked — if not, `AUDIT.md` §P1-6's
"largest real per-route expense (~$3–6)" may be overstated, because none of it was ever
being spent.

## 2. `lesson_content` times out on its primary model, exactly as `curriculum_design` did

Both real lesson generations in Phase 4 logged:

```
[AiOrchestrator::ModelRouter] Primary model gpt-5.2 failed: Request to gpt-5.2 timed out
```

Both then succeeded on the `gpt-4.1-mini` fallback. So every lesson currently costs a
wasted 30-second timeout before it starts, and is written by the fallback model rather
than the one the routing table chose.

WP-5 fixed this shape for `curriculum_design` by adding a per-task `request_timeout` to
`ai_model_defaults`, applied through `RubyLLM.context`. The mechanism already exists;
`lesson_content` just needs the same entry. Left out of WP-6 only because it is a model
/ cost concern rather than a block-contract one, and WP-7 owns those.

Measured latency for the successful fallback calls: 19.9s and 23.2s.

## 3. WP-1's shared storage volume still cannot be verified locally

Phase 4 item 5 asked for the first real test of the `learning_routes_storage` volume.
That is not testable outside production: locally there is one process and one filesystem,
so there is no `web`/`job` split for a volume to bridge.

What was verified locally instead (handoff §5): the storage path resolution, the
containment/traversal checks, the audio section injection, and the partial rendering.
What still needs a production check, once §1 is fixed:

```
kamal app exec --reuse --role job 'ls -la /rails/storage/audio/sections'
kamal app exec --reuse --role web 'ls -la /rails/storage/audio/sections'   # must match
```

## 4. `LanguageInstructions` says "lesson" for every task type

The directive now reaching all 17 templates reads "Write the ENTIRE **lesson** in
Spanish". For `step_quiz`, `quick_grading` or `gap_analysis` that noun is wrong, though
the instruction is still unambiguous about the language. Cosmetic; worth a per-task noun
when someone is next in that file.

## 5. Still open — the reason WP-10 must not slip

`AUDIT.md` §P1-9 is untouched and this package makes it *less* visible, not more: the
lessons now render cleanly, so nothing on screen suggests the exercises are
ungraded. None of `drag_drop`, `fill_blank`, `flashcards`, `scenario`, `simulation`,
`code_playground` or `check` reports a result to the server. FSRS, XP and gap analysis
stay starved of the signal they were built to consume.

Also for WP-10, from `WP6_CONTRACT.md` §5 — the capabilities the replacement map could
not preserve:

| Lost | Impact |
|---|---|
| **Productive speaking** (`speak_sentence`) | A language route has no speaking practice at all. ElevenLabs Scribe is already contracted. The highest-value gap. |
| Sequence ordering (`drag_order`) | `drag_drop` pairs, it does not order. A plausible small extension to the existing controller. |
| Click-on-region labelling (`image_label`) | Degrades to a question about a rendered image. |

## 6. Carried over, untouched by this PR

| Ref | Item |
|---|---|
| P1-6 | ElevenLabs priced `flat: 0` — and see §1, it may never have been spending anything |
| P1-7 | Model IDs / pricing survey (WP-7); `gpt-4.1-mini` is *not* retired — see `FINDINGS_WP5.md §1` |
| P2-3..P2-6 | Password reset `forget!`, `/cable` auth, tutor XSS, XP replay |
| P3-1 | CI runs 159 of 452 tests and auto-deploys on green |
| — | The 14 engine strict-loading failures from `FINDINGS_WP2.md §1` (WP-4) |
