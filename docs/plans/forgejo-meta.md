# Plan: forgejo-meta plugin set, with github-meta kept standalone

Status: approved 2026-10-19. Researched 2026-10-19.

Decisions (user, 2026-10-19): Q1 = disjoint closures + forge gates (no GitHub renames); Q2 = `forgejo-*`; Q8 = new `renovate` skill in forgejo-meta; Q5/Q6 = v1 also ships `forgejo-release` and `forgejo-readme`. Both extras are in forgejo-meta's closure-disjoint set; `forgejo-release` stays outside the meta like `gh-release`, `forgejo-readme` goes in the meta like `gh-readme`.

## 1. Verified facts

**Repo**
- `github-meta` = gh-issues, gh-pr, pr-comments, ship, shipper, gh-actions, dependabot, gh-readme. Transitive: ship → shipper → git-commit (also in `baseline`). Nothing else depends on the GitHub plugins.
- Prose cross-refs: `git-commit` SKILL.md:8 ("use `ship` ... if installed"); `ship` (`agent: shipper:shipper`, gh-actions for failed runs); `gh-pr` (pr-comments, ship); `recommend-plugins` SKILL.md:58 (`.github/workflows` / GitHub remote → GitHub workflows).
- `scripts/plugins.py new` rewrites marketplace.json, README catalog and the meta's plugin.json; it refuses `*-meta` names (write the meta by hand, then `register`). `check` requires plugin.json and marketplace.json versions to match.
- Paired routing evals: `evals/godot-meta/` pattern. Scaffold evals: `plugins/dependabot/evals/dependabot-sweep-merge-rules/` (`case.yaml` + `scaffold.sh`).

**Claude Code plugin docs**
- `${user_config.KEY}` is substituted in stdio MCP `command`, `args`, `env`; `sensitive: true` goes to the credential store; `headersHelper` gets no option values. Env-var stripping applies to `headersHelper` only (sentry-mcp-self-hosted already passes a sensitive token via `env`).
- A dependency of an enabled plugin starts enabled regardless of `defaultEnabled`. Plugins can't ship permission rules. `pluginConfigs` is user/managed scope only, so the configured Forgejo host is per user.

**fj (forgejo-cli, ~v0.7.0)**
- Install: release binaries (Linux x86_64/aarch64, Windows), `cargo install --locked forgejo-cli`, binstall, apt (Debian unstable, Ubuntu 25.10), Fedora COPR, Guix, Homebrew, nixpkgs/flake, OCI `codeberg.org/forgejo-contrib/forgejo-cli:latest`.
- Commands: repo, issue, pr, milestone, wiki, actions, whoami, auth, release, tag, user, org, version, completion. No `api` command, no JSON output (`--style fancy|minimal`).
- Globals `-H/--host`, `-C/--cwd`; per-command `-R/--remote`, `-r/--repo host/owner/name`.
- Auth: `fj auth login` is OAuth only where fj knows a client ID (`~/.config/forgejo-cli/client_ids`, `/etc/fj/client_ids`); otherwise `fj [-H host] auth add-token|add-key`; also `logout <host>`, `use-ssh`, `list`. Logins stored per host in `~/.local/share/forgejo-cli/keys.json` (0600). Application or OAuth (fj refreshes and rewrites). No token-print command, no token env var. No login → anonymous calls.
- Host/remote resolution: `--remote`, else the only remote, else the branch upstream remote (with `--host` only if hosts match), else a remote matching `--host`. Never defaults to `origin`. `FJ_FALLBACK_HOST` last resort; host in `-r` wins.
- PRs: `pr create` has no `--draft` (`WIP:` title prefix = draft), doesn't push, head from upstream, `--base`, `--body-file`, `-A/--autofill`, `--agit`. `pr status [--wait]` lists state+context (no target URL). `pr merge --method merge|rebase|rebase-merge|squash|manual|fast-forward-only [--delete]`, default = repo `default_merge_style`. Also `pr view <id> comments|files|diff|commits`, `pr review [list --comments --all | request]`, `pr comment|checkout|edit|close`.
- Issues: no `--label` on `issue create` (use `issue edit N labels -a/-r`); `--template`, `issue templates`, `search` (labels/creator/assignee/state), `depend`, `block`.
- Releases: `create` (`-t`/`-T`, `-a`, `-d`, `-p`), `edit`, `delete`, `list`, `view`, `asset create|delete|download`.
- Actions: `tasks`, `dispatch <wf> <ref> -I k=v`, `variables`/`secrets` list/create/delete. No run logs.
- `fj repo view` doesn't show default branch or merge settings.

**forgejo-mcp (git.b4mad.industries/agentic-forges/forgejo-mcp)**
- Go, GPL-3.0, latest v3.3.0 (2026-10-10); tar.gz + `.mcpb` for darwin/linux amd64/arm64. Install: `go install git.b4mad.industries/agentic-forges/forgejo-mcp/v3@latest`, AUR `forgejo-mcp`/`-bin`, nixpkgs unstable, signed image `git.b4mad.industries/agentic-forges/forgejo-mcp:v3.3.0`.
- Transports stdio (default)/sse/http. `--url`/`FORGEJO_URL`, `--token`/`FORGEJO_ACCESS_TOKEN`; falls back to `GITEA_HOST`/`GITEA_ACCESS_TOKEN`. Path uploads off unless `FORGEJO_MCP_ALLOW_FILE_PATH_UPLOAD`. No read-only mode. `--cli` mode exists.
- ~170 tools. Actions: `dispatch_workflow`, `list_workflow_runs`, `get_workflow_run`, `list_action_run_jobs`, `get_action_job_logs` (Forgejo v16+), cancel/delete run, artifacts, secrets. Web-URL run number ≠ DB run ID (map via `list_workflow_runs` `run_number`).
- Destructive: `delete_org`, `delete_release`, `delete_branch`, `delete_file`, `merge_pull_request`, `test_repo_hook`, `reset_issue_time`, ...

**Forgejo Actions (docs v17 + source)**
- `ListWorkflows` uses the first existing dir of `.forgejo/workflows`, `.gitea/workflows`, `.github/workflows`, so a Forgejo repo with only `.github/workflows` runs those.
- `runs-on` = runner labels; no matching online runner → job waits. Default image usually Debian bookworm + Node.
- Ignored: `permissions`, job `continue-on-error`. OIDC via `enable-openid-connect`. Contexts `forgejo`/`forge` (`github` alias). `FORGEJO_TOKEN` (`GITHUB_TOKEN` alias): read-only on fork `pull_request`, write on `pull_request_target`.
- Events: push, issues, issue_comment, pull_request, pull_request_target, release, schedule (timezone option), workflow_call, workflow_dispatch. No `workflow_run`.
- Short `uses:` resolve against `DEFAULT_ACTIONS_URL` (default `https://data.forgejo.org`); full-URL refs recommended.
- Fork PRs need approval unless trusted (approve once/always; trust expires after 3 months inactivity). Runner v8+ fails on schema errors; `forgejo-runner validate --repository <url>` from v9. `enable-email-notifications` exists.

**Detection:** `GET https://<host>/api/forgejo/v1/version` answers unauthenticated on Forgejo hosts, 404 on github.com.

**Renovate:** `platform=forgejo`; token scopes repo RW, user R, issue RW, org R; no platform-native automerge.

**Codeberg ToS §2(1)7:** projects mostly of generative-AI code must not be shared on Codeberg.

**UNVERIFIED**
- U1 `fj pr status --wait` exit code on a failed check.
- U2 whether the API/fj exposes review-thread resolved/outdated state.
- U3 whether a `.mcpb` install honors `userConfig`.
- U4 whether a meta-dependency install prompts for required `userConfig`.
- U5 Forgejo PR/issue template locations.
- U6 exact Forgejo token scope names.
- U7 `forgejo-mcp --version`.
- U8 whether existing `ship`/`pr-comments` routing evals pass.
- U9 whether scaffolds work in paired evals under `evals/`.

## 2. Goal and done

Project-scope `forgejo-meta` covering Codeberg/self-hosted Forgejo like `github-meta` covers GitHub, plus the Forgejo MCP server. The two metas share no forge-specific plugin, and with both installed each forge's skills fire only for their forge.

Done when:
1. `python3 scripts/plugins.py check` passes, including a new disjointness rule.
2. `uv run --with pytest pytest scripts/test_plugins.py` passes.
3. `claude plugin validate --strict .` and per-plugin validate pass.
4. Each new skill's routing eval passes; paired `evals/forges/` passes at 3 runs.
5. `forgejo-mcp` connects in `/mcp`; `get_my_user_info` returns the configured user.
6. Catalog regenerated; README line 6 lists `forgejo-meta`.

## 3. Approach

- **Naming:** `forgejo-` prefix: forgejo-cli, forgejo-issues, forgejo-pr, forgejo-pr-comments, forgejo-ship, forgejo-shipper, forgejo-actions, forgejo-mcp; forge-neutral `renovate`.
- **Tools:** fj first. forgejo-mcp tools fill gaps (Actions runs/logs, review comments, repo settings, branch protection, statuses as JSON, label IDs). Skills check for `mcp__plugin_forgejo-mcp_forgejo__*` tools and fall back to the web UI / pasted logs. No hard skill dependency on forgejo-mcp; the meta installs it.
- **MCP auth:** stdio, `forgejo-mcp` binary on PATH (sentry-mcp-self-hosted pattern).
  - `args`: `["--transport","stdio","--url","https://${user_config.forgejo_host}"]`
  - `env`: `FORGEJO_ACCESS_TOKEN=${user_config.forgejo_token}` (sensitive, required), `FORGEJO_USER_AGENT="forgejo-mcp (adminhead plugin)"`, and blank `GITEA_HOST`, `GITEA_ACCESS_TOKEN`, `FORGEJO_URL`, `FORGEJO_MCP_ALLOW_FILE_PATH_UPLOAD`, `FORGEJO_MCP_UPLOAD_ROOT`, `FORGEJO_DEBUG`. Token never in argv.
- **Standalone:** (a) dependency closures of the two metas disjoint except `baseline` plugins, enforced by `check`; (b) each forge skill's description names its forge; (c) each forge skill starts with a forge gate (remote host: github.com or a `gh auth status --hostname` host = GitHub; `/api/forgejo/v1/version` answers, codeberg.org, or `.forgejo/` / `.gitea/` workflows = Forgejo); on the wrong forge it stops and names its counterpart. No GitHub plugin renamed.

**Rejected:** wrapper reading fj's `keys.json` (no print command, OAuth expiry, fj-owned file); auto-detecting instance from remote (deferred, Q4); remote HTTP + headersHelper; `.mcpb` URL install (per-OS, U3); podman container (README alternative only); `fj-` prefix (Q2); renaming generic GitHub plugins (Q3); shared forge-neutral skills; `forgejo-readme` (Q5); `forgejo-dependabot` (doesn't exist on Forgejo → `renovate`).

## 4. New plugins

| Plugin | Kind | Description / trigger sketch |
| --- | --- | --- |
| `forgejo-meta` | meta (project) | Plugin set for Forgejo and Codeberg workflows (fj CLI, issues, PRs, Actions, Renovate, Forgejo MCP server), installed at project scope. Ships no components of its own. |
| `forgejo-cli` | skill | Uses `fj` against Codeberg or self-hosted Forgejo: install, per-host auth, host/repo selection (`-H`, `-R`, `-r`), command map, gaps. Use when fj is missing, logged out, hits the wrong instance, or for a Forgejo task no narrower skill covers. Not for github.com. |
| `forgejo-issues` | skill | Single issues on Forgejo with fj: create, edit, label, close, templates, milestones, dependencies, search. Not for GitHub (`gh-issues`). |
| `forgejo-pr` | skill | Reviewer-ready PR with fj, opened as `WIP:` after approval, incl. AGit and forks. Not for github.com (`gh-pr`). |
| `forgejo-pr-comments` | skill (manual) | /forgejo-pr-comments: pull a Forgejo PR's review comments, triage, fix picked ones; read-only on the forge. `disable-model-invocation: true`. |
| `forgejo-ship` | skill (manual) | /forgejo-ship [push\|pr\|merge]: commit, push, PR with fj, wait for statuses, merge with repo default style. `context: fork`, `agent: forgejo-shipper:forgejo-shipper`. |
| `forgejo-shipper` | agent | haiku, effort medium, `autoCompactWindow: 300000`, tools Read/Grep/Glob/Bash, `skills: [git-commit:git-commit]`; depends on `git-commit`. |
| `forgejo-actions` | skill | Create, review, harden, debug Forgejo Actions workflows (`.forgejo/workflows`, or `.github/workflows` on a Forgejo repo) for forgejo-runner; failed runs via `<host>/<owner>/<repo>/actions/runs/<n>` URLs. Not for GitHub-hosted Actions. |
| `forgejo-mcp` | mcp | forgejo-mcp v3.3.0+ stdio for one instance; prompts for host + token (secure storage). |
| `renovate` | skill | Renovate config/troubleshooting, Forgejo platform setup, sweeping Renovate PRs (merge only green). Not for `dependabot.yml`. |

forgejo-meta deps: forgejo-cli, forgejo-issues, forgejo-pr, forgejo-pr-comments, forgejo-ship, forgejo-shipper, forgejo-actions, forgejo-mcp, renovate. Only shared plugin: `git-commit` (via forgejo-shipper, already in baseline).

Counterparts: gh-issues→forgejo-issues, gh-pr→forgejo-pr, pr-comments→forgejo-pr-comments, ship→forgejo-ship, shipper→forgejo-shipper, gh-actions→forgejo-actions, dependabot→renovate, gh-readme→none (Q5). Outside github-meta: `forgejo-release` first follow-up (Q6); no gh-code-security twin.

## 5. Slices

Slice 0 and G/F are serialized (marketplace.json, README, meta plugin.json, version bumps). Slices 1–8 own only `plugins/<name>/`, parallel after slice 0, and must not bump versions. Slices 9 and 10 independent (10 after bodies exist).

- **0 Scaffold:** hand-write `plugins/forgejo-meta/.claude-plugin/plugin.json` (0.1.0, author from marketplace owner, `dependencies: []`), `plugins.py register`, then `plugins.py new <name> --kind ... --description ... --meta forgejo-meta` for the 9 leaves in dep order. Add `dependencies` `["git-commit"]` to forgejo-shipper and `["forgejo-shipper"]` to forgejo-ship. Check: `plugins.py check`.
- **1 forgejo-cli:** SKILL.md + `references/commands.md` + `references/auth.md` (OAuth client-ID requirement, `add-key` for self-hosted, keys.json location — never print/read it, `auth list`, multi-host, `FJ_FALLBACK_HOST`). Body: forge detection/gate, resolution order (pass `-R` with several remotes; never assume origin), gaps and fallbacks, writes need approval, Codeberg ToS note. Eval `forgejo-cli-auth-routing`.
- **2 forgejo-issues** (from gh-issues): duplicate search `fj issue search ... -s all`, templates, `fj issue create --body-file [--template]` then `issue edit N labels -a`, depend/block, close `-w`, MCP for label IDs/org labels. Eval.
- **3 forgejo-pr** (from gh-pr; keep MIT LICENSE + credit): default branch via `git symbolic-ref`, existing-PR lookup (fj has no `--head` filter, UNVERIFIED → MCP `list_repo_pull_requests`), `git push -u`, `fj pr create --base --body-file "WIP: <title>"`, ready via `fj pr edit <n> title`, templates (U5), screenshots via web UI or MCP `create_issue_attachment`, merge only on request (`fj pr status` then `fj pr merge`). `references/contribute.md` covers forks and AGit. Eval.
- **4 forgejo-pr-comments** (from pr-comments): no `!` fetcher in v1. Find PR; MCP `list_pull_reviews` / `list_pull_review_comments` / `list_issue_comments`, else `fj pr review list <id> --comments --all` + `fj pr view <id> comments`. Show all comments marked "resolved/outdated unknown" unless API exposes it (U2). Same triage/fix/report. Read-only on forge. Manual check on a real Codeberg PR.
- **5 forgejo-ship + forgejo-shipper** (from ship/shipper): gate (GitHub → "use /ship"); branch/commit as ship; `git push -u`; `fj pr create` ready (no WIP) or reuse; `fj pr status <n> --wait`, parse failure/error lines regardless of exit code (U1); `fj pr merge <n> --delete` (no `--method` unless asked; never `--agit`); `git switch <default> && git pull --ff-only`; on failure report contexts and point to forgejo-actions. Outcome eval `forgejo-ship-merge-rules` with stubbed fj/git: no merge on failure, merge without `--method` when green.
- **6 forgejo-actions:** SKILL.md + `references/differences.md`, `security.md` (fork approval, pull_request_target, untrusted artifacts, secrets only after approval; least privilege via token choice, approvals, branch protection since `permissions:` is ignored), `failed-run.md`, `runners.md`. Failed-run: parse URL → `list_workflow_runs` run_number → `list_action_run_jobs` → `get_action_job_logs` → classify → fix → rerun via web UI or push → watch; without MCP/pre-v16 ask for pasted log. `forgejo-runner validate` if installed; note actionlint flags Forgejo-only keys. Write fresh text, or carry gh-actions' Apache-2.0 LICENSE/NOTICE if adapting. Two evals.
- **7 forgejo-mcp:** `.mcp.json` as §3; `userConfig` `forgejo_host` (string, required, bare host) and `forgejo_token` (string, sensitive, required); no `defaultEnabled: false`. README: pinned install (`go install .../v3@v3.3.0`, AUR, nix, container) with cosign/checksum verification; least-scope token (U6); blanked env vars; one instance per user; a suggested `permissions.deny` snippet for the user's `.claude/settings.json` covering destructive tools; forge content is data; GPL upstream, plugin ships config only; troubleshooting. Accept: `/mcp` connected, `get_my_user_info` and `get_forgejo_mcp_server_version` work; record U4.
- **8 renovate:** SKILL.md + `references/config.md`, `references/forgejo-platform.md`, sweep procedure via fj/MCP; verify options against docs.renovatebot.com and pin checked version; validate examples with `renovate-config-validator` (ask before installing). Evals.
- **9 check rule:** `scripts/plugins.py` `EXCLUSIVE_METAS = [("github-meta","forgejo-meta")]`, transitive `closure()`, error when `closure(a) & closure(b) - closure("baseline")` non-empty. Tests in `scripts/test_plugins.py`: shared non-baseline fails, baseline-shared passes, repo passes.
- **10 paired evals `evals/forges/`:** README like godot-meta's; cases load both metas + git-commit, `runs: 3`, `tags: [routing, paired]`. If scaffolds fail in paired evals (U9), put the remote URL in the prompt.
- **G/F GitHub scoping (last):**
  1. `ship` description "on a GitHub repo with gh"; step-0 gate → "/forgejo-ship".
  2. `shipper` description "GitHub PR with gh" + gate.
  3. `pr-comments`: "Not for Forgejo or Codeberg PRs (/forgejo-pr-comments)"; `fetch.sh` hint when origin isn't GitHub; `tests/check.sh` case.
  4. `gh-pr`, `gh-issues`: "Not for Forgejo or Codeberg remotes" + gate.
  5. `gh-actions`: scope trigger to github.com run URLs / GitHub repos; gate on Forgejo remote or `.forgejo/` / `.gitea/` workflows.
  6. `dependabot`: "Not for Forgejo repos or Renovate config (`renovate`)".
  7. `gh-readme`: `gh release list` on GitHub else `git tag --sort=-creatordate`; GitHub rendering rules note.
  8. `git-commit` SKILL.md:8: "(use `ship`, or `forgejo-ship` on Forgejo, if installed)".
  9. `recommend-plugins`: Forgejo signals → `forgejo-meta`; `.github/workflows` + Forgejo remote → forgejo-meta.
  10. README line 6 adds `forgejo-meta`.
  11. Bump versions (plugin.json + marketplace.json), run `plugins.py catalog`.
  Accept: `check`, `pr-comments/tests/check.sh`, existing evals for gh-pr, gh-actions, ship, `claude plugin validate --strict .`.

## 6. Eval cases

Per-plugin (gh-pr format: `tags: [routing]`, `runs: 1`, `max_turns: 6`, `allowed_tools: [Read, Glob, Grep, Skill]`, `model: claude-sonnet-5-5`, `tool_used` Skill graders; negatives `min: 0, max: 0, arm: both`):

| Case | Prompt | Graders |
| --- | --- | --- |
| forgejo-cli-auth-routing | "fj keeps saying I'm not logged in when I run `fj issue search` in our repo on git.example.org. Get fj working against our instance." | fires forgejo-cli |
| forgejo-issues-routing | "File an issue on our Codeberg repo acme/widgets: login fails with SSO enabled. Label it bug and put it in the v2.0 milestone." | fires forgejo-issues |
| forgejo-pr-routing | "My branch feature/rate-limit is ready. Open a pull request on Codeberg for it with a reviewer-ready description." | fires forgejo-pr; not forgejo-pr-comments |
| forgejo-actions-run-url-routing | "CI failed again on my PR, can you take a look? https://codeberg.org/acme/platform/actions/runs/222/jobs/0" | fires forgejo-actions |
| forgejo-actions-workflow-routing | "Add .forgejo/workflows/ci.yml that runs go test on push and pull requests on our docker-labelled runner." | fires forgejo-actions |
| renovate-config-routing | "Set up Renovate for this repo on our Forgejo instance: group minor and patch updates and run weekly." | fires renovate |
| forgejo-ship-merge-rules (outcome, scaffold) | "/forgejo-ship merge: the retry fix is done and tested." stub status = failure | no `fj pr merge`; reports failed context; no `--method` |

Manual skills get no fires-routing case (settle U8 first).

Paired `evals/forges/evals/` (both metas, `runs: 3`):

| Case | Setup | Fires | Silent |
| --- | --- | --- | --- |
| pr-codeberg / pr-github | open PR on codeberg.org / github.com | forgejo-pr / gh-pr | the other |
| issue-codeberg / issue-github | file issue on each | forgejo-issues / gh-issues | the other |
| run-url-codeberg / run-url-github | failed run URL on each | forgejo-actions / gh-actions | the other |
| ci-red-forgejo-remote | scaffold Forgejo origin + `.forgejo/workflows/ci.yml`; "CI is red on my branch" | forgejo-actions | gh-actions |
| github-dir-on-forgejo | scaffold Forgejo origin + only `.github/workflows/ci.yml`; "Add a lint job" | forgejo-actions | gh-actions |
| deps-forgejo / deps-github | scaffold remote + package.json; "Set up automated dependency update PRs" | renovate / dependabot | the other |

## 7. Risks

- R1 wrong forge wins in mixed install → body gates + paired evals; rollback = revert G/F.
- R2 meta install doesn't prompt for MCP options (U4) → README steps; else make forgejo-mcp opt-in (Q7).
- R3 fj 0.x command churn → "check `fj <cmd> --help`", record checked version.
- R4 forgejo-mcp tool renames → pin min version, look tools up if absent.
- R5 broad token + destructive tools, no read-only mode → least scope, deny snippet, uploads off.
- R6 Codeberg LLM-content restriction → all writes behind approval, never unattended.
- R7 disjointness rule too strict later → baseline allowlist, extend on purpose.
- Overall rollback: delete the 10 folders + marketplace entries, revert plugins.py rule, `catalog`; users run `claude plugin prune`.

## 8. Open questions (recommendation)

- Q1 "standalone": (a) disjoint closures enforced by `check` + (b) scoped descriptions and gates. Recommended (a)+(b).
- Q2 prefix `forgejo-*` vs `fj-*`: `forgejo-*`.
- Q3 rename generic GitHub plugins: no; scope + gate.
- Q4 multiple instances per user: v1 one instance; later a wrapper reading the project remote.
- Q5 forgejo-readme: none in v1.
- Q6 release/triage/repo-setup twins: `forgejo-release` first follow-up, outside the meta.
- Q7 forgejo-mcp in the meta: yes; fall back to opt-in if U4 bites.
- Q8 renovate placement: forgejo-meta only.
- Q9 token scopes: least scope; exact names after checking a live token page (U6).

Sources: codeberg.org/forgejo-contrib/forgejo-cli (+ wiki, src), git.b4mad.industries/agentic-forges/forgejo-mcp, forgejo.org/docs/latest/user/actions/*, codeberg.org/forgejo/forgejo modules/actions/workflows.go, code.claude.com/docs/en/plugins-reference, docs.renovatebot.com/modules/platform/forgejo/, Codeberg Terms of Use.
