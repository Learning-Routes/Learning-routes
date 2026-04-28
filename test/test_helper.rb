ENV["RAILS_ENV"] ||= "test"
require_relative "../config/environment"
require "rails/test_help"

module ActiveSupport
  class TestCase
    # Run tests serially on arm64-darwin — the pg gem (1.6.x) segfaults when
    # the parallel runner forks worker processes that already loaded libpq.
    # Same root cause as the Solid Queue arm64 fork crash documented in
    # config/environments/development.rb. Stay parallel everywhere else.
    if RUBY_PLATFORM.include?("arm64-darwin")
      parallelize(workers: 1)
    else
      parallelize(workers: :number_of_processors)
    end

    # Setup all fixtures in test/fixtures/*.yml for all tests in alphabetical order.
    fixtures :all

    # Add more helper methods to be used by all tests here...
  end
end
