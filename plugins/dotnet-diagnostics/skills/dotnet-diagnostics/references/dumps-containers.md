# Dumps in Docker and Kubernetes

Contents: requirements; Docker (CoreCLR, NativeAOT, on demand); Kubernetes (pod specs, storage, on demand); verification; non-root, Alpine, SELinux/AppArmor; troubleshooting.

Read this together with dumps.md (CoreCLR) or dumps-nativeaot.md (NativeAOT).

Every change here (capabilities, env vars, volumes, a new image) edits the workload and restarts it. Show the user the change and what it costs (privilege, disk), get a go-ahead, and plan to revert it.

| Need | Tool | Requires |
| --- | --- | --- |
| CoreCLR dump on crash | `DOTNET_DbgEnableMiniDump` env vars | A writable volume |
| NativeAOT dump on crash | Core dumps (`ulimit -c`, host `core_pattern`), or `createdump` + env vars | A writable volume |
| Dump of a running process | `dotnet-dump collect` (CoreCLR), `gcore` (NativeAOT) | `SYS_PTRACE` |
| Getting the file out | `docker cp`, `kubectl cp`, or the volume | |

`dotnet-dump collect` and `gcore` attach with ptrace, so they need the `SYS_PTRACE` capability (and sometimes a seccomp adjustment). Collecting a Heap or Full dump pages in the process's memory: a container near its memory limit can be OOM-killed mid-dump, so raise or lift the limit first.

## Docker

### CoreCLR

```bash
docker run --cap-add=SYS_PTRACE \
  -v /srv/dumps:/dumps \
  -e DOTNET_DbgEnableMiniDump=1 \
  -e DOTNET_DbgMiniDumpType=4 \
  -e DOTNET_DbgMiniDumpName=/dumps/%e_%p_%t.dmp \
  -e DOTNET_EnableCrashReport=1 \
  myapp:1.2.3
```

Compose equivalent: `cap_add: [SYS_PTRACE]`, a `./dumps:/dumps` volume and the same `environment:` keys. Baking the env vars into the Dockerfile works too, but leaves dumps on in every environment that runs the image; prefer setting them at deploy time.

### NativeAOT

Core dumps follow the host's `core_pattern`; a container can't change it without `--privileged`, so configure the pattern on the host (see dumps-nativeaot.md) and raise the core limit:

```bash
docker run --ulimit core=-1 -v /srv/dumps:/dumps myapp:1.2.3
```

If the host pipes cores to systemd-coredump, the dump lands in the host's journal store; fetch it there with `coredumpctl`.

Or ship `createdump` in the image and use the env vars:

```dockerfile
FROM mcr.microsoft.com/dotnet/runtime:10.0 AS createdump
FROM mcr.microsoft.com/dotnet/runtime-deps:10.0
WORKDIR /app
COPY --from=createdump /usr/share/dotnet/shared/Microsoft.NETCore.App/ /tmp/runtime/
RUN find /tmp/runtime -name createdump -exec cp {} /app/ \; && rm -rf /tmp/runtime
COPY --from=build /app .
RUN mkdir -p /dumps
ENTRYPOINT ["./myapp"]
```

Then run with `-e DOTNET_DbgEnableMiniDump=1 -e DOTNET_DbgMiniDumpType=4 -e DOTNET_DbgMiniDumpName=/dumps/%e_%p_%t.dmp`. On .NET 11+, `DOTNET_DbgCreateDumpToolPath=/opt/tools` points at a directory holding `createdump` instead.

### On demand

```bash
docker exec <container> dotnet-dump ps                                 # CoreCLR; tool must be in the image
docker exec <container> dotnet-dump collect -p <PID> -o /dumps/myapp.dmp
docker exec <container> gcore -o /dumps/myapp <PID>                    # NativeAOT; needs gdb in the image
docker cp <container>:/dumps/myapp.dmp ./myapp.dmp
```

To get `dotnet-dump` into an image without the SDK, download the single-file build (`https://aka.ms/dotnet-dump/linux-x64`, or `linux-musl-x64` for Alpine) at build time, check it with `file`, and `COPY` it in; or copy it from an SDK stage in a multi-stage build.

## Kubernetes

### CoreCLR pod settings

```yaml
spec:
  containers:
  - name: myapp
    image: myapp:1.2.3
    securityContext:
      capabilities:
        add: ["SYS_PTRACE"]            # only needed for on-demand dotnet-dump
    env:
    - name: DOTNET_DbgEnableMiniDump
      value: "1"
    - name: DOTNET_DbgMiniDumpType
      value: "4"
    - name: DOTNET_DbgMiniDumpName
      value: /dumps/%e_%p_%t.dmp
    - name: DOTNET_EnableCrashReport
      value: "1"
    volumeMounts:
    - name: dumps
      mountPath: /dumps
  volumes:
  - name: dumps
    emptyDir:
      sizeLimit: 5Gi                   # at least the process's peak memory per expected dump
```

Put the same block under `spec.template.spec` of a Deployment to cover every replica.

### NativeAOT pod settings

```yaml
    command: ["/bin/sh", "-c"]
    args: ["ulimit -c unlimited && exec ./myapp"]
```

with the `/dumps` volume, and a node-level `core_pattern` that writes there; or the `createdump` image above with the env vars (and `DOTNET_DbgCreateDumpToolPath` on .NET 11+).

### Keep dumps across restarts

An `emptyDir` disappears with the pod, and a crash-looping pod is replaced. For crashes, use a PersistentVolumeClaim:

```yaml
  volumes:
  - name: dumps
    persistentVolumeClaim:
      claimName: dump-storage
---
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: dump-storage
spec:
  accessModes: ["ReadWriteOnce"]
  resources:
    requests:
      storage: 20Gi
```

Dumps hold everything in memory, secrets included: restrict access to the volume and delete dumps after analysis.

### On demand

```bash
kubectl exec <pod> -- dotnet-dump ps
kubectl exec <pod> -- dotnet-dump collect -p <PID> -o /dumps/myapp.dmp
kubectl cp <pod>:/dumps/myapp.dmp ./myapp.dmp
```

If the image has no tools, an ephemeral debug container that targets the app container can run them: `kubectl debug -it <pod> --image=mcr.microsoft.com/dotnet/sdk:10.0 --target=myapp --profile=general -- bash`, then install `dotnet-dump` there. The debug container has its own `/tmp`, so the tools may not find the app's diagnostic socket; if `dotnet-dump ps` lists nothing, use a sidecar that shares a `/tmp` volume with the app, or dotnet-monitor. This is a cluster change; ask first.

## Verify

```bash
kubectl exec <pod> -- env | grep DOTNET_Dbg
kubectl exec <pod> -- ls -ld /dumps
kubectl exec <pod> -- sh -c 'ls -la /dumps' # after a crash
docker exec <container> env | grep DOTNET_Dbg
```

## Non-root, Alpine, SELinux and AppArmor

- Non-root containers need a writable dump directory: `RUN mkdir -p /dumps && chown app:app /dumps` in the Dockerfile, or `securityContext.fsGroup` matching the app's group in Kubernetes.
- `createdump`, `dotnet-dump` and automatic crash dumps work on the supported Alpine images; use the `linux-musl-*` tool downloads.
- With SELinux or AppArmor, `SYS_PTRACE` may not be enough. Loosening the profile (`--security-opt label=disable`, `apparmor=unconfined`) is for a short debug session only, with the user's agreement, never a standing production setting.

## Troubleshooting

| Problem | Likely cause | Fix |
| --- | --- | --- |
| `dotnet-dump collect`: permission denied | No `SYS_PTRACE`, or seccomp/LSM blocks ptrace | Add the capability; check the seccomp and SELinux/AppArmor profile |
| No dump after a crash | Directory missing or not writable | Create it in the image or volume; check ownership |
| Core dump not where expected | Host `core_pattern` or systemd-coredump | Configure on the host; use `coredumpctl` there |
| Dump file is 0 bytes or truncated | Volume full, or OOM kill while writing | Raise `sizeLimit` or PVC size; raise the memory limit |
| `createdump` not found | `runtime-deps` or chiseled image | CoreCLR: use `dotnet-dump`; NativeAOT: copy `createdump` in as above |
| `dotnet-dump ps` shows nothing | Different user or `TMPDIR` than the app | Exec as the app's user; set the same `TMPDIR` |
