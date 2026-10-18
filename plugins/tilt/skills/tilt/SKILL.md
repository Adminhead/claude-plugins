---
name: tilt
description: Writes, debugs and runs Tilt (tilt.dev) local Kubernetes dev loops. Use when a task touches a Tiltfile or tilt_config.json, uses Starlark calls such as docker_build, k8s_yaml, k8s_resource, live_update, local_resource, allow_k8s_contexts or config.define_*, or runs tilt commands (up, ci, logs, get, wait, down, args). Not for plain Kubernetes manifests (the `kubernetes` skill), Helm chart authoring (the `helm` skill) or Dockerfiles and Compose (the `docker` skill) when no Tiltfile is involved.
---

# Tilt

Not for editing manifests, charts or Dockerfiles on their own; those skills own the content. This skill covers the Tiltfile that wires them into a dev loop and the `tilt` CLI. Run `tilt version` and `tilt <command> --help` before relying on a flag.

## Tiltfile rules

- A Tiltfile is Starlark, not Python: no classes, no `try/except`, no imports (use `load`), no recursion, no `while`. Use `fail("msg")` to abort.
- Tilt re-runs the Tiltfile when its inputs change. Tilt records the files the Tiltfile reads (`read_file`, `k8s_yaml` paths, `helm()` chart directories, `kustomize()`) and watches them. It cannot see inside `local()`: files read only by the command it runs need `watch_file`.
- `docker_build(ref, context, ...)`: `ref` must match the image name in the YAML exactly; Tilt rewrites it to a tagged ref at deploy time. An unmatched ref gives an "image not used" warning and no rebuild. `only` takes real paths, not globs; use `ignore` (relative to `context`) or `.dockerignore` to exclude.
- `k8s_yaml` only registers objects. Tilt groups them into resources by workload name; use `k8s_resource('name', port_forwards=..., resource_deps=[...], labels=[...])` to configure one. Naming a workload that does not exist is an error. Group extra objects (a Service, a ConfigMap) with `objects=[...]` and `new_name=`.
- For Helm or Kustomize output, pass the rendered text: `k8s_yaml(helm('chart/', values=[...]))`, `k8s_yaml(kustomize('dir'))`. Rendering happens when the Tiltfile runs. If you render with `local()` (for example a templating CLI), add `watch_file` for its source files so edits reload it.
- `local_resource(name, cmd, deps=[...], serve_cmd=...)`: `deps` defaults to nothing, so with no `deps` the command runs once and never again. `deps` takes paths, not globs. `cmd` is a one-shot build step; `serve_cmd` is a long-running server and is killed and restarted after each successful `cmd`. Local resources run serially unless `allow_parallel=True`.
- Order work with `resource_deps=[...]` on `k8s_resource` and `local_resource`; a resource waits for its deps to be ready, not merely started.
- Use `trigger_mode=TRIGGER_MODE_MANUAL` and `auto_init=False` for slow or destructive steps (migrations, seeds), so they run only on request (`tilt trigger <name>`).

## live_update

- Step order is enforced: optional `initial_sync()`, then `fall_back_on`, then `sync`, then `run`. A misordered list is a Tiltfile error.
- `sync(local, remote)` source paths must be inside the `docker_build` context. A change inside the context that matches no `sync` step, or matches `fall_back_on`, triggers a full image rebuild and redeploy. Put lockfiles and the Dockerfile in `fall_back_on` (dependency changes need a rebuild).
- `run(cmd, trigger=[...])` executes in the container with cwd `/`, so use absolute paths. A `trigger` file must also be covered by a `sync` step.
- Syncing files does not restart the process. For compiled or non-reloading apps, use the `restart_process` extension: `load('ext://restart_process', 'docker_build_with_restart')` and pass `entrypoint=`. It needs a shell in the image (no scratch or distroless) and does not support Compose or `k8s_custom_deploy` with `command`.
- Live update modifies a running container, so a bad sync can leave it diverged from the image. When behavior is odd after live edits, force a rebuild by triggering the resource or `tilt down` then `tilt up`.

## Cluster safety

- Tilt refuses remote clusters by default and allows known local ones (kind, minikube, Docker Desktop, k3d, microk8s). Confirm with `kubectl config current-context` before any `tilt up`.
- Add a cluster with `allow_k8s_contexts('name')` (specific name). Do not add `allow_k8s_contexts(k8s_context())` unless the user asks; it turns the safety check off for whatever context is active. Add a named context only when the user names the cluster.
- A kind or k3d cluster with a local registry is auto-detected. `default_registry('host/path')` is a manual fallback when discovery fails; remote clusters also need a registry the cluster can pull from.
- `tilt down` deletes everything the Tiltfile deployed. Run it only against the cluster you started.

## Configuration and extensions

- `load('ext://name', 'symbol')` fetches from the tilt-extensions repo on first use, so it needs network and runs third-party Starlark. Vet an extension before adding it and tell the user which ones the Tiltfile loads.
- Declare options with `config.define_string_list('services')`, `config.define_bool('flag')`, then `cfg = config.parse()`. Defined settings are absent from the dict when unset, so use `cfg.get('services', [])`. Pass them after `--` (`tilt up -- --flag`), or put them in `tilt_config.json`; flags override the file.
- After `config.parse()`, positional args are no longer treated as resource names. Restore that with `config.set_enabled_resources(cfg.get('services', []))`. An empty list enables all resources, not none.
- `config.define_*` works only in the main Tiltfile, not in files pulled in by `load` or `include`.

## Running Tilt as an agent

`tilt up` opens a TUI that blocks and garbles output. Use one of:

- `tilt ci`: build, deploy, wait for all resources to be healthy, then exit; nonzero on a build failure or crashed server. `--timeout` defaults to 30m, so pass a bound such as `--timeout 10m`. Use this for verification and CI.
- `tilt up --stream` in the background, with `run_in_background`, for a long-lived loop. Stop it with `tilt down` (also removes cluster objects) or by ending the process.
- Against a running Tilt: `tilt get uiresource` (status of each resource, `-o json` for scripts), `tilt logs <resource> --since 5m --level error`, `tilt wait --for=condition=Ready uiresource/<name> --timeout 120s`, `tilt trigger <name>`, `tilt args -- --flag` to change Tiltfile args live. `tilt wait` is experimental and its default timeout is 30s.
- The Tiltfile's own errors appear under the `(Tiltfile)` resource; read `tilt logs '(Tiltfile)'` before editing code when nothing deploys.
- Tilt serves on port 10350. A second instance needs `--port`, and later commands need the same `--port`.

## Validate

1. `tilt ci` (or `tilt up --stream` plus `tilt wait`) against a local cluster; success means every resource is Ready, not just that the Tiltfile parsed.
2. For a live_update change, edit a synced file and read `tilt logs <resource>` for "Live Update" lines instead of an image build.
3. Report the context used, the Tilt version, the commands run, and anything left running.
