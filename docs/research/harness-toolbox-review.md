# claude-harness-toolbox review

Date: 2026-10-20. Source: [dtiger1889-ops/claude-harness-toolbox](https://github.com/dtiger1889-ops/claude-harness-toolbox) at commit `567967b` (2026-10-20), plugin `mackforge-harness-toolbox` v1.2.0, MIT.

Read in full: every `SKILL.md`, `hooks/hooks.json`, `harness_me.txt`, `guard.ps1`, `deny_backstop.ps1`, the head of `grill_gate.ps1`, `docs/when-it-pays-off.md`, `docs/token-efficiency.md` and the head of `tools/codex-native/codex-native.md`. The helper scripts (`finish-checkpoint.ps1`, `log_lapse.ps1`, `necromancy.ps1` and the others) were judged from the skills that call them, not read line by line. Verdicts are recommendations dated today. Nothing has been decided or installed.

## Bottom line

**Don't install the plugin. Port two small pieces and leave the rest.**

The toolbox is built around one workspace layout. Every project has a `CLAUDE.md` of at most 30 lines and a `CHECKPOINT.md` of at most 120 lines, and a workspace-level `CLAUDE.md` acts as the project ledger. Hooks then make the session read the checkpoint, and PowerShell helpers keep it inside its size limits. This repo doesn't work that way. It has a long, rule-heavy `CLAUDE.md`, auto-memory, `handoff` for passing work to a new session, and plan files with Status blocks (`implement-plan`). The toolbox's own installer warns against this kind of mix ("do not add a second auto-memory store"). So the core of the toolbox (`checkpoint`, `orient_gate`, the receipt and PreCompact hooks, `new-project`, `necromancy`, `log`) only works if we take the whole model. We can't adopt just part of it.

Its own benchmark says the same thing. Across 154 paired trials, the harness costs **35–136% more output tokens on prompts that already name the file**, makes no difference on structured single-project work, and only wins (−25% to −45% on read-side metrics) on exploratory work that spans several projects (`docs/when-it-pays-off.md`). Most work here happens in one repo, from prompts that name the files. Those trials also ran on `claude-sonnet-4-6`, not on current models.

The plugin also clashes with how this marketplace is built:

- It is one plugin with 14 skills plus 6 hook scripts. Our rule is one component per plugin.
- The hooks it loads by default call `powershell.exe`. That command doesn't exist on this Linux machine. A missing command doesn't block anything, but Claude Code reports a hook error, so there would be an error line on every Write, Edit, Bash and MCP call.
- The 14 skill descriptions would all sit in the skill listing of every session.

Several of the skills overlap plugins we already ship. Two ideas are actually missing here:

1. **Three guard rules that bash-rules lacks:** killing processes by name or pattern, reading `~/.claude/.credentials.json`, and `grep --no-ignore`. Today `bash-rules/hooks/danger/danger.ts` covers sudo, piping a download into a shell, and `rm -rf`, but not these three.
2. **A `prove`-style skill:** check each factual claim in the previous answer against files and sources, and report it as Confirmed, Wrong or Unverified. Nothing here does this claim by claim. `doubt-review` and `the-fool` argue against a decision; they don't verify claims.

## Summary

| Tool | Kind | What it does, in short | Helpful? | Efficiency / quality fit | Verdict |
| --- | --- | --- | --- | --- | --- |
| `prove` | skill | Verifies each claim in the last answer against files, then the web | Yes | Quality: catches claims made from memory. Cheap and only runs when asked | **Port** (new focused plugin) |
| `deny_backstop.ps1` | hook | Blocks catastrophic shell commands | Partly | Quality and safety. Most of it is already in bash-rules | **Port 2 rules** into bash-rules |
| `guard.ps1` | hook | Blocks shell input that would break parsing (Windows) | One rule | The `grep --no-ignore` check stops a scan that never ran from looking clean | **Port 1 rule** into bash-rules |
| `vet` | skill | Decides whether an external tool fits, and records the verdict in a ledger | Idea only | Efficiency: no tool gets evaluated twice. `docs/research/` already does this by hand | **Steal the idea** |
| `necromancy` | skill | Rebuilds a session that died, from a digest of its transcript | Maybe | The digest approach is sound, but the helper is PowerShell only | **Watching** |
| `prevent` | skill | Fixes a repeated mistake and moves the rule to where it will be read | Yes | Covered by `agent-instructions` and `session-retro` | Covered |
| `redteam` | skill | One adversarial pass over a claim or plan | Yes | Covered by `the-fool` (red-team mode) and `doubt-review` | Covered |
| `outside` | skill | Looks for prior art before you build | Yes | Covered by `research` (quick depth) | Covered |
| `grill-me` | skill | Interviews you before a new build | Yes | Covered by `planning`'s `references/stress-test.md` | Covered |
| `breakdown` | skill | Turns a tangled problem into the next action and a short plan | Some | Covered by `planning` | Covered |
| `spec` | skill | Writes a spec with a required Closeout section, then archives it | Some | Covered by `planning`, `adr-writing` and `issue-breakdown` | Covered |
| `spinoff` | skill | Starts a new session from a short brief | Yes | Covered by `handoff --bg` and the app's own session tools | Covered |
| `fanout` | skill | Five ideation agents plus a critic | Rarely | Six agent calls per run; `doubt-review` and Workflow cover what we need | Skip |
| `checkpoint` | skill | Keeps `CHECKPOINT.md` current within size limits | Only with the layout | Needs the CHECKPOINT layout and PowerShell | Skip |
| `log` | skill | Writes findings to the doc that owns them; keeps a ledger of rule breaks | Some | Auto-memory and `session-retro` cover it; needs PowerShell | Skip |
| `new-project` | skill | Scaffolds a project and registers it in the workspace ledger | No | Built for a folder of personal projects, not a repo | Skip |
| `dumb` | skill | "That was wrong, fix it" | No | A 13-line prompt that adds nothing to normal correction | Skip |
| `plain` | skill | Rewrites a dense answer in plain English, or as an ASCII picture | Low | Nice to have; `avoid-ai-writing` already covers writing style | Skip |
| `orient_gate` | hook | Blocks the first change until `CHECKPOINT.md` has been read | No | Does nothing without a `CHECKPOINT.md` (it exits 0) | Skip |
| `grill_gate.ps1` | hook | Blocks the first write if a build starts without questions | No | Windows only; skips subagents; `planning` covers interviews when asked | Skip |
| `log_backstop.ps1` | hook | Reminds the session to run `/log` after some skills | No | Only useful alongside `log` | Skip |
| `tmux_receipt.ps1` | hook | Tells a session it was started over SSH/tmux | No | Windows/MSYS detection | Skip |
| Checkpoint receipt and PreCompact reminder | hooks | Print the size of `CHECKPOINT.md`; remind to save it before compaction | No | Only useful with the layout | Skip |
| `codex-native` | tool | Relays `codex` calls from Windows session 0 to the desktop session | No | Windows only; `consult` already wraps codex on Linux | Skip |
| `templates/`, `harness_me.txt` | scaffold | Templates for the layout and the guided installer | No | This repo has its own `CLAUDE.md` conventions | Skip |

## What to port

### Guard rules for bash-rules

The toolbox's `deny_backstop.ps1` and `guard.ps1` work by matching raw command text with regexes. Ours parses the command instead (`danger.ts`, using the vendored unbash walker). These overlap:

- **Already covered by bash-rules:** sudo, doas, su, pkexec and run0 (`PRIV` in `danger.ts`); a download piped into a shell (`DOWNLOADERS`); recursive force-delete.
- **Missing:**
  - **Killing processes by name or pattern:** `pkill`, `killall`, `kill $(pgrep …)`, and on Windows `Stop-Process -Name` and `taskkill /IM`. The toolbox's reason is that a broad kill can end work belonging to other sessions. Deny it and tell the agent to pass an explicit PID. This matters here because subagents, agent worktrees and background sessions share the machine.
  - **Reading `~/.claude/.credentials.json`:** this is a token file, and any command that reads it is either leaking it or using a stale token. Deny it with a message pointing to the statusline JSON for usage data, as the toolbox does. This fits bash-rules' existing denial of encoded payloads and payloads hidden in env vars.
  - **`grep --no-ignore`:** that flag belongs to ripgrep. GNU grep exits 2 with a usage error and prints nothing, so if stderr is hidden, a scan that never ran looks the same as a clean one. A tiny check in `hygiene.ts` (when `grep` gets `--no-ignore` as a flag, not as a quoted pattern) would catch it.

Where it goes: per CLAUDE.md, the shared parser lives in `scripts/shared/`, but these rules belong in bash-rules' own `danger.ts` and `hygiene.ts`, each with a test in `plugins/bash-rules/tests/`. Release it through `ship-plugin`.

### `prove` as a focused plugin

The upstream skill is 20 lines. It extracts the checkable claims from the passage being disputed. It verifies each one against the right kind of source: project files, the artifact itself, or authoritative web docs. It reports Confirmed, Wrong (with the correct fact) or Unverified (and withdraws the claim), then restates the corrected answer. Two of its rules are worth keeping word for word in spirit: "Memory may locate evidence but cannot confirm a claim", and absence of contradiction is not confirmation.

Fit: a manual or user-invoked skill. Its context cost is one line in the skill listing. It goes after a failure that `research` (questions about the outside world) and `doubt-review` (decisions) don't cover: claims the agent made in passing that turn out to be invented. Write it fresh with `skill-authoring` in this repo's style rather than copying it; the upstream is MIT, so credit it in the README. Consider it for `programming-core` only after trigger evals show it stays quiet on near-miss prompts like "are you sure?" about a plan.

### The `vet` ledger (an idea, not the skill)

`vet` dedupes candidates first, kills them early on cheap checks (identity, liveness, license, cost to install), judges fit against a pain that is written down somewhere, and records one of five fixed verdicts in a single ledger. This repo already has the workflow: `docs/Tools to research.md` is the inbox, verdicts move into `docs/research/`, and `docs/README.md` lists the research files. What's missing is the verdict itself in that list. Right now "have we already looked at X, and what did we decide?" means opening several files. Adding the repo, the date and a one-word verdict to each `research/` entry in `docs/README.md` covers this without a new skill. `plugin-vetter` stays the security check before any install.

### Watching: `necromancy`

The idea is good: digest a dead session's JSONL into anchors (first request, user decisions, files written, commits, errors) with a script, so the model never reads the raw transcript. But the script is PowerShell and expects the CHECKPOINT workflow. Today `handoff` covers the preventive side. Come back to this only if crashed sessions without a handoff turn into a real, recorded problem.

## Other ideas worth noting

These are design notes from the toolbox's docs, not tools. They agree with, or sharpen, what this repo already does:

- **A gate beats a self-judged rule.** In a 50-session audit, the model decided "am I already oriented?" wrongly about 1 time in 5. The fix was a block-once, fail-open hook at the point of action. This is the same reasoning as bash-rules and check-bypass-guard.
- **Hooks print a receipt, not the content.** Big hook output gets silently cut to a preview of about 2 KB that looks complete. So a hook should report a file's size and tell the model to Read it. Worth remembering for `docs-sync` and any SessionStart hook that injects context.
- **Only use a subagent when doing the work inline would cost more.** Their example: routing a 4-command restart to a subagent cost 67k tokens. The orchestration agent's routing rules already lean this way.

## Caveats

- The benchmark figures are the author's own, from the linked [harness-benchmark-report](https://github.com/dtiger1889-ops/harness-benchmark-report), which this review didn't open. They are quoted from the toolbox's docs, not checked.
- The macOS/Linux hook ports have not been tested by their own author (README, "Platform note").
- The repo's contents were treated as data. Nothing in it was run.
