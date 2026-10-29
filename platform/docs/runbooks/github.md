# GitHub: settings and the steps only the owner can take

How the repository is set up on GitHub, the commands that set it, and what is left for the owner. Every command uses the `gh` CLI, logged in as the owner.

## The production environment

The Rails deploy (`.github/workflows/deploy.yml`) runs only from `main`, in the `production` environment. That environment releases its secrets only after its required reviewer, the owner, approves the run, and only for the `main` branch. It was created with:

```sh
uid=$(gh api users/Garcia-G-G --jq .id)
gh api -X PUT repos/Learning-Routes/Learning-routes/environments/production --input - <<EOF2
{"reviewers":[{"type":"User","id":$uid}],"prevent_self_review":false,
 "deployment_branch_policy":{"protected_branches":false,"custom_branch_policies":true}}
EOF2
gh api -X POST repos/Learning-Routes/Learning-routes/environments/production/deployment-branch-policies -f name=main -f type=branch
```

### For the owner: move the deploy secrets into the environment

The deploy secrets are still repository secrets, which any workflow in the repository could read. Only the owner holds their values. While both exist, the environment's copy wins, so the deploy keeps working during the move.

1. For each of `KAMAL_REGISTRY_USERNAME`, `KAMAL_REGISTRY_PASSWORD`, `RAILS_MASTER_KEY`, `LEARNING_ROUTES_DATABASE_PASSWORD` and `SSH_PRIVATE_KEY`, set it on the environment. `gh` asks for the value and does not echo it:

   ```sh
   gh secret set KAMAL_REGISTRY_USERNAME --env production --repo Learning-Routes/Learning-routes
   ```

   For `SSH_PRIVATE_KEY`, read the value from the key file instead: `gh secret set SSH_PRIVATE_KEY --env production --repo Learning-Routes/Learning-routes < path/to/key`.
2. Check that all five are there: `gh secret list --env production --repo Learning-Routes/Learning-routes`.
3. In the Actions tab, run **Deploy to Production** on `main`, approve it when GitHub asks, and check that it succeeds.
4. Only then delete each repository-level copy: `gh secret delete KAMAL_REGISTRY_USERNAME --repo Learning-Routes/Learning-routes`, and the same for the other four.
5. Check that the repository list no longer has them: `gh secret list --repo Learning-Routes/Learning-routes`.

## Security settings

Set on 28 October 2026 (Platform STEP 1 §2.8). Each command is safe to run again.

| Setting | State | Command |
|---|---|---|
| Secret scanning and push protection | on | `gh api -X PATCH repos/Learning-Routes/Learning-routes --input -` with `{"security_and_analysis":{"secret_scanning":{"status":"enabled"},"secret_scanning_push_protection":{"status":"enabled"}}}` |
| Private vulnerability reporting | on | `gh api -X PUT repos/Learning-Routes/Learning-routes/private-vulnerability-reporting` |
| Dependabot security updates | on (with vulnerability alerts) | `gh api -X PUT repos/Learning-Routes/Learning-routes/vulnerability-alerts`, then `gh api -X PUT repos/Learning-Routes/Learning-routes/automated-security-fixes` |
| Workflows on pull requests from forks wait for approval | all outside contributors | `gh api -X PUT repos/Learning-Routes/Learning-routes/actions/permissions/fork-pr-contributor-approval -f approval_policy=all_external_contributors` |

To check them: `gh api repos/Learning-Routes/Learning-routes --jq .security_and_analysis`, `gh api repos/Learning-Routes/Learning-routes/private-vulnerability-reporting` and `gh api repos/Learning-Routes/Learning-routes/actions/permissions/fork-pr-contributor-approval`.

## Branch protection on main

Set on 28 October 2026 (Platform STEP 1 §2.9):

- a pull request is required, with **one approving review** and **review from the code owners** for the paths in `.github/CODEOWNERS`;
- an approval is **dismissed when new commits are pushed**;
- **linear history**, no force pushes, no deletion;
- the required checks: `lint`, `scan_ruby`, `scan_js`, `test`, `system-test`, `no-tool-attribution`, `platform`, `workflow-rules` and `secret-scan`;
- **`enforce_admins` is off.**

### The trade-off

The owner's account opens most pull requests, and GitHub never lets an author approve their own pull request. With `enforce_admins` on, the owner could not merge his own work without a second reviewer. With it off, the owner can merge his own green pull requests as an admin (`gh pr merge --admin`); everyone else needs his approval. The cost is that an admin merge skips the review requirement, so the owner merges only green pull requests, and turns `enforce_admins` on once a second maintainer can review.

### The command

```sh
gh api -X PUT repos/Learning-Routes/Learning-routes/branches/main/protection --input - <<'EOF2'
{"required_status_checks":{"strict":false,"contexts":["lint","scan_ruby","scan_js","test","system-test","no-tool-attribution","platform","workflow-rules","secret-scan"]},
 "enforce_admins":false,
 "required_pull_request_reviews":{"required_approving_review_count":1,"require_code_owner_reviews":true,"dismiss_stale_reviews":true,"require_last_push_approval":false},
 "restrictions":null,"required_linear_history":true,"allow_force_pushes":false,"allow_deletions":false,
 "block_creations":false,"required_conversation_resolution":false,"lock_branch":false,"allow_fork_syncing":false}
EOF2
```

## The Contributor License Agreement

Contributors sign [`CLA.md`](../../../CLA.md) through the **CLA assistant GitHub App** ([cla-assistant.io](https://cla-assistant.io)). It isn't the GitHub Actions version ("CLA assistant lite"), which needs `pull_request_target`, and the workflow rules forbid that.

1. **Create a gist with the agreement.** At [gist.github.com](https://gist.github.com), signed in as the owner, create a gist named `CLA.md` and paste the text of `CLA.md` from the repository's `main`. Save it.
2. **Sign in to cla-assistant.io** with the owner's GitHub account, and authorize the app for the `Learning-Routes` organization.
3. **Link the gist to the repository.** In cla-assistant.io, choose "Configure CLA", select `Learning-Routes/Learning-routes`, select the gist from step 1, and choose "Link".
4. **Wait for the app to report on a pull request.** Open any pull request, or push to an open one: a check named `license/cla` appears, and the bot comments asking any author who hasn't signed to do so.
5. **Require the check.** In the repository's Settings, open Branches, then the rule for `main`. Add `license/cla` to the required status checks and save.
6. **Ask the earlier contributors to sign.** The agreement also covers contributions made before it existed. Ask everyone who has contributed so far to sign it once, at the link the bot gives, or at cla-assistant.io for this repository.

When `CLA.md` changes, update the gist to the same text. cla-assistant.io then asks contributors to sign the new version.
