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
    "attempt_rating" => -> { LearningRoutesEngine::BlockAttempt.instance_method(:fsrs_rating).source_location }
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

  def block_grader
    every_type = ContentEngine::LessonBlocks.types.map { |type| { "type" => type } }
    sections = recorded_sections + every_type + GRADER_EDGE_SECTIONS
    cases = sections.flat_map { |section| submissions_for(section).map { |payload| grade(section, payload) } }
    cases + NORMALIZE_PROBES.flat_map do |expected, answers|
      answers.map { |answer| grade({ "type" => "fill_blank", "blanks" => [expected] }, { "answers" => [answer] }) }
    end
  end

  def grade(section, payload)
    grader = LearningRoutesEngine::BlockGrader
    {
      input: { section: section, payload: payload },
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
