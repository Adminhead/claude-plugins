# Custom main-session system prompt

Plan for replacing the stock main-session system prompt for script launches. Route (Q7): `claude --agent orchestration --append-system-prompt-file ~/.claude/prompts/system_override.md`. Status: S1 and S2 done 2026-10-10, then re-cut for the agent route; S3 done 2026-10-11 after the launcher `scripts/claude-tmux.sh` passed the flags (667dd0f); S5, S6, S7 and S8 done (see their sections); S4 merged into S8. All slices are done. Evidence comes from the installed 2.1.296 binary (`~/.local/share/claude/versions/2.1.296`, build 2026-10-09T01:31:52Z, SHA `fdb6c17`) and [prompt-reconstruction.md](../research/prompt-reconstruction.md), which covers 2.1.287. Function names below are 2.1.296 minified names, and they change every release.

## Outcome and completion

- Outcome: a prompt file that keeps the stock harness and safety text, drops stock sections that fight `~/.claude/CLAUDE.md`, and later carries the main-session-only rules. The plan also lists what the launch script must supply.
- Completion conditions:
  - A stock-session baseline (S0) records which sections the user's model actually gets, and the inventory below matches it.
  - The prompt file follows the inventory and assembly order.
  - A session started with the file shows the custom headings in `/context` and none of the dropped ones.
  - A subagent spawned from that session still sees CLAUDE.md and none of the custom prompt.
  - The drift probe (S2) passes on the installed version.

## Givens

### G0. Agent route (Q7, 2026-10-10)

- With a main-thread agent, the selector returns the agent prompt *instead of* the body: `[...G?[G]:V, S, K, H]`. A `--system-prompt-file` body (V) is silently dropped.
- The body is kept only when the agent definition has `appendSystemPrompt: true`. Only the built-in `claude` agent sets it; the 2.1.296 markdown frontmatter whitelist has no such key.
- The append prompt (H) survives. So `--agent orchestration` supplies the Orchestration body, and `--append-system-prompt-file` supplies `system_override.md` after it.
- Verified with `claude -p --agent orchestration --append-system-prompt-file prompts/system_override.md`. Both loaded, "You are the orchestrator" came first, and `# System` through `# Context management` followed. The interactive path uses the same selector.
- G1 below still describes `--system-prompt-file`, which this route no longer uses. Its tail-addition and side-effect notes still apply.

### G1. The flag sets `customSystemPrompt`

- The CLI reads the file into the same variable as `--system-prompt` (`Kn=Tr(await rl(file),o.systemPrompt)`), resolves it in `fhs()`, and passes it to the session as `customSystemPrompt`. Every main-thread render calls `p2({customSystemPrompt, defaultSystemPrompt, appendSystemPrompt})`.
- No 2.1.296 call site passes `overrideSystemPrompt`. It appears only in the selector's parameter list.
- The selector (`qlo` in 2.1.287, `hHo` in 2.1.296) has the same logic. A string custom prompt replaces only the default body. A selected main-thread agent prompt, the skills-persistence block, the WebSearch hint, and append text still follow it.
- Those tail additions in this setup:
  - Skills persistence (`Bae()`) needs cowork or `CLAUDE_CODE_SKILL_PROPOSALS`, and the interactive turn path never passes it. It is absent with or without a custom prompt.
  - The tools block (`k0n()`) is the WebSearch system hint. It is runtime text, added only when WebSearch is in the tool set, and it survives.
  - `--append-system-prompt` text still lands last.
- `RTe()` splits the custom string on a line equal to `__SYSTEM_PROMPT_DYNAMIC_BOUNDARY__`. The file can therefore mark a static prefix and a per-session tail.
- Identity selection (`XNn()`) ignores the custom prompt. Interactive sessions still open with "You are Claude Code, Anthropic's official CLI for Claude."
- The file is read once at startup. Edits take effect only after a relaunch.

### G2. What the custom prompt loses and what still arrives

Lost, because it lives inside the default body:

| Content | Stock slot | Note |
|---|---|---|
| Memory instructions and directory path | session 8 `memory` | ~130 lines; matters because `autoMemoryEnabled: true` |
| Model-family IDs, product surfaces, fast mode | session 9 `env_info_simple` | Not the CWD/platform block |
| Agent, Explore, fork, `! <cmd>`, `/skill` guidance | session 7 `session_guidance` | Tool names are interpolated at runtime |
| Remote-served text | sessions 19–20 `heron_brook`, `brook_heron` | Unknowable, so gone for good |
| Initial `<total_tokens>` line | session 24 | `total_tokens_reminder` attachments still fire |
| All other shared and session slots | shared 1–6, session 1–26 | Handled by the inventory |

Still delivered outside the body:

| Content | Mechanism in 2.1.296 |
|---|---|
| CWD, worktree, git-repo flag, platform, shell, OS, scratchpad | `environment` attachment (`pUn`/`Wat`), rendered as a meta message |
| Model name, ID, knowledge cutoff | `model` attachment |
| Date | `date` / `current_date` |
| Git status | Context `gitStatus`. Kept interactively, but dropped in `-p` and SDK runs that set a custom prompt (`omitGitStatus`) |
| CLAUDE.md files and MEMORY.md contents | User context ("Contents of <path> (user's auto-memory…)"), plus `relevant_memories` and `memory_index_backfill` |
| Agent types, skills, deferred tools, MCP instructions | `agent_listing_delta`, `skill_listing`, `deferred_tools_delta`, `mcp_instructions_delta` |
| Output style | `output_style_instructions` attachment |

Among the 25 `customSystemPrompt` references found, only `omitGitStatus` and `/context` accounting branch on it. No attachment is gated on it. The search used `strings` output, which can split lines, so a missed reference is possible.

### G3. Subagents keep their own prompts; forks inherit the custom one

- `agents/*.md` subagents get `rKt()`, which joins the agent body, a "Notes" block, and a token budget. It takes no custom-prompt input.
- Subagents do receive `~/.claude/CLAUDE.md` through user context. Anything moved out of CLAUDE.md stops reaching them.
- `subagent_type: "fork"` rebuilds the parent prompt through `p2()` with the parent's `customSystemPrompt`, so forks inherit the custom prompt.
- Teammates (`CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1`, tmux backend) run as separate processes. Whether their spawn carries the flag is UNCONFIRMED.

### Side effects of any custom prompt

- In-session `/update` restarts and `/tui` renderer switches are refused, because "a custom system prompt" is a launch flag a restart can't carry over.
- Launch checks (`XTe()`) treat the session as customized. One visible effect is that bare `--resume` skips FleetView.
- `--exclude-dynamic-system-prompt-sections` is ignored with a custom prompt (its help text says so).

### Drift from 2.1.287 to 2.1.296

- The selector was renamed `qlo` → `hHo` with the same logic.
- Session tail: `repl_model_calls` was removed. `user_pays` was added ("The user pays per token for your turns…", gate `tengu_wobbly_dahl`, default false).
- Slot order is otherwise identical. All 33 probe phrases, taken from both kept and dropped sections, are present, four of them only through template interpolation.
- Not checked: the model-gated predicates (`bG`, `Wbe`, `Bjo`, `Ujo`, `Fjo`, `fyn`), remote flags, and the 2.1.296 gate for `task_continuity`. Which optional slots fire for the user's model stays UNCONFIRMED until S0.

## Approach

Replace the body with a static file. It keeps the stock sections that state harness facts and safety rules, and trims what CLAUDE.md already governs. Nothing is templated. Orchestration lives in `agents/orchestration.md`, loaded with `--agent`, and the file is appended after it (G0, Q7).

| Alternative | Why it lost |
|---|---|
| `--append-system-prompt-file` on the stock body | Can't remove `opus5_reduced_delegation`, `subagent_steer_delegation`, or `willow_tern`; appending adds a third voice to the conflict |
| `prompt.section` function hooks (`CLAUDE_CODE_ENABLE_FUNCTION_HOOKS=1` is already set) that null the conflicting slots | Strongest rival. It keeps the memory path, env, and remote tuning for every launch. It lost because only session slots pass through the hook (`elt(_e, …)`), section names are internal and change per release, the API is undocumented (UNCONFIRMED), and the user asked for a prompt file. See Q1 |
| `overrideSystemPrompt` | No CLI path reaches it in 2.1.296 |
| Lean body as the base | Loses the System and Actions detail; reconsider only if S0 shows the model already gets lean |

Decision trigger: if S0 shows that none of s17, s18, s21, or s22 fires for the user's model, the main reason for replacing the body weakens. Revisit Q1 before S1.

## Section inventory

Verdicts are judged against CLAUDE.md. "Gated" marks slots whose live status S0 confirms.

| Slot | Verdict | Rationale |
|---|---|---|
| Prefix: billing, identity | n/a | The harness adds both |
| Sh1 intro, first sentence | rewrite | Frame the orchestrator role |
| Sh1 security and URL paragraphs | keep | Safety policy that CLAUDE.md lacks |
| Sh2 system | keep | Harness facts: denials, reminders, injection, hooks, compaction |
| Sh2 pasted-content bullet | drop | Gate off by default; add back if S0 shows it |
| Sh3 doing_tasks: SE context, prefer editing, security, back-compat hacks | keep | Not covered by CLAUDE.md |
| Sh3 doing_tasks: scope, error-handling, comment bullets | drop | Duplicate Design and Errors; "no comments" conflicts with "match comment density" |
| Sh3 exploratory-questions bullet | drop | "2–3 sentences" conflicts with "concise, not compressed"; Scope already says don't build until told |
| Sh3 UI bullet | drop | Orchestration's `browser-tester` routing covers it |
| Sh3 help/feedback, verified-vs-assumed | drop | No value here; Planning and Verification covers honest reporting |
| Sh4 actions | keep | Core safety text; CLAUDE.md's durable approvals fit its "authorized in CLAUDE.md" clause |
| Sh5 tools | rewrite | Name the real tool set (this setup has no Glob or Grep tools); keep the parallel-calls bullet verbatim |
| Sh6 tone | rewrite | Keep emoji, `file:line`, and colon-before-tool-call bullets; drop "short and concise" |
| lean_body | drop | Standard body chosen |
| memory_static | n/a | SDK preset only |
| s1 communication, any variant | rewrite | Keep only harness facts: the user can't see tool calls, mid-turn text may be hidden, and the final message must stand alone. Response Style owns the rest |
| s2 pronouns | keep | Not covered; one sentence |
| s3 action_caution | drop | Lean only; Actions covers it |
| s4 task_continuity | drop | Unreachable in 2.1.287, unchecked in 2.1.296; Scope covers it either way |
| s5 fable_identity | drop | Gated; the `model` attachment names the model |
| s6 tool_param_json | drop | Gate off by default; add back if S0 shows it |
| s7 session_guidance: `! <cmd>`, `/skill` bullets | keep | Not covered elsewhere |
| s7 session_guidance: Agent, Explore bullets | drop | The file's Orchestration section covers them |
| s7 fork-delegation bullet | drop | Fork is on here, but the Agent tool description already says "If you are the fork, execute directly" |
| s7 cloud and ultrareview bullets | drop | Not a cloud session; ultrareview is user-triggered |
| s8 memory | drop | Auto-memory is off for script launches (Q2); claude-mem covers memory |
| s9 env_info_simple | drop | The `claude-api` skill owns model IDs; the rest is trivia |
| s10 bg-session | drop | Interactive launches only (Q4) |
| s11 context_management | keep | Harness fact that prevents early wrap-up |
| s12 brief | drop | Brief mode is off |
| s13 focus_mode | drop | The communication rewrite's final-message rule covers it |
| s14 act_dont_rederive | keep | Default on, aligned, not duplicated |
| s15 delivering_work_max | rewrite, gated | Keep scope fidelity, do-independent-work-first, and reaffirmation-is-a-decision; drop "finish the whole task", which Scope says (Q5) |
| s16 overcorrection | keep, gated | Fits direct corrections; adds "don't take other agents' results at face value" |
| s17 subagent_steer_delegation | drop | Contradicts "Delegation is the default" |
| s18 opus5_reduced_delegation | drop | Contradicts Orchestration outright; the main reason for this work |
| s19–20 heron_brook, brook_heron | lost | Remote text that can't be copied |
| s21 willow_tern | drop, gated | Contradicts Response Style: its exemplar uses em-dashes, and it sets its own bold and header rules |
| s22 autonomy_append | rewrite, gated | Drop "the user is not watching"; keep the last-paragraph stall check and the evidence-before-state-change line |
| s23 endconv_deferred_hint | drop | The tool's own description covers it |
| s24 total_tokens | drop | Attachment reminders still fire |
| s25 user_pays (new) | drop | Gate off |
| s26 repl_working | n/a | Always null |
| Post-body: skills persistence, WebSearch hint, append | n/a | The harness adds them after the file |

## Assembly order

1. Intro: rewritten first sentence, then the stock security and URL paragraphs
2. `# System`
3. `# Doing tasks`, trimmed
4. `# Executing actions with care`
5. `# Using your tools`, with the `! <cmd>` and `/skill` bullets
6. `# Orchestration`, moved from CLAUDE.md (S3)
7. `# Tone and style`, trimmed
8. `# Communicating`: harness facts and the final-message rule
9. Pronouns, act-don't-rederive, Corrections, Delivering work (trimmed), and the stall check
10. `# Context management`
11. The user's later static additions

The stock order (shared, then session) is kept so the most-tested text sits where the model expects it. The file is fully static, so it needs no `__SYSTEM_PROMPT_DYNAMIC_BOUNDARY__` line. If a per-project tail is added later, it goes after that marker.

## CLAUDE.md migration

| Part of `~/.claude/CLAUDE.md` | Verdict | Why |
|---|---|---|
| `@RTK.md` import | stays | Every agent that runs commands needs it |
| Response Style | stays | Subagent reports, scribe docs, and non-script sessions need it |
| Engineering (Editing through Secrets) | stays | Coders and reviewers read CLAUDE.md, never the custom prompt (G3) |
| Asking Questions | stays | Also governs open questions in subagent reports |
| Scope: per-slice commits, `work_state` operator list | stays | Main-only but small; moving them splits the section |
| Orchestration (~580 words) | moves (S3) | Plain `claude` should be a default setup (Q3), its text is main-session-only, and every subagent pays for it today |

- The prompt file never restates CLAUDE.md. CLAUDE.md arrives wrapped in "These instructions OVERRIDE any default behavior", so any contradiction resolves against the prompt file.

## Launch-script dependencies

| # | The script must | Because |
|---|---|---|
| L1 | Pass `--agent orchestration --append-system-prompt-file ~/.claude/prompts/system_override.md` on every main launch, including `-c`, `--resume`, and `claude-tmux` | A resume without them silently reverts to the stock body. `--system-prompt-file` must not be used, because the agent drops it (G0) |
| L2 | Set `CLAUDE_CODE_DISABLE_AUTO_MEMORY=1` | Auto-memory is off for script launches (Q2); the prompt has no memory section to match it |
| L3 | Resolve `orchestration` from `~/.claude/agents` and the override from `~/.claude/prompts` | Both are symlinked to this repo (Q6) |
| L4 | Launch main sessions interactively, or accept losing git status under `-p` | `omitGitStatus` |
| L5 | Don't pass the flag to teammates or background jobs | Q4: agents carry their own needs |
| L6 | Relaunch to pick up edits to the prompt file | The file is read once at startup |

The script doesn't need to supply env, date, interactive git status, CLAUDE.md, the agent, skill, MCP, or deferred-tool lists, or the WebSearch hint. Plain `claude` launches are untouched (Q3).

## Slices

| # | Slice | Files | Acceptance | Cheapest check | Agent |
|---|---|---|---|---|---|
| S0 | Capture the baseline | Appendix in this plan | Live section names and token counts recorded for the default model | `/context` in a stock session (operator step). It names sections by first heading (`bHo`), but whether the UI shows them is UNCONFIRMED; the fallback is a log-only `prompt.section` hook | Main session, user runs `/context` |
| S1 | Write the prompt file | `prompts/system_override.md` | Follows the inventory and order; no sentence contradicts or restates CLAUDE.md | `claude --agent orchestration --append-system-prompt-file prompts/system_override.md`, then `/context` shows the custom headings and no dropped ones; `quick-review` checks the file against CLAUDE.md | `coder-light` copies verbatim sections; `scribe` writes the rewrites |
| S2 | Drift probe | `scripts/prompt-drift.sh` | Fails when the agent-plus-append route breaks (G0), the slot list changes, or a kept phrase disappears | Run on 2.1.296 (pass) and 2.1.294 (report the diff) | `coder` |
| S4 | ~~Agent self-sufficiency~~ | — | Merged into S8 (T4) | — | — |
| S8 | ~~Agent tool scoping~~ Done 2026-10-10 (T0–T7) | `agents/*.md`, `hooks/readonly-bash.py`, `scripts/agent-tools.*` | See the S8 section | T0 spike, drift check, T5 live run | per sub-slice |
| S5 | Research orchestration prompts | `docs/research/orchestration-prompts.md` | How oh-my-opencode and oh-my-opencode-slim write their orchestrator logic (delegation rules, routing, parallelism, verification, todo discipline, failure handling), with links to the exact source files and a list of practices worth adopting | Every claim cites a file in the upstream repo at a pinned commit | `general-purpose`, one per repo, in parallel |
| S6 | Improve the orchestration agent | `agents/orchestration.md` | Adopts the S5 practices that fit this setup; no rule contradicts CLAUDE.md or `system_override.md`; frontmatter sets tools and model where useful | `quick-review` against S5's adoption list; one `claude -p --agent orchestration --append-system-prompt-file …` smoke run | `scribe` drafts, user approves |
| S7 | ~~Orchestration enforcement~~ Done 2026-10-10 (S7.0–S7.3; S7.4 dropped) | Plan section in this file, then hooks and/or mods | Three behaviors, all agent-frontmatter classic hooks (no mod): Stop-hook continuation while tasks are open (from a hook-owned ledger), a reminder to verify when an agent returns (`UserPromptSubmit`), and a nudge when the main thread edits source directly. Each applies only to script sessions | Design reviewed before any code | `architect`, then `coder` per behavior |
| S3 | ~~Migrate Orchestration~~ Done 2026-10-11. A fresh `claude -p` sees `## Secrets` as the last CLAUDE.md heading; subagents of an already-running session keep the copy loaded at its start | `~/.claude/CLAUDE.md` (body already in `agents/orchestration.md`) | Script sessions have it; plain `claude` and subagents don't | Ask an `Explore` subagent whether its context mentions routing rules; `/context` CLAUDE.md tokens drop by about 800 | `coder-light`, only once the launch script passes the flag (L1); before that, every session would lose Orchestration. Runs last, so current sessions keep CLAUDE.md's Orchestration until the launcher is ready |

The launch script is out of scope. The user owns it, and L1–L6 are its inputs. S2 can stay a manual procedure (a `strings` and `rg -c -F` sweep) if upgrades slow down.

## Risks

| Risk | Effect | Mitigation |
|---|---|---|
| Upgrade drift | Stale verbatim text; new stock safety slots never reach the user | Run S2 after each upgrade |
| Remote tuning lost | Anthropic's served prompt fixes stop applying | Accept; S2 flags new slots |
| Gated slots misjudged | Keep and drop verdicts built on text the model never saw | S0 before S1 |
| Non-script launches (IDE, desktop, plain `claude`) | They get the stock prompt and no Orchestration, by design (Q3) | Accept |
| `/update` and `/tui` refused in session | The user must restart by hand | Accept |
| Cache | The stock shared prefix may be cached across users; a custom prompt may lose that (UNCONFIRMED). Per-session caching is unaffected | Boundary marker and stable bytes |
| Salience | CLAUDE.md's OVERRIDE wrapper wins any tie with the prompt file | Keep the prompt free of contradictions |

Rollback: launch without the flag, and move Orchestration back into CLAUDE.md.

## Critique log

Second opinion: skipped, to keep the reconstruction and CLAUDE.md off external models. Self-critique plus one internal advisor pass.

| # | Critique | Disposition |
|---|---|---|
| 1 | Replacing the body loses remote tuning and future stock fixes, while CLAUDE.md overrides already work | Adopted as a risk with S2, plus the S0 decision trigger. Not a blocker, because appending can't remove s17, s18, or s21 |
| 2 | `prompt.section` hooks would drop the conflicting slots with less loss | Open (Q1). Only session slots pass through the hook, so shared-slot edits (tone, doing_tasks) stay out of reach |
| 3 | Moving Orchestration breaks every launch that bypasses the script | Superseded by Q3: plain launches are meant to lose it |
| 4 | A templated memory path can diverge from the harness rule in worktrees | Moot: auto-memory is off for script launches (Q2) |
| 5 | Verbatim stock text names tools that don't exist here (Glob, Grep) | Adopted: Sh5 and s7 rewritten to the real tool set |
| 6 | Dropping focus_mode strands focus-mode users | Adopted: the communication rewrite keeps the final-message-stands-alone rule |
| 7 | Git status disappears under `-p` | Adopted: L5 |
| 8 | Carrying Orchestration in both files before the M-gate contradicts the no-restate rule and costs about 800 tokens a turn | Adopted: S3 moves it in one change, so it never lives in both files; the Sh3 UI bullet is dropped instead of rewritten |

## Open questions

- Q1. Resolved 2026-10-10, after S0: a full prompt file built from the standard body, as planned. The user chose it over an append file and a lean-based file, even though Opus 5.5 gets the lean body and none of the conflicting slots fire today.
- Q2. Resolved: turn auto-memory off for script launches (`CLAUDE_CODE_DISABLE_AUTO_MEMORY=1`, present in 2.1.296). claude-mem covers memory. The prompt file carries no memory section and no templated tail.
- Q3. Resolved: only script launches use the prompt file. Plain `claude` keeps the stock prompt and gets no Orchestration. Orchestration moves into `agents/orchestration.md` (Q7) and leaves CLAUDE.md in S3, with no M-gate.
- Q4. Resolved: teammates and background jobs don't get the flag. Subagents never see the main prompt, so each `agents/*.md` carries what it needs itself (S4).
- Q5. Resolved: trimmed. Drop only "Finish the whole task, not just easy parts — report completion only when fully done", which CLAUDE.md Scope already says.
- Q6. Resolved: `prompts/system_override.md` in this repo, with `~/.claude/prompts` symlinked to `prompts/` the same way as `agents/`.
- Q9. Resolved 2026-10-10: `agents/`, `prompts/` and `hooks/` stay as repo folders symlinked into `~/.claude`, not a plugin. Plugin agents ignore `hooks`, `mcpServers` and `permissionMode` (sub-agents docs), which would silently drop the read-only agents' `readonly-bash.py` guard and the S7 frontmatter hooks. Plugin hooks can't be scoped to `--agent`, and a plugin can't append to the system prompt. Mods go in a new `coremods` plugin (the engine reserves `core`), which absorbs `git-line`, `usage-band` and `agent-status` (the S7.4 notify mod was dropped) and holds the T7 git tools.
- Q8. Resolved 2026-10-10 (S6 inputs, from [orchestration-prompts.md](../research/orchestration-prompts.md)): keep "Delegation is the default" and add the two-sided rule; adopt P2–P12; route with one Delegate/Don't line per agent; and design the three hooks in S7, each judged as a hook, a mod, or both.
- Q7. Resolved 2026-10-10: Orchestration becomes the main-thread agent `agents/orchestration.md`, so its frontmatter can control tools, model, effort, permissions, hooks and MCP servers. The rest of the prompt is appended (G0). Known cost: `orchestration` also appears as a spawnable subagent type in every session, plain `claude` included (confirmed with `claude -p`). Its description says not to spawn it. To scope it to script sessions only, the launch script could define it inline with `--agents` instead of keeping it in `~/.claude/agents`.

## Appendix: S0 baseline (2026-10-10)

Stock interactive session, 2.1.296, Opus 5.5 (`claude-opus-5-5`). `/context` reports only a total (system prompt 4k tokens) and no per-section list. The section list below was read directly from a stock session's own system prompt.

| Order | Section | Slot |
|---|---|---|
| 1 | Identity, short "agent working with the user" intro, security paragraph (no URL paragraph) | prefix, Sh1 lean variant |
| 2 | `# Harness` plus a "match comment density" line | lean_body |
| 3 | Pronouns | s2 |
| 4 | Hard-to-reverse actions paragraph | s3 action_caution |
| 5 | `# Session-specific guidance` (`! <cmd>`, `/skill`, ultrareview) | s7 |
| 6 | `# Memory`, short variant | s8 |
| 7 | `# Environment` (model IDs, surfaces, fast mode) | s9 |
| 8 | `# Context management` | s11 |
| 9 | Act, don't re-derive | s14 |
| 10 | EndConversation deferred hint, `total_tokens` | s23, s24 |
| after body | WebSearch mode hint, Claude in Chrome guidance | post-body |

Absent: s1 communication, s15 delivering_work_max, s16 overcorrection, s17 subagent_steer_delegation, s18 opus5_reduced_delegation, s21 willow_tern, s22 autonomy_append.

Consequence: the decision trigger fired, and Q1 was revisited. The user kept the standard-body plan (see Q1). The inventory still stands, but its rows for s17, s18, s21 and s22 now guard against future gate changes rather than fixing current behavior. Lean-only text the model gets today (Harness bullets, action_caution, the comment-density line) is worth checking against the standard sections during S1, so nothing the model relies on now goes missing.

## S7. Orchestration enforcement

Status: done 2026-10-10. S7.0 (719fcdf), S7.1 (49dfbcc), S7.2 (c070e02) and S7.3 landed; S7.4 dropped. Remaining UNCONFIRMED items are listed under Unknowns. Evidence comes from the 2.1.296 binary (`Fje`/`F2n`, `kqo`, `B(t)`, `Rir`/`Ftt`, `yv`/`ML`), from the mod types at `plugins/git-line/.claude-plugin/types/claude-code/index.d.ts` (2.1.291), and from hooks.md, sub-agents.md and agent-teams.md, read through claude-code-guide on 2026-10-10.

### Outcome and completion

- **Outcome.** In script sessions, the main thread is held to its open tasks, gets a verify reminder when an agent returns, and gets a delegate nudge once it passes the do-it-yourself threshold. Plain `claude`, subagents and teammates see none of this.
- **Completion conditions:**
  - S7.0 findings are recorded, and every UNCONFIRMED row that blocks code is settled (done).
  - `hooks/tests/orchestration-guard.test.sh` passes every fixture row (done, 81/0).
  - One wiring run in `-p` and one in interactive tmux show R1, R2, R3 and R4 in the transcript (done for R1, R2, R4 in both; R3 in `-p` only, see S7.2 results).
  - Every mode exits 0 with no output on bad input, on a subagent payload, and in a session whose agent isn't `orchestration` (done, in the fixtures).

### Evidence

| Fact | Source |
|---|---|
| Frontmatter hooks on a `--agent` main-thread agent run alongside settings hooks | sub-agents.md, "Hooks in subagent frontmatter"; binary `Fje` → `F2n` (`mainThreadAgentHooks`) |
| On the main thread `Stop` stays `Stop`. It becomes `SubagentStop` only when the agent runs as a subagent, and those hooks are removed when it finishes | binary `kqo(…, isAgent=true)`; sub-agents.md |
| The main-thread agent's hooks join every event's hook list with no agent filter, so they also fire on tool events inside subagents | binary `B(t)` merges `q4()` (settings) and `Gse()`. Inferred; S7.0 confirms |
| `agent_id` is absent on the main thread even under `--agent`. `agent_type` holds the `--agent` name there, and the subagent's own type inside a subagent | `index.d.ts:787-805` (`BaseHookInput`); hooks.md common input fields |
| `prompt_id` ties every event to the user prompt before it | 2.1.296 hook input schema |
| Stop doesn't fire on a user interrupt. An API error fires `StopFailure` instead | hooks.md#stop |
| The engine's limit of 8 continuations resets on every tool call, so it doesn't bound a block → tool → stop loop | hooks.md#stop-input |
| Stop input carries `stop_hook_active`, `last_assistant_message`, `background_tasks` and `session_crons` | hooks.md; `index.d.ts` `StopHookInput` |
| PostToolUse on `Agent` is the documented parent-side hook. For a background agent it fires at launch, with `status: "async_launched"`. SubagentStop context goes to the child. **Interactively, every Agent call returns `async_launched`, even without `run_in_background`, so this hook almost never sees a result there** | hooks.md#subagentstop-input, #pretooluse-input; S7.0 |
| UserPromptSubmit fires when a background subagent reports back, and **also mid-turn** when a notification is delivered into a running turn, in both modes. Its `source` field is absent in 2.1.296, so a hook has to match the prompt text | hooks.md#userpromptsubmit; binary `Rir`/`Ftt`; S7.0 |
| Tasks live in `~/.claude/tasks/<list>/`, where `<list>` is `<full-sid>` in `-p` and `session-<sid8>` interactively. `CLAUDE_CODE_TASK_LIST_ID` overrides it. **The interactive UI deletes every task file about 5 s after all tasks complete**, so a Stop hook can't audit a finished list from the store | S7.0 |
| Plugin hooks can't be limited to one `--agent`. `if` holds a single permission rule, and plugin agents ignore `hooks` | hooks.md#common-fields; sub-agents.md |

### Decision

All three behaviors are classic hooks declared in the frontmatter of `agents/orchestration.md` and run by one stdlib Python script. No mod (S7.4 dropped, 2026-10-10).

| Behavior | Mechanism | Why | Scoping | Failure mode |
|---|---|---|---|---|
| 1. Continuation | `Stop` hook in the frontmatter, reading a hook-owned ledger written by `PostToolUse` on `TaskCreate\|TaskUpdate` | Only a Stop hook can keep a finished turn going, and Stop already skips interrupts and API errors. The ledger survives the interactive UI deleting finished task files | Frontmatter hooks load only for `--agent orchestration`; the script also requires `agent_id` to be absent | Fails open. The worst case is one extra model turn per chain of stops |
| 2. Agent-return reminder | `UserPromptSubmit` matched on `<agent-message from="` or `<task-notification>` with `<summary>Agent "` | Fires for idle and mid-turn returns in both modes. The interactive shape depends on permission mode (see Spike results), and both shapes match. `PostToolUse` on `Agent` almost never sees a result interactively (always `async_launched`) | Same | Fails open. A prompt-text change in an upgrade silences it, which the wiring run catches |
| 3. Direct-edit nudge | `PostToolUse` on `Edit\|Write\|NotebookEdit` | Needs only the tool input and `prompt_id` | `agent_id` must be absent, because these hooks also fire inside subagents | Fails open. A false positive costs about 60 tokens, at most once per prompt |

### Rejected alternatives

| Alternative | Why it lost |
|---|---|
| Mod: `classic.Stop` gated on `e.agent_type`, `tool.call` with no `agentId`, `prompt.submit` on origin `task-notification`, and the `agent-status` `applyTask` map for tasks | The strongest rival. It lost on the early-access API (`index.d.ts:4`; the types already drifted between 2.1.289 and 2.1.291), on having no native `--agent` scoping, and on batch2's choice of classic hooks over mods. S7.0 removed its edge: `UserPromptSubmit` fires mid-turn, and `prompt.submit` doesn't expose the agent type. The ledger replaced its task map |
| Plugin `hooks.json` with the script checking `agent_type` | Fits the house layout, but spawns Python on every matched event in every session, plain `claude` included |
| `--plugin-dir` passed by the launch script | Same scope as frontmatter, but adds another launch-script requirement. Frontmatter scoping was the intent of Q7 |
| Prompt-type Stop hook, where a model judges completion | A model call on every stop, nondeterministic, and no state for stagnation |
| Task counts from `TaskCreated`/`TaskCompleted` | Drifts on deletes (batch2) |
| Reading the task store at Stop | The interactive UI deletes the files after the last task completes, so the R4 audit would never see them. Superseded by the ledger (PostToolUse on `TaskCreate\|TaskUpdate`) |

### Design

**Shared parts**

- One stdlib script, `hooks/orchestration-guard.py <stop|prompt|edit|ledger>`, reached as `$HOME/.claude/hooks/…` because `~/.claude/hooks` symlinks to the repo's `hooks/` (QS7-1). Frontmatter hooks get no plugin root.
- Every mode first checks the session. It exits 0 silently unless `agent_type == "orchestration"` and `agent_id` is absent.
- Every mode fails open. A catch-all wraps `main`, and malformed stdin or a missing directory also produce no output and exit 0, following the H6 rule.
- State lives in `${XDG_STATE_HOME:-~/.local/state}/orchestration-guard/<session_id>.json` and is pruned after 30 days. `--resume` keeps the session ID.
- R1–R3 are module constants, with no counts, paths or timestamps in them.

```yaml
hooks:
  Stop:
    - hooks: [{type: command, command: 'python3 -I "$HOME/.claude/hooks/orchestration-guard.py" stop'}]
  UserPromptSubmit:
    - hooks: [{type: command, command: 'python3 -I "$HOME/.claude/hooks/orchestration-guard.py" prompt'}]
  PostToolUse:
    - matcher: TaskCreate|TaskUpdate
      hooks: [{type: command, command: 'python3 -I "$HOME/.claude/hooks/orchestration-guard.py" ledger'}]
    - matcher: Edit|Write|NotebookEdit
      hooks: [{type: command, command: 'python3 -I "$HOME/.claude/hooks/orchestration-guard.py" edit'}]
```

**Behavior 1: `stop` mode**

- **Where tasks come from.** `ledger` mode, on `PostToolUse` of `TaskCreate|TaskUpdate`, records each task's id, subject and status in the per-session state file (below). `stop` reads that ledger, not the store. Hook-owned state doesn't depend on the store's directory name, and it survives the interactive UI deleting finished task files. The tool-input field names for `TaskUpdate` (id, status, deletion) are UNCONFIRMED; S7.1 reads them from a captured payload first.
- **Terms:**
  - A task is *open* when it is pending or in progress.
  - The list has *started* when any task is in progress or completed.
  - The *snapshot* is the sorted list of (id, status) pairs.
- **It stays silent when any of these holds:**
  - No task is open.
  - Nothing has started, because a presented plan isn't abandoned work.
  - `background_tasks` is non-empty, because a completion notification will wake the session.
  - The snapshot equals the one saved at the last allowed stop, so nothing has moved (for example, later questions while a plan is paused).
  - `stop_hook_active` is set and the snapshot equals the last blocked one. That is stagnation.
  - The current chain has already blocked 5 times.
- **Final audit (QS7-4, ledger-based).** When every ledger task is completed and this snapshot hasn't been audited yet, it blocks once with R4 and marks the snapshot audited. A later stop with the same snapshot passes.
- **Otherwise it blocks with R1** and saves the snapshot. Every allowed stop saves the snapshot as the new rest point. When `stop_hook_active` is false, the chain count resets.
- **Stagnation limit.** It is 1, not upstream's 3. Upstream wakes an idle session, but here the model has read R1 and chosen to stop again, which the CLAUDE.md stop-and-report rules allow. Both limits are constants.
- It runs alongside the authoring plugin's docs-sync Stop hook. Since authoring 0.4.1 that hook only adds non-error `additionalContext` and never blocks, so only this guard can block a stop.

**Behavior 2: `prompt` mode (QS7-2, hook only)**

- `prompt` mode injects R2 when the `UserPromptSubmit` prompt matches an agent return:
  - `<agent-message from="` (interactive hand-back under `--permission-mode auto`, wrapping `[Subagent hand-back] …`), or
  - `<task-notification>` containing `<summary>Agent "` (`-p` background agent, and interactive under `acceptEdits`).
- It skips `<summary>Background command …` (background Bash) and Monitor events.
- It also fires mid-turn, because `UserPromptSubmit` does. Within a turn `prompt_id` is unchanged. On an idle notification turn it changes, so the edit counter resets then, which is acceptable.
- The `PostToolUse Agent` hook is gone. Interactive Agent calls always return `async_launched`, and a foreground `-p` return carries a real tool result but is the rarer path.
- One text serves every agent type. "If it changed files" keeps it true for read-only agents.

**Behavior 3: `edit` mode**

- **Lines counted per call:**
  - Edit: the larger of the old and new line counts.
  - Write: the content's line count.
  - NotebookEdit: the line count of `new_source`.
- Paths outside `cwd` are not counted.
- Lines and distinct files add up per `prompt_id`. R3 fires once per `prompt_id`, when lines exceed 30 or files exceed 2 (one file plus its test).

**Draft texts.** These stay byte-stable once fixed.

- **R1:** "Tasks are still open. Check each open task against evidence. Mark it completed if the evidence shows it is done, delete it if it no longer applies, and keep working if work remains and nothing blocks it. If you stopped on purpose (you need the user, the next step is risky or destructive, the user asked only for a plan or a report, or CLAUDE.md says to stop here), name the tasks that stay open and why, then stop."
- **R2:** "An agent just returned. Its report is a claim, not evidence. If it changed files, read the diff before you rely on it, and check it against the brief. Missing scope and out-of-scope extras are both defects."
- **R4:** "Every task is marked completed. Before you finish, map each explicit requirement from the user to concrete evidence: a diff, a check's output, or a `path:line`. Treat anything you can't point to as not done, and reopen a task for it. If everything holds, give your final report."
- **R3:** "You have now edited more than about 30 lines, or more than two files, directly since the user's last message. That is past the do-it-yourself threshold. Hand the rest to a coder agent with a brief, unless one small edit finishes it or the user asked you to make this change yourself."

### Prompt cache

- **Where the texts land.** R1 arrives as the Stop feedback message at the end of the conversation. R2 and R3 arrive as system reminders next to a tool result or a notification prompt.
- **Effect on the cache.** All three are appended, stored in the transcript and replayed on resume. No earlier bytes change, so the cached prefix survives and each text is paid for once. UNCONFIRMED: the docs mention caching only for SubagentStart.
- **Constant strings** keep the fixtures exact and make every occurrence identical.
- **Forbidden mechanisms:** `updatedToolOutput`, `prompt.section`, system-prompt edits and mod `prompt.attachment` rewrites. Each one changes bytes the cache already holds.
- **Cost:**
  - R2 costs about 45 tokens per return.
  - R3 fires at most once per prompt.
  - R1 is about 90 tokens per block, but the extra model turn it causes is the real cost.

### Unknowns

All settled by S7.0 except the last row.

| Unknown | Result (S7.0) |
|---|---|
| Task JSON shape and directory name | Settled. `<id>.json` under `<full-sid>` (`-p`) or `session-<sid8>` (interactive); the interactive UI deletes files after the last completion, so behavior 1 uses a hook-owned ledger |
| Frontmatter hooks fire inside subagents | Yes. They carry `agent_id` and the subagent's `agent_type`, so the `agent_id` check stays mandatory |
| Notification `prompt` shapes, including mid-turn delivery | Settled. Agent and Bash shapes differ (see Spike results), and `UserPromptSubmit` fires mid-turn in both modes, so QS7-2 needs no mod |
| `prompt_id` on main-thread events | Present. Unchanged mid-turn, new on idle notification turns |
| Mod `prompt.submit` sees task notifications and the session's agent type | Notifications yes; agent type no. Moot, since S7.4 is dropped |
| `--agents` JSON accepts `hooks` (spike tooling only) | Probes ran through `--agents`. Frontmatter-file agents are now verified by the S7.2 run (`-p` and tmux) |
| Whether interactive default-async is a setting (agent-teams env?) or a build default | UNCONFIRMED. Not run |
| `--resume` task dir name, and `CLAUDE_CODE_TASK_LIST_ID` ledger paths | UNCONFIRMED. Not run |
| Interactive R3 (d) and subagent-write exclusion (f) | UNCONFIRMED. Verified in `-p` only |
| Prompt-cache behavior of R1–R4 | UNCONFIRMED. See Prompt cache |

### Sub-slices

| # | Slice | Files | Acceptance | Cheapest check | Agent |
|---|---|---|---|---|---|
| S7.0 | ~~Spike the payloads and the task store~~ Done 2026-10-10 (719fcdf) | Scratch only; findings below | Records: the main-thread Stop fields; a subagent PostToolUse (with `agent_id`) firing the main agent's hook; the task directory and JSON fields; the UserPromptSubmit `prompt` for a background agent return, its hand-back, a background Bash return and a mid-turn return; whether `prompt_id` changes on notification turns | A probe agent passed through `--agents` whose hooks append stdin to a scratch log; `scripts/claude-tmux.sh` covers the interactive case | `coder` |
| S7.1 | ~~Guard script and fixtures~~ Done 2026-10-10 (49dfbcc, 81/0, flock for batched Task hooks) | `hooks/orchestration-guard.py`, `hooks/tests/orchestration-guard.test.sh` | Every fixture row passes. Modes: stop, prompt, edit, ledger | `bash hooks/tests/orchestration-guard.test.sh` | `coder`, then `quick-review` |
| S7.2 | ~~Wire the hooks~~ Done 2026-10-10 (c070e02; results below) | `agents/orchestration.md` frontmatter only | Four hook entries registered (Stop, UserPromptSubmit, PostToolUse for tasks, PostToolUse for edits) | One `claude -p --agent orchestration --append-system-prompt-file prompts/system_override.md` run in a temp git repo that creates two tasks, runs a `Explore` agent, writes a 40-line file directly, completes one task, and stops, plus the same scenario in interactive tmux (`scripts/claude-tmux.sh`), because `-p` alone doesn't match interactive behavior. Each transcript holds R1, R2, R3 and R4 | `coder-light` |
| ~~S7.4~~ | ~~Notification mod~~ | — | Dropped 2026-10-10: QS7-2 is a hook (`prompt` mode) | — | — |
| S7.3 | ~~Record~~ Done 2026-10-10 | This section, the S7 row, the `work_state` operator step | Matches what landed | Read the diff | Main session |

**S7.2 results (2.1.296).** Haiku, `--agent orchestration --append-system-prompt-file`. Evidence under `$S72` = `/tmp/claude-1000/-home-buck-Projects-adminhead-claude-plugins/d3587765-e946-4874-935d-335b692b6f5a/scratchpad/s72/`.

| Check | `-p` | Interactive tmux |
|---|---|---|
| (a) R1 on an open started task | PASS (`$S72/a1.jsonl`) | PASS (`$S72/tmux-a.pane`) |
| (b) Exactly one R4 audit | PASS (`$S72/b1.jsonl`) | PASS (`$S72/tmux-b.pane`) |
| (c) R2 on an agent return | PASS, `<task-notification>` (`$S72/c1.jsonl`) | PASS (`$S72/tmux-auto.transcript.jsonl`); appears as a `hook_additional_context` attachment |
| (d) R3 fires once past 30 lines | PASS (`$S72/d1.jsonl`, `d2.jsonl`) | UNCONFIRMED |
| (e) Batched TaskCreate/TaskUpdate keeps all ledger entries | PASS (`$S72/a1.jsonl`, `b1.jsonl`) | not run separately |
| (f) A subagent's Write doesn't count; no ledger for it | PASS (`$S72/f1.jsonl`) | UNCONFIRMED |

- **Hand-back shape depends on permission mode.** Under `acceptEdits`, interactive returns arrive as `<task-notification>` with `<summary>Agent "…" finished`. `<agent-message from=` appeared only under `--permission-mode auto`. Both branches fire R2.
- **Frontmatter-file agent hooks are verified.** The earlier probes used `--agents`.
- **Still UNCONFIRMED:** interactive (d) and (f); `--resume` and `CLAUDE_CODE_TASK_LIST_ID` paths; prompt-cache behavior of R1–R4.

**Spike results (2.1.296).** Haiku, `-p` and interactive tmux. Logs under `$L` = `/tmp/claude-1000/-home-buck-Projects-adminhead-claude-plugins/d3587765-e946-4874-935d-335b692b6f5a/scratchpad/logs/`.

| Topic | Result | Log |
|---|---|---|
| Main-thread Stop under `--agent X` | Has `agent_type`, `prompt_id`, `stop_hook_active`, `last_assistant_message`, `background_tasks` (`{id, type: subagent\|shell, status, description, agent_type\|command}`; `[]` when idle). No `agent_id`. A second Stop after a block has `stop_hook_active: true` and the same `prompt_id` | `$L/a1.log`, `a7.log`, `d1.log` |
| Frontmatter hooks inside subagents | They fire there, with `agent_id` and the subagent's `agent_type`. The `agent_id`-absent check is mandatory | `$L/b1.log` |
| Task store | `~/.claude/tasks/<list>/`; `<list>` is `<full-sid>` in `-p`, `session-<sid8>` interactive; `CLAUDE_CODE_TASK_LIST_ID` overrides. Files `<id>.json`, `.lock`, `.highwatermark`. Fields: id, subject, description, activeForm?, owner?, status (pending\|in_progress\|completed), blocks, blockedBy, metadata?. Interactive UI deletes all task files about 5 s after every task completes; `-p` keeps them. Pending tasks survive /exit | — |
| Return shapes in UserPromptSubmit `prompt` (no `source` field) | Interactive background agent under `--permission-mode auto`: `<agent-message from="<id>">` wrapping `[Subagent hand-back] …` (the subagent calls `SubagentHandback`). Under `acceptEdits` interactive returns are `<task-notification>` instead (S7.2 run). `-p` background agent: `<task-notification>` with `<summary>Agent "…" finished</summary>` and `<result>`. Background Bash: `<task-notification>` with `<summary>Background command …`. Foreground Agent in `-p`: a real tool result | — |
| Interactive Agent status | Every Agent call returns `status: "async_launched"`, even without `run_in_background` | — |
| Mid-turn delivery | UserPromptSubmit fires mid-turn for notifications delivered into a running turn, both modes. `prompt_id` stays the same mid-turn and changes on idle notification turns (critique 11 settled) | — |
| Mod `prompt.submit` | Origin `task-notification` for `-p` returns, `peer` for interactive `<agent-message>` hand-backs (auto mode; `acceptEdits` returns are `<task-notification>`). No agent type in its event (it is readable from `classic.UserPromptSubmit` and `classic.Stop`) | — |
| Not run | `--resume` task dir name; frontmatter-file agents (probes used `--agents`; verified later by the S7.2 run); whether interactive default-async is a setting (for example an agent-teams env) or a build default | — |

**Decisions after the spike (user, 2026-10-10).**

- **R4 audit → hook-owned ledger.** A PostToolUse hook on `TaskCreate|TaskUpdate` writes the per-session ledger, and Stop reads it, not the store. It still blocks once with an audit (QS7-4).
- **QS7-2 → hook only.** `prompt` mode in `orchestration-guard.py` replaces both the `PostToolUse Agent` hook and the S7.4 mod.

The fixtures follow `plugins/authoring/scripts/tests/check-docs-sync.sh` and point `XDG_STATE_HOME` and `CLAUDE_CONFIG_DIR` at temporary directories.

| Mode | Input | Expected |
|---|---|---|
| stop | No ledger; all tasks pending; `background_tasks` non-empty | Silent |
| stop | One task completed, one pending, first stop | R1 |
| stop | Same snapshot with `stop_hook_active` | Silent |
| stop | Another task completed, with `stop_hook_active` | R1 |
| stop | Chain already at 5 blocks; snapshot unchanged since the last allowed stop | Silent |
| stop | All tasks completed, first stop on that snapshot | R4 |
| stop | All tasks completed, same snapshot already audited | Silent |
| prompt | `<agent-message from="…">`; `<task-notification>` with `<summary>Agent "…" finished</summary>` | R2 |
| prompt | `<summary>Background command …`; a Monitor event; a typed prompt | Silent |
| ledger | `TaskCreate`, then `TaskUpdate` to completed (a stop afterwards sees the ledger with no store dir) | Ledger updated, no output |
| edit | One 31-line Edit; three files of 5 lines each | R3 |
| edit | 20 then 15 lines under the same `prompt_id`, then a third edit | R3 on the second edit, silent on the third |
| edit | New `prompt_id`; a path outside `cwd` | Counter resets; path not counted |
| all | `agent_id` present; another `agent_type`; malformed stdin; forced exception | Silent, exit 0 |

**When to rerun.** The test script reruns when the guard script changes. The wiring run reruns when the frontmatter changes, and after each Claude Code upgrade alongside S2.

### Risks

| Risk | Effect | Mitigation |
|---|---|---|
| An upgrade changes the `TaskCreate`/`TaskUpdate` payload or the notification text | The ledger or `prompt` mode goes silent | It fails open, and the post-upgrade wiring run (`-p` and interactive) catches it |
| Python starts on every Edit, Write, task and prompt event in script sessions, subagents included | About 20–40 ms per call (UNCONFIRMED estimate) | Accept it. Plain sessions pay nothing |
| Continuation fights a legitimate stop | One extra turn and a visible "Stop hook feedback" line | The silence rules above, and a stagnation limit of 1 |
| The edit counter resets on each idle notification turn | A long run of direct edits across returns may not trip R3 | Accepted (critique 11) |
| Hook edits need a relaunch | Old behavior until restart | Same as L6 |

Rollback: delete the `hooks:` block from `agents/orchestration.md` and relaunch. The script and symlink then sit unused.

### Critique log (S7)

Second opinion skipped, because external models are barred for prompt and agent material. This is self-critique plus one advisor pass.

| # | Critique | Disposition |
|---|---|---|
| 1 | Frontmatter hooks also fire inside every subagent | Adopted. The `agent_id` check comes first, and the spawn cost is listed under Risks |
| 2 | The engine's 8-continuation limit doesn't bound loops | Adopted. Blocks require progress, and a chain limit of 5 bounds the rest |
| 3 | Stagnation should allow 3 nudges, as upstream does | Rejected. Upstream fires on idle without the model choosing to stop; here a second unchanged stop is deliberate |
| 4 | Holding the model to pending tasks fights plan-and-stop | Adopted. The "nothing started" and "nothing moved" rules let it stop |
| 5 | The task JSON shape is unverified | Adopted. S7.0 passed (shape recorded). The interactive store deletion then moved the audit to a ledger |
| 6 | A notification plus its hand-back gives two reminders | Adopted. Only completed agent notifications match |
| 7 | Bash notifications look like agent ones | Adopted. S7.0 records both shapes, and Bash ones are skipped |
| 8 | "Read the diff" in R2 makes no sense after an Explore return | Adopted. R2 says "if it changed files" |
| 9 | The nudge fires even after the user asked the main thread to make the edit | Adopted. R3 names that exception and fires once per prompt |
| 10 | R1 invites marking tasks done just to escape | Adopted in part. R1 asks for evidence, and the reviewer pass is unchanged |
| 11 | `prompt_id` may reset on notification turns | Settled by S7.0: it changes on idle notification turns and stays put mid-turn. The per-turn counter reset is acceptable |
| 12 | The task store is deleted on completion interactively, so a Stop-time R4 audit reads nothing | Adopted (user, 2026-10-10): a hook-owned ledger written by PostToolUse on the task tools |
| 13 | `PostToolUse Agent` never sees a result interactively | Adopted: R2 moves to `UserPromptSubmit` (`prompt` mode) |

### Open questions (S7)

- Resolved 2026-10-10: QS7-1 → a repo `hooks/` folder symlinked as `~/.claude/hooks` (done; `readonly-bash.py` and its tests moved in, hivemind's logs git-ignored); QS7-2 → hook only, via `UserPromptSubmit` (the S7.4 mod is dropped, after S7.0 showed the hook fires mid-turn); QS7-3 → (a) everything under `cwd`; QS7-4 → (b) block once with R4, audited from the hook-owned ledger.
- **QS7-1. Where the script lives.**
  - (a) `scripts/`, plus an operator symlink at `~/.claude/hooks/orchestration-guard.py`. Recommended; it matches the `readonly-bash.py` precedent.
  - (b) Inside `agents/`, reached through the existing symlink. No operator step, but it relies on the agent loader ignoring non-`.md` files (UNCONFIRMED).
  - (c) An absolute repo path. It breaks if the repo moves.
- **QS7-2. Mid-turn notifications.** Resolved: a `UserPromptSubmit` hook (`prompt` mode), because S7.0 showed it fires mid-turn.
  - (a) Accept the gap. Moot.
  - (b) Add a mod with a `prompt.submit` hook. Dropped.
- **QS7-3. Which edits count toward the nudge.**
  - (a) Every path under `cwd`, plan Status edits included. Recommended, because CLAUDE.md counts docs.
  - (b) Exclude `docs/plans/**`.
- **QS7-4. Completion audit when the last task closes** (upstream's `BOULDER_COMPLETE_PROMPT`).
  - (a) Don't build it. Recommended, because CLAUDE.md's verification rules and the reviewer pass cover it.
  - (b) Block once with an evidence audit.

## S8. Agent tool scoping (absorbs S4, touches S7)

Status: done 2026-10-10. T0 (719fcdf), T1 (aae6500), T2 (c66de9c), T3 (b55a19f), T4 (c6e1c9d), T5 (live check, no commit), T6 (this record) and T7 (b8505ae) landed. Optional follow-ups are listed under T5 results.

Evidence comes from:

- the 2.1.296 binary (minified names `HC`, `an`, `SA`, `nd`, `Wf`)
- sub-agents.md and tools-reference.md, fetched 2026-10-10
- local runs

### Outcome and completion

- **Outcome.** Wherever possible, an agent is read-only because of its frontmatter allowlist. Every agent body states exactly which tools it has and which it lacks, and a check fails when a body and its frontmatter disagree.
- **Completion conditions:**
  - T0's findings are recorded, and every UNCONFIRMED row below is settled.
  - `bash scripts/agent-tools.test.sh` and `bash hooks/tests/readonly-bash.test.sh` pass.
  - In the T5 live run, no read-only agent creates its probe file. Each attempt fails because the tool is missing or `readonly-bash` blocked it, never because of a classifier denial.

### Evidence

| Fact | Source |
|---|---|
| `tools` entries parse as `Tool(spec)`, but the resolver drops the specifier for built-in tools, so `Bash(rg *)` grants all of Bash | binary `HC` → `an(e,s){return s===void 0\|\|ho(e)===void 0}`; T0.1 |
| No frontmatter field can limit Bash to certain commands. `bashCommandClamp` exists only for Workflow `agent()` | binary key list `Wf`; clamp error strings |
| `disallowedTools` applies first, and an entry with a specifier removes the whole tool | sub-agents.md |
| An entry that doesn't resolve is dropped silently. The spawn is refused only when every entry fails | sub-agents.md; binary `tengu_subagent_zero_tools` |
| Tools from the agent's own `mcpServers` join after `tools` is resolved, and only `disallowedTools` filters them | binary `nd`, then `it=[...Sn,...Ln]` in `SA` |
| A subagent with no Bash that lists `Glob` or `Grep` gets them back | tools-reference "Glob tool behavior"; binary `HC` |
| Background subagents keep only a fixed set of built-in tools: Read, Grep, Glob, LSP, Bash, Edit, Write, NotebookEdit, WebFetch, WebSearch, Skill, ToolSearch, Monitor, SendMessage, Artifact, the worktree tools and TaskStop | sub-agents.md |
| A subagent's `permissionMode` is ignored when the parent runs in auto, acceptEdits or bypass mode. The user's `defaultMode` is `auto` | sub-agents.md; binary `SA` `yn()`; `~/.claude/settings.json` |
| `memory:` turns on Read, Write and Edit automatically | sub-agents.md |
| An inline server starts with each spawn and stops when the agent finishes. The parent never sees its tools, and `~/.claude/agents` needs no folder trust | sub-agents.md; binary `nd` |
| Today's read-only agents can reach the GitHub write tools, Monitor, Artifact, SendMessage and EnterWorktree | the architect session's own tool list |
| Hooks match on the tool name, and Monitor runs shell commands as `Monitor`, so a `Bash`-matcher hook never sees them (only matcher-less hooks fire) | Confirmed, T0.6 |
| Playwright MCP 0.0.83 turns on `browser_run_code_unsafe` ("RCE-equivalent") by default | npm readme for 0.0.83, Core automation section |
| `readonly-bash.py` allows `rtk rm -rf src` (rc 0) | local run |
| `TMPDIR` is empty in agent Bash, so `$TMPDIR/x` expands to `/x` | `echo "TMPDIR=$TMPDIR"` |

### Recommended approach

- **Explore drops Bash.** It lists `Glob` and `Grep`, which brings them back, so the allowlist alone makes it read-only and it no longer needs `readonly-bash.py`.
- **The other six read-only agents keep Bash and the hook.** They need Bash for tests, `git diff`, `consult.sh`, scanners or dev servers. In 2.1.296 no allowlist entry, permission mode or MCP server can limit Bash to read-only commands, so the hook stays as their guard.
- **All seven read-only agents switch from a denylist to an allowlist.** That closes today's leaks:
  - the GitHub write tools
  - Monitor, which gets past the Bash hook
  - SendMessage, Artifact, EnterWorktree and Skill. A forked skill could spawn an agent with the full tool pool (inferred from the `spawnedBySkill` path; UNCONFIRMED).
- **Session MCP servers are granted through `tools` entries, never `mcpServers`.** A `mcpServers` reference would add every tool on that server, past the allowlist.
- **`permissionMode` is left out everywhere.** It matters only if the main thread leaves auto mode.
- **No new MCP dependency is added** (see the candidates table below).

| Alternative | Why it lost |
|---|---|
| `tools: Bash(git log *), Bash(rg *)` | The specifier is ignored, so the agent gets all of Bash while believing it is limited |
| `permissionMode: plan` or `dontAsk` | Ignored under an auto-mode parent. Plan mode would also block test runs |
| Settings `permissions.deny` for writes | Applies to the whole session, so coders and the main thread lose writes too |
| Sandbox `filesystem.denyWrite` | Also session-wide, with no per-agent scoping |
| Allowlists for writers too | They drift as Claude Code adds tools. The writers' real risk is outward-facing actions, which QT2 covers |
| A filesystem, ripgrep or git MCP for a Bash-less Explore | See the candidates table |

### Per-agent table

Shorthand, spelled out in full in the frontmatter:

- CG = `mcp__plugin_code-search_codegraph__codegraph_explore`
- C7 = `mcp__plugin_code-search_context7__resolve-library-id` and `__query-docs`
- GA = `mcp__plugin_code-search_grep-app__searchGitHub`
- EXA = `mcp__plugin_efficient-core_exa__web_search_exa` and `__web_fetch_exa`

| Agent | `tools` | `disallowedTools` | MCP servers | `readonly-bash.py` | Lost vs today |
|---|---|---|---|---|---|
| Explore | Read, Glob, Grep, LSP, CG, the `coremods` git tools (T7) | none | none | Dropped (no Bash) | Bash (git log and blame, finding files by metadata, the `codegraph` CLI), Monitor, Skill, web tools, all other MCP tools |
| architect | Read, Bash, LSP, CG, C7, GA, EXA | none | none | Kept: `consult.sh`, git, rg | Agent (QT1), on-demand Skill (preloaded skills stay), Monitor, WebFetch and WebSearch (EXA covers them), the github, claude-mem and chrome MCP tools, Artifact, SendMessage |
| debugger | Read, Bash, LSP, CG, C7, GA, EXA | none | none | Kept: tests, repro scripts | Monitor (it gets past the hook), on-demand Skill, github and claude-mem MCP, Artifact, SendMessage |
| quick-review | Read, Bash, LSP, CG | none | none | Kept: diff, tests, `consult.sh` | On-demand Skill, docs and web tools, Monitor, other MCP tools |
| review | Read, Bash, LSP, CG, C7, GA | none | none | Kept: same | On-demand Skill, Monitor, web tools, github MCP (it uses `gh` read commands instead) |
| security-auditor | Read, Bash, LSP, CG, C7, GA, EXA | none | none | Kept: scanners, diff, `consult.sh` | On-demand Skill, Monitor, github MCP (alerts through `gh api` instead) |
| browser-tester | Read, Bash | `mcp__playwright__browser_run_code_unsafe` | `playwright`, inline, pinned to 0.0.83; its tools join past `tools` | Kept: starts dev servers | `browser_run_code_unsafe`, which it can reach today, plus LSP, Skill, Monitor and the session MCP tools |
| coder-light, coder, coder-max, scribe | omitted (inherit) | Agent, Workflow (plus QT2) | none | n/a | Nothing, unless QT2(b) is chosen |
| orchestration | omitted. On the main thread, `tools` would narrow the whole session | none | none | n/a | Nothing |

- **ToolSearch stays off the read-only lists**, so their few MCP tools load up front.
  - Today each read-only spawn carries about 110 deferred tool names, roughly 1.5–2k tokens.
  - Afterwards it carries 1–6 tool schemas, roughly 0.5–3k tokens. Both figures are UNCONFIRMED estimates.
  - The change is about even for architect and debugger, and a saving for the rest.
- **Implicit tools: `SubagentHandback` and `advisor`.** Neither is ever listed. The binary passes `SubagentHandback` separately as `handbackTool`, and T0.4 confirmed allowlisted agents still hand back. T0.4 also found that every agent gets an unlisted `advisor` tool. Neither counts as a violation of a read-only agent's `Lacks` line.

### MCP candidates

| Candidate | Read-only tools | How to restrict | Pinning and supply chain | Verdict |
|---|---|---|---|---|
| `@modelcontextprotocol/server-filesystem` | read_text_file, read_media_file, read_multiple_files, list_directory(_with_sizes), directory_tree, search_files (file names only), get_file_info | `disallowedTools` must name write_file, edit_file, create_directory and move_file, because `tools` doesn't filter the agent's own `mcpServers` | 1.0.0 was published only hours ago (2026-10-11 02:44Z); 2026.8.31 is the last older release. It has five npm dependencies and is fetched through npx on every spawn. It needs args or client roots, and whether Claude Code sends roots is UNCONFIRMED | Rejected. It duplicates Read and Glob, which Explore now gets natively, and it has no content search |
| `mcp-ripgrep` 0.4.0 | All | n/a | Last published 2025-04-29 | Rejected. Stale, and it duplicates the native Grep tool, which is built on ripgrep |
| `mcp-server-git` (uvx) | status, diff*, log, show, branch | Deny commit, add, reset, create_branch and checkout by name | 2026.10.10 was published only hours ago; 2026.8.18 is the last older release. CVE-2025-68144 (`git_diff --output=` overwrote files), plus CVE-2026-27735 and CVE-2025-68143. The cyanheads git server's CVE-2026-85626 hit log, diff and show | Rejected. Its "read" tools have written files before (QT3) |
| codegraph, context7, grep-app, exa (already installed) | All | `tools` entries | Already-installed plugins | Adopted, as in the per-agent table |
| github, claude-mem, chrome (already installed) | Mixed | n/a | n/a | Main thread only |

### Tool statements and drift check

Each agent body gets one section, for example:

```
## Tools

Has: `Read`, `Glob`, `Grep`, `LSP`, `mcp__plugin_code-search_codegraph__codegraph_explore`.
Lacks: `Bash`, `Edit`, `Write`, `NotebookEdit`, `Agent`, `Skill`, `Monitor`.
You can't run git, tests, or any command. If the task needs one, hand back `needs: <tool>`.
```

- Agents that inherit their tools write `Has: all session tools except Lacks.` Agents with Bash add one line: there are no Glob or Grep tools, so search with `rg`.
- **`scripts/agent-tools.py`** is stdlib-only. `tools` and `disallowedTools` stay one-line, comma-separated strings. It checks four rules:
  1. **Has and Lacks match the frontmatter.**
     - For allowlist agents, `Has` equals `tools`, plus `mcp__<server>__*` for each inline server, minus `disallowedTools`. `Lacks` doesn't overlap `Has` and contains every `disallowedTools` entry.
     - For inheriting agents, `Lacks` contains every `disallowedTools` entry.
  2. **Every core tool is accounted for.** Read, Bash, Edit, Write, NotebookEdit, Glob, Grep, Agent, Skill and Monitor each appear in exactly one of the two lines.
  3. **Names are valid.** Built-in names come from the background-safe list, and MCP names use a known server prefix.
  4. **Read-only agents stay read-only.**
     - An agent counts as read-only when it has no Edit, Write or NotebookEdit.
     - A read-only agent has no `memory`, Skill, SendMessage, Monitor, Artifact or EnterWorktree, and no MCP tool whose name contains a write verb.
     - It has Bash if and only if it has the `readonly-bash` hook.
- **`scripts/agent-tools.test.sh`** follows the `prompt-drift.test.sh` pattern. It runs one temporary fixture per rule and expects each to fail, then runs against the real `agents/` and expects a pass.
- **Implicit tools.** `scripts/agent-tools.py` treats `advisor` and `SubagentHandback` as implicit. `Has` may list them and never needs to. Listing them in `Lacks` is a rule 1 violation, because every agent has them.
- **Limit.** The check can't see a misspelled tool name on a known server, or a renamed plugin. Both drop silently, so T5 is what catches them.

### Effect on S4 and S7

- **S4 merges into this work.** Both edit the same agent bodies, and the drift check covers both. The old S4 becomes T4 (stock essentials, plus the scratch-path fix). The tools part of the Sh5 rewrite now lives in each agent's Tools section.
- **S7 needs no design change.**
  - S7.2 touches only the orchestration frontmatter, which S8 leaves alone.
  - Read-only agents already lacked Edit and Write, so the edit-nudge hook's load doesn't change.
  - Orchestration's frontmatter no longer has a `PostToolUse Agent` hook (R2 moved to `UserPromptSubmit`), so QT1 has no effect on S7.
  - T0 and S7.0 both ran (2026-10-10) on one `--agents` probe harness.
- **Orchestration body.** The Explore routing line gains: "has no shell: no git history, tests, or commands; send those to `debugger` or do them yourself."
- **Q9 stands.** Explore no longer needs hooks, but the other six read-only agents still do.

### Sub-slices

All sub-slices are done.

| # | Slice | Files | Acceptance | Cheapest check | Agent |
|---|---|---|---|---|---|
| T0 | ~~Spike how tools resolve~~ Done 2026-10-10 (719fcdf) | Scratch only; findings below | Records ten probes (listed below) | `claude -p --agents <json>` probes, with hooks that log stdin to the scratchpad | `coder` |
| T1 | ~~Close the hook gaps~~ Done 2026-10-10 (aae6500; three security-audit rounds, suite 512/0) | `hooks/readonly-bash.py` and its test | `rtk <cmd>` and `rtk proxy <cmd>` are unwrapped and checked like `<cmd>`. `SCRATCH_MSG` names `/tmp`, not `$TMPDIR` | New test rows: `rtk git checkout main` and `rtk proxy rm x` block, `rtk git log` is allowed. Run `bash hooks/tests/readonly-bash.test.sh` | `coder`, then `quick-review` |
| T2 | ~~Drift check~~ Done 2026-10-10 (c66de9c) | `scripts/agent-tools.py` and `.test.sh` | Each fixture fails on the rule it breaks | `bash scripts/agent-tools.test.sh` | `coder`, then `quick-review` |
| T3 | ~~Frontmatter and Tools sections~~ Done 2026-10-10 (b55a19f) | `agents/*.md` | Matches the per-agent table. Explore's hook is removed, and its body uses Glob and Grep instead of the shell `codegraph` line | `python3 scripts/agent-tools.py agents` | `coder` |
| T4 | ~~Stock essentials (the old S4)~~ Done 2026-10-10 (c6e1c9d) | `agents/*.md` bodies; the orchestration routing line | Each body carries the inventory rows its role needs. Scratch paths say `/tmp` or the scratchpad path from the environment block | The drift check still passes; `quick-review` against the kept inventory rows | `scribe` |
| T5 | ~~Live check~~ Done 2026-10-10 in `-p` (results below); interactive pass not run | None (a temporary git repo) | Each read-only agent lists exactly its `Has` line. Its attempt to create `PROBE_<agent>` fails because the tool is absent or `readonly-bash` blocked it, not because of a classifier denial. No probe file exists afterwards, and one `coder` spawn does create its file | One `claude -p` session that spawns each agent with `model: haiku` per call, plus the same in interactive tmux (`scripts/claude-tmux.sh`), because interactive Agent calls are always async and `-p` alone doesn't match | `coder`; the main session reads the transcripts |
| T7 | ~~Strict git tools in `coremods` (QT3)~~ Done 2026-10-10 (b8505ae; coremods 0.2.0, installed at user scope and loaded) | `plugins/coremods/hooks/register.tsx`, a `git-tools` helper, tests, docs page; Explore's `tools` | `coremods` registers `git_log`, `git_blame` and `git_show` with `$.tool.register` and serves them in a `tool.call` hook. Each runs `git` through `$.process.run` with a fixed argument list: revisions match a strict pattern and never start with `-`, paths must sit inside `cwd` and are passed after `--`, and there is a cap on count and bytes. Explore lists `mcp__coremods__git_log`, `…git_blame` and `…git_show` | `claude plugin test plugins/coremods` (injection cases: `--output=x`, `-p`, `../`, a path outside `cwd`), then the T5 live run shows Explore calling `git_log` | `coder`, then `review` (untrusted input reaches a process) |
| T6 | ~~Record~~ Done 2026-10-10 | This section, the S4 and S7 rows, the critique log | Matches what landed | Read the diff | Main session |

**T5 results (2.1.296).** Haiku `-p`. Evidence under `$T5` = `/tmp/claude-1000/-home-buck-Projects-adminhead-claude-plugins/d3587765-e946-4874-935d-335b692b6f5a/scratchpad/t5/`.

| Check | Result |
|---|---|
| Observed tools vs `Has` | 11/11 agents equal Has ∪ {`advisor`, `SubagentHandback`} |
| Writers | Lack Agent and Workflow. They also lack `ScheduleWakeup` versus the main session, probably a harness default (UNCONFIRMED) |
| Explore | Gets Glob and Grep, though the main `-p` session has neither. Live `git_log` call worked |
| quick-review write attempt | `touch` blocked by the `readonly-bash` hook, even with `--allowedTools Bash(touch:*)` |
| browser-tester | Lacks `browser_run_code_unsafe`; `browser_evaluate` (page JS) remains |

- The tool lists are haiku self-reports, corroborated by the live calls and by the writers matching the main init list.
- Optional follow-ups, not run: an interactive T5 pass, and per-agent PROBE write attempts beyond quick-review.

T0's eight probes:

1. Whether `tools: Bash(rg *)` can still run `ls`.
2. Whether an agent with no Bash that lists Glob and Grep gets both.
3. Whether an inline server's tools appear without `tools` entries, and whether a `disallowedTools` entry removes one.
4. Whether an allowlisted agent can still hand back.
5. Whether a `skills:` preload arrives without the `Skill` tool.
6. Whether a hook with a `Bash` matcher sees a command run through Monitor.
7. Whether ToolSearch can load a tool that isn't in the agent's pool.
8. Whether one misspelled entry is dropped silently.
9. Whether a tool registered by a mod with `$.tool.register` (`mcp__coremods__<name>`) can be listed in a subagent's `tools` and called by it. The types were written by 2.1.285 and need confirming on 2.1.296.
10. Whether the mod's `tool.call` hook serves calls made from inside a subagent, and what the result looks like there.

**Spike results (2.1.296).** Haiku, `-p` and interactive tmux, probes through `--agents` (JSON needs `mcpServers` as an array of `{name: {command, args}}` and `tools` as an array).

| Probe | Result |
|---|---|
| 1. `tools: Bash(rg *)` | Grants all of Bash. Confirmed |
| 2. Glob and Grep without Bash | Listing them works. Confirmed |
| 3. Inline `mcpServers` tools | Bypass `tools`; `disallowedTools` removes them. Confirmed |
| 4. Hand-back | Allowlisted agents still hand back; `SubagentHandback` never needs listing. **Every agent also gets an unlisted `advisor` tool** |
| 5. `skills:` preload | Works without the Skill tool. Confirmed |
| 6. Monitor | Bash-matcher hooks do not fire on Monitor, only matcher-less hooks do. Monitor stays off every read-only list |
| 7. ToolSearch | Can't load tools outside the agent's pool. It is absent when nothing is deferred |
| 8. Misspelled entries | Dropped silently, so the T5 live check is the only catch |
| 9. Mod tools in `tools` | `$.tool.register` tools (`mcp__<plugin>__<name>`) work in a subagent's `tools` list. **T7's premise holds** |
| 10. `tool.call` in subagents | The mod's `tool.call` serves subagent calls; the event carries `agentId` for subagents |

Consequence for T7: coremods `$.tool.register` is viable, so the pinned `mcp-server-git` fallback (QT3 note) is not needed.

**When to rerun.** Run the drift check on every `agents/*.md` edit. Run T5 after each Claude Code upgrade (alongside S2), and after any plugin rename or MCP change.

### Risks

| Risk | Effect | Mitigation |
|---|---|---|
| A misspelled or renamed MCP entry drops silently | The agent quietly lacks a tool | Prefix check in T2; T5 after plugin changes |
| Bash agents are guarded only by the hook | `python -c`, `curl -o` and `gh pr merge` get past it, because it is an accident guard, not a sandbox | Accept it; T1 closes the `rtk` gap; QT5 |
| Inline servers bypass `tools` | A new Playwright release could add a tool that writes | Keep the version pinned and review its tool list on each bump |
| An allowlist is too tight | The agent can't finish its task | Its body says to hand back `needs: <tool>` |
| An upgrade changes `HC` or the Glob/Grep restore | Explore loses search | Run T5 after each upgrade |

Rollback: revert the T3 and T4 commits. `~/.claude/agents` is watched, so the next spawn picks up the old definitions without a restart. T1 stands on its own.

### Critique log (S8)

Second opinion: skipped, because agent material is barred from external models. This is self-critique plus one advisor pass.

| # | Critique | Disposition |
|---|---|---|
| 1 | `Bash(rg *)` in `tools` limits Bash | Rejected. The resolver drops the specifier (`an`); T0.1 confirms |
| 2 | `permissionMode: plan` makes agents read-only | Rejected. Ignored under an auto-mode parent, and it would block tests |
| 3 | Grant codegraph through `mcpServers` | Rejected. Server tools join past the allowlist |
| 4 | Give writers allowlists too | Rejected. They drift as Claude Code adds tools (QT2) |
| 5 | S7's edit hook loses load | Rejected. Edit and Write were already denied to read-only agents |
| 6 | The drift check proves that tools resolve | Adopted as a stated limit; T5 covers it |
| 7 | "No file appeared" can hide a classifier denial | Adopted. T5 asserts the reason for the failure |
| 8 | An `rtk` prefix gets past `readonly-bash` | Adopted: T1 (verified, rc 0) |
| 9 | `$TMPDIR` is unset in agent Bash | Adopted: the T1 message and the T4 bodies |
| 10 | Skill, SendMessage and Agent let a read-only agent reach a writer | Adopted for Skill and SendMessage. Agent is open (QT1). The forked-skill spawn path is UNCONFIRMED |
| 11 | Monitor runs shell commands past the Bash hook | Adopted. Monitor stays off every read-only list; T0.6 confirmed |
| 12 | Background subagents strip built-ins that aren't on the fixed list | Adopted. Allowlists use only listed built-ins, and T2 enforces it |

### Open questions (S8)

- Resolved 2026-10-10: QT1 → (a) drop Agent from architect; QT2 → (a) writers inherit, denying Agent and Workflow; QT4 → (a) EXA for architect, debugger and security-auditor only; QT5 → (a) guard `gh` mutating subcommands in T1. QT3 → strict git tools served by a `coremods` mod (T7), with a pinned `mcp-server-git` with its write tools denied as the fallback if the T0 spike rules the mod route out. T0 did not (probes 9 and 10), so the fallback is not needed.
- **QT1. Architect's Agent tool.**
  - (a) Drop it. Recommended: architect then becomes read-only by allowlist alone, and codegraph plus `rg` cover its searches. This plan was built without spawning any Explore agent.
  - (b) Keep it. A subagent's `Agent(Explore)` type list is ignored, so architect could also spawn `coder`.
- **QT2. Writers' tools.**
  - (a) Inherit, denying only Agent and Workflow. Recommended.
  - (b) Also deny `mcp__plugin_github_github`, `mcp__claude-in-chrome` and `Artifact`, which keeps outward-facing actions on the main thread.
  - (c) Full allowlists, which drift.
- **QT3. Explore and git history.**
  - (a) Accept the loss, and route history questions to `debugger` or the main thread. Recommended.
  - (b) Keep Bash and the hook for Explore.
  - (c) Add a pinned `mcp-server-git` with its write tools denied, accepting its CVE record.
- **QT4. Web access for read-only agents.**
  - (a) EXA for architect, debugger and security-auditor only. Recommended.
  - (b) None, so no data leaves the machine from read-only agents.
- **QT5. `gh` writes through Bash.**
  - (a) Add `gh` mutating subcommands (such as `pr merge`, `pr create`, `pr close`, and `api -X`) to `readonly-bash.py` in T1. Recommended.
  - (b) Accept them as outside the hook's file-mutation scope.
