# plan-ledger interactive checklist

Slices 1 to 8 are built and reviewed. These checks need a person in a real session. Record each result under its heading (pass, fail, or what you saw), then slices 9 and 10 get built on the answers. Nothing here edits the repo.

## Part A: the real plugin (slices 6 to 8)

Setup: `git init /tmp/plr-scratch && cd /tmp/plr-scratch && git commit --allow-empty -m init`, then `claude --plugin-dir /home/buck/Projects/adminhead/claude-plugins/plugins/plan-ledger`. Plans land in `~/.claude/adminhead-plans/<key>/`. Delete that folder afterwards.

1. **A1, create and look.** Ask: "Use the plan tool to create a plan with two items, then activate it." Confirm `<planId>.json` and `<planId>.jsonl` exist and `/plans status` lists it.
2. **A2, worktree sharing.** `git worktree add ../plr-wt`, start a session there with the same `--plugin-dir`, run `/plans status`. The same plan must appear.
3. **G3, the verify dialog.** Make an item whose check is `["date"]` (no allow rule for it). Have a subagent claim it and `claim_done`, then have the orchestrator call `verify`. Confirm the dialog shows the exact argv and the cwd. Then:
   - choose "Run it": the check runs and the item becomes `verified`;
   - repeat and choose "Refuse": nothing runs, item stays `claimed_done`;
   - repeat and press Escape: also refuses;
   - add a deny rule for `date`: `verify` refuses and no dialog appears;
   - optional: a guarded command such as `git push --force`: the dialog should appear.
4. **A3, `/plans unlock`.** Hold a lock: `d=$(ls -d ~/.claude/adminhead-plans/*/); mkdir "$d<planId>.lock"; printf 'tok-abcdef123 %s' $(( $(date +%s) - 90 )) > "$d<planId>.lock/owner"`. Run `/plans unlock <planId>`. The question should show holder `tok-abcd` and about 90 s. "Keep the lock" and Escape leave it, "Remove the lock" removes it.
5. **A4, `/plans repair` when the file is ahead.** Edit a plan JSON's `rev` to 99, run `/plans repair <planId>`. The question should name rev 99 against the ledger's rev. "Keep the plan file" and Escape leave it, "Rebuild from the ledger" replaces it and keeps a `.corrupt-<ts>` copy.
6. **A5, `/plans abandon`.** Run `/plans abandon <planId>`, confirm a question appears, "Keep the plan" changes nothing, "Abandon the plan" abandons it. Asking the model to abandon through the tool is allowed by design (the orchestrator may abandon a plan with no prompt); only the `/plans abandon` command asks. Result 2026-11-10: the tool path abandoned a plan without a prompt, as designed.
7. **A6, `/plans goal-text`.** The prompt box is filled with a `/goal ...` line naming command-verified and manual counts, and nothing is submitted.

## Part B: the gates that block slices 9 and 10

These need a throwaway probe, because the committed probe was replaced in slice 6. Restore it: `mkdir -p /tmp/probe-plug && git -C /home/buck/Projects/adminhead/claude-plugins archive d88a6de plugins/plan-ledger | tar -x -C /tmp/probe-plug`, then use `--plugin-dir /tmp/probe-plug/plugins/plan-ledger`. Scratch agent files are in `/tmp/probe-agent/` if still present (one lists `mcp__plan-ledger__plan` in `tools:`, one does not). The probe logs to `/tmp/plan-ledger-probe.log`; run `tail -f` on it in a second terminal.

8. **G1, injected text after `/clear` and `/compact`.** After `/clear`, then `/compact`, ask "quote any hook context that contains PROBE". Record whether the model still sees `PROBE` after each. Gates slice 9 step 3.
9. **G2, agent ids across a hot reload.** Spawn `probe-with` as a background agent, call `whoami`, note the id, touch the probe's `hooks/register.tsx` so the plugin reloads, call `whoami` again, compare. Gates how bindings survive a reload.
10. **G4, a real teammate.** With `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1`, create a team (tmux or in-process), have a teammate call `whoami`. Record: the teammate's `agentId` (present or absent) and whether it appears in `$.agent.list()`. If the id is absent, a teammate is treated as the main loop with full orchestrator rights, so slice 10 must not allowlist the tool for teammates.
11. **G5, a plugin-prefixed agent type.** Install an agent from a plugin (for example `coder:coder`) with the tool in its `tools:`, call `whoami` from it, record the `type` that `$.agent.list()` returns (`coder:coder` or `coder`).
12. **G6, SubagentStart context on a resumed child.** Spawn a subagent, finish it, resume it with `SendMessage`, and ask it to quote any hook context containing PROBE. Record whether the resumed child sees it. Gates the resume reminder in slice 9.

## Report back

Reply with the item numbers and, for each, pass, fail or what you saw. The ones that change the design if they fail: 10 (teammates), 8 (re-injection), 12 (resume reminder), 3 (the verify dialog).
