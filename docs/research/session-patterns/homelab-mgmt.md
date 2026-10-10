# Findings: h1.md (voidrot/homelab-mgmt, 31 Claude sessions)

Session counting note: f5938d31/1f5b41d1 and 80d98470/d0e29568 are forked copies of one session each; counted once. ~10 sessions are teammate/subagent sessions driven by team-lead briefs, not by the user. The repo has no CLAUDE.md or AGENTS.md; only `.claude/settings.json` (enables infra, efficient-python, efficient-shell, tooling) and `settings.local.json` (tofu/ansible allow rules).

### homelab-add-service
- type: skill
- sessions: 9  (projects: homelab-mgmt; lead 29bf082a, 82e838ab, f5938d31, 91cfeb23, 03886071; teammates 80d98470, 1b1b7b57, b02d87e9, 60045a53)
- refs: "2026-10-06T15:52 82e838ab-bf81-43d5-985c-8ccb559fbfe3.jso", "2026-10-07T06:19 f5938d31-4c04-42c0-9391-7789805de3dd.jso", "2026-10-08T23:36 03886071-9a79-4561-84a5-0dc8334db540.jso"
- example: "Next we should add the following services to pve-core: immich ... uptimekuma, AFFiNE, SearXNG, Frigate ... all apps should have an haproxy entry"
- what to build: Project skill in homelab-mgmt/.claude/skills/add-service. Encodes the checklist every brief re-explains: tofu VM/LXC file copied from `infra/environments/core/affine.tf` (storage pools, ballooning), compose role pattern (deploy.yml, digest pin in defaults, 127.0.0.1 publish while bootstrapping), entries in hosts.yml, site.yml, group_vars/haproxy, dns.yml, docs/ip-addresses.md, agents.yml (vmagent/vlagent), optional authentik-oidc-app module, and the acceptance run (second playbook run `changed=0`, HTTPS via `--resolve` through haproxy, `up{host=...}` in VictoriaMetrics).
- effort saved: high — 30+ services were added this way; each team-lead brief spends ~40 lines restating the same file list and acceptance checks.

### homelab-mgmt-claude-md
- type: claude-md
- sessions: 9  (projects: homelab-mgmt; briefs in 80d98470, 34364ebc, f79a15c3, b02d87e9, 1b1b7b57, 018476c0, e155e330 + leads 91cfeb23, 03886071)
- refs: "2026-10-07T09:00 80d98470-ccd6-4b74-ae16-90d7992a160f.jso", "2026-10-09T02:17 018476c0-366b-41f8-9ac7-cb9acdfa045f.jso", "2026-10-09T03:14 b02d87e9-627e-4e80-a78e-48466793b67e.jso"
- example: "OpenTofu: `mise run tofu core plan`, `plan -out=uptimekuma.tfplan`, `apply uptimekuma.tfplan` (delete after; `tofu init` may be needed)... Ansible: `cd ansible && uv run ansible-playbook ...`. Never print secrets."
- what to build: Create homelab-mgmt/CLAUDE.md (via authoring:manage-agent-instructions) with: tool entrypoints (`mise run tofu <env> plan -out` then apply the saved plan and delete it; `mise exec -- ansible-playbook`, pick one of mise exec/uv run), envs core/lab/authentik/grafana, storage-pool conventions (vm-data OS, nvme-data DB/victoria, slow-storage bulk), sops file layout, "docs/services-plan*.md is the slice ledger". Subagents then inherit it instead of the lead pasting it.
- effort saved: high — removes the repeated preamble from every teammate brief and stops `mise exec` vs `uv run` drift.

### sops-decrypt-guard
- type: hook
- sessions: 4  (projects: homelab-mgmt)
- refs: "2026-10-06T15:52 82e838ab-bf81-43d5-985c-8ccb559fbfe3.jso", "2026-10-08T22:56 91cfeb23-f905-4927-98f5-d1cc61d733f2.jso", "2026-10-08T01:45 f90f4161-09a9-4243-8e56-d3f29652b0f4.jso"
- example: "Ignore the leaked lines. Commit slice 12" / agent: "the slice 44 agent decrypted the Omni secrets file and printed about 8 lines of the `omni_gpg_key` private key into its transcript"
- what to build: PreToolUse Bash hook (plugin, e.g. in infra or efficient-security) that blocks `sops -d`/`sops decrypt` whose stdout reaches the transcript, allowing only capture forms (`X=$(sops -d --extract ...)`, redirect to file, pipe into a consumer). Pair with a mise task like `sops:copy <file> <key>` (to clipboard) so the user stops running `! sops -d --extract` in-session, which also lands secrets in the transcript (3 sessions: f90f4161, 03886071, c033e515).
- effort saved: med — each leak produced a rotate-or-not decision round-trip (see next finding) and a real exposure.

### dont-offer-rotation
- type: claude-md
- sessions: 4  (projects: homelab-mgmt)
- refs: "2026-10-08T01:45 f90f4161-09a9-4243-8e56-d3f29652b0f4.jso", "2026-10-08T22:56 91cfeb23-f905-4927-98f5-d1cc61d733f2.jso", "2026-10-08T23:36 03886071-9a79-4561-84a5-0dc8334db540.jso"
- example: "dont worry about rotating omni stuff" / "we dont need to rotate it" / "tdarr is finished, do not rotate the api key its fine."
- what to build: Project CLAUDE.md line: a homelab secret that appeared only in a local transcript is not rotated unless the user asks; note it once, don't re-raise. Fold into homelab-mgmt-claude-md.
- effort saved: low — one correction per occurrence, but it recurs.

### ansible-skill-missing
- type: skill
- sessions: 24  (projects: homelab-mgmt; every session with ansible-playbook runs, 13 with explicit second-run `changed=0` checks)
- refs: "2026-10-09T03:14 b02d87e9-627e-4e80-a78e-48466793b67e.jso" (109 playbook runs), "2026-10-09T03:14 60045a53-2a08-4097-aa76-107aa81a772b.jso", "2026-10-07T09:30 1f5b41d1-8ee2-4fa3-99a2-f99643cd105b.jso"
- example: "Rerun `uptime-kuma.yml` so it publishes on .67, then run it again and confirm `changed=0`. Apply `haproxy.yml --tags haproxy`, then `dns.yml`."
- what to build: New `infra:ansible` skill in the adminhead repo (infra has terraform/docker/k8s but no Ansible). Cover role layout, idempotency proof (second run changed=0), `--check --diff` limits (templates are not validated by the service in check mode; the haproxy `path /` ACL error slipped past `--check` in 80d98470), `--limit`/`--tags`, vault vs sops vars, handlers and validate: hooks.
- effort saved: med — Ansible is the dominant tool in this project with no skill guiding it.

### terraform-skill-never-triggers
- type: improve-existing:infra:terraform
- sessions: 23  (projects: homelab-mgmt; tofu plan in 23 sessions, Skill tool used only twice in all 31 sessions, both for update-config)
- refs: "2026-10-09T03:14 b02d87e9-627e-4e80-a78e-48466793b67e.jso" (38 plans), "2026-10-10T06:25 0bdbc749-5097-4261-8ac3-011549e545b0.jso", "2026-10-08T22:56 91cfeb23-f905-4927-98f5-d1cc61d733f2.jso"
- example: "Re-plan core and lab (targeted, fresh -out files) and apply them; ... always plan/apply with `-target=module.<yourmodule>` and `-lock-timeout=15m`"
- what to build: infra:terraform is enabled in this repo but never loaded. Check its description triggers on `mise run tofu`, "-out plan file", "-target", "apply"; and add a short section on shared-state concurrency (targeted applies, -lock-timeout, saved-plan apply) since parallel agents hit it.
- effort saved: med — the same plan/apply discipline was re-derived ad hoc in briefs.

### parallel-slice-landing
- type: improve-existing:authoring:agent-teams
- sessions: 6  (projects: homelab-mgmt; leads 91cfeb23, 03886071, c033e515; teammates cd401c7a, b02d87e9, 1b1b7b57 doing `git rebase` landings)
- refs: "2026-10-08T22:56 91cfeb23-f905-4927-98f5-d1cc61d733f2.jso", "2026-10-08T23:36 03886071-9a79-4561-84a5-0dc8334db540.jso", "2026-10-09T03:14 cd401c7a-681f-4a82-8d96-793dcb31c792.jso"
- example: "implement the plan, use parralel agents and worktrees as needed" / "if there are no inter dependicies you can start the other slices in parallel"
- what to build: agent-teams was never invoked though the lead ran teams with SendMessage (93 in 03886071). The lead hand-wrote a contract file (`parallel-slice-rules.md`: shared-file ownership, sops files read-only, targeted applies) and serializing scripts (`land.sh`, `locked.sh`) for rebase-and-land. Add a "landing worktrees and shared IaC state" section with those rules as a template, and trigger on "parallel agents", "worktrees", "slices in parallel".
- effort saved: med — the contract and landing scripts were rebuilt from scratch and lived in a scratchpad that is now gone.

### team-status-mod
- type: mod
- sessions: 4  (projects: homelab-mgmt)
- refs: "2026-10-08T23:36 03886071-9a79-4561-84a5-0dc8334db540.jso", "2026-10-10T04:47 c033e515-9870-4100-9b2d-23197a039506.jso", "2026-10-08T01:45 f90f4161-09a9-4243-8e56-d3f29652b0f4.jso"
- example: "Is slice 120 stuck?" / "coder is either finished or hung" / "whats left of the slices" / "Where are we at"
- what to build: A mod (sibling of git-line/usage-band) showing running teammates/subagents with time since last activity, flagging ones idle past a threshold. Optional second segment: slice counts done/total parsed from the active plan doc.
- effort saved: med — status and "is it hung" questions interrupt long team runs; a glance replaces a round-trip.

### operator-handoff-queue
- type: skill
- sessions: 7  (projects: homelab-mgmt; 29bf082a, 82e838ab, f5938d31, f90f4161, 91cfeb23, 03886071, c033e515)
- refs: "2026-10-08T23:36 03886071-9a79-4561-84a5-0dc8334db540.jso", "2026-10-08T22:56 91cfeb23-f905-4927-98f5-d1cc61d733f2.jso", "2026-10-07T06:19 f5938d31-4c04-42c0-9391-7789805de3dd.jso"
- example: "walk me through the remaining tasks that are waiting on me" / "what else is waiting on me" / "done with the uptime kuma settinbgs"
- what to build: Convention (project skill section or CLAUDE.md rule) for manual operator steps: the agent appends each one (web-UI setup, add secret to sops, iDRAC/switch config, verify login works) to a tracked checklist file with the exact command or click path, and checks items off when the user reports done. Could feed the team-status mod's "N waiting on you" count.
- effort saved: med — the user reported ~40 "X is added/works/done" confirmations across these sessions with no single place listing what is still pending.

### use-askuserquestion-when-planning
- type: claude-md
- sessions: 4  (projects: homelab-mgmt; 29bf082a, 82e838ab, f90f4161, 03886071)
- refs: "2026-10-05T08:58 29bf082a-f712-47b4-8443-4f2af6de21a4.jso", "2026-10-06T15:52 82e838ab-bf81-43d5-985c-8ccb559fbfe3.jso", "2026-10-08T23:36 03886071-9a79-4561-84a5-0dc8334db540.jso"
- example: "ask questions with to questions tool as we go." / "use the ask questions tool and letys go over the questions" / "use the ask questions tool for the omni questions"
- what to build: Global CLAUDE.md "Asking Questions" says to explain options but not to use the tool. Add: when planning, put open decisions in AskUserQuestion rather than numbered prose (the user otherwise answers "#1 C / #2 48G ..." in prose, seen in 3 sessions).
- effort saved: low — one line, removes a recurring instruction.

### commit-approved-slices
- type: claude-md
- sessions: 6  (projects: homelab-mgmt; 29bf082a, 82e838ab, 6e536bb9, f90f4161, 93135466, c033e515)
- refs: "2026-10-06T15:52 82e838ab-bf81-43d5-985c-8ccb559fbfe3.jso", "2026-10-07T01:34 6e536bb9-10fb-4fb7-b0f1-71ef7768d117.jso", "2026-10-10T03:10 93135466-f2f5-404a-937d-e652b1aea6c8.jso"
- example: "yes commit and continue" (twice in one session), "yes commit it", "create commits"
- what to build: Project CLAUDE.md override of the global "commit only when asked": in homelab-mgmt, a slice of a user-approved plan that passes its acceptance checks may be committed without asking, then continue. Keep asking for anything outside a plan.
- effort saved: low — saves one confirmation turn per slice, but slices number 120+.

### tofu-apply-permission-friction
- type: hook
- sessions: 6  (projects: homelab-mgmt; user ran `! mise run tofu ... apply` themselves in 29bf082a, 8c95cb56, f90f4161, 93135466; added allow rules in 91cfeb23, 03886071)
- refs: "2026-10-05T08:58 29bf082a-f712-47b4-8443-4f2af6de21a4.jso", "2026-10-10T03:10 93135466-f2f5-404a-937d-e652b1aea6c8.jso", "2026-10-08T22:56 91cfeb23-f905-4927-98f5-d1cc61d733f2.jso"
- example: "<bash-input> mise run tofu authentik apply -auto-approve</bash-input>" / "Add allow rules" / "mv the rule to local claude settings"
- what to build: settings.local.json now allows `mise run tofu:*` wholesale, which also allows untargeted `-auto-approve`. A PreToolUse hook that allows `tofu apply <saved>.tfplan` and blocks `-auto-approve`/untargeted applies on shared roots would keep the agent self-serving without a blanket allow.
- effort saved: med — removes the user running applies by hand while keeping a safety rail the blanket rule dropped.

## Near misses
- Research-then-plan-then-slice workflow (plan doc, "implement", "continue implementing the plan"): covered by efficient-core:planning and claude-mem:make-plan/do; not separately reported.
- "Never print secrets" in briefs (7 sessions): already in global CLAUDE.md Secrets; the gap is enforcement, reported as sops-decrypt-guard.
- `2>&1 | cat` on user-typed playbook runs (2 sessions): paging workaround, too small.
- /plugin, /reload-plugins, /reload-skills spam: 1 session only.
- Proxmox GPU passthrough / llama.cpp / Omni-Talos: one-off projects, 1 session each.
- git:commit skill: commits happen constantly but no message-quality complaints; the friction is gating (commit-approved-slices), not the skill.
- PII note: session 93135466 contains family names, emails, and a default password literal in prompts; not reproduced here.
