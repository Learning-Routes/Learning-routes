require "test_helper"

# §1 pinned where it actually lives.
#
# The controller test for "the second submit of the day works" can no longer
# catch this on its own: WP-28 also isolates bookkeeping failures so a student
# always gets their scored result, and that isolation SWALLOWS the exception this
# defect raises. Restoring the validation leaves the controller tests green.
#
# So the guard belongs on the model. `take_snapshot!` uses `create_or_find_by!`,
# which is defined as "attempt `create!`, rescue `ActiveRecord::RecordNotUnique`"
# — the DATABASE's error, from `idx_progress_snapshots_unique`. A model-level
# uniqueness validation runs BEFORE the INSERT and raises `RecordInvalid`, which
# `create_or_find_by!` does not rescue. The validation defeated the exact
# mechanism the method depends on, and the second snapshot of the day for a route
# raised for every student, every time.
class Analytics::ProgressSnapshotTest < ActiveSupport::TestCase
  def setup
    @user = create_test_user
    profile = LearningRoutesEngine::LearningProfile.create!(user: @user, current_level: "beginner")
    @route = LearningRoutesEngine::LearningRoute.create!(
      learning_profile: profile, topic: "Portugués", locale: "es", status: :active
    )
  end

  test "taking the snapshot twice in one day does not raise" do
    Analytics::ProgressSnapshot.take_snapshot!(user: @user, learning_route: @route)

    assert_nothing_raised do
      Analytics::ProgressSnapshot.take_snapshot!(user: @user, learning_route: @route)
    end
  end

  test "the second call returns the existing snapshot rather than a new row" do
    first = Analytics::ProgressSnapshot.take_snapshot!(user: @user, learning_route: @route)
    second = Analytics::ProgressSnapshot.take_snapshot!(user: @user, learning_route: @route)

    assert_equal first.id, second.id
    assert_equal 1, Analytics::ProgressSnapshot.where(
      user: @user, learning_route: @route, snapshot_date: Date.current
    ).count
  end

  # The database index is the guard, and it must stay the guard: it is the only
  # one that holds under concurrent INSERTs, which a model validation cannot do.
  test "the database still refuses a duplicate that bypasses the model" do
    Analytics::ProgressSnapshot.take_snapshot!(user: @user, learning_route: @route)

    duplicate = Analytics::ProgressSnapshot.new(
      user: @user, learning_route: @route, snapshot_date: Date.current,
      completion_percentage: 0, steps_completed: 0, total_steps: 1
    )

    assert_raises(ActiveRecord::RecordNotUnique) { duplicate.save!(validate: false) }
  end

  # Two routes on the same day are not a collision — the index is scoped to the
  # route, and a student working on several routes must snapshot each.
  test "a different route on the same day gets its own snapshot" do
    other = LearningRoutesEngine::LearningRoute.create!(
      learning_profile: LearningRoutesEngine::LearningProfile.find_by!(user: @user),
      topic: "Otra", locale: "es", status: :active
    )

    Analytics::ProgressSnapshot.take_snapshot!(user: @user, learning_route: @route)
    Analytics::ProgressSnapshot.take_snapshot!(user: @user, learning_route: other)

    assert_equal 2, Analytics::ProgressSnapshot.where(user: @user, snapshot_date: Date.current).count
  end
end
