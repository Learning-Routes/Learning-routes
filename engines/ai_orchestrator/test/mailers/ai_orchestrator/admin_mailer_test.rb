require "test_helper"

module AiOrchestrator
  class AdminMailerTest < ActionMailer::TestCase
    setup do
      Core::User.where(role: :owner).update_all(role: Core::User.roles[:student])
    end

    test "cost alert is addressed to the configured owner" do
      owner = create_test_user(role: :owner)

      message = AdminMailer.cost_alert(violation, owner)

      assert_equal [owner.email], message.to
      assert_equal ["noreply@learning-routes.com"], message.from
      assert_match "daily limit exceeded", message.subject
    end

    private

    def violation
      { type: "daily", current: 12_000, limit: 10_000 }
    end
  end
end
