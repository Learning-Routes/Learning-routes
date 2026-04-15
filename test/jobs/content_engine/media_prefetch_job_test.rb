# frozen_string_literal: true

require "test_helper"

class ContentEngine::MediaPrefetchJobTest < ActiveSupport::TestCase
  setup do
    @user = Core::User.create!(
      email: "prefetch-test-#{SecureRandom.hex(4)}@example.com",
      password: "password123",
      password_confirmation: "password123",
      name: "Test User"
    )

    profile = LearningRoutesEngine::LearningProfile.create!(
      user: @user,
      current_level: "beginner",
      interests: ["science"],
      learning_style: ["visual"],
      goal: "Learn biology"
    )

    @route = LearningRoutesEngine::LearningRoute.create!(
      learning_profile: profile,
      topic: "Biology",
      locale: "en",
      status: :active
    )

    @step = LearningRoutesEngine::RouteStep.create!(
      learning_route: @route,
      title: "Photosynthesis",
      position: 1,
      level: :nv1,
      content_type: :lesson,
      status: :available,
      metadata: { "parsed_sections" => sample_sections }
    )

    # Silence Turbo broadcasts
    silence_broadcasts!
  end

  # ── 1. Skips when no parsed_sections ──────────────────────────────
  test "skips when metadata has no parsed_sections" do
    @step.update!(metadata: {})
    # Should return early without error
    ContentEngine::MediaPrefetchJob.perform_now(@step.id)
    @step.reload
    assert_nil @step.metadata["media_prefetch_completed_at"]
  end

  test "skips when parsed_sections is not an array" do
    @step.update!(metadata: { "parsed_sections" => "not an array" })
    ContentEngine::MediaPrefetchJob.perform_now(@step.id)
    @step.reload
    assert_nil @step.metadata["media_prefetch_completed_at"]
  end

  # ── 2. Builds correct task types ──────────────────────────────────
  test "identifies visual sections without image_url as image tasks" do
    job = ContentEngine::MediaPrefetchJob.new
    # We need to set up instance variables the job expects
    job.instance_variable_set(:@step, @step)
    job.instance_variable_set(:@route, @route)
    job.instance_variable_set(:@profile, @route.learning_profile)
    job.instance_variable_set(:@user, @user)

    # Stub SectionAudioGenerator.cached to return nil
    stub_audio_cached(nil) do
      tasks = job.send(:build_media_tasks, sample_sections)

      image_tasks = tasks.select { |t| t[:type] == :image }
      audio_tasks = tasks.select { |t| t[:type] == :audio }

      # One visual section without image_url -> one image task
      assert_equal 1, image_tasks.size
      assert_equal "image_1", image_tasks.first[:key]
      assert_equal "Chloroplast diagram", image_tasks.first[:description]

      # concept + summary sections -> two audio tasks
      assert_equal 2, audio_tasks.size
      audio_keys = audio_tasks.map { |t| t[:key] }
      assert_includes audio_keys, "audio_0"
      assert_includes audio_keys, "audio_3"
    end
  end

  # ── 3. Uses cached image when available ───────────────────────────
  test "uses cached image instead of generating new one" do
    job = ContentEngine::MediaPrefetchJob.new
    job.instance_variable_set(:@step, @step)
    job.instance_variable_set(:@route, @route)
    job.instance_variable_set(:@profile, @route.learning_profile)
    job.instance_variable_set(:@user, @user)

    # Use a real memory store in case test env uses null store
    original_cache = Rails.cache
    Rails.cache = ActiveSupport::Cache::MemoryStore.new

    # Pre-populate cache for the visual section
    cache_key = job.send(:content_hash, "image", 1, "Chloroplast diagram")
    Rails.cache.write(cache_key, { url: "https://example.com/cached.png" })

    stub_audio_cached(nil) do
      tasks = job.send(:build_media_tasks, sample_sections)

      cached_tasks = tasks.select { |t| t[:type] == :cached_image }
      assert_equal 1, cached_tasks.size
      assert_equal "https://example.com/cached.png", cached_tasks.first[:cached][:url]
    end
  ensure
    Rails.cache = original_cache
  end

  # ── 4. Mermaid validation ─────────────────────────────────────────
  test "mermaid validation detects valid flowchart syntax" do
    job = ContentEngine::MediaPrefetchJob.new

    result = job.send(:validate_mermaid, {
      key: "mermaid_0",
      type: :mermaid,
      index: 0,
      body: "```mermaid\nflowchart TD\n  A-->B\n```"
    })

    assert_equal "ready", result[:status]
    assert_equal 1, result[:mermaid_count]
  end

  test "mermaid validation detects invalid syntax" do
    job = ContentEngine::MediaPrefetchJob.new

    result = job.send(:validate_mermaid, {
      key: "mermaid_0",
      type: :mermaid,
      index: 0,
      body: "```mermaid\ninvalid diagram stuff\n```"
    })

    assert_equal "invalid", result[:status]
  end

  test "mermaid validation accepts sequenceDiagram" do
    job = ContentEngine::MediaPrefetchJob.new

    result = job.send(:validate_mermaid, {
      key: "mermaid_0",
      type: :mermaid,
      index: 0,
      body: "```mermaid\nsequenceDiagram\n  Alice->>Bob: Hello\n```"
    })

    assert_equal "ready", result[:status]
  end

  # ── 5. Fallback SVG for failed images ─────────────────────────────
  test "generates fallback SVG data URI for failed images" do
    job = ContentEngine::MediaPrefetchJob.new

    fallback = job.send(:fallback_image_url)

    assert fallback.start_with?("data:image/svg+xml;base64,")
    decoded = Base64.decode64(fallback.sub("data:image/svg+xml;base64,", ""))
    assert_includes decoded, "Image unavailable"
    assert_includes decoded, "<svg"
  end

  # ── 6. Apply results marks failed audio ───────────────────────────
  test "apply_results marks failed audio as failed in audio_sections" do
    job = ContentEngine::MediaPrefetchJob.new
    job.instance_variable_set(:@step, @step)
    job.instance_variable_set(:@route, @route)
    job.instance_variable_set(:@profile, @route.learning_profile)
    job.instance_variable_set(:@user, @user)

    sections = sample_sections
    results = Concurrent::Hash.new
    results["audio_0"] = { status: "failed", error: "TTS service down" }

    stub_audio_cached(nil) do
      job.send(:apply_results!, sections, results)
    end

    @step.reload
    audio_sections = @step.metadata["audio_sections"]
    assert_equal "failed", audio_sections["0"]["status"]
  end

  # ── 7. Apply results sets image_url on success ────────────────────
  test "apply_results sets image_url on parsed_sections for successful images" do
    job = ContentEngine::MediaPrefetchJob.new
    job.instance_variable_set(:@step, @step)
    job.instance_variable_set(:@route, @route)
    job.instance_variable_set(:@profile, @route.learning_profile)
    job.instance_variable_set(:@user, @user)

    sections = sample_sections
    results = Concurrent::Hash.new
    results["image_1"] = { status: "ready", url: "https://example.com/photo.png" }

    stub_audio_cached(nil) do
      job.send(:apply_results!, sections, results)
    end

    @step.reload
    parsed = @step.metadata["parsed_sections"]
    assert_equal "https://example.com/photo.png", parsed[1]["image_url"]
  end

  # ── 8. Apply results uses fallback SVG for failed images ──────────
  test "apply_results uses fallback SVG for failed image generation" do
    job = ContentEngine::MediaPrefetchJob.new
    job.instance_variable_set(:@step, @step)
    job.instance_variable_set(:@route, @route)
    job.instance_variable_set(:@profile, @route.learning_profile)
    job.instance_variable_set(:@user, @user)

    sections = sample_sections
    results = Concurrent::Hash.new
    results["image_1"] = { status: "failed", error: "API error" }

    stub_audio_cached(nil) do
      job.send(:apply_results!, sections, results)
    end

    @step.reload
    parsed = @step.metadata["parsed_sections"]
    assert parsed[1]["image_url"].start_with?("data:image/svg+xml;base64,")
    assert_equal true, parsed[1]["image_fallback"]
  end

  # ── 9. Sets media_prefetch_completed_at timestamp ─────────────────
  test "apply_results sets media_prefetch_completed_at timestamp" do
    job = ContentEngine::MediaPrefetchJob.new
    job.instance_variable_set(:@step, @step)
    job.instance_variable_set(:@route, @route)
    job.instance_variable_set(:@profile, @route.learning_profile)
    job.instance_variable_set(:@user, @user)

    sections = sample_sections
    results = Concurrent::Hash.new

    stub_audio_cached(nil) do
      job.send(:apply_results!, sections, results)
    end

    @step.reload
    assert_not_nil @step.metadata["media_prefetch_completed_at"]
  end

  private

  def sample_sections
    [
      { "type" => "concept", "title" => "What is Photosynthesis", "body" => "Photosynthesis is the process by which plants convert sunlight into energy." },
      { "type" => "visual", "title" => "Photosynthesis Diagram", "body" => "A diagram showing the process", "image_description" => "Chloroplast diagram" },
      { "type" => "check", "title" => "Quick Check", "body" => "What is photosynthesis?" },
      { "type" => "summary", "title" => "Summary", "body" => "Key points about photosynthesis and how it works." }
    ]
  end

  def stub_audio_cached(return_value)
    original = ContentEngine::SectionAudioGenerator.method(:cached)
    ContentEngine::SectionAudioGenerator.define_singleton_method(:cached) { |*_args| return_value }
    yield
  ensure
    ContentEngine::SectionAudioGenerator.define_singleton_method(:cached, original)
  end

  def silence_broadcasts!
    return unless defined?(Turbo::StreamsChannel)

    unless Turbo::StreamsChannel.respond_to?(:_original_broadcast_replace_to)
      Turbo::StreamsChannel.singleton_class.alias_method(:_original_broadcast_replace_to, :broadcast_replace_to)
    end
    Turbo::StreamsChannel.define_singleton_method(:broadcast_replace_to) { |*_args, **_kwargs| nil }
  end
end
