require "test_helper"

class JourneyPageTest < ActionDispatch::IntegrationTest
  test "journey route exists and redirects unauthenticated users" do
    get "/learning/routes/00000000-0000-0000-0000-000000000001/journey"
    assert_response :redirect
  end

  test "show route still works for unauthenticated users" do
    get "/learning/routes/00000000-0000-0000-0000-000000000001"
    assert_response :redirect
  end
end
