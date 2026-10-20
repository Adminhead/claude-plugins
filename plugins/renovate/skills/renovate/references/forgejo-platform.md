# Renovate on Forgejo and Codeberg

Checked against docs.renovatebot.com (Forgejo platform page, self-hosted configuration, running Renovate) on 2026-10-19, Renovate 44.171.1. Forgejo is a supported platform (`platform=forgejo`). There is no hosted Renovate app for Forgejo or Codeberg: someone must run Renovate on a schedule. Codeberg itself does not run Renovate for you.

Writes here (creating the bot account, token, secret, or workflow) are admin actions on the forge. Draft them, show them, and wait for approval. Never print or read a token.

## 1. Bot account

- Create a dedicated Forgejo user for Renovate. The docs say it should have a full name and email address configured.
- Never share that user name with other bots; the docs warn this causes flip-flopping.
- Give it write access (collaborator, or a team) on each repo it should update.

## 2. Token

Create a personal access token for the bot. Docs scopes for current Forgejo (>= 1.20):

| Scope | Permission | Note |
| --- | --- | --- |
| repo | Read and Write | |
| user | Read | |
| issue | Read and Write | needed for the Dependency Dashboard |
| organization | Read | org labels and teams |
| package | Read | only if you use Forgejo packages (`read:packages`) |

Older Forgejo needs `email` Read (<= 1.19.3) or `misc` Read (1.20.0 and 1.20.1 only). The exact scope names in the Forgejo token UI were not verified; match them to the table by meaning and check the token page.

Hand the token to Renovate as `RENOVATE_TOKEN` (or `--token`, or `token` in a `config.js`). Store it as a repo or org Actions secret; never in `renovate.json`.

Also set `RENOVATE_GITHUB_COM_TOKEN` to a read-only github.com PAT. The docs say to do this on every platform except github.com, for changelog fetching and the hourly API limit. Without it, repos with GitHub-hosted dependencies can hit rate limits and Renovate may close and reopen PRs.

## 3. Global config

Self-hosted settings go in environment variables, CLI flags, or a `config.js`, not in the repo's `renovate.json`:

| Variable | Value |
| --- | --- |
| `RENOVATE_PLATFORM` | `forgejo` |
| `RENOVATE_ENDPOINT` | the instance API URL; for Forgejo this is `https://<host>/api/v1/` by analogy with Gitea. The Forgejo page does not state the format, so check it against your first run's log |
| `RENOVATE_TOKEN` | the bot's PAT |
| `RENOVATE_AUTODISCOVER` | `true` to run on every repo the bot can access (default false) |
| `RENOVATE_AUTODISCOVER_FILTER` | restrict to `org/repo` globs or regexes; no commas inside a filter when set by env |
| `RENOVATE_GITHUB_COM_TOKEN` | see above |

Autodiscover skips mirrors, repos where the bot lacks push or pull permission, and repos with pull requests disabled. Without autodiscover, pass the repos as arguments or set `repositories` in `config.js`. `autodiscoverRepoSort` and `autodiscoverRepoOrder` set the server-side order.

By default (`onboarding: true`, `requireConfig: required`) Renovate opens a "Configure Renovate" onboarding PR in each repo and does nothing else until its config is merged. Keep that default unless the user configures everything centrally.

## 4. Running it on a schedule

Run Renovate as a job that starts, processes the repos, and exits. Two options from the docs: the `renovate` npm package (`npx`), or the Docker image `ghcr.io/renovatebot/renovate` (also `renovate/renovate` on Docker Hub). The default image needs only Node and installs tools at runtime; `-full` ships many tools and weighs several GB.

Pin the version; do not use `latest` in an unattended job.

### Option A: a scheduled Forgejo Actions workflow

Forgejo Actions supports `schedule`, `workflow_dispatch`, and a `timezone` option for `schedule`. Put the workflow in a repo the bot can read (a dedicated `renovate-runner` repo works well), at `.forgejo/workflows/renovate.yml`. The `runs-on` value is a runner label, not a GitHub-hosted name; a job waits when no matching online runner exists. The runner needs network access to the instance and to the package registries Renovate queries, and Node (the default Forgejo runner image is usually Debian with Node; check yours).

```yaml
name: renovate
on:
  schedule:
    - cron: "0 */4 * * *"
  workflow_dispatch:

jobs:
  renovate:
    runs-on: docker # replace with your runner label
    steps:
      - name: Run Renovate
        env:
          RENOVATE_PLATFORM: forgejo
          RENOVATE_ENDPOINT: https://git.example.org/api/v1/
          RENOVATE_TOKEN: ${{ secrets.RENOVATE_TOKEN }}
          RENOVATE_GITHUB_COM_TOKEN: ${{ secrets.RENOVATE_GITHUB_COM_TOKEN }}
          RENOVATE_AUTODISCOVER: "true"
          RENOVATE_AUTODISCOVER_FILTER: '["myorg/*"]'
          LOG_LEVEL: info
        run: npx --yes renovate@44.171.1
```

Notes:

- Run it often enough for the config `schedule`. A config schedule of "Monday before 4 AM" only works if the job runs in that window. Every 3-4 hours with a config window of at least that long is a safe pairing.
- `permissions:` is ignored by Forgejo Actions, and this job never needs `FORGEJO_TOKEN`. Only the bot PAT acts.
- Short `uses:` references resolve against the instance's `DEFAULT_ACTIONS_URL`; this workflow uses none. If you add actions, use full URLs.
- Whether secret names have restricted prefixes is not verified here; `RENOVATE_TOKEN` is a plain name.
- The first run downloads the `renovate` npm package. Use the container if runs are slow.

### Option B: a container on a host

```
docker run --rm \
  -e RENOVATE_PLATFORM=forgejo \
  -e RENOVATE_ENDPOINT=https://git.example.org/api/v1/ \
  -e RENOVATE_TOKEN \
  -e RENOVATE_GITHUB_COM_TOKEN \
  -e RENOVATE_AUTODISCOVER=true \
  ghcr.io/renovatebot/renovate:44.171.1
```

Export the tokens in the invoking shell or an env file with mode 0600, never on the command line. Trigger it from cron or a systemd timer. Mend Renovate Community/Enterprise Edition does not list Forgejo as supported, so use the OSS image.

## 5. Automerge on Forgejo

- `platformAutomerge` defaults to true, and the config-options page lists Forgejo as a supported platform for it. The Forgejo page says platform-native automerge is not supported on Forgejo older than v10.0.0 (those versions lack the required branch autodelete). Treat it as: v10+ may use it, older versions fall back to Renovate's own automerge. Verify on the user's Forgejo version before relying on either behavior.
- Platform automerge merges when "all branch policies are met", so require status checks in the branch protection rules of the repo. With no required checks the forge may merge before CI finishes.
- Renovate's own automerge (`platformAutomerge: false`) merges only after it sees passing checks on its next run. It honors `automergeSchedule`; platform automerge does not.
- Merge style: Renovate uses the repo's default merge style if allowed, otherwise falls back to an allowed one chosen to minimize commits. If no merge style is allowed, Renovate treats the repo as blocked.
- `ignoreTests: true` automerges without tests. Only set it with the user's explicit agreement.
- Renovate's status contexts, `renovate/stability-days` (age) and `renovate/artifacts`, appear on PRs. A required `renovate/artifacts` check needs `statusCheckWhen.artifactError: "always"`.

## 6. Labels, reviewers, assignees

`labels`, `reviewers`, and `assignees` in config refer to labels and users that must already exist on the repo or org (the `organization` read scope is for org labels and teams). A missing label usually produces a warning in the run log, not a failed PR.

## 7. Verify a setup

1. Trigger the workflow with `workflow_dispatch` (web UI, or `fj actions dispatch renovate.yml main` with approval; check `fj actions dispatch --help`). Actions run logs are not readable through fj; use the web UI, or forgejo-mcp `get_action_job_logs` on Forgejo v16+.
2. Expect an onboarding PR in each target repo within one run.
3. After merging the onboarding PR, expect the Dependency Dashboard issue and update PRs on the next run.
4. Common failures: 401 or 403 (token scopes, or the bot lacks repo access), "repository is blocked" (no allowed merge style), no PRs (onboarding unmerged, `requireConfig`, schedule window missed), GitHub rate-limit warnings (`RENOVATE_GITHUB_COM_TOKEN` missing).
