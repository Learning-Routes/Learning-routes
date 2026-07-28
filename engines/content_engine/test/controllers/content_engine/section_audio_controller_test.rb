# frozen_string_literal: true

require "test_helper"

module ContentEngine
  class SectionAudioControllerTest < ActionDispatch::IntegrationTest
    setup do
      @user = create_test_user(email_verified_at: Time.current)
      @profile = LearningRoutesEngine::LearningProfile.create!(user: @user, current_level: "beginner")
      @route = LearningRoutesEngine::LearningRoute.create!(
        learning_profile: @profile,
        topic: "Section Audio Security",
        status: :active
      )
      @step = LearningRoutesEngine::RouteStep.create!(
        learning_route: @route,
        title: "Safe section listening",
        position: 0
      )
      @section_index = 2
      @sections_root = Rails.root.join("storage", "audio", "sections")
      @sibling_root = Rails.root.join("storage", "audio", "sections-escape")
      @sections_root.mkpath
      @sibling_root.mkpath
      @created_paths = []
      @original_cache = Rails.cache
      Rails.cache = ActiveSupport::Cache::MemoryStore.new

      sign_in_as(@user)
    end

    teardown do
      Rails.cache = @original_cache
      @created_paths.reverse_each { |path| FileUtils.rm_f(path) }
      Dir.rmdir(@sibling_root) if @sibling_root.directory? && @sibling_root.empty?
    end

    test "serves a valid cached section MP3" do
      path = write_file(@sections_root.join("section_audio_valid.mp3"), "a" * 2_048)
      cache_audio("/storage/audio/sections/#{path.basename}")

      get show_path

      assert_response :success
      assert_equal "audio/mpeg", response.media_type
    end

    test "forbids a different user from accessing section audio" do
      path = write_file(@sections_root.join("section_audio_private.mp3"), "a" * 2_048)
      cache_audio("/storage/audio/sections/#{path.basename}")
      other_user = create_test_user(email_verified_at: Time.current)
      delete core.sign_out_path
      sign_in_as(other_user)

      get show_path

      assert_response :forbidden
    end

    test "evicts a sibling-prefix cache entry without deleting the outside file" do
      outside = write_file(@sibling_root.join("section_audio_escape.mp3"), "a" * 2_048)
      cache_audio("/storage/audio/sections-escape/#{outside.basename}")

      get show_path

      assert_response :not_found
      assert_nil Rails.cache.read(cache_key)
      assert outside.exist?
    end

    test "evicts and removes an undersized MP3 inside the sections root" do
      corrupt = write_file(@sections_root.join("section_audio_corrupt.mp3"), "tiny")
      cache_audio("/storage/audio/sections/#{corrupt.basename}")

      get show_path

      assert_response :not_found
      assert_nil Rails.cache.read(cache_key)
      assert_not corrupt.exist?
    end

    private

    def cache_key
      SectionAudioGenerator.cache_key(@step.id, @section_index)
    end

    def cache_audio(audio_url)
      Rails.cache.write(cache_key, { audio_url: audio_url, duration: 12.5 })
    end

    def show_path
      content_engine.section_audio_show_path(
        step_id: @step.id,
        section_index: @section_index
      )
    end

    def write_file(path, contents)
      File.binwrite(path, contents)
      @created_paths << path
      path
    end
  end
end
