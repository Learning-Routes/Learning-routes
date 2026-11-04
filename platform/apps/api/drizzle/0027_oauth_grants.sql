-- Safe to run again: the database runbook re-runs it after a restore, after 0013's revoke.
-- Better Auth's OAuth tables, written by the OAuth provider as lr_app, with no row-level
-- security, like its other tables. connection_uses is the MCP's note of when each was last used.
grant select, insert, update, delete on
  jwks, oauth_client, oauth_resource, oauth_client_resource, oauth_refresh_token,
  oauth_access_token, oauth_consent, oauth_client_assertion, connection_uses
  to lr_app;
