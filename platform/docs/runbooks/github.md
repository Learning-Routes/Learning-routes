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
