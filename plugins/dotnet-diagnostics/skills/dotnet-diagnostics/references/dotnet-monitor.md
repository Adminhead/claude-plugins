# dotnet-monitor

Contents: when to use; install; Kubernetes sidecar; auth; REST calls.

An HTTP API for collecting traces, dumps, logs and metrics from .NET processes, built for containers. Supports modern .NET (not .NET Framework); no tools needed in the app image. Current major version: 10 (checked October 2026; confirm the tag at mcr.microsoft.com before pinning).

Prefer console tools (`dotnet-trace`, `dotnet-dump`) when you can exec into the container; they need no sidecar or auth. Use dotnet-monitor when there is no console access or it is already deployed.

## Install

```bash
dotnet tool install --global dotnet-monitor     # host install
docker pull mcr.microsoft.com/dotnet/monitor:10  # container image; pin a full version in manifests
```

## Kubernetes sidecar (listen mode)

Adding the sidecar changes the Deployment and restarts its pods: show the diff to the user and get a go-ahead.

```yaml
spec:
  template:
    spec:
      volumes:
      - name: diag
        emptyDir: {}
      - name: monitor-key
        secret:
          secretName: dotnet-monitor-key
      containers:
      - name: app
        image: myapp:1.2.3
        env:
        - name: DOTNET_DiagnosticPorts
          value: /diag/dotnet-monitor.sock     # suspends startup until monitor connects; append ,nosuspend to avoid that
        volumeMounts:
        - name: diag
          mountPath: /diag
      - name: monitor
        image: mcr.microsoft.com/dotnet/monitor:10
        args: ["collect"]
        env:
        - name: DOTNETMONITOR_DiagnosticPort__ConnectionMode
          value: Listen
        - name: DOTNETMONITOR_Storage__DefaultSharedPath
          value: /diag                          # socket and dump temp folder
        - name: DOTNETMONITOR_Urls
          value: https://localhost:52323       # keep HTTPS and loopback in production
        - name: DOTNETMONITOR_Metrics__Endpoints
          value: http://+:52325                # Prometheus scrape endpoint
        volumeMounts:
        - name: diag
          mountPath: /diag
        - name: monitor-key
          mountPath: /etc/dotnet-monitor        # key-per-file config; rotations apply without restart
          readOnly: true
        resources:
          limits: { cpu: 250m, memory: 256Mi }
```

The image's default artifact URL is `https://+:52323`; the metrics URL defaults to `http://localhost:52325`.

## Auth

API key auth is on by default. Generate a key and store the subject and public key in a Secret; keep the bearer token on the operator's side.

```bash
dotnet-monitor generatekey --output Text     # prints the bearer token, Subject and PublicKey
kubectl create secret generic dotnet-monitor-key \
  --from-literal=Authentication__MonitorApiKey__Subject='<subject>' \
  --from-literal=Authentication__MonitorApiKey__PublicKey='<public key>' \
  --dry-run=client -o yaml | kubectl apply -f -
```

Outside Kubernetes, the same settings are the env vars `DOTNETMONITOR_Authentication__MonitorApiKey__Subject` and `DOTNETMONITOR_Authentication__MonitorApiKey__PublicKey`. Keys expire after 7 days by default (`generatekey --expiration`).

- Never use `--no-auth` on production workloads: anyone who reaches the port can take dumps containing secrets. Use it only for a short-lived, isolated debug session.
- Bind to localhost and reach the API with `kubectl port-forward`, not a public Service.
- `--temp-apikey` prints a key for one run, handy for a quick local session.

## REST calls

```bash
kubectl port-forward pod/<pod> 52323:52323
TOKEN=...   # bearer token from generatekey
H="Authorization: Bearer $TOKEN"

curl -k -H "$H" https://localhost:52323/processes
curl -k -H "$H" -o trace.nettrace "https://localhost:52323/trace?pid=<PID>&durationSeconds=30"                 # default profiles Cpu,Http,Metrics
curl -k -H "$H" -o gc.nettrace    "https://localhost:52323/trace?pid=<PID>&profile=GcCollect&durationSeconds=30"
curl -k -H "$H" -o dump.dmp       "https://localhost:52323/dump?pid=<PID>&type=WithHeap"                         # Mini, Triage, WithHeap (default), Full
curl -k -H "$H" "https://localhost:52323/livemetrics?pid=<PID>"
```

`-k` accepts the sidecar's self-signed certificate over the local tunnel only. Trace profiles are `Cpu`, `Http`, `Logs`, `Metrics` and `GcCollect`; there is no allocation-sampling profile, so for allocation detail use `dotnet-trace --profile gc-verbose` from a console. Custom providers (networking, assembly loader) go in a POST to `/trace` with a JSON provider list (the "Get Custom Trace" API in the dotnet-monitor docs). A dump request is a production change like any other dump: confirm with the user and check the container's memory headroom first.
