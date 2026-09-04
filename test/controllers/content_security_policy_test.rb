require "test_helper"

# THE CLASS: a feature needs a CSP directive, nobody writes it down, and the
# browser silently refuses the feature.
#
# Two features died this way and neither raised anything a test could see:
#
#   media-src   the voice recorder's PREVIEW. `<audio src="blob:...">` fell
#               through to `default-src 'self'`, so a student could never listen
#               back to their own recording before sending it.
#   worker-src  canvas-confetti builds its worker from a `blob:` URL. It fell
#               through to `script-src`, so the celebration on a correct answer
#               never fired. (WP-23 §3.)
#
# The COMMENT beside each assertion is the point of this file. A directive list
# with no attribution is unmaintainable — the next person deletes one to tighten
# the policy and breaks a feature nobody connected to it. Every entry here names
# who needs it and why, so removing one means removing a feature on purpose.
class ContentSecurityPolicyTest < ActionDispatch::IntegrationTest
  def setup
    @user = create_test_user(email_verified_at: Time.current)
    post core.sign_in_path, params: { email: @user.email, password: "password123" }
    get main_app.dashboard_path
    follow_redirect! while response.redirect?
    assert_response :success
    @policy = parse_policy(response.headers["Content-Security-Policy"])
  end

  test "the policy is enforced, not report-only" do
    assert response.headers["Content-Security-Policy"].present?,
      "no CSP header at all; every assertion below would be vacuous"
    assert_nil response.headers["Content-Security-Policy-Report-Only"]
  end

  # ── who needs what ──────────────────────────────────────────────────────

  test "media-src allows blob: for the voice recorder's preview" do
    # voice_recorder_controller sets previewAudio.src to a blob: URL of the
    # student's own recording. Without this they cannot hear it before sending.
    assert_includes @policy.fetch("media-src", []), "blob:"
    # Lesson audio is same-origin: SectionAudioGenerator writes to
    # /storage/audio/sections/... and it is served from this host.
    assert_includes @policy.fetch("media-src", []), "'self'"
  end

  test "worker-src allows blob: for canvas-confetti" do
    # canvas-confetti constructs a Worker from a blob:. Without this the
    # celebration is blocked and a correct answer looks like nothing happened.
    assert_includes @policy.fetch("worker-src", []), "blob:"
  end

  test "script-src carries a nonce and never unsafe-inline" do
    # Once a nonce is present browsers IGNORE 'unsafe-inline' in script-src, so
    # inline handlers can never be unblocked that way — they have to move to
    # Stimulus/CSS. That is WP-23 §5 and is why it cannot be shortcut.
    script_src = @policy.fetch("script-src", [])
    assert script_src.any? { |source| source.start_with?("'nonce-") },
      "the nonce generator stopped applying to script-src"
    assert_not_includes script_src, "'unsafe-inline'"
  end

  test "connect-src allows the websocket ActionCable needs" do
    # Turbo Streams over ActionCable. Without this, live updates die silently.
    assert @policy.fetch("connect-src", []).any? { |source| source.start_with?("ws") },
      "no websocket source; ActionCable would be blocked"
  end

  test "frame-src allows self for the code-playground sandbox" do
    # /sandbox.html runs student Python. It is additionally locked down with
    # sandbox="allow-scripts", which gives it an opaque origin.
    assert_includes @policy.fetch("frame-src", []), "'self'"
  end

  test "the clickjacking and object protections stay closed" do
    # These are the ones that must NOT gain sources.
    assert_equal ["'none'"], @policy.fetch("frame-ancestors", [])
    assert_equal ["'none'"], @policy.fetch("object-src", [])
  end

  # A directive that falls back to default-src is exactly how both defects
  # happened, so name the ones that must be explicit.
  test "every directive a loaded feature depends on is set explicitly" do
    required = %w[media-src worker-src script-src style-src connect-src frame-src img-src font-src]
    missing = required.reject { |directive| @policy.key?(directive) }

    assert_empty missing,
      "these fall back to default-src 'self', which silently refuses the feature " \
      "that needs them — the same way media-src and worker-src did:\n  " + missing.join("\n  ")
  end

  private

  def parse_policy(header)
    header.to_s.split(";").each_with_object({}) do |directive, policy|
      name, *sources = directive.strip.split(/\s+/)
      next if name.blank?

      policy[name] = sources
    end
  end
end
