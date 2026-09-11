# frozen_string_literal: true

module ContentEngine
  # Pure and Dir.glob-based, NEVER shelling to git: these tests must run where
  # git is not available (a deployed console, a stripped CI image).
  module MotionBuild
    ROOT     = "app/motion"
    ARTIFACT = "vendor/javascript/mc.js"
    TYPES    = "app/motion/src/generated/schemas.d.ts"
    EXCLUDED = %w[dist node_modules].freeze

    ARTIFACT_HEADER = "motion-src-sha256"
    SCHEMAS_HEADER  = "motion-schemas-sha256"

    HEADER_PATTERN = /(?:#{ARTIFACT_HEADER}|#{SCHEMAS_HEADER}):\s*([0-9a-f]{64})/

    def self.input_files(kind)
      pattern = kind == :schemas ? "#{ROOT}/src/scenes/*.schema.json" : "#{ROOT}/**/*"
      Dir[Rails.root.join(pattern)]
        .select { |p| File.file?(p) }
        .reject { |p| EXCLUDED.any? { |d| p.include?("/#{d}/") } }
        .sort
    end

    # path + "\n" + content, so a rename or a move moves the digest too —
    # a file's location is part of what the build consumes.
    def self.digest_for(kind)
      sha = Digest::SHA256.new
      input_files(kind).each do |path|
        rel = Pathname.new(path).relative_path_from(Rails.root).to_s
        sha << rel << "\n" << File.binread(path)
      end
      sha.hexdigest
    end

    def self.header_digest(relative_path)
      file = Rails.root.join(relative_path)
      return nil unless File.exist?(file)

      File.foreach(file).first(5).each do |line|
        m = line.match(HEADER_PATTERN)
        return m[1] if m
      end
      nil
    end
  end
end
