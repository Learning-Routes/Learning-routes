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

    # The AiContent row whose `body` these sections are parsed from.
    #
    # Public because LessonVideoPublisher edits that body and has to edit the SAME
    # row this class parses. A second copy of the selection rule would be a second
    # answer to "where does the lesson body live", and the publisher's `:replace`
    # branch (it looks for an existing `## Video:` heading in the body) only works
    # if the row it wrote is the row this reads.
    def self.lesson_content_for(step) = new(step).lesson_content

    def initialize(step)
      @step = step
    end

    # Always returns an Array (possibly empty) of sections with string keys.
    def call
      persisted = @step.metadata&.dig("parsed_sections")
      return persisted if persisted.is_a?(Array) && persisted.any?

      parse_and_persist!
    end

    # ORDERED, because `.first` on an unordered scope is not a rule — it is whatever
    # PostgreSQL returns, which is physical order today and something else after a
    # VACUUM or a plan change. A step really can carry more than one row:
    # content_generation_job.rb:36 and content_pipeline_job.rb:152 each `create!`
    # one without deleting an earlier one (count them with `rake
    # wp38:ai_content_census`).
    #
    # Oldest first. The first row generated for a step is the lesson; a second is the
    # duplicate, and promoting a duplicate would change what the student reads.
    #
    # This is what makes the comment on `lesson_content_for` above true rather than
    # merely intended. LessonVideoPublisher edits the row this returns — its
    # `:replace` branch looks for a `## Video:` heading in that body and
    # `stripped_body` removes a payload from it — so if the publisher's write and
    # this read can land on different rows, an unpublish deletes nothing while the
    # cache records that the video is gone.
    def lesson_content
      target = @step.content_type_exercise? ? :exercise : :text
      scope = AiContent.where(route_step: @step).order(:created_at, :id)
      scope.by_type(target).first || scope.first
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

      # merge_metadata!, not `update!(metadata: metadata.merge(...))`. The second
      # writes the WHOLE jsonb blob from the copy this process is holding, so an
      # `audio_sections` or `image_url` a job wrote between the read and this
      # line is erased. Same class as the reparse task's write, one line.
      @step.merge_metadata!("parsed_sections" => sections)
      sections
    rescue => e
      # A step whose content cannot be parsed must not take down the page or the
      # progression check. It degrades to "no sections", which is what the callers
      # already handled before this class existed.
      Rails.logger.error("[SectionResolver] step=#{@step.id} #{e.class}: #{e.message}")
      []
    end
  end
end
