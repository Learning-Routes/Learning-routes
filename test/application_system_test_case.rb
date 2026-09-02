require "test_helper"

class ApplicationSystemTestCase < ActionDispatch::SystemTestCase
  # Chrome's autofill / saved-password / leak-detection UI targets exactly the
  # email + password fields these tests fill in (autocomplete="email" /
  # "current-password"), and it observably fights with Capybara's typed
  # `fill_in`: a field can read back empty right after being filled, or show a
  # value from a completely different test's fixture data. Both were caught
  # live while diagnosing owner_dashboard_test.rb flakiness. Disabling these
  # services keeps the browser from mutating form state the test didn't ask
  # for — it doesn't touch anything the app itself renders or logic-tests.
  driven_by :selenium, using: :headless_chrome, screen_size: [1440, 1000] do |options|
    options.add_preference(:credentials_enable_service, false)
    options.add_preference(:profile, password_manager_enabled: false, password_manager_leak_detection: false)
    options.add_argument("--disable-features=AutofillServerCommunication,PasswordLeakDetection,PasswordManagerOnboarding")
  end
end
