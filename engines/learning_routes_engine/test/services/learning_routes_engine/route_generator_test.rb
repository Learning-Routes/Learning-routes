require "ostruct"
require "test_helper"

module LearningRoutesEngine
  class RouteGeneratorTest < ActiveSupport::TestCase
    setup do
      @fixture_path = File.expand_path("../../fixtures/files/route_generation_response.json", __dir__)
      @ai_response = File.read(@fixture_path)
      @user = Core::User.create!(
        email: "generator_test_#{SecureRandom.hex(4)}@example.com",
        password: "password123",
        name: "Test User"
      )
      @profile = LearningProfile.create!(
        user: @user,
        current_level: "beginner",
        interests: ["Ruby on Rails"],
        learning_style: ["visual"],
        goal: "Build web applications"
      )
    end

    test "generates route with NV1, NV2, NV3 steps" do
      with_mock_ai(@ai_response) do
        route = RouteGenerator.new(@profile).generate!

        assert route.persisted?
        assert route.active?
        assert_equal "completed", route.generation_status
        assert route.generated_at.present?
        assert route.total_steps > 0

        assert route.nv1_steps.any?, "Should have NV1 steps"
        assert route.nv2_steps.any?, "Should have NV2 steps"
        assert route.nv3_steps.any?, "Should have NV3 steps"
      end
    end

    test "first step is unlocked, rest are locked" do
      with_mock_ai(@ai_response) do
        route = RouteGenerator.new(@profile).generate!
        steps = route.route_steps.order(:position)

        assert steps.first.available?, "First step should be available"
        steps[1..].each do |step|
          assert step.locked?, "Step at position #{step.position} should be locked"
        end
      end
    end

    test "route has level-up exams and final exam" do
      with_mock_ai(@ai_response) do
        route = RouteGenerator.new(@profile).generate!
        steps = route.route_steps

        level_ups = steps.select { |s| s.title.include?("Level-Up") }
        assert_equal 2, level_ups.size, "Should have 2 level-up exams"

        final = steps.find { |s| s.title.include?("Final Exam") }
        assert final.present?, "Should have a final exam"

        review = steps.find { |s| s.title.include?("Comprehensive Review") }
        assert review.present?, "Should have a comprehensive review"
      end
    end

    test "steps have sequential prerequisites" do
      with_mock_ai(@ai_response) do
        route = RouteGenerator.new(@profile).generate!
        steps = route.route_steps.order(:position)

        assert_equal [], steps.first.prerequisites
        steps[1..].each do |step|
          assert step.prerequisites.present?,
                 "Step '#{step.title}' at position #{step.position} should have prerequisites"
        end
      end
    end

    test "handles empty modules with error" do
      empty_response = { "route_name" => "Empty", "modules" => [] }.to_json

      with_mock_ai(empty_response) do
        assert_raises(RouteGenerator::GenerationError) do
          RouteGenerator.new(@profile).generate!
        end
      end
    end

    test "marks route as failed on AI failure" do
      with_mock_ai(nil, failed: true) do
        assert_raises(RouteGenerator::GenerationError) do
          RouteGenerator.new(@profile).generate!
        end

        route = LearningRoute.last
        assert_equal "failed", route.generation_status
      end
    end

    test "partitions untagged modules by 30/40/30 ratio" do
      untagged = {
        "route_name" => "Test",
        "modules" => 10.times.map { |i|
          { "name" => "Module #{i + 1}", "description" => "Desc",
            "lessons" => [{ "title" => "Lesson #{i + 1}", "type" => "lesson", "estimated_minutes" => 30 }] }
        }
      }.to_json

      with_mock_ai(untagged) do
        route = RouteGenerator.new(@profile).generate!

        assert route.nv1_steps.any?, "Should have NV1 steps"
        assert route.nv2_steps.any?, "Should have NV2 steps"
        assert route.nv3_steps.any?, "Should have NV3 steps"
      end
    end

    private

    def with_mock_ai(response_text, failed: false)
      interaction = OpenStruct.new(
        id: SecureRandom.uuid,
        status: failed ? "failed" : "completed",
        response: response_text,
        model: "gpt-5.2",
        completed?: !failed
      )

      original = AiOrchestrator::Orchestrate.method(:call)
      AiOrchestrator::Orchestrate.define_singleton_method(:call) { |**_args| interaction }
      yield
    ensure
      AiOrchestrator::Orchestrate.define_singleton_method(:call, original)
    end
  end
end
