# WP-25 — The exam will not start

Branch: `wp25-exam-wont-start`, off whatever WP-24 lands on.

**This is a blocker, same tier as WP-24 §1.** The owner cannot start the exam on a live route:
pressing "Iniciar examen" produces a 406 and nothing moves. Reported 4 September with console
evidence from `learningroutes.com/assessments/assessments/3cdb3a6c-8e01-4284-9ccc-cce06f296b27`.

Two symptoms, probably unrelated to each other. Take §1 first.

---

## §1 — `POST .../start` returns 406 Not Acceptable

Console, repeated on every press, logged by Turbo itself (`turbo.es2017-esm.js:668`):

```
POST https://learningroutes.com/assessments/assessments/3cdb3a6c-…/start
406 (Not Acceptable)
```

### What is already ruled out — do not spend time here

- **The doubled path is not a bug.** `Assessments::Engine` is mounted at `/assessments`
  (`config/routes.rb:6`) and the resource inside it is `:assessments`, so
  `/assessments/assessments/:id/start` is the correct URL. Ugly, not broken.
- **It is not auth.** `authenticate_user!`, `require_email_verification!` and
  `authorize_assessment_owner!` all use plain `redirect_to`, which is a 302 in any format.
- **It is not `record_not_found`.** That `rescue_from` handles html, turbo_stream and json
  (`core/application_controller.rb:82-86`) and returns 404.

### The prime suspect — confirm before fixing

`assessments_controller.rb#start` ends with:

```ruby
respond_to do |format|
  format.html
  format.turbo_stream
end
```

But the view directory contains **only `start.html.erb`**. There is no
`start.turbo_stream.erb`:

```
engines/assessments/app/views/assessments/assessments/
  show.html.erb
  start.html.erb          ← only this
```

`button_to` (both call sites: `steps/_assessment.html.erb:72` and
`assessments/show.html.erb:56`) is a form, so Turbo intercepts it and sends
`Accept: text/vnd.turbo-stream.html, text/html, …`. `respond_to` picks `turbo_stream` because
it is first in the Accept list, and then has no template to render.

**I am not certain this produces 406 rather than 204.** A declared format with a missing
template normally takes `default_render` → `head :no_content`. A 406 is what
`ActionController::UnknownFormat` produces, which means negotiation matched nothing at all.
Those are different failures and they have different fixes, so **do not fix on this
hypothesis alone.**

### Do this first — get the server's own account

```
source .env.deploy && kamal app logs -n 300 | grep -A 30 -i "assessments"
```

The Rails log for that request says which format was processed, which template it looked for,
and which exception was raised. One paste of that block ends the guessing. If the log shows
`ActionController::UnknownFormat`, the negotiation is the bug. If it shows a missing template
or a 204, the hypothesis above is wrong and the 406 is coming from somewhere else — say so and
find it before touching anything.

### Then fix it at the layer that is actually wrong

If the missing template is the cause, there are two honest options and they are not equivalent:

- **(a)** Add `start.turbo_stream.erb`. Right if starting an exam should update the page in
  place. Then it has to actually render the exam, not a stub.
- **(b)** Drop `format.turbo_stream` from `respond_to`, so the POST is answered with the full
  HTML page. Right if starting an exam is a navigation, which is what `start.html.erb` being
  the only view suggests was the original intent.

Prefer **(b)** unless you find evidence the turbo_stream path was ever built. Declaring a
format you cannot render is the defect; adding a template to justify the declaration is
building a feature to cover a mistake.

### The test that prevents the class

The class is **"a controller declares a `respond_to` format it has no way to render"**. It is
the exact sibling of WP-23 §1 (a turbo_stream targeting an id that does not exist): both are
promises the app makes and cannot keep, and both fail silently at the student.

```ruby
# test/controllers/respond_to_formats_have_templates_test.rb
```

Sweep every controller for `respond_to` blocks, collect the formats declared in each action,
and assert that each one either has a matching template or an explicit inline render/head in
the block. Fail with the list. It must fail today naming
`Assessments::AssessmentsController#start` / `turbo_stream`.

Run the sweep before you fix anything and **report every hit**, not just this one. If it finds
others, that is the point of the test — but fix only the ones that are actually reachable, and
record the rest.

---

## §2 — The voice response goes nowhere

The owner recorded and sent audio on an audio lesson and nothing at all happened — no result,
no error, no spinner resolving.

### What is already ruled out

- **Storage is shared.** `config/deploy.yml:89-90` mounts the named volume
  `learning_routes_storage:/rails/storage` and Kamal 2 applies top-level `volumes:` to every
  app role, so the file the web container writes is readable by the job container.
- **The broadcast target exists.** `VoiceEvaluationJob` replaces
  `voice-interaction-#{step.id}`, and that id is rendered at
  `content_engine/audio/_audio_lesson.html.erb:85`. This is *not* another orphaned
  turbo_stream target.
- **The job broadcasts on failure too** (`voice_evaluation_job.rb:25-31`, the
  `evaluation_failed` partial). So a job that ran and failed should still have said something
  on screen. Silence means the job did not run, or the broadcast did not arrive.

### The three candidates, in the order to check them

1. **The POST was refused before anything happened.**
   `voice_responses_controller.rb:15-19` returns `head :forbidden` when
   `ModuleAccessPolicy.generation_allowed?` is false. A voice evaluation is billable AI work,
   so a preview/unpaid route is *supposed* to be refused here — but a bare 403 with no UI
   response is indistinguishable from the app being broken. Check the route's entitlement for
   this user first; this is the cheapest check and it fits the symptom exactly.
   If this is it, the bug is not the policy — it is that **the refusal is invisible**. It must
   surface as the buy-your-route modal, which is WP-20's job. Wire the affordance, do not
   loosen the gate.
2. **The job never ran.** `bin/jobs` is a separate 512 MB container on the same 2-core box.
   Check Solid Queue for the enqueued job and its state.
3. **The broadcast did not arrive.** `/cable` is on the open security-debt list — unauthenticated
   and never verified working under Kamal. If the job completed and wrote a score but the page
   never changed, this is where it died.

Diagnose to one of the three and **stop there**. Fixing the wrong one silently is how this
defect survived from the first roadmap to now.

### The test that prevents the class

The class is **"a refusal the student cannot see"**. Same shape as WP-23 §1 and WP-24 §3.
Whatever the cause, the fix ships with a test asserting that a refused voice submission puts a
visible, specific message on the page — not a silent `head`.

---

## §3 — Confirmed live, and it raises WP-23 §5's priority

The same console shows, many times:

```
Executing inline event handler violates the following Content Security Policy directive:
'script-src' 'self' https://cdn.jsdelivr.net 'nonce-svwBR/DEwSNY/A77zITMwg=='.
The action has been blocked.
```

That is WP-23 §5, now with production evidence instead of a code sweep. Two things it changes:

- The CSP uses **nonces**. Once a nonce is present, browsers ignore `'unsafe-inline'` in
  `script-src` entirely — so that shortcut was never available. Moving the twelve handlers to
  CSS is the only fix, exactly as WP-23 §5 says.
- The volume of these errors is why nobody reads this console. Five real defects have been
  hiding behind that noise. Treat clearing it as making the next bug findable, not as tidying.

**Not in this package** — it stays in WP-23. Recorded here so the evidence is not lost.

### One thing that is NOT ours

```
Uncaught TypeError: Cannot read properties of undefined (reading 'startTime')
  at et.reportAllChanges (<anonymous>:2:19429)
```

`reportAllChanges` is the `web-vitals` API, and `grep` finds no web-vitals in
`config/importmap.rb` or `app/javascript`. The stack is an anonymous VM script. This is a
browser extension, not the application. Do not chase it.

---

## Order

1. §1 — get the log, then fix. The exam is unreachable until this closes.
2. §2 — diagnose to one of three, fix that one.
3. §3 is not in this package.

## Verification

- `env -u RAILS_MASTER_KEY bin/rails test`, three runs, report the intersection.
- Browser suite, same.
- Both new tests demonstrated red before the fix, with the failure output pasted.
- CI is red since WP-17 (`ci.yml:70,105` run `postgres:16-alpine`; `db/*structure.sql` emit
  `SET transaction_timeout = 0`, which is PG17). Bumping those two lines to `postgres:17-alpine`
  is a two-line change that unblocks auto-deploy — **do it in this branch and say so**, because
  every package since WP-17 has merged without a green CI.
- Then the owner starts an exam on the live site. That is the only thing that confirms §1.
- Say what you did not do.
