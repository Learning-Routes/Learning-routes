# frozen_string_literal: true

# STEP 44 §1. Captures the behaviour the new platform keeps, as golden JSON fixtures
# it is ported against: one file per unit, written to ENV["OUT"].
#
#   bin/rails characterize:all OUT=tmp/characterization
#
# Every unit is read-only (a transaction that always rolls back, no network, no job
# enqueued), runs at a frozen time, and writes content and numbers only: no ids,
# emails, names or tokens. Keys and cases are sorted, so a second run is
# byte-identical. test/tasks/characterize_test.rb checks the shape.
require "active_support/testing/time_helpers"

module Characterization
  extend ActiveSupport::Testing::TimeHelpers

  FROZEN_AT = Time.utc(2026, 10, 26, 12)

  # unit => where its Ruby lives, resolved when the task runs.
  UNITS = {
    "block_registry" => -> { Object.const_source_location("ContentEngine::LessonBlocks::BLOCKS") },
    "block_grader" => -> { LearningRoutesEngine::BlockGrader.instance_method(:call).source_location },
    "gating" => -> { Object.const_source_location("LearningRoutesEngine::BlockGrader::GATING_TYPES") },
    "fsrs" => -> { LearningRoutesEngine::SpacedRepetition.instance_method(:review).source_location },
    "attempt_rating" => -> { LearningRoutesEngine::BlockAttempt.instance_method(:fsrs_rating).source_location },
    "lesson_parser" => -> { ContentEngine::LessonSectionParser.instance_method(:parse).source_location },
    "cost_estimate" => -> { AiOrchestrator::CostTracker.method(:estimate_microcents).source_location },
    "spend_limits" => -> { AiOrchestrator::SpendGuard.instance_method(:call).source_location }
  }.freeze

  module_function

  # Runs one unit inside the guards and writes its file.
  def capture(unit, source)
    cases = nil
    with_guards { cases = yield }
    write(unit, source, cases)
  end

  def with_guards
    jobs = ActiveJob::QueueAdapters::TestAdapter.new
    previous_adapter = ActiveJob::Base.queue_adapter
    ActiveJob::Base.queue_adapter = jobs
    travel_to(FROZEN_AT)
    ActiveRecord::Base.transaction(requires_new: true) do
      yield
      raise ActiveRecord::Rollback
    end
    raise "characterize enqueued #{jobs.enqueued_jobs.size} job(s)" if jobs.enqueued_jobs.any?
  ensure
    travel_back
    ActiveJob::Base.queue_adapter = previous_adapter
  end

  def write(unit, source, cases)
    out = Pathname(ENV.fetch("OUT", Rails.root.join("tmp/characterization").to_s))
    FileUtils.mkdir_p(out)
    unique = cases.map { |c| deep_sort(c.as_json) }.uniq { |c| JSON.generate(c["input"]) }
    payload = {
      "unit" => unit,
      "source" => source,
      "captured_at" => FROZEN_AT.iso8601,
      "cases" => unique.sort_by { |c| JSON.generate(c["input"]) }
    }
    File.write(out.join("#{unit}.json"), "#{JSON.pretty_generate(payload)}\n")
    puts "[characterize] #{unit}: #{unique.size} cases"
  end

  # Hash keys sorted at every depth. Array order is behaviour (section order, review
  # order), so arrays keep it; `write` sorts the cases themselves.
  def deep_sort(value)
    case value
    when Hash then value.keys.sort.to_h { |k| [k, deep_sort(value[k])] }
    when Array then value.map { |v| deep_sort(v) }
    else value
    end
  end

  # "path:line" of a method or constant, relative to the app root.
  def source(location)
    path, line = location
    "#{Pathname(path).relative_path_from(Rails.root)}:#{line}"
  end

  def block_registry
    blocks = ContentEngine::LessonBlocks
    authored = blocks.authored_types
    probes = blocks.types + %w[tap_pairs Concept CHECK] + [""]
    [{
      input: "ContentEngine::LessonBlocks",
      output: {
        blocks: blocks::BLOCKS,
        types: blocks.types.sort,
        fence_types: blocks.fence_types.sort,
        heading_map: blocks.heading_map.transform_values(&:to_s),
        authored_types: authored.sort,
        system_types: (blocks.types - authored).sort,
        partial_types: blocks.partial_types.sort,
        default_titles: I18n.available_locales.sort.to_h do |locale|
          [locale, I18n.with_locale(locale) { blocks.types.to_h { |t| [t, blocks.default_title(t)] } }]
        end,
        known: probes.to_h { |t| [t, blocks.known?(t)] }
      }
    }]
  end

  # Every section the dev database recorded, under a spread of submissions.
  def recorded_sections
    LearningRoutesEngine::RouteStep.where("metadata ? 'parsed_sections'").order(:id)
      .flat_map { |step| Array(step.metadata["parsed_sections"]) }.select { |s| s.is_a?(Hash) }
  end

  # `origin` tells the platform which sections are real ("recorded") and which
  # were built here to probe a rule ("edge", "normalize").
  def block_grader
    every_type = ContentEngine::LessonBlocks.types.map { |type| { "type" => type } }
    sections = recorded_sections.map { |s| [s, "recorded"] } + (every_type + GRADER_EDGE_SECTIONS).map { |s| [s, "edge"] }
    cases = sections.flat_map do |section, origin|
      submissions_for(section).map { |payload| grade(section, payload, origin) }
    end
    cases + NORMALIZE_PROBES.flat_map do |expected, answers|
      answers.map { |answer| grade({ "type" => "fill_blank", "blanks" => [expected] }, { "answers" => [answer] }, "normalize") }
    end
  end

  def grade(section, payload, origin)
    grader = LearningRoutesEngine::BlockGrader
    {
      input: { origin: origin, section: section, payload: payload },
      output: {
        call: grader.new(section: section, payload: payload).call.to_h,
        answerable: grader.answerable?(section)
      }
    }
  end

  # Per type: graded, a gate before the step completes, or engagement only (the
  # default for any type not graded, so a new type can never trap a student).
  def gating
    grader = LearningRoutesEngine::BlockGrader
    (ContentEngine::LessonBlocks.types + ["tap_pairs", ""]).map do |type|
      gradable = grader.gradable?(type)
      { input: type, output: { gradable: gradable, gating: grader.gating?(type), engagement_only: !gradable } }
    end
  end

  # The card attributes SpacedRepetition reads; a RouteStep carries them today.
  FsrsCard = Struct.new(:fsrs_state, :fsrs_reps, :fsrs_lapses, :fsrs_stability, :fsrs_difficulty,
                        :fsrs_last_review_at, keyword_init: true)

  # Cards a sequence starts from: nil is a card never reviewed. `days_ago` places
  # the last review before the frozen time.
  FSRS_STARTS = [
    nil,
    { "fsrs_state" => "fsrs_new", "fsrs_reps" => 0 },
    { "fsrs_state" => "fsrs_review", "fsrs_reps" => 0, "fsrs_stability" => 5.0, "fsrs_difficulty" => 5.0, "days_ago" => 3 },
    { "fsrs_state" => "fsrs_learning", "fsrs_reps" => 1, "fsrs_lapses" => 0, "fsrs_stability" => 2.4,
      "fsrs_difficulty" => 4.93, "days_ago" => 2 },
    { "fsrs_state" => "fsrs_review", "fsrs_reps" => 3, "fsrs_lapses" => 0, "fsrs_stability" => 10.0,
      "fsrs_difficulty" => 5.0, "days_ago" => 7 },
    { "fsrs_state" => "fsrs_relearning", "fsrs_reps" => 5, "fsrs_lapses" => 2, "fsrs_stability" => 0.4,
      "fsrs_difficulty" => 8.5, "days_ago" => 1 },
    { "fsrs_state" => "fsrs_review", "fsrs_reps" => 12, "fsrs_lapses" => 1, "fsrs_stability" => 120.0,
      "fsrs_difficulty" => 2.0, "days_ago" => 90 },
    { "fsrs_state" => "fsrs_review", "fsrs_reps" => 2, "fsrs_lapses" => 0, "fsrs_stability" => 0.0,
      "fsrs_difficulty" => 10.0, "days_ago" => nil }
  ].freeze
  FSRS_ELAPSED_DAYS = [0, 0.01, 0.5, 1, 2, 3, 5, 7, 10, 14, 21, 30, 45, 60, 90, 180, 365, 400].freeze
  # 0 and 5 are out of range: review clamps them.
  FSRS_RATINGS = [1, 2, 3, 4, 1, 2, 3, 4, 0, 5].freeze

  def fsrs
    srs = LearningRoutesEngine::SpacedRepetition.new
    random = Random.new(44)
    every_rating = FSRS_STARTS.product(FSRS_RATINGS.uniq).map { |start, rating| [start, [{ "elapsed_days" => 1, "rating" => rating }]] }
    sampled = Array.new(100) do |i|
      reviews = Array.new(1 + random.rand(12)) do
        { "elapsed_days" => FSRS_ELAPSED_DAYS.sample(random: random), "rating" => FSRS_RATINGS.sample(random: random) }
      end
      [FSRS_STARTS[i % FSRS_STARTS.size], reviews]
    end

    sequences = (every_rating + sampled).map do |start, reviews|
      { input: { kind: "review_sequence", start: start, reviews: reviews }, output: review_sequence(srs, start, reviews) }
    end
    sequences + retrievability_cases(srs) + [0, -1, 0.01, 0.05, 0.4, 0.5, 1, 1.5, 2.4, 2.5, 5.8, 10, 100, 364.5, 405.6, 1000].map do |s|
      { input: { kind: "next_interval", stability: s }, output: srs.send(:next_interval, s) }
    end
  ensure
    travel_to(FROZEN_AT)
  end

  def review_sequence(srs, start, reviews)
    now = FROZEN_AT
    travel_to(now)
    card = FsrsCard.new(**(start || {}).except("days_ago").transform_keys(&:to_sym))
    card.fsrs_last_review_at = now - start["days_ago"].days if start&.dig("days_ago")

    reviews.each_with_object([]) do |review, results|
      now += review["elapsed_days"].days
      travel_to(now)
      before = srs.retrievability(card)
      result = srs.review(card, review["rating"])
      card = FsrsCard.new(**result.slice(*FsrsCard.members))
      results << result.merge(retrievability_before: before)
    rescue FloatDomainError => e
      # An existing card with stability 0 schedules NaN days: Ruby raises. Recorded, not hidden.
      break results << { error: e.class.name, message: e.message }
    end
  end

  def retrievability_cases(srs)
    [0, -1, 0.4, 2.4, 10, 100].product([nil, -1, 0, 0.5, 1, 7, 30, 365]).map do |stability, elapsed|
      travel_to(FROZEN_AT)
      last = elapsed && FROZEN_AT - elapsed.days
      card = FsrsCard.new(fsrs_stability: stability, fsrs_last_review_at: last)
      { input: { kind: "retrievability", stability: stability, elapsed_days: elapsed }, output: srs.retrievability(card) }
    end
  end

  FLASHCARD_PAYLOADS = [
    nil, "easy", %w[easy], {}, { "ratings" => nil }, { "ratings" => [] }, { "ratings" => %w[easy hard] },
    { "ratings" => %w[easy good] }, { "ratings" => %w[Easy NORMAL] }, { "ratings" => %w[meh] },
    { "ratings" => %w[easy unknown normal] }, { "ratings" => { "0" => "easy", "1" => "hard" } },
    { "ratings" => "easy" }, { "ratings" => [3, "easy"] }
  ].freeze

  CHECK_SECTION = { "type" => "check", "question" => "2 + 2?",
                    "options" => [{ "label" => "3", "correct" => false }, { "label" => "4", "correct" => true }] }.freeze
  RIGHT = { "option_index" => 1 }.freeze
  WRONG = { "option_index" => 0 }.freeze

  # name => [section, [[payload, complete], ...]], replayed through BlockAttemptRecorder.
  SUBMISSIONS = {
    "check: right first time" => [CHECK_SECTION, [[RIGHT, true]]],
    "check: wrong, wrong, right" => [CHECK_SECTION, [[WRONG, true], [WRONG, true], [RIGHT, true]]],
    "check: wrong three times" => [CHECK_SECTION, [[WRONG, true], [WRONG, true], [WRONG, true]]],
    "check: wrong four times" => [CHECK_SECTION, Array.new(4) { [WRONG, true] }],
    "check: released, then right" => [CHECK_SECTION, [[WRONG, true], [WRONG, true], [WRONG, true], [RIGHT, true]]],
    "check: wrong three times, not complete" => [CHECK_SECTION, Array.new(3) { [WRONG, false] }],
    "check: wrong, incomplete wrong, wrong, wrong" => [CHECK_SECTION, [[WRONG, true], [WRONG, false], [WRONG, true], [WRONG, true]]],
    "check: right, then wrong" => [CHECK_SECTION, [[RIGHT, true], [WRONG, true]]],
    "fill_blank: partial three times" => [{ "type" => "fill_blank", "blanks" => %w[uno dos] },
                                          Array.new(3) { [{ "answers" => %w[uno tres] }, true] }],
    "drag_drop: wrong twice, right" => [{ "type" => "drag_drop", "pairs" => [%w[a 1], %w[b 2]] },
                                        [[{ "matches" => { "0" => 1, "1" => 0 } }, true]] * 2 +
                                          [[{ "matches" => { "0" => 0, "1" => 1 } }, true]]],
    "check without a correct option" => [CHECK_SECTION.merge("options" => [{ "label" => "3" }]), [[WRONG, true]] * 3],
    "flashcards: rated" => [{ "type" => "flashcards", "cards" => [{ "front" => "a", "back" => "b" }] },
                            [[{ "ratings" => %w[easy hard] }, true]]],
    "concept: read" => [{ "type" => "concept", "body" => "text" }, [[{}, true]]]
  }.freeze

  # BlockAttempt#fsrs_rating over every branch, then whole submission histories
  # replayed in memory through the recorder, where the release after 3 failures lives.
  def attempt_rating
    ratings = %w[check drag_drop fill_blank flashcards concept].product([true, false, nil], [nil, 0, 1, 2, 3], [false, true])
      .map { |type, correct, attempts, released| rating_case(type, correct, attempts, released, nil) }
    ratings += FLASHCARD_PAYLOADS.product([false, true]).map { |payload, released| rating_case("flashcards", nil, 1, released, payload) }
    ratings + SUBMISSIONS.map { |name, (section, submissions)| submission_case(name, section, submissions) }
  end

  def rating_case(block_type, correct, attempts, released, payload)
    attempt = LearningRoutesEngine::BlockAttempt.new(block_type: block_type, correct: correct, attempts: attempts,
                                                     released_at: (FROZEN_AT if released), payload: payload)
    { input: { kind: "fsrs_rating", block_type: block_type, correct: correct, attempts: attempts,
               released: released, payload: payload },
      output: attempt.fsrs_rating }
  end

  def submission_case(name, section, submissions)
    attempt = LearningRoutesEngine::BlockAttempt.new(block_type: section["type"], section_index: 0)
    step = Struct.new(:id, :learning_route_id).new("step", "route")
    states = submissions.map do |payload, complete|
      grading = LearningRoutesEngine::BlockGrader.new(section: section, payload: payload).call
      LearningRoutesEngine::BlockAttemptRecorder.new(user: nil, route_step: step, section_index: 0,
        block_type: section["type"], payload: payload, grading: grading, complete: complete)
        .send(:record_submission!, attempt)
      { attempts: attempt.attempts, correct: attempt.correct, score: attempt.score&.to_f,
        completed: attempt.completed_at.present?, released: attempt.released?, passed: attempt.passed?,
        engaged: attempt.engaged?, satisfied: attempt.satisfied?, fsrs_rating: attempt.fsrs_rating }
    end
    { input: { kind: "submissions", name: name, section: section,
               submissions: submissions.map { |payload, complete| { payload: payload, complete: complete } } },
      output: states }
  end

  # Token mixes for chat and image models, then the units speech models bill by.
  COST_MIXES = [
    {}, { input_tokens: 1 }, { input_tokens: 1_000_000 }, { output_tokens: 1_000_000 },
    { input_tokens: 1234, output_tokens: 567 }, { cached_tokens: 1 }, { cached_tokens: 3 },
    { input_tokens: 10_000, cached_tokens: 200_000, output_tokens: 800 },
    { input_tokens: 2_000, cache_write_tokens: 50_000, output_tokens: 300 },
    { input_tokens: 500, cached_tokens: 4_000, cache_write_tokens: 1_000, output_tokens: 250 },
    { input_tokens: 200, image_input_tokens: 3_333, output_tokens: 4_160 },
    { characters: 0 }, { characters: 1 }, { characters: 999 }, { characters: 1_000 }, { characters: 12_345 },
    { audio_seconds: "0" }, { audio_seconds: "0.1" }, { audio_seconds: "59.5" }, { audio_seconds: 7.25 },
    { audio_seconds: "3600" }
  ].freeze

  # Every model in the pricing table, and one it does not know, under every mix.
  def cost_estimate
    models = AiOrchestrator::CostTracker::PRICING.keys + ["unpriced-model"]
    models.product(COST_MIXES).map do |model, mix|
      output = begin
        AiOrchestrator::CostTracker.estimate_microcents(model: model, **mix)
      rescue StandardError => e
        { error: e.class.name, message: e.message }
      end
      { input: mix.merge(model: model), output: output }
    end
  end

  SPEND_DELTAS = [-10_000_000, -1_000_000, -10_000, -1, 0, 1, 10_000].freeze
  # Rows that must not count (or, at midnight, must) next to the billable spend.
  SPEND_NOISE = {
    "none" => nil,
    "yesterday" => { at: :last_second_yesterday },
    "unpriced" => { pricing_status: "unpriced" },
    "cached" => { cached: true },
    "failed" => { status: :failed },
    "midnight_today" => { at: :midnight },
    "other_user_today" => { user_id: :other }
  }.freeze

  # SpendGuard's verdicts around the daily cap, the per-user cap and the rate limit.
  # Each situation starts from no spend, with a fresh in-memory rate counter.
  def spend_limits
    alerts = Rails.application.config.ai_cost_alerts
    cent = AiOrchestrator::CostTracker::MICROCENTS_PER_CENT
    daily_cap = alerts[:daily_limit] * cent
    user_cap = alerts[:per_user_daily] * cent
    # Two accounts, rolled back with the rest: SpendGuard tells the student from
    # someone else by id, and no id is written out.
    @spender, @other_spender = %w[one two].map do |n|
      Core::User.create!(name: "Spender #{n}", email: "spender-#{n}@characterize.invalid", password: SecureRandom.hex(16))
    end

    daily = SPEND_DELTAS.product(SPEND_NOISE.keys).map do |delta, noise|
      spend_case({ limit: "daily_budget", delta_microcents: delta, noise: noise }) do
        spend!(daily_cap + delta, noise, user_id: nil)
        guard_verdict(model: "gpt-4.1-mini", user: nil)
      end
    end

    user = SPEND_DELTAS.product(SPEND_NOISE.keys + %w[no_user daily_also_over]).map do |delta, noise|
      spend_case({ limit: "user_budget", delta_microcents: delta, noise: noise }) do
        spend!(user_cap + delta, SPEND_NOISE.key?(noise) ? noise : nil, user_id: @spender.id)
        spend!(daily_cap, "none", user_id: nil) if noise == "daily_also_over"
        guard_verdict(model: "gpt-4.1-mini", user: noise == "no_user" ? nil : @spender)
      end
    end

    limits = AiOrchestrator::ModelRouter::RATE_LIMITS
    rate = %w[elevenlabs gpt-image-1 claude-opus-4-5 claude-haiku-4-5 gpt-4.1-mini eleven_multilingual_v2].flat_map do |model|
      limit = limits.fetch(model, 25)
      [limit - 1, limit, limit + 1, limit + 5].map { |calls| rate_case(model, calls) }
    end
    rate += [[59, false], [61, false], [61, true]].flat_map do |pause, over|
      %w[elevenlabs gpt-image-1].map { |model| rate_case(model, limits[model] + 1, pause_seconds: pause, daily_over: over) }
    end
    rate += %w[elevenlabs gpt-image-1 claude-opus-4-5].map { |model| rate_case(model, limits[model] + 5, daily_over: true) }

    daily + user + rate
  end

  def rate_case(model, calls, pause_seconds: nil, daily_over: false)
    input = { limit: "rate_limit", model: model, calls: calls, pause_seconds: pause_seconds, daily_over: daily_over }
    spend_case(input) do
      cap = Rails.application.config.ai_cost_alerts[:daily_limit] * AiOrchestrator::CostTracker::MICROCENTS_PER_CENT
      spend!(cap, "none", user_id: nil) if daily_over
      verdicts = Array.new(calls) { guard_verdict(model: model, user: nil) }
      if pause_seconds
        travel_to(FROZEN_AT + pause_seconds.seconds)
        verdicts << guard_verdict(model: model, user: nil)
      end
      kinds = verdicts.map { |v| v[:kind] || "allowed" }
      { first_refused_call: kinds.index { |k| k != "allowed" }&.succ,
        runs: kinds.chunk_while { |a, b| a == b }.map { |run| [run.first, run.size] } }
    end
  end

  # One situation in its own savepoint, so the rows of one never leak into the next.
  def spend_case(input)
    output = nil
    previous_cache = Rails.cache
    Rails.cache = ActiveSupport::Cache::MemoryStore.new
    ActiveRecord::Base.transaction(requires_new: true) do
      AiOrchestrator::AiInteraction.delete_all
      output = I18n.with_locale(:en) { yield }
      raise ActiveRecord::Rollback
    end
    { input: input, output: output }
  ensure
    Rails.cache = previous_cache
    travel_to(FROZEN_AT)
  end

  # `total` billable microcents today, in two rows, plus one row of the noise kind.
  def spend!(total, noise, user_id:)
    day = FROZEN_AT.beginning_of_day
    record = lambda do |microcents, at: FROZEN_AT, **attributes|
      AiOrchestrator::AiInteraction.create!(
        { model: "gpt-4.1-mini", prompt: "characterize", status: :completed, cached: false, pricing_status: "priced",
          user_id: user_id, cost_microcents: microcents, created_at: at }.merge(attributes)
      )
    end
    record.call(total / 2)
    record.call(total - (total / 2))
    extra = SPEND_NOISE[noise] or return
    at = { last_second_yesterday: day - 1.second, midnight: day }.fetch(extra[:at], FROZEN_AT)
    attributes = extra.except(:at)
    attributes[:user_id] = @other_spender.id if attributes[:user_id] == :other
    record.call(1_000_000, at: at, **attributes)
  end

  def guard_verdict(model:, user:)
    AiOrchestrator::SpendGuard.call(model: model, user: user)
    { allowed: true }
  rescue AiOrchestrator::SpendGuard::LimitExceeded => e
    { allowed: false, kind: e.kind.to_s, message: e.message }
  end

  LESSON_BODY_CAP = 500
  # Stands in for a real audio file, whose URL may carry a signed token.
  AUDIO_URL = "https://media.example/lesson-audio.mp3"
  KNOWLEDGE_CHECKS = [
    { "question" => "Q1?", "options" => %w[a b c], "correct_index" => 1, "explanation" => "b." },
    { "question" => "Q2?", "options" => %w[x y], "correct_index" => 0 }
  ].freeze

  # Every lesson body in the database (capped), every markdown literal in the parser's
  # tests, and the inputs that switch the metadata and audio injections on.
  def lesson_parser
    db = ContentEngine::AiContent.where(content_type: :text).where.not(body: [nil, ""])
      .includes(:route_step).order(:id).limit(LESSON_BODY_CAP).map do |content|
      checks = content.route_step&.metadata&.dig("knowledge_checks")
      parse_case(content.body, checks, content.audio_url.present? ? AUDIO_URL : nil)
    end
    from_tests = test_suite_markdown.flat_map { |body| [parse_case(body, nil, nil), parse_case(body, nil, AUDIO_URL)] }
    concepts = "## Concepto: Uno\nA.\n\n## Concepto: Dos\nB.\n\n## Concepto: Tres\nC.\n\n## Concepto: Cuatro\nD."
    synthetic = [nil, "", "  \n", concepts].product([nil, KNOWLEDGE_CHECKS], [nil, AUDIO_URL])
      .map { |body, checks, audio| parse_case(body, checks, audio) }
    db + from_tests + synthetic
  end

  def parse_case(body, knowledge_checks, audio_url)
    metadata = knowledge_checks ? { "knowledge_checks" => knowledge_checks } : {}
    output = begin
      ContentEngine::LessonSectionParser.call(body, metadata: metadata, audio_url: audio_url).map(&:as_json)
    rescue StandardError => e
      { error: e.class.name, message: e.message }
    end
    { input: { body: body, knowledge_checks: knowledge_checks, audio_url: audio_url }, output: output }
  end

  # String literals in the tests that exercise the parser and read as lesson
  # markdown (a ::: fence or a ## heading at a line start). Interpolated strings
  # are left out: their value is only known when the test runs.
  def test_suite_markdown
    files = Dir[Rails.root.join("{test,engines/*/test}/**/*_test.rb")].sort
      .select { |file| File.read(file).include?("LessonSectionParser") }
    files.flat_map { |file| string_literals(Prism.parse_file(file).value) }
      .map { |s| s.dup.force_encoding(Encoding::UTF_8) }
      .select { |s| s.valid_encoding? && s.match?(/^(:::\w|\#{2,3} )/) }.uniq
  end

  def string_literals(node)
    found = node.is_a?(Prism::StringNode) ? [node.unescaped] : []
    found + node.compact_child_nodes.flat_map { |child| string_literals(child) }
  end

  # Right, wrong, partial, empty and malformed answers for one section.
  def submissions_for(section)
    section = (section || {}).with_indifferent_access
    case section[:type].to_s
    when "check"
      count = Array(section[:options]).size
      (0...count).map { |i| { "option_index" => i } } +
        [{}, { "option_index" => "1" }, { "option_index" => count }, { "option_index" => -1 }]
    when "drag_drop"
      count = Array(section[:pairs]).size
      identity = (0...count).to_h { |i| [i.to_s, i] }
      [identity, identity.transform_values { |i| (i + 1) % count }, identity.first(1).to_h,
       identity.transform_values(&:to_s), {}].map { |matches| { "matches" => matches } }
    when "fill_blank"
      blanks = Array(section[:blanks]).map(&:to_s)
      [blanks, blanks.map(&:upcase), ["wrong"] + blanks.drop(1), blanks.take(1), []].map { |a| { "answers" => a } }
    else
      [{}]
    end
  end

  # Sections a generation bug can produce, and the boundaries of each rule.
  GRADER_EDGE_SECTIONS = [
    nil,
    {},
    { "type" => "tap_pairs" },
    { "type" => "check", "question" => "Q?", "options" => [] },
    { "type" => "check", "question" => "Q?", "options" => [{ "label" => "A", "correct" => false }] },
    { "type" => "check", "question" => "", "options" => [{ "label" => "A", "correct" => true }] },
    { "type" => "check", "question" => "  ", "options" => [{ "label" => "A", "correct" => true }] },
    { "type" => "check", "options" => [{ "label" => "A", "correct" => true }] },
    { "type" => "check", "question" => "Q?",
      "options" => [{ "label" => "A", "correct" => true }, { "label" => "B", "correct" => true }] },
    { "type" => "check", "question" => "Q?", "options" => [{ "label" => "A", "correct" => "yes" }, { "label" => "B" }] },
    { "type" => "drag_drop", "pairs" => [] },
    { "type" => "drag_drop", "pairs" => [%w[uno one], %w[dos two], %w[tres three]] },
    { "type" => "drag_drop", "pairs" => [{ "term" => "a", "definition" => "b" }] },
    { "type" => "fill_blank", "blanks" => [] },
    { "type" => "fill_blank", "blanks" => ["", "  "] },
    { "type" => "fill_blank", "blanks" => ["", "gato"], "sentence" => "El ___ come ___." },
    { "type" => "fill_blank", "blanks" => %w[uno dos tres] },
    { "type" => "flashcards", "cards" => [] },
    { "type" => "flashcards", "cards" => [{ "front" => "a", "back" => "b" }] },
    { "type" => "scenario", "options" => [] },
    { "type" => "scenario", "situation" => "S", "options" => [{ "label" => "A" }] }
  ].freeze

  # expected blank => answers probing normalize: accents, case, whitespace, punctuation.
  NORMALIZE_PROBES = {
    "Obrigado" => ["obrigado", "OBRIGADO", " obrigádo! ", "obri gado", "obrigada", ""],
    "¿Qué tal?" => ["que tal", "Qué tal", "¿qué  tal?", "quetal", "que-tal"],
    "São Paulo" => ["sao paulo", "SÃO\tPAULO", "Sao  Paulo.", "saopaulo"],
    "Ñandú" => ["nandu", "ñandu", "NANDÚ", "nandú!!"],
    "C++" => ["c", "C++", "c+", "c#"],
    "l'eau" => ["leau", "l eau", "L'EAU", "l’eau"],
    "café au lait" => ["cafe au lait", "café-au-lait", "cafe\nau lait", "cafeaulait"],
    "naïve" => ["naive", "NAÏVE", "naıve"],
    "3.14" => ["314", "3,14", "3.14", "3 14"],
    "straße" => ["strasse", "STRASSE", "straße", "STRAẞE"]
  }.freeze
end

namespace :characterize do
  Characterization::UNITS.each do |unit, location|
    desc "Write #{unit}.json, a golden fixture for the new platform (read-only)."
    task unit => :environment do
      Characterization.capture(unit, Characterization.source(location.call)) do
        Characterization.public_send(unit)
      end
    end
  end

  desc "Write every golden fixture for the new platform (read-only)."
  task all: Characterization::UNITS.keys
end
