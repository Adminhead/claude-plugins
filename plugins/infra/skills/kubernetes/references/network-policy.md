# NetworkPolicy and Pod Security Standards

## Pod Security Standards (PSS)

Pod Security Admission replaced PodSecurityPolicy, which was deprecated in Kubernetes 1.21 and removed in 1.25. Pod Security Admission is stable from 1.25. Don't write PodSecurityPolicy objects.

Three levels apply per namespace: `privileged` (no restrictions), `baseline` (blocks known privilege escalations), and `restricted` (current hardening best practice). Three modes choose what happens on a violation: `enforce` rejects the pod, `audit` records an audit annotation, and `warn` returns a user-facing warning.

```yaml
apiVersion: v1
kind: Namespace
metadata:
  name: <ns>
  labels:
    pod-security.kubernetes.io/enforce: restricted
    pod-security.kubernetes.io/enforce-version: latest
    pod-security.kubernetes.io/warn: restricted
    pod-security.kubernetes.io/audit: restricted
```

- Roll out in stages on an existing namespace. Set `warn` and `audit` to `restricted` first, fix the reported workloads, then add `enforce`. A dry run shows what would be rejected: `kubectl label --dry-run=server --overwrite ns <ns> pod-security.kubernetes.io/enforce=restricted`.
- `enforce` applies to pods, not to Deployments. A Deployment can be created and then fail to produce pods, so look at the ReplicaSet's events (`kubectl describe rs`) when pods are missing.
- Restricted requires, among other things: `runAsNonRoot: true`, `allowPrivilegeEscalation: false`, `seccompProfile.type` of `RuntimeDefault` or `Localhost`, and no added capabilities beyond the allowed minimum (drop `ALL`). It also limits volume types, which excludes `hostPath`.
- Pin `enforce-version` to a Kubernetes minor version when you need stable behavior across cluster upgrades. `latest` follows the cluster.
- Don't exempt controller service accounts from admission.

Check the full control list in the current Pod Security Standards page for the cluster's version before declaring a manifest compliant.

## NetworkPolicy

A NetworkPolicy has no effect unless the cluster's network plugin (CNI) enforces it. Confirm the CNI supports NetworkPolicy before relying on one. Check the CNI's docs, since the API server accepts the object either way.

Policies are additive. A connection is allowed if any policy allows it, and the source's egress policy and the destination's ingress policy must both allow it.

Start with default deny, then allow what is needed:

```yaml
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: default-deny-all
  namespace: <ns>
spec:
  podSelector: {}
  policyTypes: [Ingress, Egress]
---
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: allow-dns
  namespace: <ns>
spec:
  podSelector: {}
  policyTypes: [Egress]
  egress:
    - to:
        - namespaceSelector:
            matchLabels:
              kubernetes.io/metadata.name: kube-system
      ports:
        - { protocol: UDP, port: 53 }
        - { protocol: TCP, port: 53 }
---
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: allow-frontend-to-backend
  namespace: <ns>
spec:
  podSelector:
    matchLabels:
      app.kubernetes.io/name: backend
  policyTypes: [Ingress]
  ingress:
    - from:
        - podSelector:
            matchLabels:
              app.kubernetes.io/name: frontend
      ports:
        - { protocol: TCP, port: 8080 }
```

- Default-deny egress also blocks DNS, so add the DNS allow in the same change. Restrict it to the cluster DNS pods when your DNS deployment has a stable label.
- Select namespaces with the automatic `kubernetes.io/metadata.name` label. A hand-made `name:` label exists only if someone added it.
- Allow ingress from the ingress controller's namespace to the pods it fronts, or default deny breaks external traffic.
- Test an allow and a deny after applying. Use a throwaway pod in the namespace, with the user's approval, since it creates a resource.
