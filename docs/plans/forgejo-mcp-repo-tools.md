# Plan: shrink the forgejo-mcp tool list to repo-task tools

Status: slices 2-4 done 2026-11-10. Slice 1 deviated: no token, so `tests/tools.txt` is derived from section 4, not observed; the list was then confirmed against a running 3.3.0 server (163 tools, identical to the derived set).

## 1. Verified facts

**Plugin and consumers**
- `plugins/forgejo-mcp/.mcp.json` declares one HTTP server `forgejo` at `https://${user_config.forgejo_host}/mcp` with an `Authorization: token ...` header. The plugin ships only `.mcp.json`, `plugin.json` (0.2.0) and `README.md`. Tools surface as `mcp__plugin_forgejo-mcp_forgejo__<tool>`.
- The server is run by the instance operator (`forgejo-mcp --transport http`, passthrough auth). `forgejo-mcp --help` (local 3.2.0) has no tool, toolset or filter flag, so the client cannot ask the server for a subset.
- The README already has a "Suggested deny rules" block (19 destructive names) that the user pastes into their own settings. It still lists `delete_org`, `delete_package`, `delete_wiki_page`, `delete_repo_hook`, `remove_*_member` and similar; those become redundant once the groups below are hidden.
- Skills that name forgejo-mcp tools (grep of `plugins/forgejo-*`, 2026-11-10); these must survive:
  - forgejo-actions `references/failed-run.md`: `list_workflow_runs`, `get_workflow_run`, `list_action_run_jobs`, `get_action_job_logs`, and by reference dispatch/cancel/rerun ("rerun" has no tool in the upstream list; only `dispatch_workflow` and `cancel_workflow_run` exist).
  - forgejo-pr-comments: `list_repo_pull_requests`, `list_pull_reviews`, `list_pull_review_comments`, `list_issue_comments`.
  - forgejo-pr: `list_repo_pull_requests`, `create_issue_attachment`.
  - forgejo-issues: label IDs and organization labels (`list_repo_labels`, `list_org_labels`), issue reopen (`issue_state_change` or `update_issue`).
  - forgejo-cli (`SKILL.md`, `references/commands.md`): `mcp__plugin_forgejo-mcp_forgejo__*` as the fallback for JSON output, run logs, branch protection and repo merge settings (`get_branch_protection`, `edit_repo`).
  - forgejo-meta and forgejo-ship/shipper/release/readme: no tool names.
- None of those skills needs any edit if the keep list below survives, because they reference tools by name and always "if present".

**Tool names.** Source: goern/forgejo-mcp README (the 3.x line, 163 tools) read via jsdelivr, and `strings /usr/bin/forgejo-mcp` (3.2.0). The b4mad repo (`git.b4mad.industries/agentic-forges/forgejo-mcp`) blocks automated fetches (Anubis), so it is not read. Every name in section 4 was found in the 3.2.0 binary except those marked `unverified`. The 3.2.0 binary lacks `change_files` and the `*_action_secret*` tools, so the hosted server's version and tool set may differ; slice 1 replaces this with a live list.

**Hiding tools from the model (Claude Code docs, d.ts, 2026-11-10)**
- Settings `permissions.deny` with a bare tool name removes the tool from the model's context. Deny rules accept globs in the tool-name position, the pattern must match the full name, and `*` matches any run of characters (permissions doc, "Tool name wildcards"; example `mcp__*`). A glob deny removes matched tools the same way. A deny rule that matches no known tool only warns at startup, and names containing `_` or `*` are exempt from that warning. A rule with parentheses on an `mcp__` name is skipped.
- Plugins cannot ship permission rules. Rules live in user, project, local or managed settings.
- `.mcp.json` has no per-server tool filter. Docs list only `type`, `url`, `headers`, `headersHelper`, `timeout`, `alwaysLoad`; issues #20617 (`allowedTools`/`disallowedTools` ignored in `.mcp.json`) and #7328, #4906, #29517 (feature requests) confirm there is none.
- Mods API (`claude-code.d.ts`): `tool.describe` rewrites a tool's description and only moves it between the prompt and ToolSearch (`isDeferred`); `tool.call` can deny a call but the tool is still listed; `agent.offer` is for agent types; `$.tool.list()` reads only; `$.tool.register` adds tools. There is no hook that removes an MCP tool from the listing. MCP tools are already deferred behind ToolSearch by default (`isDeferred` doc), so the prompt-token cost of an unwanted tool is small; the harm is noise in ToolSearch results and a wider write surface.
- `$.settings.read` exists, no settings write.

## 2. Goal and done

Goal: the model sees only repo-task tools (issues, comments, PRs and reviews, releases, labels, milestones, branches and protection, files and commits, Actions runs and logs, repo settings, attachments, dependencies) from the `forgejo` server. Wiki, organization, team, package, notification, user-search, webhook, time-tracking, secrets and comment-attachment tools are gone from its context.

Done when:
- `plugins/forgejo-mcp/README.md` has a paste-ready `permissions.deny` block that hides every drop-table tool and no keep-table tool, plus the keep table.
- A spec fails if a deny pattern matches a tool in the must-survive list.
- Someone ran the slice 1 live listing and the tables match it (or the differences are recorded).
- `python3 scripts/plugins.py check` and the plugin spec pass; plugin version is bumped in `plugin.json` and `marketplace.json`.

## 3. Approach

Recommended: settings `permissions.deny` globs, documented in the plugin README, pasted once by the user into `~/.claude/settings.json` (or an operator into managed settings for a team). It is the only persistent, session-wide mechanism that removes tools from the model's context, needs no code, and costs one paste per user. The README block replaces the old "Suggested deny rules" block and keeps the merge/destructive-write advice (`merge_pull_request`, `delete_*` of kept tools) as a second, separate block.

Use explicit names for odd cases and globs only where the pattern cannot touch a kept tool (`*notification*`, `*_wiki_*`, `*_package*`, `*_repo_hook*`, `*team*`, `*stopwatch*`, `*_tracked_times`, `*_issue_time*`, `*_action_secret*`). The spec proves that property for the names known today; a new upstream name is not covered until the fixture is refreshed (section 6).

Alternatives compared:

| Option | Hides from model | Plugin ships it | Cost | Verdict |
| --- | --- | --- | --- | --- |
| Settings `permissions.deny` globs | Yes | No (user pastes) | One paste, README upkeep | Chosen |
| `.mcp.json` per-server filter field | n/a | n/a | Does not exist (docs, issues above) | Rejected |
| Server flag / operator config | Yes | n/a | Not available in 3.2.0 `--help`; operator-owned | Rejected; ask upstream/operator as a follow-up |
| Mod on `tool.call` that denies dropped names | No (still listed in ToolSearch; only the call fails) | Yes | New component in a one-component plugin, regex over model text needs bounding, model wastes a turn on a refusal | Rejected as primary; viable add-on if enforcement without a paste matters |
| Mod on `tool.describe` | No (moves to ToolSearch, already the default) | Yes | None useful | Rejected |
| Plugin-shipped stdio proxy that drops entries from `tools/list` and rejects `tools/call` | Yes | Yes | Own a streamable-HTTP MCP client/server, token passes through argv/env, new runtime dependency, upstream schema changes | Rejected for now; the only route to a plugin-shipped hide, revisit if the paste step proves unreliable |
| Hand-curated per-project `.claude/settings.json` | Yes | No | Same paste, per project | Subsumed by the user-scope paste |
| `claude --disallowedTools` / `--settings <json>` on the command line | Yes | No | Per launch, easy to forget | Rejected as default; fine for a one-off session |
| Subagent `tools` / `disallowedTools` allowlists (agent-authoring) | Only inside that agent | Yes (in an agent file) | Does not change the main session | Rejected; useful only for a dedicated forge agent |

## 4. Keep and drop

Counts follow the goern README (163 tools). Names marked `unverified` were not found in the 3.2.0 binary or only come from the README.

**Keep (about 103)**

| Group | Tools |
| --- | --- |
| Server and self | `get_my_user_info`, `get_forgejo_mcp_server_version` |
| Repos and settings | `list_my_repos`, `get_repo`, `edit_repo`, `search_repos`, `list_repo_topics`, `set_repo_topics`, `add_repo_topic`, `delete_repo_topic` |
| Branches and protection | `list_branches`, `create_branch`, `delete_branch`, `list_branch_protections`, `get_branch_protection`, `create_branch_protection`, `edit_branch_protection`, `delete_branch_protection` |
| Files and commits | `get_file_content`, `list_repo_contents`, `get_repo_tree`, `create_file`, `update_file`, `delete_file`, `change_files` (unverified), `list_repo_commits`, `get_commit_statuses` |
| Issues, labels, milestones | `list_repo_issues`, `search_issues`, `get_issue_by_index`, `create_issue`, `update_issue`, `issue_state_change`, `add_issue_labels`, `remove_issue_labels`, `list_issue_dependencies`, `list_issue_dependents`, `add_issue_dependency`, `remove_issue_dependency`, `list_repo_milestones`, `list_repo_labels`, `get_repo_label`, `create_repo_label`, `edit_repo_label`, `delete_repo_label`, `list_org_labels`, `get_org_label` |
| Comments | `list_issue_comments`, `get_issue_comment`, `create_issue_comment`, `edit_issue_comment`, `delete_issue_comment` |
| Pull requests and reviews | `list_repo_pull_requests`, `get_pull_request_by_index`, `create_pull_request`, `update_pull_request`, `list_pull_request_files`, `get_pull_request_diff`, `merge_pull_request`, `list_pull_reviews`, `get_pull_review`, `list_pull_review_comments`, `create_pull_review`, `submit_pull_review`, `dismiss_pull_review`, `delete_pull_review`, `create_review_requests`, `delete_review_requests` |
| Releases | `list_releases`, `get_release_by_id`, `get_release_by_tag`, `get_latest_release`, `create_release`, `edit_release`, `delete_release`, `delete_release_by_tag`, and the six `*_release_attachment(s)` tools |
| Issue and comment attachments | `list_issue_attachments`, `get_issue_attachment`, `download_issue_attachment`, `create_issue_attachment`, `edit_issue_attachment`, `delete_issue_attachment`, `list_comment_attachments`, `get_comment_attachment`, `download_comment_attachment`, `create_comment_attachment`, `edit_comment_attachment`, `delete_comment_attachment` |
| Actions | `dispatch_workflow`, `list_workflow_runs`, `get_workflow_run`, `list_action_run_jobs`, `get_action_job_logs`, `cancel_workflow_run`, `delete_workflow_run`, `list_action_run_artifacts`, `get_action_artifact` |

**Drop (about 60)**

| Group | Tools | Deny pattern |
| --- | --- | --- |
| Notifications | `check_notifications`, `get_notification_thread`, `mark_notification_read`, `mark_all_notifications_read`, `list_repo_notifications`, `mark_repo_notifications_read` | `*notification*` |
| User search | `search_users` | `search_users` |
| Organizations | `list_my_orgs`, `list_user_orgs`, `get_org`, `create_org`, `edit_org`, `delete_org`, `list_org_members`, `check_org_membership`, `remove_org_member` | explicit names |
| Org label writes | `create_org_label`, `edit_org_label`, `delete_org_label` | explicit names |
| Teams | `list_org_teams`, `search_org_teams`, `create_org_team`, `add_team_member`, `remove_team_member`, `add_team_repo`, `remove_team_repo` | `*team*` |
| Packages | `list_packages`, `get_package`, `delete_package`, `list_package_files` | `*_package*` |
| Webhooks | `list_repo_hooks`, `get_repo_hook`, `create_repo_hook`, `edit_repo_hook`, `delete_repo_hook`, `test_repo_hook` | `*_repo_hook*` |
| Wiki | `list_wiki_pages`, `get_wiki_page`, `get_wiki_revisions`, `create_wiki_page`, `update_wiki_page`, `delete_wiki_page` | `*_wiki_*` |
| Time tracking | `list_issue_tracked_times`, `list_repo_tracked_times`, `list_my_tracked_times`, `add_issue_time`, `reset_issue_time`, `delete_issue_time_entry`, `start_issue_stopwatch`, `stop_issue_stopwatch`, `cancel_issue_stopwatch`, `list_my_stopwatches` | `*_tracked_times`, `*_issue_time*`, `*stopwatch*` |
| Action secrets | `list_repo_action_secrets`, `create_or_update_repo_action_secret`, `delete_repo_action_secret`, `list_org_action_secrets`, `create_or_update_org_action_secret`, `delete_org_action_secret` (all unverified in 3.2.0) | `*_action_secret*` |
| Repo creation | `create_repo`, `fork_repo` | explicit names |

All patterns carry the prefix `mcp__plugin_forgejo-mcp_forgejo__`. `*team*` has to be checked against kept names (none contain "team"); `*_package*` against `get_pull_request_*` (no match).

## 5. Slices

Slice 1 first; slices 2 and 3 after it (slice 3 reads the README block from slice 2, so do 2 then 3); slice 4 last. Total is small, one agent can do all, so each slice is one commit.

### Slice 1: capture the hosted tool list as a fixture (human, then sonnet)

Owner: the user runs the probe (needs the token); a coder saves the output. Goal: replace the unverified marks and give the spec an inventory.
1. User: write `/tmp/probe.sh` (not in the repo) that takes `H` (host) and `T` (token) from the environment and does, with `curl -sS -D /tmp/h.txt -o /tmp/b.txt` for each call: (a) POST `initialize` (`protocolVersion` `2025-03-26`, `Accept: application/json, text/event-stream`, `Authorization: token $T`); (b) read `Mcp-Session-Id` from `/tmp/h.txt` if present and send it on later calls (stateless servers send none); (c) POST `notifications/initialized`; (d) POST `tools/list`, then repeat with `params.cursor` while `result.nextCursor` is set. If a response is `text/event-stream`, take the last `data:` line. Abort on any `error` member.
2. User: run `H=<host> T=<token> sh /tmp/probe.sh | jq -r '.result.tools[].name' | sort -u > /tmp/forgejo-tools.txt`.
3. Coder: save the sorted names as `plugins/forgejo-mcp/tests/tools.txt`, one per line, with a first-line comment `# observed <date>, forgejo-mcp <version from get_forgejo_mcp_server_version>`.
4. Coder: for each name in `tools.txt` not in section 4, add it to keep or drop by the section 3 boundary (existing-repository maintenance); for each section 4 name missing from `tools.txt`, keep it in the table with the mark `not on observed server` (do not delete it: other installations may run another version, and an unneeded deny entry is harmless).
Passing: every line of `tools.txt` is classified in section 4.
Rollback: delete `tests/tools.txt`.

### Slice 2: README deny block and keep table (sonnet)

Files: `plugins/forgejo-mcp/README.md`.
1. Replace the section "Suggested deny rules" (the JSON block listing 19 names and the paragraph after it) with a "Hide tools you do not need" section.
2. In it, add the JSON block `{"permissions":{"deny":[...]}}` with one string per drop pattern from section 4, each prefixed `mcp__plugin_forgejo-mcp_forgejo__`. Explain: paste into `permissions.deny` in `~/.claude/settings.json` (user scope), or managed settings for a team; plugins cannot ship permission rules; a bare-name or glob deny removes the tool from the model's context (link the permissions doc, "Tool name wildcards").
3. Add the keep table from section 4 as a compact list so the user knows what remains, plus one sentence that names a tool's group when it is missing ("a tool you want is missing: remove its pattern from your deny list").
4. Add a second block "Optional: block risky writes you kept" with the previous deny entries that still name kept tools: `delete_release`, `delete_release_by_tag`, `delete_release_attachment`, `delete_branch`, `delete_branch_protection`, `delete_file`, `delete_workflow_run`, `merge_pull_request`; keep the sentence about dropping `merge_pull_request` and the `ask` suggestion for `dispatch_workflow`, `cancel_workflow_run`, `dismiss_pull_review`, `delete_pull_review`.
5. In "Token scopes", keep the organization read bullet (kept tools `list_org_labels` and `get_org_label` need it). Replace only the bullet "Organization, team, package and notification tools need their own matching scopes; leave them off unless used." with "Team, package and notification tools are hidden by the deny block above, so the token needs no scope for them."
6. In the intro paragraph add one sentence that the plugin cannot filter tools itself and link to the new section.
4b. State in the section that the entries are appended to an existing `permissions.deny` array (never replace it) and that the optional block is merged the same way.
Verify: the slice 3 spec parses and checks the block; run `bun test plugins/forgejo-mcp/tests/` after slice 3.

### Slice 3: spec guarding the deny patterns (sonnet)

Files: new `plugins/forgejo-mcp/tests/deny-rules.spec.ts`. The `.spec.ts` name keeps `claude plugin test` from loading it as a mod (repo CLAUDE.md "Mods").
1. Read `../README.md`, `JSON.parse` the first fenced `json` block under the heading "Hide tools you do not need", and keep `permissions.deny`.
2. Read `tools.txt` (skip `#` lines) as `INVENTORY`. Define in the spec `KEEP` and `DROP` string arrays copied from the section 4 tables (bare names, expand the six release-attachment tools to `list_release_attachments`, `get_release_attachment`, `download_release_attachment`, `create_release_attachment`, `edit_release_attachment`, `delete_release_attachment`).
3. Implement `denied(name)`: true if any deny entry, after stripping the prefix `mcp__plugin_forgejo-mcp_forgejo__` (fail if an entry lacks it), matches `name` as a full-string glob (`*` becomes `.*`, all else escaped).
4. Tests: (a) every `INVENTORY` name is in exactly one of `KEEP` or `DROP`; (b) no `KEEP` name is denied; (c) every `DROP` name is denied.
5. Consumer test: scan `../../forgejo-*/skills/**/*.md` with `Bun.Glob`; collect names after the qualified prefix and every backticked token that equals an `INVENTORY` name; assert the set is non-empty and that none is denied. Also assert a fixed list `list_workflow_runs`, `get_workflow_run`, `list_action_run_jobs`, `get_action_job_logs`, `list_repo_pull_requests`, `list_pull_reviews`, `list_pull_review_comments`, `list_issue_comments`, `create_issue_attachment`, `list_repo_labels`, `list_org_labels` is not denied (guards the scan itself).
Verify: `bun test plugins/forgejo-mcp/tests/` passes. Limit: it knows only the names in `tools.txt`; refresh the fixture after a server upgrade.

### Slice 4: version bump and release (sonnet)

Files: `plugins/forgejo-mcp/.claude-plugin/plugin.json`, `.claude-plugin/marketplace.json` (the entry for forgejo-mcp).
1. Set `version` to `0.2.1` in both.
2. Run `uv run --with pyyaml python3 scripts/plugins.py check`; fix only what it reports about forgejo-mcp (the new `tests/` directory is the likely trip; if `check` rejects it, move the spec to `plugins/forgejo-mcp/scripts/tests/` as `check-bypass-guard` does).
3. Do not run `plugins.py catalog` unless `check` says the catalog drifted; the description is unchanged, so it should not.
4. Commit: `docs(forgejo-mcp): hide non-repo tools with a deny list` plus a spec line, staging explicit paths: the README, the spec, both version files, and this plan.
5. User step: run the `ship-plugin` skill for `forgejo-mcp` if it should go live. Then paste the deny block into `~/.claude/settings.json`, start a new session, and run ToolSearch for `select:mcp__plugin_forgejo-mcp_forgejo__get_wiki_page` (a glob-denied name) and `select:mcp__plugin_forgejo-mcp_forgejo__delete_org` (an explicit-denied name) and `select:mcp__plugin_forgejo-mcp_forgejo__list_repo_issues`. Passing: the first two are not found, the third loads. Record the Claude Code version (`claude --version`) in the README section as the version tested.
Verify: `uv run --with pyyaml python3 scripts/plugins.py check` prints no error.

## 6. Risks and rollback

- Upstream renames or adds tools: the deny globs miss new non-repo tools (they appear again) and explicit names go stale silently (no warning because names contain `_`). Mitigation: the README states the 3.x source and date; rerun slice 1 after a server upgrade. Rollback: delete the block from settings.
- A glob swallows a kept tool later (a new repo tool whose name contains `team`, `_package` or `notification`). The spec knows only the names in `tools.txt`. Accepted; refresh the fixture after an upgrade.
- The user may never paste the block, so the shrink does nothing for them. This is inherent to settings-based hiding; the README is the delivery channel.
- The tool name prefix assumes the plugin is called `forgejo-mcp` and the server `forgejo`. Renaming either changes every entry.
- The hosted server version may differ from 3.2.0 (action secrets, `change_files`); slice 1 settles it.
- Kept destructive tools stay one approval away; the optional block covers them.

## 7. Decisions and open questions

Decisions (user, 2026-11-10): drop org label writes, `create_repo` and `fork_repo`; keep comment attachments; enforcement is the pasted README deny block plus the fixture spec, with no proxy or mod.

Open (recommendation):

1. Ask the operator or upstream for a server-side tool filter (an allowlist flag)? Recommend yes as a separate issue; it would replace this whole mechanism.
2. Should the deny block also go into the forgejo-meta docs/install flow? Recommend no; meta plugins ship only dependencies.

## 8. Critique log

Reviewer: codex gpt-6.1-sol, medium, plan mode, one pass.

| # | Point | Disposition |
| --- | --- | --- |
| 1 | No acceptance check that deny removes tools from ToolSearch | adopted: slice 4 step 5 ToolSearch check and recorded Claude Code version |
| 2 | Token-scope edit contradicts kept org label tools | adopted: slice 2 step 5 keeps the org read bullet |
| 3 | Missed `--disallowedTools`, `--settings`, agent tool lists | adopted: added to section 3 table; "only mechanism" narrowed |
| 4 | Spec copies names without an inventory; "cannot collide" overclaims | adopted: `tests/tools.txt` fixture, completeness test, claims limited |
| 5 | Consumer scan misses bare names | adopted: scan backticked inventory names plus a fixed list and a non-empty assertion |
| 6 | Probe not executable (sessions, versions, SSE, pagination) | adopted: slice 1 rewritten; protocol-version header on later calls not added because 2025-03-26 initialize is the stated assumption (open if the server answers 400) |
| 7 | One server version should not define inventory | adopted: absent names are marked, not deleted |
| 8 | Comment attachments and fork_repo drops overreach | partly overruled by the user: comment attachments kept; fork_repo and create_repo dropped (section 7) |
| 9 | `sed | jq` fails; blocks must merge, not replace | adopted: spec parses the block; step 4b says append |
