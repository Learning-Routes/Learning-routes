# frozen_string_literal: true

require "test_helper"

module ContentEngine
  class AudioControllerTest < ActionDispatch::IntegrationTest
    setup do
      @user = create_test_user(email_verified_at: Time.current)
      @profile = LearningRoutesEngine::LearningProfile.create!(user: @user, current_level: "beginner")
      @route = LearningRoutesEngine::LearningRoute.create!(
        learning_profile: @profile,
        topic: "Audio Security",
        status: :active
      )
      @step = LearningRoutesEngine::RouteStep.create!(
        learning_route: @route,
        title: "Safe listening",
        position: 0
      )
      @audio_root = Rails.root.join("storage", "audio")
      @sibling_root = Rails.root.join("storage", "audio-escape")
      @audio_root.mkpath
      @sibling_root.mkpath
      @created_paths = []

      sign_in_as(@user)
    end

    teardown do
      @created_paths.reverse_each { |path| FileUtils.rm_f(path) }
      Dir.rmdir(@sibling_root) if @sibling_root.directory? && @sibling_root.empty?
    end

    test "serves valid audio belonging to the signed-in user" do
      path = write_file(@audio_root.join("audio_controller_valid.mp3"), "valid lesson audio")
      create_ready_content("/storage/audio/#{path.basename}")

      get content_engine.audio_path(@step)

      assert_response :success
      assert_equal "audio/mpeg", response.media_type
    end

    test "forbids a different user from accessing the step audio" do
      path = write_file(@audio_root.join("audio_controller_private.mp3"), "private audio")
      create_ready_content("/storage/audio/#{path.basename}")
      other_user = create_test_user(email_verified_at: Time.current)
      delete core.sign_out_path
      sign_in_as(other_user)

      get content_engine.audio_path(@step)

      assert_response :forbidden
    end

    test "returns not found for a missing stored audio file" do
      create_ready_content("/storage/audio/audio_controller_missing.mp3")

      get content_engine.audio_path(@step)

      assert_response :not_found
    end

    test "rejects audio in a sibling directory with the same prefix" do
      path = write_file(@sibling_root.join("audio_controller_escape.mp3"), "outside audio")
      create_ready_content("/storage/audio-escape/#{path.basename}")

      get content_engine.audio_path(@step)

      assert_response :not_found
    end

    private

    def create_ready_content(audio_url)
      ContentEngine::AiContent.create!(
        route_step: @step,
        body: "Lesson body",
        audio_status: "ready",
        audio_url: audio_url
      )
    end

    def write_file(path, contents)
      File.binwrite(path, contents)
      @created_paths << path
      path
    end
  end
end
