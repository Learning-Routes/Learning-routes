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
    "block_registry" => -> { Object.const_source_location("ContentEngine::LessonBlocks::BLOCKS") }
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
