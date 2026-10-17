# Batch iac: implementation report

## Plugins created

| Name | Type | Description (exactly as plugin.json) | Sources | Deps |
| --- | --- | --- | --- | --- |
| `terraform` | skill | Terraform, OpenTofu and Terragrunt skill: safe plan and saved-plan apply, plan review, state and refactoring blocks, Terratest, and security scanning with Trivy, Checkov and OPA. | archive infra/skills/terraform (+4 refs) and its 5 terraform evals; new `references/terratest.md` from awesome-copilot terratest-module-testing.agent.md (MIT); new `references/security-scanning.md` from Anthropic-Cybersecurity-Skills auditing-terraform-infrastructure-for-security (Apache-2.0; LICENSE + NOTICE) | none |
| `ansible` | skill | Ansible skill: playbooks, roles and inventories with idempotency proof, check-mode limits, validate hooks, vault or sops secrets, and ansible-lint style. | archive infra/skills/ansible; archive infra `ansible-routing` eval | none |
| `docker` | skill | Docker skill: Dockerfiles, Compose and .dockerignore with multi-stage builds, non-root hardened runtime, daemon.json hardening, secret handling and container debugging. | archive deploy/skills/docker (+3 refs); new `references/daemon-hardening.md` from Anthropic-Cybersecurity-Skills hardening-docker-daemon-configuration (Apache-2.0; LICENSE + NOTICE) | none |
| `bash` | skill | Bash skill: defensive scripts with strict mode and its holes, quoting, trap cleanup, argument parsing, ShellCheck configuration and Bats tests. | archive coding-shell/skills/bash (+4 refs) and its `bash-vs-coding` eval; deltas from wshobson shell-scripting (MIT, LICENSE) | none |
| `cloud-ops-guard` | classic hooks.json (PreToolUse Bash, runs `bun`) | PreToolUse guard (needs bun) that denies unsafe tofu, terraform and terragrunt applies, destroys, imports and state surgery, and gates subagent plan and aws calls. | archive infra hooks/hooks.json + scripts/ (cloud-ops-guard.ts, shell/walk.ts, vendor/unbash, tests/check.sh, tests/fuzz.ts) | none |
| `devops` | agent | Read-only-by-default infrastructure agent that reviews, validates and plans Terraform, Ansible, Docker, Kubernetes, Helm and GitOps changes using the matching skills. | archive crew/agents/devops.md, rewritten | none |

## Validation and tests

- `claude plugin validate --strict plugins/<name>` for all six: passed.
- `python3 .claude/skills/skill-authoring/scripts/validate_skill.py plugins/<s>/skills/<s>` for terraform, ansible, docker, bash: all valid.
- `bash plugins/cloud-ops-guard/scripts/tests/check.sh`: passed=269 failed=0 (includes 8,824 fuzz variants, none allowed; walker copies byte-identical to `plugins/bash-danger-guard/hooks/`).
- `cd plugins/cloud-ops-guard && bun test` (new `scripts/cloud-ops-guard.spec.ts` wraps check.sh): 1 pass, 0 fail. bun 1.4.3.
- grep for codegraph, claude-mem, coding-core:, github:, github-admin, infra:, deploy:, coremods, coding-shell, crew, Efficient: no old names left (only hit is the word "Bridgecrew" in a scanner note).
- Evals were moved and their grader regexes renamed to `terraform:terraform`, `ansible:ansible`, `bash:bash`, `coding:coding`, `kubernetes:kubernetes`. Not run (`claude plugin eval` costs money).

## Changes and deviations

- **terraform**: description cut to 359 chars, "Not for" moved into the body with the new names. Testing section now points at the two new references. Security reference: tfsec replaced by `trivy config`, Terrascan dropped, Rego rewritten to v1 syntax (`deny contains msg if`) against plan JSON `resource_changes` (upstream examples used pre-1.0 syntax and HCL-shaped input against plan JSON, which would not have matched). CI example uses SHA-pinned actions. Added a supply-chain note on the March 2026 Trivy compromise (trivy-action and setup-trivy tags force-pushed; Trivy 0.69.4 to 0.69.6 malicious; GHSA-69fq-xp46-6x23). Dropped `--bc-api-key` usage and the upstream state-grepping loop.
- **ansible-routing eval** moved to the `ansible` plugin, not terraform. The plan said "6 trigger evals" for terraform, but that sixth eval tests ansible routing. Its `not-terraform` grader, and terraform's `not-kubernetes` graders, can only fail when the other plugin is loaded in the same eval run.
- **docker**: daemon reference rewritten, not copied. Content Trust guidance replaced: DCT is retired and Notary v1 shuts down on 2026-12-08 (docs.docker.com/retired), so the reference points to Cosign or Notation. Rootless install uses `dockerd-rootless-setuptool.sh` rather than `curl | sh`. Added gotchas: userns-remap creates a fresh store and conflicts with host namespaces and `--privileged`, the `hosts` key conflicts with systemd `-H fd://`, live-restore does not support Swarm, and `userland-proxy:false` can break hairpin. SSH is preferred over a TCP socket. The gVisor runtime block, Terrascan-style compliance tables and docker-bench run-by-default were dropped.
- **bash**: the archive already covered all three points named in the brief: the env shebang, the trap under `set -u` (`tmpdir=''` before the trap) and the set -e holes table. wshobson's versions are weaker and partly wrong (a nonexistent `skip_if`, overwriting `$TMPDIR`, installing bats from npm). Added three real deltas: a background-job/`wait` row in the set -e holes table, a `flock` lock for cron jobs in patterns.md, and the `--report-formatter junit` line in bats.md. Fixed the `# Efficient Bash` heading and the old cross-references. MIT LICENSE added for the wshobson-derived points.
- **cloud-ops-guard**: logic unchanged except for a new 64 KiB command-length bound (asks when a longer command names a guarded tool), which has two new check.sh cases. The walker-sync check now compares against `../bash-danger-guard/hooks/` and is skipped when that plugin is absent, where it used to compare against coremods. One comment was renamed (`infra:terraform` became "the terraform skill"). I reviewed the script line by line: it fails toward `ask`, never echoes the command, and checks transcript paths for traversal.
- **devops**: rewritten as read-only by default. It switches to change mode only when the brief asks for an edit, and has no commit or push unless told to. Explicit `tools` allowlist: Read, Grep, Glob, Bash, Skill, Edit, Write and five codebase-memory tools. No codegraph, coremods MCP, Agent or chrome tools. It routes to `terraform:terraform`, `ansible:ansible`, `docker:docker`, `kubernetes:kubernetes`, `helm:helm`, `gitops:gitops`, `bash:bash` and `gh-actions:gh-actions`, and documents the `ALLOW: cloud-ops` marker. The read-only default is enforced only by the prompt; Edit and Write stay available for change mode.

## Unverified / TODO

- Terraform 1.16, OpenTofu 1.13 and Terragrunt 1.1 facts in the archived terraform SKILL.md, and the ansible-core 2.21 and ansible-lint 26.9 facts in ansible, were checked by the archive on 2026-10-02 and 2026-10-10. I did not re-check them.
- Terratest names (`InitAndPlanAndShowWithStruct`, `RequirePlannedValuesMapKeyExists`, `InitAndPlanWithExitCode`, `TerraformBinary`) come from memory plus the terratest docs index. Context7 confirmed only the test_structure/SKIP_ behaviour.
- Checked with Context7 or the web: trivy config flags, plan scanning and ignore syntax; conftest Rego v1 and the `main` namespace; Docker userns-remap limits and the daemon.json/systemd `hosts` conflict; DCT retirement; the Trivy compromise advisory.
- Trigger evals not run.

## Suggested follow-ups

- Coordinator: register the six plugins and add them to `iac-meta`, with `bash-language-server@claude-code-lsps` as the plan says.
- Add `devops` to `readonly-agent-gate`'s configurable agent list if the read-only default should be enforced for Bash.
- Write the walker sync script (plan decision 10), so cloud-ops-guard, bash-danger-guard and readonly-agent-gate share one canonical copy. check.sh already compares against bash-danger-guard.
- Run `claude plugin eval` on terraform, ansible and bash once registered.
