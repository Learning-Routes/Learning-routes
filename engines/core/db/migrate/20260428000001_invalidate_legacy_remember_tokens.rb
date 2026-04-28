# Switching remember_token from a plaintext token to a SHA-256 digest of the token.
# Existing rows hold raw tokens that will never match an incoming digest comparison
# anyway — clear them so the unique-index doesn't get hit by a digest-vs-raw collision
# (extremely unlikely, but cheap to be safe). Users with a remember-me cookie set
# before this deploy will simply re-authenticate on next visit, no data loss.
class InvalidateLegacyRememberTokens < ActiveRecord::Migration[8.1]
  def up
    Core::User.where.not(remember_token: nil).update_all(remember_token: nil)
  end

  def down
    # No-op — we cannot recover plaintext tokens. Re-login is the only way back.
  end
end
