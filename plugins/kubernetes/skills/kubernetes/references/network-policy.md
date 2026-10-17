# NetworkPolicy

Pod Security Standards and namespace labels are in [pod-security](pod-security.md).

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
