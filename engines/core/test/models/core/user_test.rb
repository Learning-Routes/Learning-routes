require "test_helper"

module Core
  class UserTest < ActiveSupport::TestCase
    def valid_user_attributes
      {
        email: "test@example.com",
        name: "Test User",
        password: "securepassword123",
        password_confirmation: "securepassword123",
        role: :student
      }
    end

    test "valid user" do
      user = Core::User.new(valid_user_attributes)
      assert user.valid?
    end

    test "requires email" do
      user = Core::User.new(valid_user_attributes.merge(email: nil))
      assert_not user.valid?
      assert_includes user.errors[:email], "can't be blank"
    end

    test "requires unique email" do
      Core::User.create!(valid_user_attributes)
      duplicate = Core::User.new(valid_user_attributes.merge(name: "Other"))
      assert_not duplicate.valid?
      assert_includes duplicate.errors[:email], "has already been taken"
    end

    test "normalizes email to lowercase" do
      user = Core::User.new(valid_user_attributes.merge(email: "  TEST@EXAMPLE.COM  "))
      assert_equal "test@example.com", user.email
    end

    test "requires name" do
      user = Core::User.new(valid_user_attributes.merge(name: nil))
      assert_not user.valid?
    end

    test "requires minimum password length" do
      user = Core::User.new(valid_user_attributes.merge(password: "short", password_confirmation: "short"))
      assert_not user.valid?
      assert_includes user.errors[:password], "is too short (minimum is 8 characters)"
    end

    test "default role is student" do
      user = Core::User.new(valid_user_attributes.except(:role))
      assert_equal "student", user.role
    end

    test "role enum values" do
      assert_equal({ "student" => 0, "teacher" => 1, "admin" => 2 }, Core::User.roles)
    end

    test "authenticates with correct password" do
      user = Core::User.create!(valid_user_attributes)
      assert user.authenticate("securepassword123")
      assert_not user.authenticate("wrongpassword")
    end

    test "email_verified? returns false by default" do
      user = Core::User.new(valid_user_attributes)
      assert_not user.email_verified?
    end

    test "verify_email! sets email_verified_at" do
      user = Core::User.create!(valid_user_attributes)
      user.verify_email!
      assert user.email_verified?
      assert_not_nil user.email_verified_at
    end

    test "onboarding_completed? returns false by default" do
      user = Core::User.new(valid_user_attributes)
      assert_not user.onboarding_completed?
    end

    test "complete_onboarding! sets flag" do
      user = Core::User.create!(valid_user_attributes)
      user.complete_onboarding!
      assert user.onboarding_completed?
    end

    test "remember! generates and stores token" do
      user = Core::User.create!(valid_user_attributes)
      token = user.remember!
      assert_not_nil token
      assert_not_nil user.remember_token
    end

    test "forget! clears remember token" do
      user = Core::User.create!(valid_user_attributes)
      user.remember!
      user.forget!
      assert_nil user.remember_token
    end

    test "generates token for email verification" do
      user = Core::User.create!(valid_user_attributes)
      token = user.generate_token_for(:email_verification)
      assert_not_nil token

      found = Core::User.find_by_token_for(:email_verification, token)
      assert_equal user, found
    end

    test "generates token for password reset" do
      user = Core::User.create!(valid_user_attributes)
      token = user.generate_token_for(:password_reset)
      assert_not_nil token

      found = Core::User.find_by_token_for(:password_reset, token)
      assert_equal user, found
    end

    test "authorization - student" do
      user = Core::User.new(valid_user_attributes.merge(role: :student))
      assert user.can_create_routes?
      assert_not user.can_manage_users?
      assert_not user.can_manage_content?
    end

    test "authorization - admin" do
      user = Core::User.new(valid_user_attributes.merge(role: :admin))
      assert user.can_manage_users?
      assert user.can_manage_content?
      assert user.can_access_analytics?
    end

    test "authorization - teacher" do
      user = Core::User.new(valid_user_attributes.merge(role: :teacher))
      assert_not user.can_manage_users?
      assert user.can_manage_content?
      assert user.can_access_analytics?
    end
  end
end
