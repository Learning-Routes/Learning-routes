# WP-23 — The Silent Failures

Branch: `wp23-silent-failures`, off `main` **after** `wp22-lesson-completion` AND
`wp24-unfinishable-lesson` are merged. WP-24 comes first: its three defects stop a student
from finishing a lesson at all, and none of the six here do.

The rule in this project: **bugs before features.** This is the remainder of the production
defects from the audit. No WP-20, no Task 8, no Task 9 until this closes.

Second rule: **every fix ships with the test that prevents its whole class of defect**, not
a test that reproduces this one instance. WP-21 had 20 green tests and still broke server
delivery, because all 20 asked the DOM. WP-22 fixed that by asserting against the database.
That is the bar.

All six defects share one signature: **they fail without saying anything.** None throws,
none shows the student an error, and five of the six have been in production for weeks
precisely because of that.

---

## §1 — "Completar paso" can never give feedback (D1 and D2 are the same defect)

**Highest priority. Every step, every student, every time.**

`app/views/layouts/learning.html.erb:85` renders a real `button_to` in the header:

```erb
<% if @step && !@step.completed? %>
  <div id="step_complete_btn">
    <%= button_to t("layout.learning.complete_step"),
        learning_routes_engine.complete_route_step_path(@route, @step),
        method: :post, data: { lesson_target: "markCompleteBtn", turbo_frame: "_top" } %>
  </div>
<% end %>
```

Three facts that together produce the silence:

1. It renders whenever the step is not completed — i.e. it is **pressable from section 0**,
   with the entire lesson unread.
2. It lives in the layout header, **outside** the `interactive-lesson` element. Everything
   WP-22 fixed (`_showOutstandingBlocks`, resetting `_completed`, jumping to the first
   outstanding section) lives in the lesson controller and **does not run for this button**.
   `button_to` never goes through it.
3. `button_to` sends an ordinary Turbo form submission → `Accept: text/vnd.turbo-stream.html`,
   so `steps_controller#complete` takes the `format.turbo_stream` branch and renders
   `show_outstanding_blocks.turbo_stream.erb`, which does:

   ```erb
   <%= turbo_stream.replace "step-complete-feedback" do %>
   ```

   **`step-complete-feedback` exists nowhere in the application.** Check it:
   `grep -rn "step-complete-feedback" app engines` returns only the template itself. Turbo
   cannot find the target, drops the stream silently, and nothing whatsoever happens.

Correction to what was said earlier: that template is **not dead code**. It is this button's
only live path. It has been broken since the day it was written.

What the student sees: press "Completar paso", the server refuses with 422, and the screen
does not move. No message, no jump, no shake. Press again. Nothing.

### What to do

Do not invent an empty `<div id="step-complete-feedback">` in the layout just so the
`replace` finds something. That fixes the symptom and leaves the class intact.

Pick **one** of these and justify it in the commit:

- **(a)** The header button does not render until the step is completable, and until then
  the lesson footer is the only route (it already knows how to jump to the outstanding
  section). The predicate is `@step.outstanding_blocks_for(current_user).empty?`.
- **(b)** The button stays, and `show_outstanding_blocks.turbo_stream.erb` targets an id
  that **does** exist — `#step_complete_btn`, which is already there and already has an id —
  replacing it with the button plus a notice naming how many sections are outstanding.

I prefer (b) if the notice takes the student to the outstanding section; (a) if it does not.
Do not leave the student staring at a screen that will not react.

### The test that prevents the class

The class is not "this button gives no feedback". It is **"a turbo_stream targets an id the
page never renders"**. Write the test that sweeps that whole class:

```ruby
# test/views/turbo_stream_targets_test.rb
# Every .turbo_stream.erb declares turbo_stream.replace/update "some-id".
# That id must exist in some renderable view, or the stream is a no-op.
```

Walk `**/*.turbo_stream.erb`, extract every target id from `replace`/`update`, and fail if
the id appears in no `.erb` in the app. It must fail today, naming `step-complete-feedback`.
It must pass after the fix. If the sweep finds more orphaned targets, **fix them all** —
that is exactly the point of the test.

---

## §2 — An `EventSource` to a nonexistent route retries forever

`app/javascript/controllers/tutor_chat_controller.js:126`

```js
subscribeToChannel() {
  const streamName = "tutor_chat_step_" + this.stepIdValue
  const source = new EventSource("/turbo-stream?stream=" + encodeURIComponent(streamName))
  // Turbo Stream via ActionCable is handled automatically if cable is set up
}
```

Five problems in five lines:

1. `/turbo-stream` **is not a route**. `grep -n "turbo-stream" config/routes.rb` → nothing.
2. `EventSource` **reconnects automatically** when the connection fails. A 404 does not stop
   it: the browser retries every ~3 seconds **for as long as the tab is open**.
3. `source` is a local variable. It is never stored, so `disconnect()` cannot close it. It
   survives Turbo navigation.
4. `connect()` calls it (line 23), so this happens on **every lesson page load**.
5. Nothing broadcasts to `tutor_chat_step_*` server-side
   (`grep -rn "tutor_chat_step" app engines` → only this line). Even if the route existed,
   nothing would ever arrive.

On a 2 GB / 2-core box shared with Postgres, this is real, permanent load per open tab, and
a steady stream of 404s in the log. It is the most likely contributor to the load average
that already cost us a deploy.

### What to do

Delete it. The method does nothing that works, and its own comment admits it defers to
something that is not mounted. If the tutor chat needs real streaming, the app already has
the correct pattern in six places: `turbo_stream_from` in the view plus a broadcast in the
model (`app/views/layouts/learning.html.erb:39-40` is the closest example). Building that is
a **feature**, not a fix — if you want it, it goes to the roadmap, not here.

**Owner report, 3 September: the tutor chatbot does not work at all.** Not yet diagnosed in
full, and it is not this package's job to fix it — but two known defects point straight at it:
this dead `EventSource`, and `tutor_reply_job.rb:76`, a bare `rescue` placed *after* the paid
call, so the chat hangs and the reply is not even cached. When you delete the `EventSource`,
check whether the chat comes back. If it does, say so. If it does not, **write down what you
observed and stop** — the diagnosis is its own work package.

### The test that prevents the class

The class is **"client JS requests one of our own URLs that the router does not know"**. A
system test does not catch it because the 404 is silent.

```ruby
# test/javascript/client_routes_exist_test.rb
```

Extract from `app/javascript/**/*.js` every absolute-path URL literal passed to `fetch(`,
`new EventSource(`, `new WebSocket(` or `Turbo.visit(` — the ones starting with `/` and
carrying no interpolation — and check each against
`Rails.application.routes.recognize_path`. Fail with the list of those that do not resolve.
It must fail today with `/turbo-stream`.

---

## §3 — Confetti is blocked by CSP and the fallback hides it

`config/initializers/content_security_policy.rb` **declares no `worker_src`**. Without that
directive, `worker-src` falls back to `child-src` and from there to `default_src :self`.

`canvas-confetti` creates its Web Worker from a **`blob:` URL**, and `:self` does not admit
`blob:`. The worker is blocked.

And you never see it, because `celebration_controller.js:10` swallows it:

```js
} catch (e) {
  console.warn("[celebration] canvas-confetti not available:", e)
  confettiModule = () => {} // noop fallback
}
```

A `console.warn` and an empty function. The student finishes the lesson and nothing happens
visually. The silent fallback is as much the defect as the CSP is.

### What to do

Add to the policy:

```ruby
policy.worker_src :self, :blob
```

Verify in the browser that confetti actually appears — do not trust that the directive is
written. And check whether `canvas-confetti@1.9.3` has a worker-free mode
(`confetti.create(canvas, { useWorker: false })`); if it does, use that and **do not** relax
the CSP. I would rather not open `blob:` if there is an alternative.

### The test that prevents the class

The class is **"a third-party dependency needs a CSP directive we do not declare"**. Write
an integration test that requests a lesson page, reads the `Content-Security-Policy` header,
and asserts every directive the loaded libraries need — with a comment per directive naming
**who** needs it. When someone adds a library with new requirements, that test is where it
gets documented.

---

## §4 — `data-controller="hover"` with no `hover_controller.js`

`app/views/profiles/show.html.erb:147`:

```erb
data-controller="hover"
data-hover-translate-value="-2"
data-hover-border-color-value="rgba(176,152,72,0.45)"
```

There is no `app/javascript/controllers/hover_controller.js`. Stimulus fails to resolve on
every profile visit and the "Para repasar" card animation never happens. The two
`data-hover-*-value` attributes describe exactly the controller that is missing.

### What to do

Either write the controller (~20 lines: `mouseenter` applies `translateY(translateValue)`
and `borderColor`, `mouseleave` removes them, respecting `prefers-reduced-motion`), or drop
the three attributes and do the effect in CSS with `:hover`. **I prefer CSS** — a purely
decorative hover does not need JavaScript, and it is the option that cannot break this way
again.

### The test that prevents the class

The census is already written; turn it into a test. The class is **"a view references a
Stimulus controller that does not exist"**:

```ruby
# test/javascript/stimulus_controllers_resolve_test.rb
```

Walk the views, extract every **literal** `data-controller="…"` (skip the ones containing
`<%`, like `_stars.html.erb:9`, which is a false positive), and assert the matching
`*_controller.js` exists. It must fail today with `hover` alone. Sweep already done: 58
controllers referenced, 60 files present, 1 real gap.

---

## §5 — 12 dead inline handlers under CSP

`script_src` is `:self, "https://cdn.jsdelivr.net"` — **without `'unsafe-inline'`**. So every
inline event handler in HTML is blocked. There are 12, across 5 files:

```
engines/learning_routes_engine/app/views/learning_routes_engine/
  steps/lesson_sections/_visual.html.erb:48                    onmouseover
  steps/lesson_sections/_section_audio_player.html.erb:23,24   onmouseover, onmouseout
  steps/_notes.html.erb:13,14,26,27                            onfocus, onblur ×2
  routes/_step_item.html.erb:4,5                               onmouseover, onmouseout
  routes/show.html.erb:161,162                                 onfocus, onblur
```

All cosmetic (hover and focus mutating inline `style`). None breaks a function. But each is
a CSP violation in the student's console, and that noise is why nobody looks at the console
when something that matters fails there — which is precisely how §2, §3 and §4 went weeks
unseen.

### What to do

Move them to CSS (`:hover`, `:focus-visible`). None of the 12 needs JavaScript.
**Do not add `'unsafe-inline'` to `script_src`.** That turns twelve cosmetic defects into an
XSS hole in an application that renders LLM-generated markdown.

### The test that prevents the class

```ruby
# test/views/no_inline_event_handlers_test.rb
```

Sweep all `.erb` for `\son[a-z]+=` and fail with the list. It must reach zero and stay zero.

---

## §6 — Mermaid — SOLVED, see WP-24 §2. Do not investigate here.

The cause is `parse_heading_scenario` in `lesson_section_parser.rb:399-418`: the option loop
has no terminator, so the last scenario option's `consequence` swallows every remaining line
of the body — including the mermaid fence — and joins them with `" "`, destroying the
newlines mermaid needs. `scenario_controller.js:30` then prints that string with
`textContent`, so the fence is shown as literal characters. The diagram source never reaches
`MarkdownRenderer` at all.

Mermaid itself was never broken. Fix lives in WP-24 §2, which ships before this package.

One thing that still belongs here: the `_visual.html.erb` branch using
`section[:mermaid] || section[:diagram]` is **dead** — `lesson_section_parser.rb` only ever
sets `contains_diagram`, never those keys. Delete the branch or populate it, but do not leave
it lying.

---

## Execution order

1. §1 — it is the one every student hits on every step.
2. §2 — it is the one costing the server CPU right now.
3. §3, §4, §5 — any order; all three are sweeps and all three ship a test that closes the
   class.
§6 is closed by WP-24 §2; only the dead `_visual.html.erb` branch remains, and it
   rides along with whichever sweep you do last.

## Verification before handing off

- `env -u RAILS_MASTER_KEY bin/rails test` — the main suite, three runs, and report the
  **intersection**, not the best one.
- The browser suite, same treatment.
- All five new tests, each demonstrated failing before the fix. Paste the failure output in
  the report. A test never seen red has proven nothing.
- State explicitly what you did **not** do. WP-22 did that, and it is why we could trust it.

## What is NOT in this work package

WP-20 (free tier), Task 8 (`PaidModuleGenerationJob`), Task 9 (refunds), bot protection, the
72 sites missing `includes`, the English landing page. All of that is on the roadmap waiting
its turn. If you find something new, **write it down, do not fix it.**
