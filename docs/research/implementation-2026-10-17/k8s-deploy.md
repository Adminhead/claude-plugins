# Batch k8s-deploy report

## Plugins created

| Name | Type | Description (plugin.json) | Sources | Deps |
| --- | --- | --- | --- | --- |
| `kubernetes` | skill | Writes and reviews Kubernetes manifests (probes, resources, RBAC, NetworkPolicy, Pod Security Standards and admission, Jobs, HPA, PDB, Kustomize) and triages failing workloads with read-only kubectl. | archive deploy/skills/kubernetes (base: ECC kubernetes-patterns + wshobson k8s-manifest-generator/k8s-security-policies, MIT); new `references/pod-security.md` from Anthropic-Cybersecurity-Skills implementing-kubernetes-pod-security-standards (Apache-2.0) | none |
| `helm` | skill | Authors, validates and releases Helm charts: values and schema, helpers, dependencies, lint and template checks, helm diff, atomic upgrades, OCI publishing and provenance. | archive deploy/skills/helm incl. scripts/validate-chart.sh (from wshobson helm-chart-scaffolding, MIT) | none |
| `gitops` | skill | Sets up and reviews GitOps delivery with Argo CD or Flux: choosing between them, repo layout, sync policy per environment, and secrets with External Secrets, Sealed Secrets or SOPS. | archive deploy/skills/gitops (from wshobson gitops-workflow, MIT) | none |
| `rollout-plan` | skill | Plans and verifies production rollouts: strategy choice, preflight go/no-go, phased verification signals, numeric rollback criteria and post-deploy follow-up. | archive deploy/skills/rollout (awesome-copilot, ECC, wshobson; all MIT) | none |
| `production-readiness` | skill | Evidence-based ship-or-block review (Blocked, Risky or Caveats) of an application before launch, built from local repo evidence. | archive deploy/skills/production-readiness (ECC production-audit, MIT) + archive deploy/evals/production-readiness-vs-rollout | none |

Each plugin has `LICENSE` (MIT copyright lines + MIT text per upstream; `kubernetes` also carries the full Apache-2.0 text) and `kubernetes` has a `NOTICE` stating the pod-security reference was modified. SKILL.md files end with an "Adapted from ..." line. Long "Not for ..." lists moved from descriptions into the body; skill descriptions are 296-352 chars.

## Changes beyond the copy

- kubernetes: new `references/pod-security.md` (levels/modes, choosing a level, labels and version pinning, staged rollout with server dry run, full baseline and restricted control tables, compliant pod spec, AdmissionConfiguration defaults/exemptions, diagnosing rejections, PSP migration). The old PSS section in `network-policy.md` was moved there (that file now covers NetworkPolicy only). Checklist and reference list updated. The upstream kubescape `curl | bash` CI workflow, scripts (agent.py, process.py) and the CIS/MITRE mappings were not ported.
- helm: `release.md` now covers Helm 4 helm-diff install (signed tarball; git URL can't be verified; never `--verify=false`), Helm 4 `--wait` semantics (bare = watcher, omitted = hookOnly), `--atomic` deprecated in favour of `--rollback-on-failure`, `--server-side`/`--force-conflicts`. diff/atomic/OCI/provenance were already there. `validate-chart.sh` reviewed line by line (read-only, safe); one fix: detect kubeconform with `kubeconform -v` rather than `command -v`, because a mise shim with no version set exists but fails (this happened on this machine and made the script report FAIL).
- gitops: Flux vs Argo chooser already present (kept). External Secrets note updated: `external-secrets.io/v1` GA since ESO 1.0, `v1beta1` deprecated since 0.17, plus a command to check what the operator serves.
- rollout-plan: renamed from `rollout`; cross-refs to `gh-actions`, `db-schema-design`, `production-readiness`, `gitops`.
- production-readiness: `security:audit` -> `security-scan`, `deploy:rollout` -> `rollout-plan`. Eval moved to `plugins/production-readiness/evals/`; graders now match `(production-readiness:)?production-readiness` and `(rollout-plan:)?rollout-plan`.

## Verification

- `claude plugin validate --strict plugins/<name>`: passed for all five.
- `.claude/skills/skill-authoring/scripts/validate_skill.py`: all five valid.
- `validate-chart.sh`: `bash -n` and shellcheck clean; ran it on a fresh `helm create demo` chart with Helm v4.3.0: lint and template PASS, kubeconform SKIP (not installed), exit 0.
- grep for `deploy:`, `security:`, `db:`, `coding-core:`, `github:`, `codegraph`, `claude-mem`, `Efficient `, `infra:`: no old names left (only false positives such as "Pre-deploy:").
- Version facts checked on the web (Context7 not used): helm.sh docs for helm upgrade and helm plugin install (Helm 4.3.1); databus23/helm-diff README; kubernetes.io Pod Security Standards, Pod Security Admission and enforce-standards-admission-controller pages (v1.37); external-secrets.io ExternalSecret API page and ESO 0.17 deprecation notes; fluxcd.io HelmRelease page (helm.toolkit.fluxcd.io/v2, source.toolkit.fluxcd.io/v1, Flux 2.9 docs).

## Deviations

- The archived kubernetes skill had no ECC attribution in the files. I added it from `archive/docs/research/third-party-skills-review.md` and `docs/research/inventory-2026-10-17/ecc.md`, which name ECC kubernetes-patterns as the base. I did the same for the other four skills, using their recorded sources.
- `kubernetes` LICENSE puts the MIT notices and the Apache-2.0 text in one file instead of two license files.

## Unverified / TODO

- The eval was not run (`claude plugin eval` not executed). It needs the skills registered.
- The versioned helm-diff tarball URL pattern (`releases/download/v<version>/helm-diff-<os>-<arch>.tgz`) is inferred from the README's `latest` URL. Confirm it on the releases page.
- Argo CD `argoproj.io/v1alpha1` and the Flux Kustomization/GitRepository `v1` APIs were kept from the archive without a fresh check (only HelmRelease and the source APIs were rechecked).
- Housekeeping: I ran a `sed -i` on `plugins/*/LICENSE` to fix an ECC URL. It only matches my own generated string, so other plugins' LICENSE content is unchanged, but their file mtimes were touched.

## Follow-ups

- Register the five plugins and add `kubernetes`, `helm`, `gitops` to `kubernetes-meta`. `rollout-plan` and `production-readiness` are direct installs.
- The `docker` skill (archive deploy) is referenced by name from kubernetes and helm. It isn't in this batch, so make sure another batch ports it.
