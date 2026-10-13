# WP-26 — Finish the exam and the voice response

Branch: `wp26-exam-and-voice`, off `wp25-exam-wont-start`.

WP-25 shipped and **it worked** — it changed both failures into different, diagnosable ones,
and the voice recorder now names its own cause on screen, in Spanish, exactly as designed.
That is the fix doing its job. But neither feature works yet, and the console from the live
site now shows why. All four findings below are grounded in that console plus the code.

**Read this first, because it is the same mistake twice:** WP-25 §1's brief (mine) said option
(b) meant "the POST is answered with the full HTML page." That is not a thing Turbo allows. The
test I specified asserted the response was `2XX success` — which a 200 HTML render passes. So
the brief was wrong *and* the test I asked for could not have caught it. §1 below fixes both.

---

## §1 — The exam: the 406 is gone, replaced by Turbo's next refusal

Live console, on pressing "Iniciar examen":

```
Error: Form responses must redirect to another location
  formSubmissionErrored     @ turbo.es2017-esm.js:4906
  requestSucceededWithResponse @ turbo.es2017-esm.js:1225
  submitForm                @ turbo.es2017-esm.js:4827
```

No 406 anywhere in that trace — WP-25 §1 closed that correctly. This is Turbo's *other* rule:
a form submission must end in a **redirect** or a **turbo_stream**. A 200 with an HTML body is
refused, and Turbo throws it away without navigating. The student presses the button and the
page does not move — same symptom, different mechanism.

### Why this was structurally inevitable

`engines/assessments/config/routes.rb` has **no GET route that renders the exam**:

```ruby
resources :assessments, only: [:show] do
  member { post :start }
end
```

`show` is the intro card (4 preguntas / 80% / Iniciar examen). `start.html.erb` — a full page
with its own `content_for(:title)` — is rendered **from the POST**. So "start the exam" is a
POST that renders a page, which Turbo forbids, and which also means a refresh re-POSTs and
re-runs `AssessmentResult.create!` and the `StudySession` upsert.

### The fix

Give the exam a GET, and make `start` do what a POST should do — mutate, then redirect:

1. Add `get :take` to the assessment member routes.
2. Move `start.html.erb` to `take.html.erb`. It is already a full page; nothing inside changes.
3. `take` loads the in-progress `AssessmentResult` and the questions and renders. It must
   handle "no result yet" by redirecting back to `show` rather than creating one — a GET does
   not create.
4. `start` keeps the creation, the `route_step` status change and the `StudySession`, then:
   `redirect_to take_assessment_path(@assessment), status: :see_other`.
   `:see_other` (303) is required — Turbo needs it to convert the POST into a GET.

Do **not** reach for `form: { data: { turbo: false } }`. It makes the button work today and
leaves a POST that renders a page, so refresh and back-button keep creating results. Fix the
shape, not the symptom.

### The test that prevents the class — and replaces the one that failed to catch this

The old assertion was `assert_response :success`. A 200 HTML render passes it while the button
does nothing, which is precisely the client/server split this project keeps hitting.

The class is **"a form the student presses does not navigate"**. It cannot be asserted on the
server's status code. It has to be a system test:

```ruby
# test/system/exam_start_test.rb
```

Click "Iniciar examen" in a real browser and assert the page actually changed — the exam's
first question is visible and `page.current_path` is the exam's path. That fails today with
the button pressed and nothing happening.

Then sweep: any other `button_to`/`form_with` whose action renders instead of redirecting has
the same defect. Report what you find.

---

## §2 — The voice response: a 415 the client causes on itself

```
POST https://learningroutes.com/assessments/voice_responses?route_step_id=3700fee4-…
415 (Unsupported Media Type)
```

`voice_responses_controller.rb:27`:

```ruby
ALLOWED_CONTENT_TYPES = %w[audio/webm audio/ogg audio/mp4 audio/mpeg].freeze
...
return head(:unsupported_media_type) if audio.respond_to?(:content_type) &&
  !ALLOWED_CONTENT_TYPES.include?(audio.content_type)
```

`voice_recorder_controller.js:298`:

```js
_supportedMimeType() {
  const types = ["audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus", "audio/mp4"]
  for (const type of types) { if (MediaRecorder.isTypeSupported(type)) return type }
  return "audio/webm"
}
```

and `:57`: `new Blob(this.audioChunks, { type: this.mediaRecorder.mimeType })`.

Chrome supports the **first** candidate, so every recording is uploaded as
`audio/webm;codecs=opus`. The server compares with `include?` — exact string equality — against
a list that has no codec parameters. `"audio/webm;codecs=opus"` is not `"audio/webm"`.

**This has always refused every recording made in Chrome.** Not a policy question, not the job,
not `/cable` — none of the three candidates WP-25 §2 listed. The client's own first-choice
format is the one the server rejects, and the two lists were written to disagree.

### The fix

Compare the media type without its parameters:

```ruby
media_type = audio.content_type.to_s.split(";").first.to_s.strip.downcase
return head(:unsupported_media_type) unless ALLOWED_CONTENT_TYPES.include?(media_type)
```

Do not add `"audio/webm;codecs=opus"` to the list. That fixes one browser and leaves the next
codec string to fail the same way — Safari sends `audio/mp4`, Firefox `audio/ogg;codecs=opus`.

### The test that prevents the class

The class is **"the client and the server keep two lists of the same vocabulary and nothing
keeps them in sync"** — the fifth instance of this shape in this codebase (the block-type
vocabulary was the first four).

```ruby
# test/controllers/assessments/voice_upload_formats_test.rb
```

Take the candidate list from `_supportedMimeType` as the source of truth — read it, or mirror
it in a constant the JS and the test both derive from — and POST an upload with **each** one,
asserting none returns 415. It must fail today on `audio/webm;codecs=opus`.

---

## §3 — Preview playback is blocked by CSP: `media-src` is not set

```
Loading media from 'blob:https://learningroutes.com/1e7ac52c-…' violates the following
Content Security Policy directive: "default-src 'self'". Note that 'media-src' was not
explicitly set, so 'default-src' is used as a fallback. The action has been blocked.
[VoiceRecorder] Preview playback failed: NotSupportedError: Failed to load because no
supported source was found.
```

`config/initializers/content_security_policy.rb` declares `default_src`, `img_src`, `font_src`,
`script_src`, `style_src`, `connect_src`, `frame_src` — and **no `media_src`**. So `<audio>`
falls back to `default_src :self`, and the `blob:` URL of the student's own recording is
refused. They cannot listen back before sending.

This is the exact sibling of WP-23 §3 (confetti's worker blocked because `worker_src` is
unset). Same root, two features.

### The fix

```ruby
policy.media_src :self, :blob
```

`:self` is enough for lesson audio — `section_audio_generator.rb:67` serves it from
`/storage/audio/sections/...`, same origin. `:blob` is what the recorder's preview needs.
Verify in the browser that preview playback works; do not trust the directive being written.

Fold WP-23 §3's `worker_src` in here too if you are editing this file — one CSP change, both
directives, and note in the commit that WP-23 §3 is then already done.

### The test that prevents the class

Write the CSP test WP-23 §3 asks for, now, since you are here: request a lesson page, read the
`Content-Security-Policy` header, and assert each directive the loaded features need, with a
comment per directive naming **who** needs it and why. `media-src blob:` — the voice recorder's
preview. `worker-src blob:` — canvas-confetti. That comment is the whole point: it is where the
next person learns the requirement exists.

---

## §4 — Still open, unchanged

The inline-handler CSP violations are still all over that console. That is WP-23 §5 and it is
correctly not in this package. Recorded so nobody re-diagnoses it.

---

## Order

1. §2 — one line, and it unblocks a feature that has never once worked.
2. §3 — one line, same file, and it finishes WP-23 §3 for free.
3. §1 — the real work: a route, a moved template, a redirect.

## Verification

- `env -u RAILS_MASTER_KEY bin/rails test`, three runs, report the intersection.
- Browser suite, same.
- Three new tests, each demonstrated red first, failure output pasted.
- **`main` is behind production again.** Its tip is `99f6279` (WP-24); WP-25 was deployed from
  its branch. Merge `wp25-exam-wont-start` before branching, or say plainly that you did not.
- Say what you did not do.

## Not in this package

WP-24 §2 (the scenario parser with no terminator — still the highest-value bug left after
these), WP-23, WP-20, Task 8, Task 9. And `wp7-true-costs`, which has been unmerged since
August and needs a decision from the owner, not from an agent.
