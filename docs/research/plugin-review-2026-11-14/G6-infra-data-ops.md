# G6 infra, cloud, data, ops, 2026-11-14

Read-only review of 35 plugins. Each SKILL.md was read in full. References, scripts and evals were sampled by heading, grep and spot reads (not every reference file line by line). Ran `uv run --with pyyaml python3 scripts/plugins.py check` (ok). No plugin tests run (none relevant and cheap).

## Summary

- Verdicts: KEEP 11, KEEP-FIX 17, SLIM 2, MERGE 4, DEPRECATE 0 (with one owner-call merge, aws-cli into aws).
- Prior review: 14 FIXED, 3 PARTLY, 21 STILL OPEN (mostly low).
- The daily stack earns its place: ansible (46 calls, 10 sessions), terraform (28 calls, 13 sessions), mise, kubernetes, docker. Each carries tool-quirk or decision content a bare model lacks. ansible's check-mode rule is still the one real hole.
- Unused-but-listed skills: helm (0 calls, 50 sessions), promql and grafana-dashboards (0, 30), feature-flags (0, 57) and postgres (0 model calls, 10 loads, all from the `dba` agent preload). Descriptions all name concrete triggers, so this is mostly "the owner does no such work in those sessions" and "the model does not need a generic rule". It is not a description failure. Details per plugin below.
- AWS: five skills, 14 to 15 sessions listed, 1 call total (aws-resource-query, 1 session). Listing cost is about 874 tokens per session. The evidence is thin because aws-meta is project scope. I recommend folding `aws-cli` into `aws` (owner's call, since the owner asked for them separate on 2026-10-18).
- feature-flags in programming-core costs 264 tokens in 12 language metas, with 0 calls in 57 sessions. Remove it from programming-core and install it directly. Together with flag-hygiene and the three goff-* plugins there are five flag plugins and about 1,350 listing tokens. Reduce to two plugins: `feature-flags` (absorbing flag-hygiene) and one `goff` skill.
- Caution: the 2026-10-23 report says Statsig was acquired by Amplitude on 2026-05-05. A web search today found only OpenAI's September 2025 announcement and no Amplitude link. Do not write the Amplitude claim into the skill.
- Corrections still open at [med]: ansible check mode (`ansible/skills/ansible/SKILL.md:14`), redis live-instance guardrails, MySQL 9.7 and 8.0 end of life, dba missing `dependencies`, three ops-process descriptions with no Not-for.

## Prior findings re-checked

| Prior finding (source) | Status | Evidence |
| --- | --- | --- |
| V17 aws-well-architected `ce` region (G6 high) | FIXED | `aws-well-architected/skills/aws-well-architected/references/cost.md:3` names the `us-east-1` exception; `:10` and the rightsizing line use `--region us-east-1`. Commit 79bad8e2. |
| V18 / A10 WA and cloudwatch secret deny list drift | FIXED | `aws-cloudwatch/SKILL.md:174` and `aws-well-architected/SKILL.md:379` both list `batch-get-secret-value`, `ecr get-login-password`, `eks get-token`, `rds generate-db-auth-token`, `ec2 get-password-data` and credential-minting `sts`, and point to `aws-resource-query`. |
| Invalid YAML descriptions (ansible, aws, aws-cli, docker, homelab-network) | FIXED | All are single-quoted now (commit 5996f610). `check` passes. |
| Vacuous `not-<sibling>` graders | FIXED | Commit 7d02eaad dropped them. `mysql-vs-postgres/graders` and `ansible-routing/graders` hold only `fires-*`. This leaves those suites with no negative at all (see Cross-plugin). |
| Coverage gaps, no evals (17 plugins) and `runs: 1` | STILL OPEN | `ls plugins/*/evals` unchanged. kubernetes, helm, docker, gitops, devenv, postgres, db-schema-design, grafana, observability, homelab, chezmoi, pass-cli, feature-flags, rollout-plan, postmortem and all four new flag plugins have none. `ansible/evals/ansible-routing/prompt.md:5` still has `runs: 1`. |
| AWS safety rules duplicated in several places | PARTLY | Deny list is now complete in all three copies but still copied in three places (`aws-resource-query:271-283`, `aws-cloudwatch:174`, `aws-well-architected:379`). Write habits still appear in `aws-cli:100`, `aws-resource-query:310-319` and `aws-well-architected:368`. |
| mysql sourced only from the 8.4 manual, no 9.7 LTS / 8.0 EOL (F8) | STILL OPEN | `mysql/skills/mysql/SKILL.md:12`; grep for `9.7` and `LTS` finds nothing. F8 says "no edits planned". |
| Statsig closing unconfirmed (F8) | STILL OPEN, but the prior correction is doubtful | `feature-flags/skills/feature-flags/SKILL.md:56`, `references/platforms.md:62`. The prior report's "Amplitude, 2026-05-05" is not supported (see Needs source check). |
| promql native histograms and Prometheus 3 UTF-8 names (F8) | STILL OPEN | `promql/skills/promql/SKILL.md:26` requires `le` with no native-histogram branch. `references/investigations.md:33` already uses `histogram_fraction` for native histograms, so the skill contradicts its own reference. |
| Renovate/dependabot divergence | out of scope here (G-other) | not re-checked |
| redis has no live-instance safety rules | STILL OPEN | grep for `FLUSHALL`, `FLUSHDB`, `CONFIG SET`, `MONITOR` in `plugins/redis` returns nothing. |
| redis licensing / `HEXPIRE` / `allkeys-lrm` source | STILL OPEN (low) | `redis/SKILL.md:50` unsourced. |
| ansible `--check` "run freely" vs `check_mode: false` | STILL OPEN | `ansible/skills/ansible/SKILL.md:14` vs `:86`. |
| terraform contract omits `state push`, `apply -refresh-only`, `taint`, `workspace delete` | STILL OPEN | `terraform/skills/terraform/SKILL.md:14`. |
| terraform OpenTofu ephemeral note | STILL OPEN (low) | `:114` mentions only Terraform 1.10/1.11. |
| kubernetes `exec` approval mismatch | PARTLY | `kubernetes/SKILL.md:15` asks only for production pods. `references/triage.md:3` says never exec without approval. |
| kubernetes `logs` secret redaction | STILL OPEN (low) | `kubernetes/SKILL.md:14`. |
| helm `--dry-run=server` prints Secrets | STILL OPEN (low) | `helm/SKILL.md:50`, `references/release.md:46`. |
| docker approval list omits `volume rm/prune`, `image prune -a`; no ufw note, no `version:` note | STILL OPEN | `docker/SKILL.md:113`; grep of `references/*.md` for ufw, firewalld and `version:` is empty. |
| devcontainer/devenv Not-for omits mise | PARTLY | `devenv` body line 50 still omits mise. mise names devenv at `mise/SKILL.md:3`. |
| homelab-network points cloud networking to aws-well-architected | STILL OPEN (low) | `homelab-network/SKILL.md:8`. |
| pass-cli name collides with password-store | FIXED | Description now opens "Uses the Proton Pass CLI". |
| aws profile fallback `default` vs resource-query "ask" | STILL OPEN (low) | `aws/SKILL.md:15` vs `aws-resource-query/SKILL.md:256`. |
| aws-cli `--page-size` equal to `--max-items` unsourced | STILL OPEN (low) | `aws-cli/SKILL.md:112`. |
| aws-resource-query query-start calls "go through aws-cloudwatch"; `appsync list-api-keys` unconfirmed | STILL OPEN (low) | `aws-resource-query/SKILL.md:285`, `:306`. |
| aws-cloudwatch / aws-well-architected / production-readiness / rollout-plan / postmortem descriptions lack boundaries | STILL OPEN | The Not-for text is in the body only (e.g. `postmortem/SKILL.md:10`, `rollout-plan/SKILL.md:8`, `production-readiness/SKILL.md:10`, `aws-cloudwatch/SKILL.md:167`). The `description:` lines have none. |
| rollout-plan restates flag hygiene | STILL OPEN (low) | `rollout-plan/SKILL.md:61`. |
| grafana "default before v12.2" unsourced | STILL OPEN (low) | `grafana-dashboards/SKILL.md:43`. |
| dba preloads postgres and db-schema-design without declaring dependencies | STILL OPEN | `plugins/dba/.claude-plugin/plugin.json` has no `dependencies`; dba is in no meta (grep of marketplace). |
| devops claims kubernetes/helm/gitops, but iac-meta lacks them | STILL OPEN | `iac-meta` deps are terraform, ansible, docker, bash, devops, plan-ledger-usage, bash-language-server. |
| sentry-sdk eval grader matches only Write | not re-checked | |
| cloud-ops-guard coverage | CHANGED | It is now a direct install, not in aws-meta or iac-meta (`cloud-ops-guard/README.md`). `docs/plans/aws-meta.md:140,179` still list it as a dependency (line 25 says superseded). |

## Per-plugin

### aws, KEEP-FIX (medium)
- Value: K-decision. IAM traps (`aws/SKILL.md:55-60`: PassRole plus compute create, `ForAllValues` absent-key, role-chain 1 hour, GetSessionToken limits) and cost habits (`:68-72`, `references/cost.md`). The model gets these right inconsistently. Context-first plus sign-in with `aws login` (CLI 2.32) is newer than most training data (needs source check).
- Evidence: 14 sessions listed, 0 calls, 220 listing tokens.
- Fixes: [low] `:15` falls back to profile `default` but `aws-resource-query:256` asks. Pick one. [low] description is 652 chars; trim to under 500 by cutting the symptom list. [med] add the evals proposed in the prior report (outcome `ce get-cost-and-usage --region us-east-1`, PassRole review).

### aws-cli, MERGE into aws (medium-low, owner's call)
- Value: mostly generic CLI mechanics (`--query`, pager, waiters, skeletons). The non-obvious parts are `--no-paginate` silently dropping items (`:109`), env keys beating `--profile` (`:153`), `DryRunOperation` is a pass (`:102`), and `--client-token` reuse (`:103`). About 25 lines.
- Evidence: 14 sessions, 0 calls, 241 listing tokens (the largest of the five).
- Fixes: move the quirks into `aws/references/cli.md` and delete the plugin, or keep it and trim the description (706 chars). [low] `:112` unsourced `--page-size` rule.
- Lost: a separate trigger for "my aws script is truncated". Sonnet 5.5 would likely handle this unprompted; Haiku would miss the `--no-paginate` and env-key-precedence traps.

### aws-cloudwatch, KEEP (medium)
- Value: K-decision. Onset-vs-transition widening (`:190`), "no correlated change found" rule (`:219`), read-only call allowlist with Logs Insights as the only log route (`:173-174`), traps list (`:229-235`).
- Evidence: 15 sessions, 0 calls, 119 tokens.
- Fixes: [med] description has no Not-for (postmortem, sentry-sdk, promql). [low] `:177` "at most 50 log groups" is version-dependent.

### aws-resource-query, KEEP-FIX (medium)
- Value: Enforcement-by-instruction. It is the single owner of the secret-read deny list (`:271-283`) and the "secret in full output" table (`:291-306`). Its 6 reference tables are tooling-like intent-to-command maps.
- Evidence: 15 sessions, 1 load/call; 169 tokens.
- Fixes: [low] `:285` sends Athena and Logs Insights queries to aws-cloudwatch; say they bill and need approval. [low] `:306` "likely, not confirmed" row. [low] `:310-319` duplicates aws-cli write habits; point to one place.

### aws-well-architected, KEEP-FIX (low)
- Value: K-decision, mild. Procedure (IaC-only/live/both, never run `terraform plan` or `cdk synth` at `:377`, "not verified is not a pass" at `:381`, per-finding evidence fields). `references/pillars.md` is mostly textbook Well-Architected.
- Evidence: 14 sessions, 0 calls, 125 tokens.
- Fixes: [med] description has no Not-for and "cost audit" collides with `aws` "what AWS costs". [low] consider cutting `pillars.md` to the checks that read IaC.

### terraform, KEEP-FIX (high)
- Value: K-decision plus K-private. Saved-plan flow and "plan file is the approval" (`:32-39`), shared-state lock handling, `moved` blocks on count-to-for_each, wrapper-first rule, write-only arguments by version, Terragrunt errors in `references/terragrunt.md`.
- Evidence: 49 sessions, 28 calls in 13 sessions, 146 tokens. 5 routing evals, no outcome eval.
- Fixes: [med] `:14` never-without-instruction list omits `state push`, `apply -refresh-only`, `taint/untaint`, `workspace delete` (cloud-ops-guard is opt-in now, so the skill is the only gate in an iac-meta install). [low] `:114` OpenTofu ephemeral/write-only note. [med] add outcome evals (`apply` only with a saved plan; count-to-for_each yields `moved`).

### ansible, KEEP-FIX (high)
- Value: K-decision. `validate:` on template/copy because `--check` does not run the service's own validator (`:72-85`), `--force-handlers` for the failed-run trap (`:69`), `creates:`/`changed_when`, runner discovery (`:21`).
- Evidence: 49 sessions, 46 loads and calls in 10 sessions, 120 tokens (the most-used skill in this family). 1 routing eval.
- Fixes: [high] `:14` lists `--check --diff --limit <host>` under "Run freely". `check_mode: false` tasks (recommended by the skill at `:86`), plus `command`/`shell` tasks without `check_mode`, run for real. Require a grep for `check_mode: false` and `shell`/`command`/`raw`/`reboot` before a check run on a real host, or move it to "Run against real hosts". [med] add an outcome eval (`--limit` always present on a real run).

### docker, KEEP-FIX (medium)
- Value: K-decision. `.dockerignore` for `.env`, build secrets via `--mount=type=secret`, Compose `service_healthy`, hardening block, the Docker-socket warning. The Dockerfile rules are largely generic; the approval list and secrets table are the useful part.
- Evidence: 60 sessions, 5 calls in 4 sessions, 117 tokens.
- Fixes: [low] `:113` approval list omits `volume rm|prune`, `image prune -a`, `compose down --remove-orphans`. [low] add published ports bypass ufw/firewalld (owner runs homelab) and obsolete Compose `version:`.

### kubernetes, KEEP (medium)
- Value: K-decision. Context and `-n` before any command (`:16`), Secret-dump ban, restricted securityContext plus PSA labels (`references/pod-security.md`, 167 lines), kubeconform and server-side dry-run order (`:35-46`).
- Evidence: 50 sessions, 5 calls in 3 sessions, 126 tokens. No evals.
- Fixes: [low] align exec rule (`:15` vs `references/triage.md:3`). [low] add "redact before quoting" for logs. [med] add one outcome eval.

### helm, KEEP-FIX (low confidence, revisit)
- Value: Tooling plus K-decision. `scripts/validate-chart.sh` is a real read-only lint-and-render-and-kubeconform gate. The Helm 3 to 4 flag table (`:37-41`) is the only fact-like part (needs source check).
- Evidence: 50 sessions listed (kubernetes-meta), 0 calls, 103 tokens. The description asks for "creating or changing a chart" or a failed install. The owner consumes charts through gitops/Flux; the skill never fires because no chart authoring happens, not because the description is weak. A bare model authors charts fine. Haiku would miss Helm 4 flag renames.
- Fixes: [low] `:50` do not paste `--dry-run=server` output. If still 0 calls next window, MERGE the Helm 4 table and `validate-chart.sh` into `kubernetes` or `gitops` (`HelmRelease` section).

### gitops, KEEP (medium)
- Value: K-decision. Delete-with-finalizer prunes workloads (`:16`), prune/selfHeal per environment (`:62-71`), Flux default for homelab. Secrets reference.
- Evidence: 50 sessions, 1 call, 112 tokens. The owner runs Flux or Argo, so low call counts say they do few GitOps authoring tasks per month, not that the guidance is wasted.
- Fixes: none.

### tilt, KEEP (medium)
- Value: K-private-ish and K-decision. Starlark pitfalls (`:12-26`), `tilt ci --timeout` and `tilt up --stream` for agents (`:45-51`), `allow_k8s_contexts(k8s_context())` warning. Hard negative eval works.
- Evidence: 50 sessions, 1 call, 170 tokens (497-char description; fine).
- Fixes: none.

### devcontainer, KEEP (medium)
- Value: K-decision with sourced spec rules (image label merge at `:22`, lifecycle forms at `:19`, `waitFor` values). Its two Do-not-report guards are the kind that stop false positives.
- Evidence: not listed anywhere (0 sessions). Judged on content.
- Fixes: [low] body Not-for (`:8`) omits mise/devenv; add to description.

### devenv, KEEP-FIX (medium-low)
- Value: K-private/version-sensitive: 2.x vs 1.x commands, `devenv generate` uploads files (`:59`), SecretSpec runtime loading, `-O` option probing. Facts will go stale (devenv 2.3.1 claimed).
- Evidence: not listed. No evals.
- Fixes: [low] Not-for lacks mise. [med] add `devenv-not-mise` and a secret-in-eval outcome eval.

### mise, KEEP (high)
- Value: K-private and K-decision. Agent shell integration (`mise activate` does nothing in the Bash tool, shims, `mise exec`, `:155-161`), trust semantics (`:150-153`), `ubi:` deprecation (needs source check). Three working evals incl. hard negative.
- Evidence: 36 sessions, 3 calls in 3 sessions, 207 tokens (609-char description).
- Fixes: [low] trim the description under 500 chars.

### chezmoi, KEEP (medium)
- Value: K-decision. Apply gate with AskUserQuestion (`:33-39`), avoid `chezmoi push` and `cd`, dry-run never runs scripts.
- Evidence: not listed. No evals.
- Fixes: [low] add an apply-gate eval.

### pass-cli, KEEP (medium-high)
- Value: K-private (Proton Pass CLI 2.4.2 command surface) and Enforcement-by-instruction (`:14-26` secret-printing commands list, no secrets in argv). A bare model would not know `item view --field` prints a secret.
- Evidence: not listed. No evals.
- Fixes: none; add a `max: 0` eval on bare `item view --field`.

### homelab-network, KEEP-FIX (low)
- Value: K-decision of the "plan first, rollback and out-of-band access" kind (`:10-16`). The OPNsense rule-order notes (`:68`) are real. Zone tables and DNS cutover are generic.
- Evidence: 26 sessions, 0 calls, 127 tokens. The owner has a homelab, but no homelab network change fell in the window.
- Fixes: [low] `:8` point cloud networking to `aws-resource-query`. [med] add the plan-first outcome eval; the skill's value is a behavior change that only an eval can show.

### pre-commit, KEEP (medium)
- Value: K-decision. "Never bypass a hook" plus the repair procedure (`:35-59`: classify, fix at cause, three-round cap, leave tree as found), prek preference. Pairs with the `check-bypass-guard` plugin (Enforcement).
- Evidence: 18 sessions, 0 calls, 110 tokens. 2 routing evals.
- Fixes: none.

### postgres, KEEP (medium-low)
- Value: K-decision, mostly process (baseline, one variable per probe, `EXPLAIN ANALYZE` executes). The facts live in `references/remedies.md` (online DDL list, `CONCURRENTLY` in transaction, RLS cost) and `pgvector.md`. A bare Sonnet writes decent Postgres advice; the skill mainly adds production-safety restraint.
- Evidence: 52 sessions listed, 0 model calls, 10 loads (all `dba` agent preload: dba agent_calls = 10). 113 tokens. No evals.
- Fixes: [low] `:8` and `:12` repeat the db-schema-design pointer. [med] `dba/.claude-plugin/plugin.json` should declare `dependencies: [postgres, db-schema-design, plan-ledger-usage]` (the agent preloads them at `dba/agents/dba.md:7-9`).
- Trigger verdict: the listing never fires because `dba` takes the work. Model-invoked use is not needed.

### mysql, KEEP-FIX (low)
- Value: K-decision, mild. The upsert alias vs `VALUES()` split by engine (`:51-63`) is a real correction; `SKIP LOCKED` and replica lag notes are fine; `:84-95` defaults table is generic and overlaps db-schema-design.
- Evidence: 9 sessions, 0 calls, 114 tokens. 1 routing eval.
- Fixes: [med] `:12` still cites only the 8.4 manual; add MySQL 9.7 LTS and the 8.0 end of life (needs source check). [low] `:84-95` point to db-schema-design.

### redis, KEEP-FIX (medium)
- Value: K-decision. Eviction-policy table with the `volatile-*` caveat (`:44-50`), cache-aside delete-on-write, `references/patterns.md` (token-checked lock, why re-setting TTL on each `INCR` breaks limiters).
- Evidence: 13 sessions, 0 calls, 116 tokens.
- Fixes: [med] no rule for running commands against a live instance: never `FLUSHALL`/`FLUSHDB`, `CONFIG SET`, `DEBUG`, `SHUTDOWN`, pattern `DEL`; `MONITOR` streams values. [low] `:50` source for `allkeys-lrm`.

### db-schema-design, KEEP (medium)
- Value: K-decision. Invariant classification (row-local, relationship, cross-row) and what `CHECK` cannot enforce (`:29-33`); expand-contract in `references/migrations.md`; shared-database safety (`:12-17`).
- Evidence: 28 sessions, 11 loads (10 dba preload plus 1 call), 108 tokens. No evals.
- Fixes: [med] dba dependency (above). [med] add the expand-contract outcome eval.

### promql, SLIM (low-medium)
- Value: mostly Generic. The 7 query rules (`:24-30`) are textbook and models know them. Worth keeping: the credentials rule (`:12-20`), `references/server-config.md` plus `promtool check/test` gate (`:48-50`), query cost limits (`:32-38`).
- Evidence: 30 sessions, 0 calls, 115 tokens. The description fits PromQL and promtool work; the model either does not need it or the owner does not query Prometheus from these projects.
- Fixes: [med] `:26` add the native-histogram branch (`histogram_quantile(0.99, sum by (route) (rate(x[5m])))` for native) and check type first; it contradicts `references/investigations.md:33`. [low] UTF-8 metric names under Prometheus 3 (needs source check).
- If SLIM: keep about 30 lines of SKILL.md (credentials, config work, cost, native histograms); cut rules 1-7 to one line. Lost: a Haiku reminder to keep `le` in grouping.

### grafana-dashboards, SLIM (low)
- Value: weakly K-decision. "Do not write dashboard JSON from memory, export one" (`:43`) and provisioning reference (62 lines) matter. The RED/USE panel tables and checklist are generic.
- Evidence: 30 sessions, 0 calls, 118 tokens. No evals.
- Fixes: [low] `:43` cite the version claim. If SLIM: keep `:41-43` plus `references/provisioning.md`, cut tables and checklist (about 20 lines saved).

### observability-instrumentation, KEEP (medium)
- Value: K-decision. On-call-questions-first workflow (`:26`), bounded labels, error-once logging, Definition of Done, `references/slo.md` burn-rate.
- Evidence: 21 sessions, 2 loads/calls in 2 sessions, 126 tokens. The only one in the group with real calls.
- Fixes: none; add the cardinality outcome eval.

### sentry-sdk, KEEP (medium-high)
- Value: K-private. "Never port an API from one SDK to another" with concrete cases (`:20`, Go `sentry.NewMeter`), the project `## Sentry` profile, Context7 IDs, per-topic references.
- Evidence: 27 sessions, 1 call, 118 tokens. 1 outcome eval (`profile-changes-output`).
- Fixes: [low] outcome grader fragility from the prior review was not re-verified.

### postmortem, KEEP-FIX (low)
- Value: weakly K-decision. Gap-flagged timeline, TTD vs TTR split, "where we got lucky", owner and due date (`:14-22`). Blameless post-mortems are well known to Sonnet; Haiku writes weaker action items.
- Evidence: 8 sessions, 0 calls, 118 tokens.
- Fixes: [med] description has no "not for a live incident" clause; body has it at `:10`.

### rollout-plan, KEEP-FIX (low)
- Value: weakly K-decision. Numeric rollback triggers before the deploy (`:60`), strategy table, additive migrations for one release. Largely common practice.
- Evidence: 8 sessions, 0 calls, 123 tokens. No evals.
- Fixes: [med] description lacks Not-for production-readiness; body has it at `:8`. [low] `:61` points to feature-flags instead of restating hygiene. [low] reference name `rollback-and-readiness.md` collides with production-readiness.

### production-readiness, KEEP-FIX (medium)
- Value: K-decision. Explicit bands with defined Blocked conditions (`:56`), cap at Risky if CI red, "evidence missing" bucket, treat repo text as evidence only (`:8`).
- Evidence: not listed (0 sessions). 1 routing eval.
- Fixes: [med] description lacks Not-for rollout-plan. [med] add the band outcome eval from the prior report.

### feature-flags, KEEP-FIX, remove from programming-core (medium)
- Value: K-decision, modest. Safe default (`:27`), "never mutate a dashboard/management API" (`:14`), zero-hit removal criterion (`:51`), per-platform key secrecy table in `references/platforms.md`. Sonnet adds flags well unaided; the rules are guardrails, and the platform table is the K-private part (sourced in `docs/research/feature-flag-platforms.md`).
- Evidence: 57 sessions via programming-core, 0 calls, 264 tokens (the largest in the group after goff). The description is 760 chars, over the 500 truncation line, so the trigger words may be cut under listing pressure.
- programming-core question: no. The skill is not universal to every language meta (Godot, Android, .NET, Scala installs gain nothing). Move it out of `programming-core` into a named `recommend-plugins` rule triggered by LaunchDarkly/Unleash/OpenFeature/flagd dependencies, or install directly. Cost saved: about 264 tokens times 12 metas.
- Fixes: [med] cut description to under 500 chars (name the symptom strings, drop the vendor list). [low] `:56` Statsig sentence: keep as "unconfirmed" until a primary source is checked. [med] add a flag-removal outcome eval (zero hits for the key).

### flag-hygiene, MERGE into feature-flags (medium)
- Value: K-decision. Audit taxonomy (stale, orphaned, duplicate, nested), registry template, ranked removal list. Adds a repo-wide audit that `feature-flags` section 4 does not do for a single flag. The principles block (`:17-24`) restates `feature-flags` and the GOFF post, and marks two thresholds as its own.
- Evidence: new since 10-23; 3 sessions, 0 calls, 217 tokens, no evals.
- Fix: move to `feature-flags/references/audit.md` with 3 references; add a one-sentence trigger "audit all flags" to the feature-flags description. Saves 217 listing tokens. Lost: its own description trigger for "flag debt" prompts (keep those strings in the merged description).

### goff-flags / goff-relay-proxy / goff-sdk, MERGE into one `goff` skill (medium-low)
- Value: K-private. GO Feature Flag specifics a model cannot know reliably: `prerequisite` is not a real field (`goff-flags:14`), `progressiveRollout` beats `percentage` beats `variation` (`:18`), reverse-alphabetical bucket layout, relay proxy `authorizedKeys` open by default (`goff-relay-proxy:13`), `/admin/v1` vs docs prose, `serverExternalPackages` for WASM in Next.js (`goff-sdk:36`), `TARGETING_KEY_MISSING`. Every claim is hedged "verify" and "nothing was run against a live proxy" (`goff-relay-proxy:8`), so confidence is lower than the style suggests.
- Evidence: new; 2 to 3 sessions each, 0 calls, 284 + 269 + 312 = 865 listing tokens (descriptions 828, 770, 914 chars, all over 500). No evals, no meta membership. No evidence the owner runs GOFF; the research doc (`docs/research/feature-flag-platforms.md`) does not even list it as a platform.
- The three facets share one context (flag file, proxy, SDK) and the descriptions repeat each other's Not-for lists. One skill with `flags.md`, `relay-proxy.md`, `sdk.md` references and one 450-char description would keep the facts and cut listing cost to roughly a third.
- If the owner does not use GOFF, DEPRECATE (Unused) is the honest alternative; I cannot tell from data. Lost for either: GOFF-only facts, for Sonnet and Haiku alike.
- Fixes: [med] add one routing eval per facet if kept as three. [low] pin which GOFF version the facts match (proxy v1.58.1 is named only in `goff-relay-proxy`).

## Cross-plugin findings

- **Five AWS skills.** Boundaries are clear in descriptions except cloudwatch and well-architected. Recommend `aws-cli` into `aws`. A single aws-meta routing eval set is still missing.
- **Five flag plugins.** feature-flags, flag-hygiene and three goff-* repeat each other's Not-for lists. Merge to two (above). `rollout-plan:61` and `goff-flags:64` both restate flag removal.
- **Listing cost.** Descriptions over 500 characters: goff-sdk 914, goff-flags 828, goff-relay-proxy 770, feature-flags 760, aws-cli 706, aws 652, flag-hygiene 622, mise 609. These are the ones most exposed to truncation.
- **Sibling negatives.** The vacuous negative graders are gone, which leaves the mysql/postgres/redis, ansible/terraform and production-readiness/rollout boundaries with no negative at all. A negative has to live in the suite of the skill that should fire, for example `redis-not-postgres-queue` inside redis.
- **dba and devops.** dba declares no dependencies, so installing it alone loses the skills it preloads. iac-meta still ships the devops agent without kubernetes, helm or gitops.
- **cloud-ops-guard.** It is now opt-in (README), so `aws-meta` and `iac-meta` rely on skill text alone for the ask-first rules. `docs/plans/aws-meta.md:140,179` still list it as a dependency; update or annotate.
- **Daily-stack safety contracts.** terraform, ansible, kubernetes, helm and gitops each carry a different list of "ask first" commands. Not harmful, but the terraform and ansible lists are the incomplete ones.
- **Unused skills, trigger vs need.** helm, promql, grafana, postgres, feature-flags all have descriptions that name specific triggers. For postgres and db-schema-design the work goes to the dba agent. For helm, the owner consumes charts via GitOps. For promql, grafana and feature-flags, the model plausibly handles the task without the skill. I did not find a description that fails to trigger.

## Needs source check

- Statsig ownership: prior review says Amplitude, 2026-05-05. A web search on 2026-11-14 returned OpenAI's September 2025 agreement ($1.1B, founder as CTO of Applications), and nothing about Amplitude and nothing confirming close. Neither source is primary.
- MySQL 9.7 LTS (GA 2026-04-21) and MySQL 8.0 end of life April 2026: unverified here.
- Prometheus 3: native histogram stability and UTF-8 metric/label quoting syntax.
- Helm 4 flag table (`--rollback-on-failure`, `--force-replace`, `--wait` watcher default) at `helm/SKILL.md:37-41`.
- `aws login` requires CLI 2.32.0 and `SignInLocalDevelopmentAccess` (`aws/SKILL.md:39-40`).
- Redis 8.6 `allkeys-lrm` (`redis/SKILL.md:50`); Redis `HEXPIRE` 7.4; licensing.
- Tool-version claims: ansible-core 2.21 and ansible-lint 26.9 (`ansible/SKILL.md:10`), Terraform 1.16, OpenTofu 1.13, Terragrunt 1.1 (`terraform/SKILL.md`), devenv 2.3.1, chezmoi v2.73.1, Proton Pass CLI 2.4.2, prek 0.5, GOFF proxy v1.58.1, mise `ubi:` removal in 2027.1.0 (`mise/SKILL.md:132`).
- CloudWatch Logs Insights 50 log-group limit (`aws-cloudwatch/SKILL.md:177`).
