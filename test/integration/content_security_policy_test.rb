# frozen_string_literal: true

require "test_helper"

class ContentSecurityPolicyTest < ActionDispatch::IntegrationTest
  test "CSP header allows the sandbox iframe and blocks framing" do
    get "/"
    csp = response.headers["Content-Security-Policy"]
    assert csp.present?, "expected a CSP header"

    # Code-playground sandbox iframe (/sandbox.html) must be loadable.
    assert_includes csp, "frame-src 'self'"
    # But the app itself must not be framable (clickjacking).
    assert_includes csp, "frame-ancestors 'none'"
    # Scripts stay locked to self + the pinned CDN (no unsafe-inline/eval).
    assert_includes csp, "script-src 'self'"
    assert_not_includes csp, "unsafe-eval"
  end

  test "each response carries a fresh script nonce" do
    get "/"
    first = response.headers["Content-Security-Policy"][/'nonce-([^']+)'/, 1]
    get "/"
    second = response.headers["Content-Security-Policy"][/'nonce-([^']+)'/, 1]
    assert first.present?
    assert_not_equal first, second, "nonce must be per-request, not session-derived"
  end
end
