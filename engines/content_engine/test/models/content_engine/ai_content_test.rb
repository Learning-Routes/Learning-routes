require "test_helper"

module ContentEngine
  class AiContentTest < ActiveSupport::TestCase
    test "requires body" do
      content = AiContent.new(body: nil)
      assert_not content.valid?
      assert_includes content.errors[:body], "can't be blank"
    end

    test "content_type enum values" do
      assert_equal({ "text" => 0, "code" => 1, "explanation" => 2, "exercise" => 3 }, AiContent.content_types)
    end
  end
end
