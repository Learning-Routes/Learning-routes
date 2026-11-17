# One address: moving the app to learningroutes.com (Platform STEP 19)

Until STEP 19, the landing was on `learningroutes.com` and the app on `app.learningroutes.com`. The session cookie is `__Host-lr_session`, which only its own host can read, so moving between the two meant signing in again. Now everything people use is on `learningroutes.com`:

- `app.learningroutes.com` answers 308 to the same path on `learningroutes.com`.
- A page opened there by someone signed in first goes through one silent hand-off (`apps/web/workers/old-host.ts`, `apps/api/src/auth/handoff.ts`). Its code lives a minute, is used once, and works only from the same address and browser.
- Creators' pages stay on `[slug].learningroutes.com`.

No DNS record changes. `learningroutes.com`, `www` and `app` are already custom domains of the web Worker (`apps/web/wrangler.jsonc`), and the change is only in the Workers' settings and code.

## Before you deploy

1. **Turnstile:** let the widget run on the apex.
   1. In the Cloudflare dashboard, open **Turnstile**.
   2. Open the "Quiero enseñar" widget, then **Settings**.
   3. Under **Hostname Management**, choose **Add hostnames**, add `learningroutes.com`, and **Save**. Keep `app.learningroutes.com` in the list until the end.

   The API also checks the hostname Turnstile reports. That is `TURNSTILE_HOSTNAMES`, now `learningroutes.com`, in `apps/api/wrangler.jsonc`.

2. **Pick a quiet moment.** The four Workers below must go out one after the other with nothing in between. While some are already moved and others are not yet, the API refuses the web Worker's calls, because it accepts only its own `APP_ORIGIN` host. Signed-in pages fail for that minute; public pages keep working.

## Deploy, in this order

From `main`, after the PR is merged:

```sh
git switch main && git pull
pnpm --filter @learning-routes/api exec wrangler deploy
pnpm --filter @learning-routes/api exec wrangler deploy --config wrangler.mcp.jsonc
pnpm --filter @learning-routes/api exec wrangler deploy --config wrangler.agent.jsonc
pnpm --filter @learning-routes/content exec wrangler deploy
pnpm --filter @learning-routes/web build
pnpm --filter @learning-routes/web exec wrangler deploy
```

The content Worker only adds `https://learningroutes.com` to the pages that may frame a creation (`FRAME_ANCESTORS`).

## Check each step

1. `pnpm smoke:prod`. It now also checks that `app.learningroutes.com/mis-rutas?a=1`, `/mcp` and `/api/auth/get-session` answer 308 to the same path on the apex. Every line must say `ok`.
2. In a browser where you were already signed in on the old address, open `https://app.learningroutes.com/mis-rutas`. You land on `https://learningroutes.com/mis-rutas`, signed in, without a sign-in page.
3. Open `https://learningroutes.com/es`. The header says **Mis rutas** instead of **Entrar**. "Quiero enseñar" opens `https://learningroutes.com/ser-creador`, still signed in.
4. In a private window, open `https://learningroutes.com/es`. The header says **Entrar**: the cached page is the same for everyone.
5. On "Quiero enseñar", the Turnstile check passes. If it says the host is not allowed, step 1 of "Before you deploy" was missed.

## Your assistants (MCP)

Access tokens name the old issuer and server (`https://app.learningroutes.com/api/auth`, `https://app.learningroutes.com/mcp`), so they stop working with the deploy. Reconnect each assistant once, at the new address:

- **Claude (claude.ai or the desktop app):**
  1. Go to **Settings → Connectors**.
  2. Open **Learning Routes** and choose **Remove**.
  3. Choose **Add custom connector**, enter the name `Learning Routes` and the URL `https://learningroutes.com/mcp`, then **Add**.
  4. Choose **Connect**, sign in if asked, and approve.
- **Claude Code:**

  ```sh
  claude mcp remove learning-routes
  claude mcp add --transport http learning-routes https://learningroutes.com/mcp
  ```

  Then run `/mcp` in Claude Code, pick `learning-routes`, and authenticate.

- **Your own assistant inside the app** (`/creador/asistente`) needs nothing: it runs on the same host as the app.

Old connections still appear in **Creador → Conexiones** until you remove them there. Removing them is tidy, but not required.

## When it is done

After a week with no visits to `app.learningroutes.com`:

- Remove `app.learningroutes.com` from the Turnstile widget's hostnames.
- Keep the custom domain and the 308 for as long as old links and bookmarks may exist. They cost nothing.

## Roll back

```sh
git revert <the STEP 19 merge commit>
```

Then deploy the same Workers in the same order. Sessions started on the old host before the move still work there. Anyone who first signed in on `learningroutes.com` after the move signs in once more. Assistants reconnected at the new address must be reconnected at `https://app.learningroutes.com/mcp`.
