# ServiceAccounts and RBAC

## Pick the pattern

- **The app never calls the Kubernetes API (most apps).** Give it a dedicated ServiceAccount with `automountServiceAccountToken: false`, and set the same on the pod. No Role is needed. A compromised container then has no API credential.
- **The app calls the API (operators, controllers, config watchers).** Mount the token and bind a namespace-scoped Role listing only the verbs and resources it uses.

```yaml
apiVersion: v1
kind: ServiceAccount
metadata:
  name: <app>
  namespace: <ns>
automountServiceAccountToken: false
---
apiVersion: rbac.authorization.k8s.io/v1
kind: Role
metadata:
  name: <app>
  namespace: <ns>
rules:
  - apiGroups: [""]
    resources: [configmaps]
    verbs: [get, list, watch]
  - apiGroups: [""]
    resources: [secrets]
    resourceNames: [<app>-credentials]
    verbs: [get]
---
apiVersion: rbac.authorization.k8s.io/v1
kind: RoleBinding
metadata:
  name: <app>
  namespace: <ns>
subjects:
  - kind: ServiceAccount
    name: <app>
    namespace: <ns>
roleRef:
  kind: Role
  name: <app>
  apiGroup: rbac.authorization.k8s.io
```

For the token pattern, set `automountServiceAccountToken: true` on the ServiceAccount and the pod.

## Rules

- Use `Role` and `RoleBinding` unless the app needs cluster-wide or non-namespaced resources. Reach for `ClusterRole` last.
- Name resources (`resourceNames`) and list explicit verbs. Avoid `*` in `verbs`, `resources`, or `apiGroups`.
- Never bind an application ServiceAccount to `cluster-admin`.
- Don't bind to the `default` ServiceAccount. Every pod without an explicit account shares it.
- `get`, `list`, and `watch` on Secrets expose every Secret value in scope. Treat them as high-risk grants.
- A subject that can create pods, or can create RoleBindings, can often escalate. Review those verbs closely.

## Audit with read-only commands

```sh
kubectl auth can-i --list --as system:serviceaccount:<ns>:<sa> -n <ns>
kubectl auth can-i create pods --as system:serviceaccount:<ns>:<sa> -n <ns>
kubectl get rolebindings,clusterrolebindings -A -o wide
```

`--as` needs the caller to hold impersonation rights. If it is denied, review the Role and binding manifests instead.
