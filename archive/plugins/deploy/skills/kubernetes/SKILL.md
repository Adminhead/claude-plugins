---
name: kubernetes
description: Write and review Kubernetes manifests (Deployments, Services, probes, resources, RBAC, NetworkPolicy, Pod Security Standards, Jobs, HPA, PDB, Kustomize) and triage failing workloads with read-only kubectl. Use when creating or changing manifests, hardening a namespace or workload, validating YAML, or diagnosing CrashLoopBackOff, OOMKilled, ImagePullBackOff, or Pending pods. Not for Helm charts (deploy:helm), Argo CD or Flux setup (deploy:gitops), Dockerfiles (deploy:docker), or rollout planning (deploy:rollout).
---

# Kubernetes manifests and triage

Write manifests that pass the cluster's admission rules and fail safely, and diagnose workloads without changing the cluster. Take the cluster version, conventions, and existing manifests from the repo and `kubectl version` before choosing fields.

## Safety contract

- Inspection is read-only by default. Allowed without asking: `kubectl get`, `describe`, `logs`, `events`, `top`, `explain`, `api-resources`, `auth can-i`, `diff`, and `apply --dry-run=server`.
- Ask before any command that changes the cluster: `apply`, `create`, `patch`, `delete`, `scale`, `rollout undo|restart`, `drain`, `cordon`, `label`, and `exec` into a production pod.
- State the context and namespace (`kubectl config current-context`, `-n <ns>`) before the first command. Pass `-n` and `--context` explicitly so a command can't land on the wrong cluster.
- Don't print Secret values. `kubectl get secret -o yaml` and `-o jsonpath` on a Secret dump credentials into the transcript. Check that a Secret exists and has the expected keys (`kubectl describe secret`) instead.

## Writing a manifest

1. Read the neighbouring manifests and any Kustomize base or Helm values the workload already uses. Match labels, naming, and namespace layout.
2. Start from the production Deployment in [deployment](references/deployment.md). Remove what the workload doesn't need.
3. Set these on every long-running workload:
   - A pinned image tag or digest, never `:latest`.
   - `resources.requests` for CPU and memory. Requests drive scheduling, and an HPA computes utilization against them.
   - A memory limit. Exceeding it gets the container OOM-killed, so set it from measured usage. A CPU limit throttles the container, so set one only to cap noisy neighbours.
   - Probes chosen from the table in [probes](references/probes.md).
   - The restricted-profile `securityContext` (non-root, no privilege escalation, `drop: [ALL]`, `seccompProfile: RuntimeDefault`). See [network-policy](references/network-policy.md) for the namespace labels that enforce it.
   - A dedicated ServiceAccount with `automountServiceAccountToken: false` unless the app calls the API. See [rbac](references/rbac.md).
4. Add a PodDisruptionBudget and an HPA where availability or load calls for them, and use [jobs](references/jobs.md) for batch work.
5. Check the apiVersion against the cluster, not memory: `kubectl api-resources` and `kubectl explain <kind>.spec`.

## Validate before applying

Run these in order, cheapest first:

```sh
kubeconform -strict -summary -kubernetes-version <cluster-version> <path>   # schema check, offline
kubectl apply --dry-run=server -f <path>                                    # admission and defaulting, no persist
kubectl diff -f <path>                                                      # what would change
```

- Use `kubeconform`, not the unmaintained `kubeval`. It validates against JSON schemas only, so it can't catch what the API server enforces. The server-side dry run covers that gap.
- Custom resources need extra schemas. Point `-schema-location` at a CRD schema catalog or the CRD's own schema, or pass `-ignore-missing-schemas` and say that those resources went unchecked.
- `kube-linter lint <path>` and `kube-score score <path>` add best-practice checks (missing limits, probes, security context). They run locally. Treat their output as findings to weigh, since some rules won't fit every workload.
- For Helm output, pipe `helm template` into `kubeconform` (see `deploy:helm`).

## Environments with Kustomize

Use Kustomize (built into `kubectl`) for per-environment variation of plain manifests. Use Helm (`deploy:helm`) when you distribute a configurable package.

- Layout: `base/` holds the manifests and a `kustomization.yaml`. `overlays/<env>/kustomization.yaml` lists `resources: [../../base]` plus `patches`, `images`, and `replicas`.
- Render with `kubectl kustomize overlays/<env>` and apply with `kubectl apply -k overlays/<env>`. Render and read the output before applying.
- Keep secrets out of overlays. Use an external secret store or SOPS (see `deploy:gitops`).

## Secrets and config

- A Secret's values are base64-encoded, not encrypted. Enable encryption at rest on the cluster, and keep Secret manifests out of Git unless they are sealed or sourced from an external store (`deploy:gitops`).
- Put non-sensitive settings in a ConfigMap, and mount files with `readOnly: true`. Never put credentials in a ConfigMap.
- Env vars from `secretKeyRef` are easy but visible to anything that can read the pod spec's environment. Mount a Secret as a file for sensitive values.

## Triage

Follow [triage](references/triage.md) to diagnose a failing workload. The usual path is `get pods` for the state, `describe pod` for events and last-state exit codes, and `logs --previous` for a crashed container.

## Review checklist

- [ ] Image pinned; requests set; memory limit based on measurement.
- [ ] Startup, liveness, and readiness probes fit the app, and liveness doesn't depend on downstream services.
- [ ] Restricted `securityContext`; dedicated ServiceAccount; no `cluster-admin` bindings for apps.
- [ ] NetworkPolicy default-deny plus explicit allows, on a cluster whose CNI enforces policy.
- [ ] PDB and 2 or more replicas for anything that must stay up during a node drain.
- [ ] `kubeconform` and a server-side dry run both pass.

## References

- [deployment](references/deployment.md): read when writing a Deployment, Service, Ingress, or HPA and PDB.
- [probes](references/probes.md): read when choosing probes or tuning failure thresholds and startup time.
- [rbac](references/rbac.md): read when creating ServiceAccounts, Roles, or bindings, or auditing permissions.
- [network-policy](references/network-policy.md): read when isolating namespaces or enforcing Pod Security Standards.
- [jobs](references/jobs.md): read when writing a Job or CronJob.
- [triage](references/triage.md): read when a pod is crashing, pending, or failing to pull an image.
