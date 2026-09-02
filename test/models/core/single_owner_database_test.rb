require "test_helper"

class Core::SingleOwnerDatabaseTest < ActiveSupport::TestCase
  test "the database has a unique partial index for the owner role" do
    index = Core::User.connection.indexes(:core_users).find { |candidate| candidate.name == "idx_core_users_single_owner" }

    assert index, "owner cardinality must be enforced by PostgreSQL"
    assert index.unique
    assert_equal "(role = 2)", index.where
  end

  test "application validation rejects a second owner" do
    create_user!(email: "first-owner@example.test", role: :owner)
    second = Core::User.new(user_attributes(email: "second-owner@example.test", role: :owner))

    assert_not second.valid?
    assert_includes second.errors[:role], "has already been taken"
  end

  test "PostgreSQL rejects a second owner when validations are bypassed" do
    create_user!(email: "database-owner@example.test", role: :owner)

    assert_raises(ActiveRecord::RecordNotUnique) do
      Core::User.insert!(user_attributes(email: "bypass-owner@example.test", role: 2).except(:password, :password_confirmation))
    end
  end

  private

  def create_user!(email:, role: :student)
    Core::User.create!(user_attributes(email: email, role: role))
  end

  def user_attributes(email:, role:)
    {
      name: "Owner Boundary",
      email: email,
      password: "password123",
      password_confirmation: "password123",
      password_digest: BCrypt::Password.create("password123"),
      role: role,
      locale: "en",
      theme: "system",
      created_at: Time.current,
      updated_at: Time.current
    }
  end
end
