# Findings: h3.md

Scope is 189 sessions: 59 Claude Code and 130 pi. Teammate and idle-notification messages were filtered out before counting. Each count below is the number of sessions where at least one human prompt matched.

### commit-and-push
- type: command
- sessions: ~51 (projects: home-manager 34, voidrot-agents 9, claude-plugins 3, eveonline-tools 2, 3d-designs, pi-ext, homelab-nix, oxide). Raw regex hit 53; ~2 are pasted text, not requests.
- refs: "2026-08-26T21:33 2026-08-26T21-33-23-690Z" (8 separate "commit and push" turns), "2026-09-07T04:10 2026-09-07T04-10-45-578Z", "2026-10-10T08:46 761a4bd0-1c62-4d18-bfab-5a83adb9aa0b.jsonl"
- example: "it works, commit and push"
- what to build: add a `/commit-push` command to the `git` plugin. It runs `git:commit` on the diff and then pushes the current branch, or fast-forwards it into main when that's the repo's flow. The gap is real. `git:commit` says a commit request "does not authorize pushing" and hands off to `commit-commands:commit-push-pr` "if installed", and that plugin is not in enabledPlugins. Enabling `commit-commands` is an alternative.
- effort saved: high, because it's the most-typed prompt in the chunk and today it takes a second turn or a permission round to push.

### claude-plugins-ship
- type: command
- sessions: 5 (projects: claude-plugins)
- refs: "2026-10-04T02:05 61c126a0-db24-4c52-abff-bc20cdb1820e.jsonl", "2026-10-06T18:44 a567af77-2569-4f58-820b-57347125d56e.jsonl", "2026-10-03T04:29 66b91933-527a-4e66-b18d-136e0a856cd1.jsonl" (also 25334424, 5d77c749)
- example: "Ensure plugin docs are up to date, Create commits, and push"
- what to build: a project-local `/ship-plugin <name>` command in the adminhead repo's `.claude/commands`. In another session the user typed this tail as separate prompts ("Commit it" → "Merge to main" → "Push" → "Install it as a user scope plugin"). The command runs these steps in order:
  - `claude plugin validate --strict plugins/<name>`
  - check that `docs/plugins/<name>.md`, README and marketplace.json are updated ("Ensure plugin docs are up to date, Create commits, and push")
  - commit
  - `git merge --ff-only` into main, then delete the branch and prune the worktree
  - push
  - `claude plugin install <name>@adminhead`
  - remind the user to run `/reload-plugins`
- effort saved: med, because it replaces a 5–7 turn tail, partly typed as `!` bash, on every new plugin.

### plan-gap-pass
- type: improve-existing:efficient-core:planning
- sessions: 16 (gap/open-question review requested in 12, AskUserQuestion requested in 8, some overlap; projects: claude-plugins, oxide, pi-ext, eveonline-tools, pi-agy-agent, home-manager, homelab-ansible, home dir)
- refs: "2026-10-02T04:20 e2a6b57d-23b0-42b1-8650-04c8b5cff005.jsonl", "2026-09-21T09:17 2026-09-21T09-17-23-386Z", "2026-10-03T06:23 1b402260-9aad-46f5-92b1-bba1a1ec39cc.jsonl"
- example: "review the plan and ensure that there are no gaps or open questions" / "use the ask questions tool for any remaining questions"
- what to build: add a closing step to planning that does three things:
  - run a gap and open-question pass on the finished plan
  - when blocking questions remain, ask them with AskUserQuestion, each with its options explained
  - save the plan to `docs/plans/<name>.md` so a later session can resume it (5 sessions asked to save or load a plan file)

  Step 5 currently says to proceed on assumptions "rather than asking", and `stress-test.md` is opt-in only. Both cut against what the user asks for every time. The user also answers numbered prose questions with "#1 … #2 …" in 8+ sessions, which shows the questions are being asked in prose instead of through the tool.
- effort saved: high, because it removes 1–3 follow-up turns from nearly every planned task.

### mcp-smoke-test
- type: skill
- sessions: 5 (projects: 3d-designs ×2, homelab-ansible, pi-ext ×2)
- refs: "2026-10-04T05:36 52b1323c-8f0b-4763-9646-e4af714c541c.jsonl", "2026-10-04T05:58 7c04ec88-d991-448d-9da1-dda79c454761.jsonl", "2026-09-27T09:28 2026-09-27T09-28-39-424Z"
- example: "test the pve mcp servers and make sure they connect and work"
- what to build: a skill in the `mcp` plugin that runs when a user asks to "test the X mcp/extension tools". It lists the server's tools, calls each read-only tool with minimal arguments, skips mutating ones unless told otherwise, and reports a pass/fail table with errors. Recurring failures (bad token-ID format, `startsWith is not a function`, reconnect errors) suggest it should check connection first. `mcp:review` doesn't cover this: it does release QA and forbids probes against live servers.
- effort saved: med, because each run today is ad hoc and repeated after every reload or fix.

### freecad-design-loop
- type: skill
- sessions: 7 (projects: 3d-designs, 3d-designs/ELCROW-10.1-Dev-Frame; 4 Claude, 3 pi)
- refs: "2026-10-04T06:01 5d53c68f-c223-40d9-b4b1-5f9e05993c12.jsonl", "2026-09-20T07:33 2026-09-20T07-33-08-588Z", "2026-10-05T01:10 1e5c1ef0-b2d1-4b2a-b095-88202faf1e79.jsonl"
- example: "load the cad file for the ELECROW ESP32 10.1 display from ./ESP32-P4-10_1-inch-20251230.stp and lets develop a bezel frame to house it"
- what to build: a FreeCAD MCP workflow skill, project-local in `voidrot/3d-designs` or a small plugin:
  - load the reference STEP and pull out board dimensions and port positions
  - prototype parametric parts
  - run fixed fit and printability checks ("yes run the same checks")
  - export STL per part
  - build Bambu multi-color text as separate bodies
  - set up git-lfs for binaries

  Fold in the FreeCAD crash and Wayland launch fix from 2026-09-20T03:09. Session 5d53c68f wrote a repo CLAUDE.md that can seed it.
- effort saved: med, because every session re-derives the load/measure/check/export steps.

### nix-home-manager-ops
- type: skill
- sessions: 18 distinct (package adds, pasted rebuild errors, failing user services and pasted coredumps, unioned; projects: home-manager 17, homelab-nix 1)
- refs: "2026-08-25T22:22 2026-08-25T22-22-59-395Z" (14 package adds then commit), "2026-08-27T20:31 2026-08-27T20-31-09-766Z" (pasted `nixos-rebuild` trace), "2026-09-11T23:25 2026-09-11T23-25-45-559Z" (proton-pass-agent.service failing)
- example: "add trashy package and ensure that it takes over the rm command"
- what to build: on 2026-09-30 the user dropped global home-manager/nixos skills from ~/.claude ("drop the home-manager and nixos skills"), so this belongs as a project-local skill in `voidrot/home-manager` and `homelab-nix`, not global. The later sessions show the need persisted. The skill has three procedures, each repeated in the bash counts (`nix search`, `nix eval` per host, `nix fmt`, `git diff`):
  - add a package or extension: confirm the attr with `nix search`, place it in the right user or system module, run `nix fmt`, run `nix eval` per host
  - triage a rebuild failure: read the innermost `error:`, then `--show-trace` or `nix log`, then classify it as a renamed option, a buildEnv path conflict, a source build, or a missing option
  - triage a failing user service or coredump: `systemctl --user status`, `journalctl --user -u`, `coredumpctl info`, and check nix-ld
- effort saved: med, because the procedures are the same each time but are cheap per session.

### keep-going-until-done
- type: hook
- sessions: 6–8 (projects: pi-ext 3, voidrot-agents 2, homelab-nix, oxide, 3d-designs; 2 hits are only resume-after-interrupt turns; most are pi)
- refs: "2026-07-22T07:07 2026-07-22T07-07-30-187Z" (9× "continue with the next steps"), "2026-07-22T15:48 2026-07-22T15-48-10-349Z" ("begin task #N" / "continue task #N work" ×14), "2026-08-24T08:35 2026-08-24T08-35-43-306Z" ("keep going until complete" ×4)
- example: "keep decomposing the tasks and implementing them. ask questions as needed."
- what to build: for Claude, a Stop hook that blocks the stop while the active plan or task list still has unchecked items and the last turn asked no question. The decision is left to the model, so the hook only says how many items remain. For pi, add a matching AGENTS.md rule. Most evidence is pi, so the Claude benefit is UNCONFIRMED. A CLAUDE.md line is the lighter fallback.
- effort saved: med, because it removes long chains of one-word nudges in big implementation sessions.

### prefer-biome
- type: claude-md
- sessions: 3 (projects: eveonline-tools, adminhead/pi-ext, vscode settings in home dir)
- refs: "2026-09-21T09:17 2026-09-21T09-17-23-386Z", "2026-09-29T06:08 2026-09-29T06-08-14-678Z", "2026-09-19T07:00 2026-09-19T07-00-36-154Z"
- example: "lets remove prettier and replace it with biome.js"
- what to build: one line in global CLAUDE.md under Design or tooling: "For JS/TS lint and format, use Biome (or oxlint/oxfmt) rather than Prettier+ESLint, unless the repo already uses something else." The user corrected this in every JS repo set up in the chunk. One more pi-ext repo (2026-07-22T02:37) chose oxlint/oxfmt, so the rule is "not Prettier+ESLint" more than "always Biome".
- effort saved: low, because it's one correction per new repo, but it's also a migration avoided.

### pi-orchestration-drift
- type: claude-md
- sessions: 9 (projects: home-manager 7, pi-ext, oxide). These sessions re-tell the agent to orchestrate, fan out, use worktrees, or forward rules.
- refs: "2026-09-05T03:17 2026-09-05T03-17-04-226Z", "2026-09-13T23:18 2026-09-13T23-18-05-916Z", "2026-08-30T00:56 2026-08-30T00-56-39-579Z"
- example: "update ... AGENTS.md with better language about being an orchestrator, it still does a lot of multi-turn work by its self instead of orchestrating it."
- what to build: the target is pi's `AGENTS.md` and pi agent definitions, managed in home-manager. Nothing new for Claude. The 10-04 CLAUDE.md orchestration section already covers it, and only 1 Claude session after it repeated "use multiple agents". For pi, port the Claude Orchestration and Routing sections into the managed pi AGENTS.md as one pass instead of continuing piecemeal edits. The pi roster (coder-simple/coder/coder-high/coder-max, quick-review, doc-updater) already mirrors the Claude agents.
- effort saved: med, because it stops a recurring rewrite-the-prompt loop.

### ssh-agent-signing-troubleshoot
- type: improve-existing:pass-cli:pass-cli
- sessions: 4 (projects: home dir, eveonline-tools, chezmoi, home-manager)
- refs: "2026-09-17T07:17 2026-09-17T07-17-06-304Z", "2026-09-21T08:48 2026-09-21T08-48-45-602Z", "2026-09-21T08:56 2026-09-21T08-56-12-189Z" (also 2026-08-27T19:50 proton-pass-agent.service)
- example: "why does vscode git commit have this error? `Couldn't find key in agent?`"
- what to build: add a troubleshooting reference to `pass-cli:pass-cli` for the Proton Pass ssh agent on this host. It should cover the agent socket and SSH_AUTH_SOCK in GUI apps vs shells, git `gpg.format=ssh` signing with `user.signingkey` as a `key::` literal, keychain or omz ssh-agent plugins fighting the Proton agent, and the agent service's PAT and keyring wiring. Each session re-diagnosed the same stack from scratch.
- effort saved: med, because there were 4 debugging sessions across 4 projects on one recurring failure.

## Near misses
- **probe sessions** (10): "reply with just ok", "ping", and "Quote verbatim any Code Search Guidelines" are headless harness or hook-injection probes, not user patterns.
- **tmux / claude-tmux** (7): iterating one script and config, with no repeated procedure.
- **pi subagent roster edits** (23): project work on agent definitions, not automatable. Covered by `plugin-dev:agent-development` and `authoring:manage-agent-instructions`.
- **PR review-comment loops** (2, both eveonline): "review the codex comments ... plan ... implement ... commit and push". Covered by `github:pr-comments` and `claude-mem:babysit`.
- **GitHub issues from findings** (4: eveonline, oxide): covered by `github:issues` and `github:issue-breakdown`. A one-off correction asked for native "relates to" relationships, not description text. Worth checking that `github:issues` covers it.
- **docs-URL → skill** (21, mostly the pi agents repo): covered by `authoring:create-skill`. Only `references/porting.md` mentions verifying against official docs. Corrections were about pushing doc detail into references/ with source links kept (≈3 sessions), so a "build from official docs" reference is a possible small improvement.
- **plan → implement** (16): covered by `efficient-core:planning` and `claude-mem:make-plan`/`do`. The gap is in plan-gap-pass above.
- **parallel/multi-agent encouragement** (14): most hits predate the 10-04 CLAUDE.md orchestration section or are pi. See pi-orchestration-drift.
- **/plugin + /reload-plugins churn** (6 claude-plugins sessions, one with 10 in a row): a "plugin source changed since load" mod is the only angle, and it's weak.
- **ignore plan docs / lockfile in commits** (3, all pi-ext on 2026-07-22): one project, so it belongs in a project AGENTS.md.
- **proton-pass service failures** (3 of the service_fail sessions): could be a troubleshooting reference in `pass-cli:pass-cli`. They're folded into nix-home-manager-ops because the root causes were sops/systemd wiring.
- **session mining** (2: pi 2026-09-01T05:55 "review my pi.dev session logs and give a list of suggested skills", and this run): a `/session-mining` command could keep the digest and filter setup. There are only 2 sessions, but they're in two harnesses.
