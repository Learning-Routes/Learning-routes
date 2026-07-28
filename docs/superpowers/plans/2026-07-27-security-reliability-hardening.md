# Learning Routes Security and Reliability Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove known vulnerable dependencies and enforce a tested filesystem boundary for all locally stored audio responses.

**Architecture:** A new `ContentEngine::AudioStorage` service owns URL-to-path conversion, containment, real-path validation, file quality checks, and safe deletion. Audio controllers and the section-audio cache delegate to this service, while focused tests exercise traversal, sibling-prefix, symlink, authorization, cache-eviction, and valid-delivery behavior.

**Tech Stack:** Ruby 3.3.8, Rails 8.1, Minitest, PostgreSQL, Pathname, Bundler, Brakeman, Bundler Audit, RuboCop

## Global Constraints

- No new runtime dependency for filesystem validation.
- Audio roots are fixed constants derived from `Rails.root`; callers cannot supply arbitrary roots.
- Existing authorization semantics remain unchanged.
- Dependency updates are limited to `bcrypt`, `mcp`, `msgpack`, and resolution changes they strictly require.
- Final versions must satisfy `bcrypt >= 3.1.22`, `mcp >= 0.9.2`, and `msgpack >= 1.8.2`.
- Brakeman warnings are fixed in code and tests, never ignored.
- Do not modify the user's unrelated `.gitignore` or `config/credentials/` work.

---

## File Structure

- Create `engines/content_engine/app/services/content_engine/audio_storage.rb`: the only stored-audio URL to filesystem-path boundary.
- Create `engines/content_engine/test/services/content_engine/audio_storage_test.rb`: unit coverage for containment, validation, symlinks, and deletion.
- Create `engines/content_engine/test/controllers/content_engine/audio_controller_test.rb`: ownership and response behavior for full-lesson audio.
- Create `engines/content_engine/test/controllers/content_engine/section_audio_controller_test.rb`: ownership, response, eviction, and non-deletion behavior for section audio.
- Modify `engines/content_engine/app/controllers/content_engine/audio_controller.rb`: delegate path resolution to `AudioStorage`.
- Modify `engines/content_engine/app/controllers/content_engine/section_audio_controller.rb`: delegate resolution and deletion to `AudioStorage`.
- Modify `engines/content_engine/app/services/content_engine/section_audio_generator.rb`: validate cache hits through `AudioStorage`.
- Modify `Gemfile`: require the safe bcrypt patch floor.
- Modify `Gemfile.lock`: lock patched bcrypt, MCP, and MessagePack releases.
- Modify `.rubocop.yml`: align the array-bracket spacing cop with the established repository convention.
- Modify only RuboCop-reported alignment files after the configuration correction.

### Task 1: Build the Audio Storage Boundary

**Files:**

- Create: `engines/content_engine/test/services/content_engine/audio_storage_test.rb`
- Create: `engines/content_engine/app/services/content_engine/audio_storage.rb`

**Interfaces:**

- Produces: `ContentEngine::AudioStorage.resolve(stored_url, scope:, minimum_size: 1) -> Pathname | nil`
- Produces: `ContentEngine::AudioStorage.delete(stored_url, scope:, minimum_size: 1) -> true | false`
- Valid scopes: `:audio`, rooted at `Rails.root/storage/audio`; `:sections`, rooted at `Rails.root/storage/audio/sections`.

- [ ] **Step 1: Write failing resolution tests**

Create tests that make explicit MP3 fixtures below the selected root and assert:

```ruby
assert_equal valid_path.realpath,
  ContentEngine::AudioStorage.resolve("/storage/audio/valid.mp3", scope: :audio)

assert_nil ContentEngine::AudioStorage.resolve("/storage/audio/../secret.mp3", scope: :audio)
assert_nil ContentEngine::AudioStorage.resolve("/storage/audio-escape/secret.mp3", scope: :audio)
assert_nil ContentEngine::AudioStorage.resolve("/storage/audio/valid.txt", scope: :audio)
assert_nil ContentEngine::AudioStorage.resolve("/storage/audio/missing.mp3", scope: :audio)
assert_nil ContentEngine::AudioStorage.resolve("/storage/audio", scope: :audio)
assert_nil ContentEngine::AudioStorage.resolve("/storage/audio/tiny.mp3", scope: :audio, minimum_size: 1_024)
```

Add a symlink test guarded with `skip` only when the platform raises
`NotImplementedError` or `Errno::EACCES`; link from inside the audio root to an
MP3 outside it and assert resolution returns `nil`.

- [ ] **Step 2: Run the service tests and confirm the expected failure**

Run:

```bash
bin/rails test engines/content_engine/test/services/content_engine/audio_storage_test.rb
```

Expected: failure with `uninitialized constant ContentEngine::AudioStorage`.

- [ ] **Step 3: Implement minimal safe resolution**

Implement:

```ruby
module ContentEngine
  class AudioStorage
    ROOTS = {
      audio: -> { Rails.root.join("storage", "audio") },
      sections: -> { Rails.root.join("storage", "audio", "sections") }
    }.freeze

    class << self
      def resolve(stored_url, scope:, minimum_size: 1)
        root = ROOTS.fetch(scope).call.expand_path
        raw = stored_url.to_s
        return if raw.blank? || raw.include?("\0")

        candidate = Rails.root.join(raw.delete_prefix("/")).expand_path
        relative = candidate.relative_path_from(root)
        return if relative.each_filename.any? { |part| part == ".." }
        return unless candidate.extname.downcase == ".mp3"
        return unless candidate.file? && candidate.size >= minimum_size

        real_root = root.realpath
        real_candidate = candidate.realpath
        real_relative = real_candidate.relative_path_from(real_root)
        return if real_relative.each_filename.any? { |part| part == ".." }

        real_candidate
      rescue KeyError, ArgumentError, Errno::ENOENT, Errno::EACCES, Errno::ELOOP
        nil
      end

      def delete(stored_url, scope:, minimum_size: 1)
        path = resolve(stored_url, scope: scope, minimum_size: minimum_size)
        return false unless path

        path.delete
        true
      rescue Errno::ENOENT, Errno::EACCES
        false
      end
    end
  end
end
```

Keep `ROOTS` private to the class if tests do not require it. Do not log rejected
user-derived paths.

- [ ] **Step 4: Add and pass safe-deletion tests**

Assert a validated MP3 is deleted and an outside/sibling path is not deleted.
Run the focused test command again and expect all tests to pass.

- [ ] **Step 5: Commit the boundary**

```bash
git add engines/content_engine/app/services/content_engine/audio_storage.rb \
  engines/content_engine/test/services/content_engine/audio_storage_test.rb
git commit -m "feat(content): add safe audio storage boundary"
```

### Task 2: Integrate Full-Lesson Audio Delivery

**Files:**

- Create: `engines/content_engine/test/controllers/content_engine/audio_controller_test.rb`
- Modify: `engines/content_engine/app/controllers/content_engine/audio_controller.rb`

**Interfaces:**

- Consumes: `AudioStorage.resolve(url, scope: :audio)`.
- Existing route: `GET /content/audio/:id`.

- [ ] **Step 1: Write failing request tests**

Build a user, learning profile, route, step, and ready `AiContent`. Cover:

```ruby
get content_engine.audio_path(step)
assert_response :success
assert_equal "audio/mpeg", response.media_type
```

Also sign in as another user and expect `403`; store an outside or sibling-prefix
URL and expect `404`; store a missing URL and expect `404`.

- [ ] **Step 2: Run the controller tests and verify the unsafe-path case fails**

Run:

```bash
bin/rails test engines/content_engine/test/controllers/content_engine/audio_controller_test.rb
```

Expected: the valid response may pass, while the crafted sibling-prefix case
demonstrates that the controller still owns weaker path logic.

- [ ] **Step 3: Delegate resolution to AudioStorage**

Replace controller path construction with:

```ruby
file_path = AudioStorage.resolve(content.audio_url, scope: :audio)
return head(:not_found) unless file_path

send_file file_path, type: "audio/mpeg", disposition: :inline
```

Retain the existing authorization callback and return after forbidden responses.

- [ ] **Step 4: Run focused and service tests**

```bash
bin/rails test \
  engines/content_engine/test/services/content_engine/audio_storage_test.rb \
  engines/content_engine/test/controllers/content_engine/audio_controller_test.rb
```

Expected: all pass.

- [ ] **Step 5: Commit full-lesson integration**

```bash
git add engines/content_engine/app/controllers/content_engine/audio_controller.rb \
  engines/content_engine/test/controllers/content_engine/audio_controller_test.rb
git commit -m "fix(content): constrain lesson audio delivery"
```

### Task 3: Integrate Section Audio and Cache Validation

**Files:**

- Create: `engines/content_engine/test/controllers/content_engine/section_audio_controller_test.rb`
- Modify: `engines/content_engine/app/controllers/content_engine/section_audio_controller.rb`
- Modify: `engines/content_engine/app/services/content_engine/section_audio_generator.rb`

**Interfaces:**

- Consumes: `AudioStorage.resolve(url, scope: :sections, minimum_size: 1_024)`.
- Consumes: `AudioStorage.delete(url, scope: :sections, minimum_size: 1)`.
- Existing route: `GET /content/section_audio/:step_id/:section_index/show`.

- [ ] **Step 1: Write failing section-audio tests**

Stub or seed `SectionAudioGenerator.cached` and cover:

- a valid section MP3 larger than 1 KiB is served;
- another user's request returns `403`;
- a traversal or sibling-prefix cached URL returns `404`;
- an invalid cache entry is deleted from `Rails.cache`;
- a path outside the section root remains on disk.

Use an explicit cache key from
`SectionAudioGenerator.cache_key(step.id, section_index)`.

- [ ] **Step 2: Run the section controller tests and confirm failure**

```bash
bin/rails test engines/content_engine/test/controllers/content_engine/section_audio_controller_test.rb
```

Expected: crafted containment/cache assertions fail against the current
controller-owned implementation.

- [ ] **Step 3: Integrate the shared boundary**

Use:

```ruby
file_path = AudioStorage.resolve(
  cached[:audio_url],
  scope: :sections,
  minimum_size: 1_024
)
```

When resolution fails, delete the cache key and call `AudioStorage.delete` with
the same stored URL and `minimum_size: 1`. This permits cleanup of a corrupt
server-owned MP3 while preserving the boundary and rejecting outside paths.

Update `SectionAudioGenerator.cached` to validate cache hits through the same
resolver before returning them.

- [ ] **Step 4: Run section, service, and existing media tests**

```bash
bin/rails test \
  engines/content_engine/test/services/content_engine/audio_storage_test.rb \
  engines/content_engine/test/controllers/content_engine/section_audio_controller_test.rb \
  test/jobs/content_engine/media_prefetch_job_test.rb
```

Expected: all pass.

- [ ] **Step 5: Commit section integration**

```bash
git add engines/content_engine/app/controllers/content_engine/section_audio_controller.rb \
  engines/content_engine/app/services/content_engine/section_audio_generator.rb \
  engines/content_engine/test/controllers/content_engine/section_audio_controller_test.rb
git commit -m "fix(content): harden section audio cache paths"
```

### Task 4: Patch Vulnerable Dependencies Conservatively

**Files:**

- Modify: `Gemfile`
- Modify: `Gemfile.lock`

**Interfaces:**

- Produces safe dependency floors recorded in the lockfile.

- [ ] **Step 1: Record the failing audit**

Run:

```bash
bundle exec bundler-audit check
```

Expected: reports vulnerable `bcrypt 3.1.21`, `mcp 0.8.0`, and `msgpack 1.8.0`.

- [ ] **Step 2: Raise the direct bcrypt floor**

Change:

```ruby
gem "bcrypt", "~> 3.1.22"
```

Apply the same compatible requirement in
`engines/core/core.gemspec` if Bundler otherwise permits the vulnerable patch.

- [ ] **Step 3: Resolve only patched dependencies**

Run:

```bash
bundle update bcrypt mcp msgpack --patch --strict --conservative
```

If the installed Bundler rejects the option combination, use:

```bash
bundle update bcrypt mcp msgpack --patch --strict
```

Inspect `git diff -- Gemfile Gemfile.lock` and stop if unrelated dependencies
move without a resolver requirement.

- [ ] **Step 4: Verify versions and audits**

```bash
bundle exec ruby -e 'puts %w[bcrypt mcp msgpack].map { |name| s = Gem.loaded_specs[name] || Gem::Specification.find_by_name(name); "#{name}=#{s.version}" }'
bundle exec bundler-audit check
bin/rails test
```

Expected: safe minimum versions, no Ruby dependency advisories, and the full test
suite passes.

- [ ] **Step 5: Commit dependency remediation**

```bash
git add Gemfile Gemfile.lock engines/core/core.gemspec
git commit -m "chore(deps): patch audited Ruby vulnerabilities"
```

### Task 5: Restore Static-Analysis Signal

**Files:**

- Modify: `.rubocop.yml`
- Potentially modify after targeted safe autocorrection:
  `app/controllers/landing_controller.rb`,
  `app/helpers/application_helper.rb`,
  `db/seeds/content_delivery_seed.rb`,
  `engines/ai_orchestrator/app/services/ai_orchestrator/response_parser.rb`,
  `engines/assessments/app/controllers/assessments/answers_controller.rb`,
  `engines/assessments/app/controllers/assessments/assessments_controller.rb`,
  `engines/assessments/app/controllers/assessments/results_controller.rb`,
  `engines/content_engine/app/controllers/content_engine/audio_controller.rb`,
  `engines/content_engine/app/controllers/content_engine/exercises_controller.rb`,
  `engines/content_engine/app/controllers/content_engine/lessons_controller.rb`,
  `engines/content_engine/app/services/content_engine/audio_generator.rb`,
  `engines/content_engine/app/services/content_engine/lesson_assistant_agent.rb`,
  `engines/core/app/controllers/core/application_controller.rb`,
  `engines/core/app/controllers/core/onboarding_controller.rb`,
  `engines/core/app/controllers/core/passwords_controller.rb`,
  `engines/core/app/controllers/core/registrations_controller.rb`,
  `engines/core/app/controllers/core/sessions_controller.rb`,
  `engines/learning_routes_engine/app/controllers/learning_routes_engine/routes_controller.rb`,
  `engines/learning_routes_engine/app/controllers/learning_routes_engine/step_quizzes_controller.rb`,
  `engines/learning_routes_engine/app/controllers/learning_routes_engine/steps_controller.rb`,
  `engines/learning_routes_engine/app/jobs/learning_routes_engine/gap_analysis_job.rb`,
  `engines/learning_routes_engine/app/services/learning_routes_engine/gap_analyzer.rb`,
  `engines/learning_routes_engine/app/services/learning_routes_engine/spaced_repetition.rb`,
  `engines/learning_routes_engine/test/services/learning_routes_engine/adaptive_difficulty_test.rb`.

**Interfaces:**

- Produces a clean RuboCop run without a generated TODO file or broad disable.

- [ ] **Step 1: Configure the established array style**

Add:

```yaml
Layout/SpaceInsideArrayLiteralBrackets:
  EnforcedStyle: no_space
```

- [ ] **Step 2: Re-run RuboCop and capture the remaining offenses**

```bash
RUBOCOP_CACHE_ROOT=tmp/rubocop bin/rubocop --format simple
```

Expected: the large paired array-spacing offense set disappears; remaining
offenses identify genuine alignment or other configured style issues.

- [ ] **Step 3: Correct only remaining safe offenses**

Use targeted autocorrection on explicitly reported files:

```bash
RUBOCOP_CACHE_ROOT=tmp/rubocop bin/rubocop -a \
  engines/learning_routes_engine/app/jobs/learning_routes_engine/gap_analysis_job.rb \
  engines/learning_routes_engine/app/services/learning_routes_engine/gap_analyzer.rb \
  engines/learning_routes_engine/app/services/learning_routes_engine/spaced_repetition.rb \
  engines/learning_routes_engine/test/services/learning_routes_engine/adaptive_difficulty_test.rb
```

For the remaining files listed in this task, apply `-a` only when the fresh
RuboCop output still names that exact file. Review every formatting diff. Do not
run repository-wide `-A`.

- [ ] **Step 4: Run focused tests and RuboCop**

```bash
RUBOCOP_CACHE_ROOT=tmp/rubocop bin/rubocop
bin/rails test
```

Expected: both commands exit successfully.

- [ ] **Step 5: Commit lint alignment**

```bash
git add .rubocop.yml
git add -u app db/seeds engines
git commit -m "style: align lint rules with project convention"
```

### Task 6: Full Verification and Review

**Files:**

- Modify only if verification exposes a regression directly caused by Tasks 1–5.

**Interfaces:**

- Confirms all design requirements and security gates.

- [ ] **Step 1: Run the full verification matrix**

```bash
bin/rails test
bundle exec brakeman --no-pager
bundle exec bundler-audit check
bin/importmap audit
RUBOCOP_CACHE_ROOT=tmp/rubocop bin/rubocop
RAILS_ENV=test bin/rails zeitwerk:check
```

Expected: all commands exit zero. The optional local OpenSlide warning may still
appear and is not an application failure.

- [ ] **Step 2: Verify the requirements against the final diff**

Confirm:

- no `start_with?(audio_root)` containment remains;
- both audio controllers call `AudioStorage`;
- section cache validation calls `AudioStorage`;
- no Brakeman ignore entry was added;
- no unrelated dependency or user-owned file changed;
- tests cover traversal, sibling-prefix, symlink, authorization, eviction, and
  safe deletion.

- [ ] **Step 3: Inspect repository state**

```bash
git status --short
git diff --check
git log --oneline -8
```

Separate the pre-existing `.gitignore` and `config/credentials/` changes from the
implementation report.

- [ ] **Step 4: Request code review**

Review the implementation against
`docs/superpowers/specs/2026-07-27-security-reliability-hardening-design.md` and
this plan. Fix every critical or important finding, then rerun the full
verification matrix.

- [ ] **Step 5: Prepare the handoff**

Report modified files, dependency versions, exact verification results, remaining
environment warnings, and any follow-up recommendations. Do not push or deploy
without a separate user request.
