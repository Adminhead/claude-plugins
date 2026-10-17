# Pod Security Standards and Pod Security Admission

Adapted from mukul975/Anthropic-Cybersecurity-Skills `implementing-kubernetes-pod-security-standards` (Apache-2.0; modified, see `NOTICE` in the plugin root). Control lists checked against the Kubernetes v1.37 Pod Security Standards and Pod Security Admission pages in October 2026. Recheck them for the cluster's version before declaring a manifest compliant.

Contents: levels and modes, choosing a level, namespace labels, rolling out on an existing namespace, the control tables, a compliant pod spec, cluster defaults and exemptions, diagnosing a rejection, migrating from PodSecurityPolicy.

## Levels and modes

Pod Security Admission (PSA) is built into the API server and stable from Kubernetes 1.25. It replaced PodSecurityPolicy, which was removed in 1.25. Don't write PodSecurityPolicy objects.

| Level | Purpose |
| --- | --- |
| `privileged` | No restrictions. For system components that need host access (CNI, storage drivers, node agents). |
| `baseline` | Blocks known privilege escalations: host namespaces, privileged containers, extra capabilities, hostPath. |
| `restricted` | Current hardening practice: everything in baseline, plus non-root, no privilege escalation, `drop: [ALL]`, seccomp required, limited volume types. |

| Mode | On a violation |
| --- | --- |
| `enforce` | Rejects the Pod. Applies to Pod objects only. |
| `audit` | Allows it and adds an audit annotation to the API audit log entry. Also checks workload templates. |
| `warn` | Allows it and returns a warning to the client. Also checks workload templates (Deployments, Jobs, and so on). |

## Choosing a level

| Namespace holds | enforce | warn and audit |
| --- | --- | --- |
| Application workloads | `restricted` | `restricted` |
| Workloads that can't meet restricted yet (legacy images that run as root) | `baseline` | `restricted`, with a ticket to close the gap |
| Cluster add-ons that need host access | `privileged`, in a dedicated namespace | `baseline` or `restricted`, to see what each pod needs |

Default to `restricted` for anything new. Give a workload a lower level only when a named control blocks it, and put it in its own namespace so the exception doesn't cover its neighbours.

## Namespace labels

```yaml
apiVersion: v1
kind: Namespace
metadata:
  name: <ns>
  labels:
    pod-security.kubernetes.io/enforce: restricted
    pod-security.kubernetes.io/enforce-version: v1.37   # or latest
    pod-security.kubernetes.io/audit: restricted
    pod-security.kubernetes.io/warn: restricted
```

- Each mode takes a level label and an optional `<mode>-version` label: a Kubernetes minor version (`v1.37`) or `latest`. A pinned version keeps that release's rules after a cluster upgrade, so new controls don't start rejecting pods unannounced. `latest` follows the cluster.
- Pin `enforce-version` and leave `warn-version` at `latest`. Warnings then preview what the next upgrade's rules would reject.
- List the current labels: `kubectl get ns -L pod-security.kubernetes.io/enforce,pod-security.kubernetes.io/warn`.

## Rolling out on an existing namespace

1. Preview, which changes nothing: `kubectl label --dry-run=server --overwrite ns <ns> pod-security.kubernetes.io/enforce=restricted`. The API server lists each existing pod that would violate the level and the controls it fails.
2. Set `warn` and `audit` to `restricted` (ask first; labelling changes the cluster). Deploys now print warnings without being blocked.
3. Fix the reported workloads with the control tables below. Re-run the dry run until it reports nothing.
4. Set `enforce` (ask first). Do it per namespace, starting with the least critical.

Existing pods keep running when `enforce` is added. The rule bites on the next pod creation, for example the next rollout, node drain, or eviction, which is why the dry run in step 1 matters.

## Baseline controls

A pod that fails any control on any container (including init and ephemeral containers) fails the level.

| Control | Allowed |
| --- | --- |
| HostProcess (Windows) | `windowsOptions.hostProcess` unset or `false` |
| Host namespaces | `hostNetwork`, `hostPID`, `hostIPC` unset or `false` |
| Privileged containers | `securityContext.privileged` unset or `false` |
| Capabilities | `capabilities.add` unset, or only `AUDIT_WRITE`, `CHOWN`, `DAC_OVERRIDE`, `FOWNER`, `FSETID`, `KILL`, `MKNOD`, `NET_BIND_SERVICE`, `SETFCAP`, `SETGID`, `SETPCAP`, `SETUID`, `SYS_CHROOT` |
| HostPath volumes | No `hostPath` volumes |
| Host ports | `hostPort` unset or `0` |
| Host probes and lifecycle hooks (1.34+) | `host` unset or `""` in `httpGet` and `tcpSocket` probes and in `postStart` and `preStop` hooks |
| AppArmor | `appArmorProfile.type` unset, `RuntimeDefault`, or `Localhost` (never `Unconfined`) |
| SELinux | `seLinuxOptions.type` unset, `container_t`, `container_init_t`, `container_kvm_t`, or `container_engine_t`; `user` and `role` unset |
| `/proc` mount | `procMount` unset or `Default` |
| Seccomp | `seccompProfile.type` unset, `RuntimeDefault`, or `Localhost` (never `Unconfined`) |
| Sysctls | Only the safe set: `kernel.shm_rmid_forced`, `net.ipv4.ip_local_port_range`, `net.ipv4.ip_unprivileged_port_start`, `net.ipv4.tcp_syncookies`, `net.ipv4.ping_group_range`, plus newer additions by version (`ip_local_reserved_ports` 1.27; `tcp_keepalive_*` and `tcp_fin_timeout` 1.29; `tcp_rmem` and `tcp_wmem` 1.32; `tcp_slow_start_after_idle` and `tcp_notsent_lowat` 1.37) |

## Restricted controls (in addition to baseline)

| Control | Required |
| --- | --- |
| Volume types | Only `configMap`, `csi`, `downwardAPI`, `emptyDir`, `ephemeral`, `persistentVolumeClaim`, `projected`, `secret` |
| Privilege escalation | `allowPrivilegeEscalation: false` on every container (Linux) |
| Non-root | `runAsNonRoot: true` at pod level, or on every container |
| Non-root user | `runAsUser` unset or non-zero |
| Seccomp | `seccompProfile.type` set to `RuntimeDefault` or `Localhost`, at pod level or on every container. Unset fails. (Linux) |
| Capabilities | `capabilities.drop` includes `ALL`; `add` is unset or only `NET_BIND_SERVICE` (Linux) |

`readOnlyRootFilesystem: true` is not part of restricted, but set it anyway where the app allows, with `emptyDir` mounts for the paths it writes.

## A restricted-compliant pod spec

```yaml
spec:
  automountServiceAccountToken: false
  securityContext:
    runAsNonRoot: true
    runAsUser: 10001
    runAsGroup: 10001
    fsGroup: 10001
    seccompProfile: { type: RuntimeDefault }
  containers:
    - name: app
      image: <registry>/<image>@sha256:<digest>
      securityContext:
        allowPrivilegeEscalation: false
        readOnlyRootFilesystem: true
        capabilities: { drop: [ALL] }
      volumeMounts:
        - { name: tmp, mountPath: /tmp }
  volumes:
    - name: tmp
      emptyDir: { sizeLimit: 100Mi }
```

- `runAsNonRoot: true` with an image whose `USER` is a name rather than a numeric UID fails at container start (the kubelet can't verify a name is non-root). Set a numeric `runAsUser`, or fix the Dockerfile to `USER 10001`.
- An app that binds a port below 1024 needs `NET_BIND_SERVICE` added back, or better, a high port behind the Service.
- Init and sidecar containers need the same `securityContext`. They are the usual reason a fixed workload still fails.

## Cluster defaults and exemptions

The API server reads cluster-wide defaults and exemptions from an `AdmissionConfiguration` file passed with `--admission-control-config-file`. That is control-plane config, so on a managed cluster the provider may not expose it.

```yaml
apiVersion: apiserver.config.k8s.io/v1
kind: AdmissionConfiguration
plugins:
  - name: PodSecurity
    configuration:
      apiVersion: pod-security.admission.config.k8s.io/v1
      kind: PodSecurityConfiguration
      defaults:            # used when a namespace has no label for a mode
        enforce: baseline
        enforce-version: latest
        audit: restricted
        audit-version: latest
        warn: restricted
        warn-version: latest
      exemptions:
        usernames: []
        runtimeClasses: []
        namespaces: []
```

- Without this file every unlabelled namespace is `privileged`. Label every namespace explicitly, or set defaults here.
- An exemption skips enforce, audit, and warn entirely. Prefer a `privileged` namespace label for a system namespace over an exemption, because the label is visible on the namespace.
- Don't exempt controller service accounts such as `system:serviceaccount:kube-system:replicaset-controller`. That exempts everyone who can create a Deployment.
- Exempting a user only covers pods that user creates directly. Most pods are created by controllers.

## Diagnosing a rejection

- `enforce` checks Pods, not Deployments. A Deployment is accepted and then produces no pods. Read the ReplicaSet's events: `kubectl describe rs -n <ns> -l <selector>`. The `FailedCreate` event names the violated controls, such as `allowPrivilegeEscalation != false` or `seccompProfile`.
- Cluster-wide: `kubectl get events -A --field-selector reason=FailedCreate`.
- Test a manifest against the namespace without creating anything: `kubectl apply --dry-run=server -f <file>`. Warnings print for `warn`, errors for `enforce`.
- The API server exposes `pod_security_evaluations_total`, `pod_security_exemptions_total`, and `pod_security_errors_total` for dashboards.

## Migrating from PodSecurityPolicy

Only clusters older than 1.25 still have PSPs, so this is part of an upgrade.

1. Map each PSP to the closest level: a PSP that allows host access maps to `privileged`, one that blocks escalation but allows root maps to `baseline`, and a fully locked-down one maps to `restricted`.
2. Label each namespace with `warn` and `audit` at the target level while the PSPs are still active, and fix what they report.
3. Add `enforce` per namespace, then remove the PSPs and their RBAC bindings, then disable the PodSecurityPolicy admission plugin before upgrading to 1.25.
4. A PSP that mutated pods (default seccomp profile, default `runAsUser`) has no PSA equivalent. Write those fields into the manifests, or use a mutating policy engine.

For finer rules than three levels (allowed registries, required labels, per-workload exceptions), add a policy engine such as Kyverno or Gatekeeper, or a `ValidatingAdmissionPolicy`, alongside PSA rather than instead of it.
