require "test_helper"

module AiOrchestrator
  class CacheServiceTest < ActiveSupport::TestCase
    setup do
      Rails.cache.clear
    end

    test "returns nil on cache miss" do
      result = CacheService.fetch(task_type: "route_generation", prompt: "test", model: "gpt-5.2")
      assert_nil result
    end

    test "stores and retrieves cached response" do
      CacheService.store(
        task_type: "route_generation",
        prompt: "test prompt",
        model: "gpt-5.2",
        response: "cached response"
      )

      result = CacheService.fetch(
        task_type: "route_generation",
        prompt: "test prompt",
        model: "gpt-5.2"
      )

      assert_not_nil result
      assert_equal "cached response", result[:content]
      assert_not_nil result[:cached_at]
    end

    test "does not cache non-cacheable task types" do
      CacheService.store(
        task_type: "quick_grading",
        prompt: "test",
        model: "claude-haiku-4-5",
        response: "grading result"
      )

      result = CacheService.fetch(
        task_type: "quick_grading",
        prompt: "test",
        model: "claude-haiku-4-5"
      )

      assert_nil result
    end

    test "different prompts have different cache keys" do
      CacheService.store(task_type: "lesson_content", prompt: "prompt A", model: "gpt-5.2", response: "A")
      CacheService.store(task_type: "lesson_content", prompt: "prompt B", model: "gpt-5.2", response: "B")

      result_a = CacheService.fetch(task_type: "lesson_content", prompt: "prompt A", model: "gpt-5.2")
      result_b = CacheService.fetch(task_type: "lesson_content", prompt: "prompt B", model: "gpt-5.2")

      assert_equal "A", result_a[:content]
      assert_equal "B", result_b[:content]
    end

    test "different models have different cache keys" do
      CacheService.store(task_type: "lesson_content", prompt: "test", model: "gpt-5.2", response: "gpt")
      CacheService.store(task_type: "lesson_content", prompt: "test", model: "claude-opus-4-6", response: "claude")

      gpt = CacheService.fetch(task_type: "lesson_content", prompt: "test", model: "gpt-5.2")
      claude = CacheService.fetch(task_type: "lesson_content", prompt: "test", model: "claude-opus-4-6")

      assert_equal "gpt", gpt[:content]
      assert_equal "claude", claude[:content]
    end

    test "invalidate removes specific cache entry" do
      CacheService.store(task_type: "lesson_content", prompt: "test", model: "gpt-5.2", response: "data")
      CacheService.invalidate(task_type: "lesson_content", prompt: "test", model: "gpt-5.2")

      result = CacheService.fetch(task_type: "lesson_content", prompt: "test", model: "gpt-5.2")
      assert_nil result
    end

    test "cache_key is deterministic" do
      key1 = CacheService.cache_key(task_type: "test", prompt: "hello", model: "gpt-5.2")
      key2 = CacheService.cache_key(task_type: "test", prompt: "hello", model: "gpt-5.2")
      assert_equal key1, key2
    end

    test "cache TTLs are defined for all standard task types" do
      AiModelConfig::TASK_TYPES.each do |task|
        assert CacheService::CACHE_TTLS.key?(task),
          "No cache TTL defined for task type: #{task}"
      end
    end
  end
end
