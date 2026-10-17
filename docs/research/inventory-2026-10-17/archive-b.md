# Archive review B: domain, tool, crew and coremods plugins

Scope: `archive/plugins/` api, auth, aws, db, deploy, infra, observability, security, web, accessibility, homelab, mcp, devenv, chezmoi, pass-cli, playwright-cli, termwright, sentry-core, sentry-mcp, sentry-mcp-self-hosted, crew, coremods, efficient-*. All are our own (author Buck Brady). Several skills were written from MIT third-party seeds (developer-platform-skills, awesome-copilot, ECC, wshobson; see `archive/docs/research/third-party-skills-review.md` Table 1). Keep that attribution line when porting.

## Summary

- **78 items reviewed: port 54, merge 6, cross-dep 0, skip 18.**
- The domain skills are consistently good. I opened every SKILL.md. Each has a safety contract, version-checked guidance, a review checklist and references loaded on demand, and the bodies run 37 to 141 lines. Port them almost unchanged. Two edits are needed everywhere: (1) rewrite the `plugin:skill` cross-references (`deploy:kubernetes`, `auth:auth`, `coding-go:golang`, `testing:e2e`, `github-admin:actions` and others) to the new one-skill plugin names, and drop links to plugins that no longer exist; (2) trim descriptions, which often exceed 500 characters because of long "Not for ..." lists.
- **Metas**: put terraform, ansible, docker and cloud-ops-guard into `iac-meta`. Proposed new metas: `new:kubernetes-meta` (kubernetes, helm, gitops), `new:aws-meta` (3 skills), `new:api-meta` (6 contract skills), `new:web-meta` (web-development, web-design, screen-reader-testing, playwright-cli) and `new:observability-meta` (4 skills). Nothing here goes in `baseline` except possibly the zero-context-cost status-line mods.
- **crew**: built-in Explore/Plan/general-purpose (with a per-call `model`), agent teams, the Workflow tool, /code-review and /security-review cover 11 of the 15 agents and the orchestration layer. Keep 3 agents as focused plugins: `debugger` (debugger-critical folds in; pass `model: opus`), `browser-tester` (rewrite onto playwright-cli) and `scribe`. Also keep the read-only Bash gate as its own hooks plugin, because plugin agents can't carry frontmatter hooks.
- **coremods**: split into focused mod plugins: `git-statusline`, `usage-band`, `agent-status` and a trimmed `bash-danger-guard`. Skip git-tools, the tool-mgr hygiene rules (the current harness explicitly allows cat/sed/heredoc in Bash), systemone (local-model experiment) and the DuckDB metrics pipeline.
- Skip both bundled MCP servers that duplicate a CLI skill (Playwright MCP, AWS MCP). Port one of the two Sentry MCP servers, whichever the user actually uses.

## Table

| Item | Source path | Verdict | Proposed plugin name | Meta(s) | Notes (overlap, license, edits needed, size) |
| --- | --- | --- | --- | --- | --- |
| rest-design | api/skills/rest-design | port | api-rest-design | new:api-meta | 54 lines + 5 refs; strong (RFC 9457, contract-first, drift checks). Absorb versioning as `references/versioning.md`. Seed: developer-platform-skills (MIT) |
| versioning | api/skills/versioning | merge | → api-rest-design | — | 129 lines. Fold the REST policy into rest-design's references and the GraphQL-evolution part into api-graphql. Saves one description |
| idempotency-retry | api/skills/idempotency-retry | port | api-idempotency | new:api-meta | 110 lines + 2 refs; three-state key, atomic claim, full-jitter. Overlaps a little with webhooks (consumer dedupe), but the boundaries are stated |
| webhooks | api/skills/webhooks | port | api-webhooks | new:api-meta | 92 lines + 2 refs; Standard Webhooks signing, SSRF, dead-lettering |
| keys | api/skills/keys | port | api-keys | new:api-meta | 112 lines, no refs; consider moving half into a reference |
| oauth-provider | api/skills/oauth-provider | port | api-oauth-provider | new:api-meta | 87 lines + 2 refs; RFC 9700, MCP auth server. Distinct from app-side auth |
| graphql | api/skills/graphql | port | api-graphql | new:api-meta | 95 lines + 1 ref. Rare in this stack, so it could be a direct install instead of meta |
| grpc | api/skills/grpc | port | api-grpc | none (or golang-meta) | 94 lines + 2 refs; buf gates, 4 compatibility dimensions. Fits Go projects |
| auth | auth/skills/auth | port | app-auth | none | 91 lines; app-side authn/authz, IDOR. Heading still says "Efficient Auth" (rename). Also fits node-typescript-meta and python-meta if those web stacks are common |
| better-auth | auth/skills/better-auth | port | better-auth | none (node-typescript-meta optional) | 90 lines + 4 refs; version-matched docs via llms.txt. Upstream `better-auth-skills` has NO license, so confirm ours was rewritten from docs (review line 499 required that). Heading says "Efficient Better Auth" |
| resource-query | aws/skills/resource-query | port | aws-resource-query | new:aws-meta | 120 lines + 6 refs; read-only CLI. Drop `references/aws-mcp.md` if the MCP is skipped |
| cloudwatch-investigation | aws/skills/cloudwatch-investigation | port | aws-cloudwatch | new:aws-meta | 84 lines + 3 refs; mutating calls only after approval |
| architecture-review | aws/skills/architecture-review | port | aws-well-architected | new:aws-meta | 54 lines + 2 refs; pillars + cost |
| aws-mcp server | aws/.mcp.json | skip | — | — | Remote AWS MCP (`aws-mcp.us-east-1.api.aws`). The skills already work through the CLI with the user's SSO. Re-add as a focused `aws-mcp` plugin only if the user wants it |
| database-design | db/skills/database-design | port | db-schema-design | none | 84 lines + 1 ref; expand-contract. Absorb the crew `dba` safety rule (never migrate or write shared DBs unless told; EXPLAIN ANALYZE writes only in BEGIN…ROLLBACK) |
| postgres | db/skills/postgres | port | postgres | none | 66 lines + 3 refs (pgvector, remedies, schema). Per-project install |
| mysql | db/skills/mysql | port | mysql | none | 110 lines + 1 ref |
| redis | db/skills/redis | port | redis | none | 76 lines + 1 ref |
| docker | deploy/skills/docker | port | docker | iac-meta | 126 lines + 3 refs; excellent (secrets table, hardening, debugging) |
| kubernetes | deploy/skills/kubernetes | port | kubernetes | new:kubernetes-meta | 80 lines + 6 refs; read-only kubectl contract, kubeconform |
| helm | deploy/skills/helm | port | helm | new:kubernetes-meta | 66 lines + 2 refs + `scripts/validate-chart.sh` (allowed-tools) |
| gitops | deploy/skills/gitops | port | gitops | new:kubernetes-meta | 89 lines + 3 refs; Argo CD/Flux, SOPS/ESO |
| rollout | deploy/skills/rollout | port | rollout-plan | none | 63 lines + 2 refs; plans only |
| production-readiness | deploy/skills/production-readiness | port | production-readiness | none | 72 lines + 1 ref; ship/block review. Doesn't duplicate /code-review (release surface, not bugs). Seed ECC (MIT) |
| terraform | infra/skills/terraform | port | terraform | iac-meta | 141 lines + 4 refs (state, refactoring, opentofu, terragrunt); checked against TF 1.16/Tofu 1.13. Best skill in scope. Has 6 trigger evals; bring them |
| ansible | infra/skills/ansible | port | ansible | iac-meta | 108 lines, no refs; idempotency proof, check mode |
| cloud-ops-guard hook | infra/hooks/hooks.json + scripts/cloud-ops-guard.ts | port | cloud-ops-guard | iac-meta | PreToolUse Bash guard for tofu/terraform/terragrunt/aws: allowlisted reads, deny apply/destroy/state surgery, ask otherwise. 416 lines + shared shell walker + fuzz tests. Needs bun |
| instrumentation | observability/skills/instrumentation | port | observability-instrumentation | new:observability-meta | 56 lines + 6 refs (logs, metrics, tracing, SLO, profiling, alerting) |
| promql | observability/skills/promql | port | promql | new:observability-meta | 54 lines + 3 refs; creds never in prompts |
| dashboards | observability/skills/dashboards | port | grafana-dashboards | new:observability-meta | 45 lines + 1 ref |
| postmortem | observability/skills/postmortem | port | postmortem | none | 54 lines + 1 ref. Used rarely, so install directly; not tied to a stack |
| audit | security/skills/audit | port | security-scan | none | Manual only (`disable-model-invocation`), so no listing cost. Wraps gitleaks/semgrep/trivy/govulncheck/pip-audit and adds a verifier subagent. Complements built-in /security-review (model-only). Python scripts + tests. Absorb crew `security-auditor`'s CI/IaC trust checklist into `references/vuln-categories.md` |
| threat-model | security/skills/threat-model | port | threat-model | none | 95 lines + 2 refs; STRIDE, verify-before-flag, exploitability tiers |
| privacy-review | security/skills/privacy-review | port | privacy-review | none | 38 lines + 1 ref |
| web-development | web/skills/web-development | port | web-development | new:web-meta | 93 lines + 3 refs. Heading "Efficient Web Development". Hand-offs name `coding-js:react`/`tanstack`/`testing:e2e`, which must be re-pointed |
| web-design | web/skills/web-design | port | web-design | new:web-meta | 106 lines + 8 refs (incl. token-core.css). Complements Anthropic frontend-design and taste-skill, which do bold new UI; ours extends existing systems. Its description names `ui-ux-pro-max` and `ui-styling`, which may not be installed |
| playwright MCP | web/.mcp.json | skip | — | — | Superseded by playwright-cli (Bash, fewer tokens) and claude-in-chrome. Its only consumer was crew browser-tester, which gets rewritten |
| screen-reader-testing | accessibility/skills/screen-reader-testing | port | screen-reader-testing | new:web-meta | 75 lines + 1 ref; manual AT testing. Complements design:accessibility-review |
| homelab-network | homelab/skills/homelab-network | port | homelab-network | none | 107 lines + 4 refs; read-only-first. User-scope personal tool |
| build | mcp/skills/build | port | mcp-server | none | 50 lines + 4 per-SDK refs (2026-07-28 protocol revision). Absorb `design` as step 1 plus `references/tool-design.md` |
| design | mcp/skills/design | merge | → mcp-server | — | 86 lines + 2 refs. Same task flow as build; merging saves one description |
| review | mcp/skills/review | port | mcp-server-review | none | 37 lines + 2 refs; static security + release QA |
| devenv | devenv/skills/devenv | port | devenv | none | 57 lines; Context7 for option shapes |
| chezmoi | chezmoi/skills/chezmoi | port | chezmoi | none | 69 lines + 6 refs. User scope |
| pass-cli | pass-cli/skills/pass-cli | port | pass-cli | none | 49 lines + 3 refs; secret-safe. User scope |
| playwright-cli | playwright-cli/skills/playwright-cli | port | playwright-cli | new:web-meta | 53 lines + 4 refs; already points at upstream's bundled SKILL.md for flags. Microsoft's playwright-cli ships its own skill (`playwright-cli install --skills`), but ours adds the safety and session discipline. Keep ours |
| termwright | termwright/skills/termwright | port | termwright | none | 77 lines + 2 refs; checked against termwright 0.2.0. Useful for TUI/mod testing; rust-meta optional |
| sentry | sentry-core/skills/sentry | port | sentry-sdk | none | 75 lines + 16 refs (topics + platforms); Context7-first, project-profile convention. Has an outcome eval |
| sentry MCP (hosted) | sentry-mcp/.mcp.json | port | sentry-mcp | none | HTTP `mcp.sentry.dev`, OAuth. Install only if the user is on sentry.io |
| sentry MCP (self-hosted) | sentry-mcp-self-hosted/.mcp.json | port | sentry-mcp-self-hosted | none | stdio `@sentry/mcp-server@latest`: **pin the version**. Uses `user_config` host/token. Keep exactly one of the two Sentry MCPs installed |
| Explore | crew/agents/Explore.md | skip | — | — | Built-in Explore plus codebase-memory scout/verify agents. Its tools name dead `codegraph` and `coremods` MCPs |
| orchestration (main agent) | crew/agents/orchestration.md | skip | — | — | Agent teams, the Workflow tool and default orchestration cover it. Depends on the deleted crew roster. Good routing ideas, but it isn't a plugin |
| system_override prompt | crew/prompts/system_override.md | skip | — | — | A copied built-in system prompt; drifts on every CC release |
| architect | crew/agents/architect.md | skip | — | — | Built-in Plan agent. The distinctive part (external codex/agy critic via `review:second-opinion`) depends on an archived plugin. Revisit if that MCP returns |
| coder / coder-high / coder-max (3 rows) | crew/agents/coder*.md | skip | — | — | Model tiers are just general-purpose + `model` override. "Ground rules" block is generic |
| dba | crew/agents/dba.md | merge | → db-schema-design | — | Keep only the shared-DB safety rules |
| devops | crew/agents/devops.md | skip | — | — | Safety contracts already live in terraform/kubernetes/docker skills and cloud-ops-guard |
| quick-review | crew/agents/quick-review.md | skip | — | — | /code-review low |
| review | crew/agents/review.md | skip | — | — | /code-review high/xhigh; plan review via Plan or a Workflow |
| security-auditor | crew/agents/security-auditor.md | merge | → security-scan (refs) | — | /security-review covers the diff read. Move the supply-chain/CI/IaC checklist (pull_request_target, unpinned actions, OIDC sub wildcards) into security-scan references |
| debugger | crew/agents/debugger.md | port | debugger | none | 25 lines; read-only, reproduce first, hypothesis table, confirmation rule, worktree-only bisect. No built-in equivalent. Rewrite tools (drop codegraph/grep-app/exa; add codebase-memory). Remove `coding-core:problem-solving` preload. Alternative: mattpocock `diagnosing-bugs` skill (MIT) does the same as a skill, so compare before porting |
| debugger-critical | crew/agents/debugger-critical.md | merge | → debugger | — | Same prompt with opus; the caller passes `model: opus` |
| scribe | crew/agents/scribe.md | port | scribe | none | 31 lines; claim-verified doc writer with UNVERIFIED marks. Swap the `avoid-ai-writing` preload for a ported humanizer/anti-slop skill or drop it |
| browser-tester | crew/agents/browser-tester.md | port | browser-tester | new:web-meta | 28 lines; pass/fail/blocked per acceptance criterion with evidence. Rewrite from Playwright MCP onto `playwright-cli` (Bash) and preload the playwright-cli skill |
| readonly Bash gate | crew/hooks/hooks.json (PreToolUse) + scripts/readonly-gate.ts, readonly-bash.ts | port | readonly-agent-gate | none | Enforces read-only Bash for listed agent types (debugger, browser-tester and any user agents). Plugin agents ignore frontmatter `hooks`, so this has to be its own hooks plugin. Keep the TS path only and drop the duplicate Python checker (1592 lines); make the agent list configurable |
| orchestration-guard hooks | crew/hooks/hooks.json (Stop/UserPromptSubmit/PostToolUse) + orchestration-guard.py | skip | — | — | Only fires for `crew:orchestration`, which is skipped |
| writing-agents.md | crew/docs/writing-agents.md | merge | → repo-local `.claude/skills/agent-authoring` | — | Docs, not a component. Mine anything agent-authoring lacks |
| git-line mod | coremods/hooks/git-line + register.tsx | port | git-statusline | baseline? (zero context cost) or none | 97 lines; repo/branch/ahead-behind/dirty counts under the prompt. Note built-in `statusLine` exists; this uses PromptHint, so they coexist |
| usage-band mod | coremods/hooks/usage-band | port | usage-band | baseline? or none | 223 lines; live context-by-category + 5h/weekly limits above the prompt. Built-in /context and /usage are on demand only |
| agent-status mod | coremods/hooks/agent-status | port | agent-status | none | 145 lines; live agent count + panel. Check against the current built-in teammate/background-task view before porting. Shares AbovePrompt with usage-band: each split plugin must chain `next()` instead of assuming the other |
| git-tools mod (git_log/blame/show) | coremods/hooks/git-tools | skip | — | — | Existed so a Bash-less crew:Explore could read history. Built-in agents have Bash; codebase-memory has `detect_changes` |
| tool-mgr danger rules | coremods/hooks/tool-mgr/danger.ts + shell/walk.ts + vendor/unbash | port | bash-danger-guard | none (baseline candidate) | rm-root, disk-wipe, system-perms, sudo deny; force-push and curl\|sh ask. Deterministic, which complements the auto-mode classifier. Ship as a mod with only these rules plus parse-error/too-long. Shell walker + unbash are also vendored in cloud-ops-guard and readonly-gate; keep one canonical copy and sync it with a script |
| tool-mgr hygiene rules (sed-read, heredoc-write, echo-write) | coremods/hooks/tool-mgr/rules.ts | skip | — | — | Contradicts current harness guidance (auto mode tells Claude to use cat/sed/heredocs) and costs denied turns |
| tool-mgr systemone | coremods/hooks/tool-mgr/systemone.ts + scripts/systemone-eval.ts | skip | — | — | Experimental local-LLM (Kev GGUF) command judge; needs a local model server |
| tool-mgr metrics (`/tool-mgr`, log-call, metrics.mjs, DuckDB SessionStart install) | coremods/hooks/hooks.json classic hooks + scripts/ + tool-mgr/metrics.ts | skip | — | — | Heavy (DuckDB install into plugin data, async hooks on every call) for a dev-only metric. Mixes classic hooks and mod in one plugin |
| efficient-core / -js / -testing | archive/plugins/efficient-* | skip | — | — | Only stale `evals/results/` folders; no components |

## Skipped bulk

- crew agents superseded by built-ins: 9 (Explore, orchestration, architect, coder ×3, devops, quick-review, review), plus system_override and orchestration-guard hooks.
- coremods internals with no standalone value: 4 (git-tools, hygiene rules, systemone, metrics pipeline).
- Bundled MCP servers duplicating a CLI skill: 2 (Playwright, AWS).
- Empty leftovers: 3 efficient-* dirs.

## Third-party alternatives checked

- Debugging: mattpocock `diagnosing-bugs` (MIT) and addyosmani `debugging-and-error-recovery` (MIT) are skill versions of our debugger agent. Ours is stricter (read-only, confirmation rule). Keep ours, but if only one is wanted, a skill costs less than an agent.
- Terraform/K8s/Postgres/MCP: Jeffallan claude-skills (`terraform-engineer`, `kubernetes-specialist`, `postgres-pro`, `mcp-developer`) ship inside one 67-skill mega-plugin and are shallower. The earlier review already mined wshobson/ECC/awesome-copilot into ours. None beats ours.
- Web design: Anthropic `frontend-design` and `taste-skill` cover bold new UI and complement ours rather than replacing it.
- Docs: `humanizer` (MIT) can replace the `avoid-ai-writing` preload in scribe.
- UNCONFIRMED, worth a look: HashiCorp's own Terraform agent skills, Sentry's official agent skills/plugin, and awslabs agent plugins. None of their marketplaces is in `allowCrossMarketplaceDependenciesOn`, so they could only be direct installs.

## Open questions

1. Sentry: sentry.io or self-hosted? Port only the matching MCP plugin.
2. Should the zero-context mods (git-statusline, usage-band, bash-danger-guard) go in `baseline`? They cost no tokens, but baseline deps can't be disabled individually.
3. Does the current built-in agent/teammate display make `agent-status` redundant for you?
4. Is the `api-meta` cluster (6 skills) worth a meta, or should those be direct installs? They suit API-platform repos, not every service.
5. Is `debugger` better as an agent (isolated context, read-only gate) or as a skill (cheaper; mattpocock style)?
