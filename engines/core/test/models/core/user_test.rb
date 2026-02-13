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

    test "authenticatable concern" do
      user = Core::User.create!(valid_user_attributes)
      assert user.authenticate("securepassword123")
      assert_not user.authenticate("wrongpassword")
    end

    test "authorizable concern - student" do
      user = Core::User.new(valid_user_attributes.merge(role: :student))
      assert user.can_create_routes?
      assert_not user.can_manage_users?
      assert_not user.can_manage_content?
    end

    test "authorizable concern - admin" do
      user = Core::User.new(valid_user_attributes.merge(role: :admin))
      assert user.can_manage_users?
      assert user.can_manage_content?
      assert user.can_access_analytics?
    end

    test "authorizable concern - teacher" do
      user = Core::User.new(valid_user_attributes.merge(role: :teacher))
      assert_not user.can_manage_users?
      assert user.can_manage_content?
      assert user.can_access_analytics?
    end
  end
end
