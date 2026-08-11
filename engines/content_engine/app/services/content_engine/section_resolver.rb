# frozen_string_literal: true

module ContentEngine
  # The single answer to "what sections does this step have?".
  #
  # The lesson view has always been able to parse the AiContent body on the fly when
  # metadata["parsed_sections"] was missing — and it never persisted the result. So the
  # page rendered correctly from a source nobody else read, while every other consumer
  # read the metadata directly and silently got nothing:
  #
  #   - SectionImagesController answered "no image description available" about a
  #     description the student could read on the same screen.
  #   - LessonsController handed the AI tools an empty lesson context, which is why
  #     "Dar ejemplo" asked the student which concept they meant.
  #   - RouteStep#outstanding_blocks_for concluded a step had no gating blocks and let
  #     the student walk past an unanswered exercise.
  #
  # In production 14 of 21 steps had no parsed_sections, so two thirds of the product
  # had an invisible gate. Three separate patches were written for three symptoms before
  # anyone noticed they were one defect: the truth lived in two places.
  #
  # This resolves it in one, and persists what it parses, so the indices every consumer
  # looks up are the indices the page was rendered from. Idempotent: it only writes when
  # the metadata is empty.
  class SectionResolver
    def self.call(step) = new(step).call

    def initialize(step)
      @step = step
    end

    # Always returns an Array (possibly empty) of sections with string keys.
    def call
      persisted = @step.metadata&.dig("parsed_sections")
      return persisted if persisted.is_a?(Array) && persisted.any?

      parse_and_persist!
    end

    private

    def parse_and_persist!
      content = lesson_content
      return [] unless content

      sections = LessonSectionParser.call(
        content.body,
        metadata: @step.metadata || {},
        audio_url: content.audio_url
      ).map(&:as_json)
      return [] if sections.empty?

      @step.update!(metadata: (@step.metadata || {}).merge("parsed_sections" => sections))
      sections
    rescue => e
      # A step whose content cannot be parsed must not take down the page or the
      # progression check. It degrades to "no sections", which is what the callers
      # already handled before this class existed.
      Rails.logger.error("[SectionResolver] step=#{@step.id} #{e.class}: #{e.message}")
      []
    end

    def lesson_content
      target = @step.content_type_exercise? ? :exercise : :text
      scope = AiContent.where(route_step: @step)
      scope.by_type(target).first || scope.first
    end
  end
end
