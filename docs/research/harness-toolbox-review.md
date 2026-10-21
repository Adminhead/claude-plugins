# claude-harness-toolbox review

Date: 2026-10-20. Source: [dtiger1889-ops/claude-harness-toolbox](https://github.com/dtiger1889-ops/claude-harness-toolbox) at commit `567967b` (2026-10-20), plugin `mackforge-harness-toolbox` v1.2.0, MIT.

Read in full: every `SKILL.md`, `hooks/hooks.json`, `harness_me.txt`, `guard.ps1`, `deny_backstop.ps1`, the head of `grill_gate.ps1`, `docs/when-it-pays-off.md`, `docs/token-efficiency.md` and the head of `tools/codex-native/codex-native.md`. For the port, `necromancy.ps1` was also read in full, and the vet SKILL.md was read in full. The other helper scripts (`finish-checkpoint.ps1`, `log_lapse.ps1` and the others) were judged from the skills that call them, not read line by line.

Decision (user, 2026-10-21): port prove, vet, necromancy and three guard rules; plan in `docs/plans/harness-toolbox-ports.md`. The verdicts below are recommendations dated 2026-10-20, except the five rows marked Ported, which record the port. Nothing from the toolbox is installed. The ported pieces are our own code.

## Bottom line

**Don't install the plugin. Port its prove, vet and necromancy skills and three guard rules, and leave the rest.**

The toolbox is built around one workspace layout. Every project has a `CLAUDE.md` of at most 30 lines and a `CHECKPOINT.md` of at most 120 lines, and a workspace-level `CLAUDE.md` acts as the project ledger. Hooks then make the session read the checkpoint, and PowerShell helpers keep it inside its size limits. This repo doesn't work that way. It has a long, rule-heavy `CLAUDE.md`, auto-memory, `handoff` for passing work to a new session, and plan files with Status blocks (`implement-plan`). The toolbox's own installer warns against this kind of mix ("do not add a second auto-memory store"). So the core of the toolbox as written upstream (`checkpoint`, `orient_gate`, the receipt and PreCompact hooks, `new-project`, `necromancy`, `log`) only works if we take the whole model. We can't adopt just part of it.

Its own benchmark says the same thing. Across 154 paired trials, the harness costs **35–136% more output tokens on prompts that already name the file**, makes no difference on structured single-project work, and only wins (−25% to −45% on read-side metrics) on exploratory work that spans several projects (`docs/when-it-pays-off.md`). Most work here happens in one repo, from prompts that name the files. Those trials also ran on `claude-sonnet-4-6`, not on current models.

The plugin also clashes with how this marketplace is built:

- It is one plugin with 14 skills plus 6 hook scripts. Our rule is one component per plugin.
- The hooks it loads by default call `powershell.exe`. That command doesn't exist on this Linux machine. A missing command doesn't block anything, but Claude Code reports a hook error, so there would be an error line on every Write, Edit, Bash and MCP call.
- The 14 skill descriptions would all sit in the skill listing of every session.

Several of the skills overlap plugins we already ship. Four ideas were missing or only half covered here, and they are now ported:

1. **Three guard rules that bash-rules lacked:** killing processes by name or pattern, reading `~/.claude/.credentials.json`, and `grep --no-ignore`. They are in bash-rules, not yet released (S7 bumps the version).
2. **A `prove`-style skill:** check each factual claim in the previous answer against files and sources, and report it as Confirmed, Wrong or Unverified. Nothing else here does this claim by claim. `doubt-review` and `the-fool` argue against a decision; they don't verify claims.
3. **A verdict ledger for external tools:** `vet`, which dedupes against past verdicts first.
4. **Dead-session recovery:** `necromancy`, which digests a crashed session's transcript into anchors for a fresh session.

## Summary

Verdicts as of 2026-10-21. The five rows marked Ported were changed that day, and the two ideas the review had marked "Steal the idea" and "Watching" are now ported as the user chose.

| Tool | Kind | What it does, in short | Helpful? | Efficiency / quality fit | Verdict |
| --- | --- | --- | --- | --- | --- |
| `prove` | skill | Verifies each claim in the last answer against files, then the web | Yes | Quality: catches claims made from memory. Cheap and only runs when asked | **Ported** (`prove`, baseline, manual) |
| `deny_backstop.ps1` | hook | Blocks catastrophic shell commands | Partly | Quality and safety. Most of it is already in bash-rules | **Ported 2 rules** (`kill-by-name`, `credentials-read`, in `danger.ts`) |
| `guard.ps1` | hook | Blocks shell input that would break parsing (Windows) | One rule | The `grep --no-ignore` check stops a scan that never ran from looking clean | **Ported 1 rule** (`grep --no-ignore`, in `hygiene.ts`) |
| `vet` | skill | Decides whether an external tool fits, and records the verdict in a ledger | Yes | Efficiency: no tool gets evaluated twice. `docs/research/` already does this by hand | **Ported** (`vet`, project scope, ledger in `docs/README.md`) |
| `necromancy` | skill | Rebuilds a session that died, from a digest of its transcript | Yes | The digest approach is sound. Ported as a Python script, so it runs here | **Ported** (`necromancy`, baseline, Python digest) |
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
- **Missing, now ported:**
  - **Killing processes by name or pattern** (`kill-by-name` in `danger.ts`): denies `pkill`, `killall`, a kill of a `pgrep` or `pidof` result (directly, through `$(...)`, or through `xargs`), and `kill -1` as a target. The reason is that a broad kill can end work belonging to other sessions, subagents and background sessions on this machine. The message tells the agent to find its own PID with `pgrep -a` or `ps`. A kill of a known PID still passes. Tests: `describe('kill-by-name')` in `plugins/bash-rules/tests/danger.test.tsx`.
  - **Reading `~/.claude/.credentials.json`** (`credentials-read` in `danger.ts`): this is a token file, and any command that reads it is either leaking the token or using a stale one. The rule matches the path in its several spellings, a `$CLAUDE_CONFIG_DIR` form, and code passed to an interpreter that names both `.claude` and the file. Metadata commands such as `ls` and `stat` pass. The message points to the statusline JSON for usage data, as the toolbox does. The Read tool is not covered yet (a follow-up). Tests: `describe('credentials-read')` in `danger.test.tsx`.
  - **`grep --no-ignore`** (category `flag`, tool `shell`, in `hygiene.ts`): flags only the literal `grep` word, when `--no-ignore` or an rg-only `--no-ignore-{vcs,dot,parent,global,exclude,messages}` appears as a flag and not as a pattern. Tests are in `plugins/bash-rules/tests/hygiene.test.ts`, in the new `flag` describe block.

The `--no-ignore` premise in the toolbox was wrong for this machine, so the rule is scoped to match. In Claude Code's Bash, `grep` is a shell function that runs the bundled ugrep with `--ignore-files`. ugrep rejects `--no-ignore` and `--no-ignore-vcs` with exit 2 and a usage message on stderr, so a scan with stderr hidden prints nothing. GNU grep 3.12 (`/usr/bin/grep`, `command grep`, `xargs grep`, `egrep`) reads `--no-ignore` as an abbreviation of `--no-ignore-case` and runs the scan. Flagging every `grep --no-ignore` would therefore block commands that work. The rule passes `--no-ignore-files`, `--no-ignore-case`, `rg --no-ignore`, `command grep`, `/usr/bin/grep`, `xargs grep` and `egrep`. Claude's grep already skips gitignored files, so the deny message suggests `--no-ignore-files` when those are needed. The facts come from the check recorded in the plan's Findings (2026-10-21).

Where it lives: the first two rules are in bash-rules' `danger.ts`, and the third is in `hygiene.ts`, each with tests in `plugins/bash-rules/tests/`. Version bump and release go through S7 and `ship-plugin`.

### `prove`, ported as a focused plugin

It is `plugins/prove` (skill `prove`, 0.1.0). It is in `baseline` and marked `disable-model-invocation: true`, so the user starts it with "prove it" or "source?". Model invocation would fire on "are you sure?" about a plan, and that wants reconsideration (`doubt-review`), not a claim audit. The steps: take the passage (or the last answer), extract the checkable claims, check each against project files, the artifact itself or authoritative docs, then write one line per claim: Confirmed, Wrong (with the correct fact) or Unverified (and withdrawn). It restates the corrected answer. The skill keeps the upstream rule that memory may locate evidence but cannot confirm a claim. The upstream is MIT, so `LICENSE` and `NOTICE` ship in the plugin. Moving it to `programming-core` would need trigger evals first, and only if the usage log shows it used often.

### `vet`

It is `plugins/vet` (skill `vet`, 0.1.0). It is model-invocable, for a mid-task check before adopting an external tool, and it depends on `plugin-vetter`. Its ledger is this repo's `docs/README.md`, so it is project scope only and in no meta. Its steps: list the candidates, dedupe first, cheap gates, research the survivors, judge fit in the session, then write one ledger line. Dedupe searches `docs/README.md`, `docs/research/`, `docs/3rd-party/README.md`, the plugin NOTICE files, the marketplace, the local skills folder and the MCP names, and it uses `command grep -rin` because Claude's grep honors `.gitignore`.

The five verdicts are fixed and verbatim: Adopted, Watching, Stole the idea, Rejected and Not evaluated. The ledger line carries its verdict, date and evidence, and the lines are sorted by verdict. vet installs nothing. An Adopted candidate goes to `plugin-vetter` on the exact files at a pinned commit before any install. Enabling vet for this repo (`claude plugin install vet@adminhead --scope project`) is S7 step 4, and it is not done yet.

### `necromancy`

It is `plugins/necromancy` (skill `necromancy`, 0.1.0). It is in `baseline` and manual. A Python 3 standard-library script, `skills/necromancy/scripts/necromancy.py`, has two commands. `list` shows this project's sessions, with age, size, title, a `live?` flag and any handoff file they wrote. `digest` writes masked anchors from one transcript (first ask, user decisions, files written, commits, errors) and prints a receipt. The skill then checks the anchors against the repo as it is now and writes a handoff-shaped brief for a fresh session. The model never reads the raw JSONL.

Its scope is narrow. `handoff` prevents loss, because the live session writes the brief. `necromancy` recovers a session that died with no handoff. If the user only wants the old conversation back, `claude --resume` is the better choice. The digest idea came via the toolbox from ryanthedev/herderp, which has no license file, so nothing was taken from it. The NOTICE says so.

## Other ideas worth noting

These are design notes from the toolbox's docs, not tools. They agree with, or sharpen, what this repo already does:

- **A gate beats a self-judged rule.** In a 50-session audit, the model decided "am I already oriented?" wrongly about 1 time in 5. The fix was a block-once, fail-open hook at the point of action. This is the same reasoning as bash-rules and check-bypass-guard.
- **Hooks print a receipt, not the content.** Big hook output gets silently cut to a preview of about 2 KB that looks complete. So a hook should report a file's size and tell the model to Read it. Worth remembering for `docs-sync` and any SessionStart hook that injects context.
- **Only use a subagent when doing the work inline would cost more.** Their example: routing a 4-command restart to a subagent cost 67k tokens. The orchestration agent's routing rules already lean this way.

## Caveats

- The benchmark figures are the author's own, from the linked [harness-benchmark-report](https://github.com/dtiger1889-ops/harness-benchmark-report), which this review didn't open. They are quoted from the toolbox's docs, not checked.
- The macOS/Linux hook ports have not been tested by their own author (README, "Platform note").
- The `--no-ignore` facts depend on Claude Code's bundled grep being ugrep. If Claude Code changes its grep (for example to rg), the rule's scope and message need a fresh look.
- The repo's contents were treated as data. Nothing in it was run by this review. The ported code is covered by the bash-rules and prove/necromancy/vet checks named in the plan, not by this document.
