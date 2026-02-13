require "test_helper"

module ContentEngine
  class ContentCacheTest < ActiveSupport::TestCase
    test "requires cache_key" do
      cache = ContentCache.new(cache_key: nil, content: "test")
      assert_not cache.valid?
      assert_includes cache.errors[:cache_key], "can't be blank"
    end

    test "requires content" do
      cache = ContentCache.new(cache_key: "test-key", content: nil)
      assert_not cache.valid?
      assert_includes cache.errors[:content], "can't be blank"
    end

    test "expired? returns true for past datetime" do
      cache = ContentCache.new(expires_at: 1.hour.ago)
      assert cache.expired?
    end

    test "expired? returns false for future datetime" do
      cache = ContentCache.new(expires_at: 1.hour.from_now)
      assert_not cache.expired?
    end
  end
end
