module Admin
  module Api
    # The door the studio pushes a finished film through, and the one it takes a film
    # back out of. `ContentEngine::LessonVideoPublisher` owns every positional
    # decision — where the section goes, what moves with it, and whether an unpublish
    # is allowed at all. This controller owns the two things around it that the
    # service deliberately does not touch (see the "NOT DONE HERE" note at the end of
    # its class comment): the bytes, and the blobs.
    #
    # THE ORDER OF THE THREE STEPS IS THE WHOLE DESIGN
    #
    # 1. Validate from the BYTES, before a single blob exists. The filename is
    #    whatever the uploader typed, and a step left holding an attachment for a
    #    publish that then failed is a half-published step.
    # 2. Attach. This has to come second and not third: the payload the publisher
    #    writes into the lesson body carries the PROXY URLs, and a proxy URL can only
    #    be built from a persisted blob.
    # 3. Publish, and if it raises, purge what step 2 attached — the same rule as
    #    step 1, one layer out.
    #
    # AND THE PURGE IS ONLY EVER ON `:ok`
    #
    # `unpublish!` answers `:ok` or `:conflict` and nothing else, and a `:conflict`
    # must leave the attachment, the body and `parsed_sections` exactly as they were:
    # a refusal that deletes the film it refused to unpublish is a worse outcome than
    # the re-pointing it exists to prevent. The decision is entirely the service's —
    # including for a video in the MIDDLE of the array, which it allows whenever no
    # recorded work sits at or above it — so there is no "is it last" check here.
    class StepVideosController < BaseController
      # Spec §6: over 300 MB is a 413, answered from CONTENT_LENGTH before the body
      # is read.
      MAX_BODY_BYTES = 300.megabytes

      # Verbatim, because the studio displays this sentence unchanged.
      CONFLICT_MESSAGE = "students have recorded work on this step; re-upload replaces the video, " \
                         "unpublish would re-point their attempts".freeze

      # Not a client field: the contract's multipart body is `video`, `subtitles?`,
      # `title`, `duration_seconds`, `lesson_id`, `voice`. This records which door the
      # film came through, and this endpoint is the only door there is.
      SOURCE = "manim-studio".freeze

      # The three bytes of a UTF-8 BOM, stripped before the head is decoded.
      BOM = "\xEF\xBB\xBF".b.freeze

      # BEFORE `load_step`, and before anything else that could touch `params`:
      # reading `params` is what parses (and buffers) the multipart body, and the
      # point of this check is to answer without doing that.
      before_action :refuse_oversized_body!, only: :create
      before_action :load_step

      def create
        video = uploaded(:video)
        return refuse("a video file is required") if video.nil?
        return refuse("the bytes are not an mp4") unless mp4?(video)

        subtitles = uploaded(:subtitles)
        subtitles_type = subtitles && subtitles_type(subtitles)
        return refuse("the subtitles are neither SRT nor VTT") if subtitles && subtitles_type.nil?

        index = unchanged_upload_index(video, subtitles)
        # Spec §6: identical bytes answer 200 with the EXISTING URLs. Not a
        # re-publish: `attach` never reuses a blob, so re-running it would hand the
        # student's `<video>` a new proxy URL for a file that did not change.
        return respond_with(section_index: index, placement: :replace, status: :ok) if index

        attach!(video, subtitles, subtitles_type)
        publish(subtitles: subtitles.present?)
      end

      def destroy
        return unless (outcome = unpublish)

        if outcome == :conflict
          render json: { "error" => CONFLICT_MESSAGE }, status: :conflict
        else
          # `:ok` only. `purge` and not `purge_later`: the section that pointed at
          # these blobs is already gone from the body and the cache, so a queue that
          # is behind would leave the file reachable by URL with nothing referring to
          # it.
          @step.lesson_video.purge
          @step.lesson_subtitles.purge
          head :no_content
        end
      end

      private

      def publish(subtitles:)
        outcome = ContentEngine::LessonVideoPublisher.publish!(step: @step, payload: video_payload)
        respond_with(section_index: outcome[:section_index], placement: outcome[:placement], status: :created)
      rescue ContentEngine::LessonVideoPublisher::MissingLessonBody
        purge_new_attachments!(subtitles: subtitles)
        refuse("this step has no lesson body to carry a video section")
      rescue ContentEngine::LessonVideoPublisher::UnparsableSection
        purge_new_attachments!(subtitles: subtitles)
        refuse("the video section did not parse back as a video")
      end

      def unpublish
        ContentEngine::LessonVideoPublisher.unpublish!(step: @step)
      rescue ContentEngine::LessonVideoPublisher::MissingLessonBody
        refuse("this step has no lesson body to carry a video section")
        nil
      end

      # The ONE place the placement crosses from Ruby to JSON. `publish!` returns a
      # Symbol; the contract is one of exactly three strings, and the studio matches
      # on them.
      def respond_with(section_index:, placement:, status:)
        render json: {
          "step_id" => @step.id,
          "section_index" => section_index,
          "video_url" => proxy_path(@step.lesson_video),
          "subtitles_url" => proxy_path(@step.lesson_subtitles),
          "placement" => placement.to_s
        }, status: status
      end

      # `has_one_attached` + `attach` replaces the previous attachment and its blob is
      # purged in a job afterwards (`ActiveStorage::Attachment` declares
      # `after_destroy_commit :purge_dependent_blob_later`, attachment.rb:37) — which
      # is what spec §6 asks for, "the old blob is purged later, not inline". So there
      # is deliberately no explicit purge of the old blob here.
      #
      # The content types are the ones this request read out of the BYTES, never the
      # client's multipart headers: the filename and the declared type are both just
      # what the uploader typed.
      def attach!(video, subtitles, subtitles_type)
        video.rewind
        @step.lesson_video.attach(io: video, filename: upload_name(video, "lesson.mp4"),
                                  content_type: "video/mp4")
        return if subtitles.nil?

        subtitles.rewind
        @step.lesson_subtitles.attach(io: subtitles, filename: upload_name(subtitles, "lesson.srt"),
                                      content_type: subtitles_type)
      end

      # Only what THIS request attached. `attach` has already purged the blob it
      # replaced, so this is not a restore of the previous state: a re-upload whose
      # publish fails leaves the step with no video rather than with a blob no section
      # points at. Both are recoverable by uploading again; only the second is
      # invisible.
      def purge_new_attachments!(subtitles:)
        @step.lesson_video.purge
        @step.lesson_subtitles.purge if subtitles
      end

      # The index of the video section when BOTH uploads are byte-identical to what
      # is already attached, and nil otherwise — including when there is no video
      # section to report an index for, in which case this is not a re-upload of a
      # published video whatever the checksums say.
      #
      # Both files, not just the video: a step whose film is unchanged but whose
      # subtitles are new has not been published before in this shape.
      def unchanged_upload_index(video, subtitles)
        return nil unless same_blob?(@step.lesson_video, video)
        return nil unless same_blob?(@step.lesson_subtitles, subtitles)

        sections = @step.metadata.is_a?(Hash) ? @step.metadata["parsed_sections"] : nil
        Array(sections).index { |section| section.is_a?(Hash) && section["type"] == "video" }
      end

      def same_blob?(attached, file)
        return !attached.attached? if file.nil?

        attached.attached? && attached.blob.checksum == checksum_of(file)
      end

      # The same digest `ActiveStorage::Blob#compute_checksum_in_chunks` (blob.rb:353)
      # writes into `blobs.checksum`, so the comparison above is against the column:
      # MD5, base64-digested, read in 5 MB chunks. Reimplemented rather than called
      # because that method is private on a Blob instance.
      def checksum_of(file)
        file.rewind
        OpenSSL::Digest::MD5.new.tap do |digest|
          buffer = "".b
          digest << buffer while file.read(5.megabytes, buffer)
          file.rewind
        end.base64digest
      end

      # The filename is whatever the uploader typed. `ftyp` at offset 4 of the first
      # 12 bytes is what an mp4 actually is.
      def mp4?(io)
        head = io.read(12).to_s
        io.rewind
        head.byteslice(4, 4) == "ftyp"
      end

      # The media type the BYTES say, or nil when they say neither — which is also
      # the "are these subtitles at all" test.
      #
      # Real .srt files routinely carry a UTF-8 BOM and CRLF line endings; neither
      # makes them invalid, so both are tolerated. Two DELIBERATE differences from
      # the shape the brief gave, each measured:
      #
      #   - the BOM is stripped as three BYTES rather than with the brief's
      #     `sub(/\A\xEF\xBB\xBF/n, "")`. That regexp is ASCII-8BIT, and matching an
      #     ASCII-8BIT regexp against a UTF-8 string that is not pure ASCII raises
      #     Encoding::CompatibilityError — on a BOM, and on every accented Spanish
      #     subtitle file. A 500 on this app's normal input.
      #   - only the first line is decoded and validated. `read(64)` can stop in the
      #     middle of a multi-byte character, and a chopped tail is not evidence that
      #     the file is not UTF-8; everything this method looks at is on line one.
      #     No line break in the first 64 bytes is neither an SRT nor a VTT.
      def subtitles_type(io)
        window = io.read(64).to_s
        io.rewind
        window = window.byteslice(3..).to_s if window.b.start_with?(BOM)
        line = window[/\A[^\n]*\n/]
        return nil if line.nil?

        head = line.dup.force_encoding(Encoding::UTF_8)
        return nil unless head.valid_encoding?

        head = head.lstrip
        return "text/vtt" if head.start_with?("WEBVTT")

        "application/x-subrip" if head.match?(/\A\d+\s*\z/)
      end

      # `PAYLOAD_KEYS` on the publisher is what the section is built from; the
      # `.permit(...).to_h` is not decoration — `publish!` calls `to_h` on a plain
      # Hash and an ActionController::Parameters would raise there.
      #
      # `duration_seconds` is passed through EXACTLY as it arrived, coerced only when
      # the string really is an integer. Nothing here verifies it against the film
      # (there is no ffprobe in the image), so a wrong number must stay visible as
      # the wrong number rather than become a nil that hides it.
      def video_payload
        permitted = params.permit(:title, :duration_seconds, :lesson_id, :voice).to_h
        permitted.merge(
          "duration_seconds" => duration_seconds(permitted["duration_seconds"]),
          "video_url" => proxy_path(@step.lesson_video),
          "subtitles_url" => proxy_path(@step.lesson_subtitles),
          "source" => SOURCE,
          "published_at" => Time.current.utc.iso8601
        )
      end

      # Multipart carries no types, so 477 arrives as "477".
      def duration_seconds(raw)
        Integer(raw.to_s, exception: false) || raw
      end

      def proxy_path(attached)
        rails_storage_proxy_path(attached) if attached.attached?
      end

      def uploaded(name)
        file = params[name]
        file if file.respond_to?(:read) && file.respond_to?(:rewind)
      end

      def upload_name(file, fallback)
        File.basename(file.original_filename.to_s).presence || fallback
      end

      def refuse(message)
        render json: { "error" => message }, status: :unprocessable_entity
      end

      def refuse_oversized_body!
        return if request.content_length.to_i <= MAX_BODY_BYTES

        render json: { "error" => "the request body is larger than #{MAX_BODY_BYTES / 1.megabyte} MB" },
               status: :content_too_large
      end

      # `strict_loading(false)`, and not because of this action's own two reads.
      # `strict_loading_by_default` is on for every environment (application.rb:48),
      # so a record from a query is strict and every record loaded through it inherits
      # that — including the `ActiveStorage::Attachment` rows, whose own associations
      # ActiveStorage declares `strict_loading: false` (attached/model.rb:128) but
      # whose RECORDS still carry the owner's flag. `reload` then re-preloads every
      # association in the cache (`_find_record`, activerecord persistence.rb:857),
      # and `LessonVideoPublisher#publish!` opens with `@step.with_lock`, which
      # reloads: the preload walks `lesson_video_blob` to the attachment's `blob` and
      # raises StrictLoadingViolationError. Measured — six of the ten tests in this
      # file errored on exactly that before this line.
      #
      # One step, two attachments, two blobs: this endpoint is not an N+1 surface, and
      # this is the opt-out config/query_optimization.rb:84 documents.
      def load_step
        @step = LearningRoutesEngine::RouteStep.strict_loading(false).find_by(id: params[:step_id])
        head :not_found if @step.nil?
      end
    end
  end
end
