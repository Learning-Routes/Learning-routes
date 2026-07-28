# frozen_string_literal: true

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
        return unless contained?(candidate, root)
        return unless candidate.extname.downcase == ".mp3"
        return unless candidate.file? && candidate.size >= minimum_size

        real_root = root.realpath
        real_candidate = candidate.realpath
        return unless contained?(real_candidate, real_root)

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

      private

      def contained?(candidate, root)
        relative = candidate.relative_path_from(root)
        relative.each_filename.none? { |part| part == ".." }
      end
    end
  end
end
