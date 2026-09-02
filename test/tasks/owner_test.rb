require "test_helper"
require "rake"

class OwnerTaskTest < ActiveSupport::TestCase
  test "promotion task requires runtime credentials and never prints them" do
    Rails.application.load_tasks unless Rake::Task.task_defined?("owner:promote")

    assert Rake::Task.task_defined?("owner:promote")
    task = Rake::Task["owner:promote"]
    task.reenable
    output = capture_io do
      with_env("OWNER_EMAIL" => nil, "OWNER_PASSWORD" => nil) do
        assert_raises(Owner::Promotion::AuthenticationError) { task.invoke }
      end
    end.join
    assert_no_match(/password|@/, output)
  end

  private

  def with_env(values)
    previous = values.to_h { |key, _| [key, ENV[key]] }
    values.each { |key, value| value.nil? ? ENV.delete(key) : ENV[key] = value }
    yield
  ensure
    previous.each { |key, value| value.nil? ? ENV.delete(key) : ENV[key] = value }
  end
end
