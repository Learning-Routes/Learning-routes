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
    "gating" => -> { Object.const_source_location("LearningRoutesEngine::BlockGrader::GATING_TYPES") }
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
