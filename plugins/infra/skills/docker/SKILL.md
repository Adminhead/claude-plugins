---
name: docker
description: Write and review Dockerfiles, Compose files, and .dockerignore with multi-stage builds, cache-friendly layer order, non-root and hardened runtime settings, safe secret handling, and container debugging. Use when creating or changing a Dockerfile, compose.yaml, or .dockerignore, shrinking or hardening an image, wiring services, or diagnosing a container that won't build, start, or connect. Not for Kubernetes manifests (infra:kubernetes), Helm charts (infra:helm), CI workflow authoring (github:actions, if installed), or rollout planning (infra:rollout).
---

# Docker and Compose

Change Dockerfiles and Compose files from what the repo already builds and runs. Match its base images, package manager, and service names before applying the rules below.

## Before editing

1. Read the existing `Dockerfile*`, `compose*.yaml`, `.dockerignore`, and the lockfile or build manifest the image installs from.
2. Identify the language and its build output (a bundle, a static binary, a virtualenv). The runtime stage copies only that output. See [dockerfiles](references/dockerfiles.md) for per-language stage layouts.
3. Check whether the target is dev (hot reload, bind mounts), production (minimal image), or both. Use one Dockerfile with named stages for both, and select the stage with `build.target`.

## Dockerfile rules

- **Name stages and order them by change rate.** Typical order is `deps`, `build`, `test` (optional), `runtime`. Each stage is named with `AS` so Compose and CI can target it.
- **Copy dependency manifests first, install, then copy source.** A source edit then reuses the cached install layer. For example, copy `package.json` and the lockfile, run `npm ci`, and only then `COPY . .`.
- **Pin base images.** Use an exact version tag, never `:latest`. Pin by digest for release builds so rebuilds are reproducible. Refresh pins on a schedule, since a pin that never moves stops getting security fixes.
- **Keep the runtime stage small.** Start from a slim or distroless base and copy artifacts with `COPY --from=build`. Build tools, compilers, and test dependencies stay in earlier stages. Distroless images have no shell, so use exec-form commands and a healthcheck that does not need `sh` or `wget`.
- **Run as a non-root user.** Create a user (or use a distroless `nonroot` tag) and set `USER` before `CMD`. Use `COPY --chown` so files are owned correctly without an extra layer.
- **Use exec-form `CMD` and `ENTRYPOINT`** (`["node", "dist/server.js"]`). Shell form wraps the process in `sh -c`, so SIGTERM never reaches the app and shutdown waits for the kill timeout.
- **Add a `HEALTHCHECK`** for long-running services that Compose or a plain Docker host supervises. Kubernetes ignores it and uses its own probes (`infra:kubernetes`).
- **Set `NODE_ENV=production` and similar runtime flags** in the runtime stage only.
- **Merge related `RUN` steps** that must share a cache lifetime, such as `apt-get update && apt-get install -y --no-install-recommends ... && rm -rf /var/lib/apt/lists/*`. Don't merge unrelated steps, because one change then invalidates all of them.

## .dockerignore

The build context is everything not ignored, so it decides what `COPY . .` can bake into a layer. Start from this and extend it for the project:

```
.git
.env
.env.*
secrets/
*.pem
*.key
node_modules
dist
coverage
*.log
```

- Exclude `.env` and `.env.*` always. A `COPY . .` with no `.dockerignore` copies the file into the image, where anyone who pulls the image can extract it.
- Keep secret files (Compose `secrets:` sources, keys, certificates) out of the build context, or ignore them as above. A `COPY . .` stage bakes in whatever the context holds. Rename the `secrets/` pattern if the project keeps them elsewhere.
- Keep `.dockerignore` at the context root, or use `<Dockerfile name>.dockerignore` beside a specific Dockerfile. The more specific file wins.
- Don't ignore files a `COPY` needs. A `!` line re-includes a path, and the last matching line decides.

## Secrets

Accepted ways to give a container a secret at runtime:

| Method | Notes |
| --- | --- |
| Gitignored `.env` via `env_file:` | Not baked into the image. Never commit it, and keep it in `.dockerignore`. |
| Host environment passthrough (`environment: [API_KEY]`) | Compose reads the value from the shell that runs it. |
| Compose `secrets:` with a `file:` or `environment:` source | Mounted as a file at `/run/secrets/<name>` in only the services that list it. Works without Swarm on Linux containers. |

Know the limits before choosing:

- Environment values are readable with `docker inspect` and inside the container through the process environment, and child processes inherit them. Prefer file-mounted secrets (`secrets:`) for sensitive values such as database passwords and API keys.
- Build args and `ENV` persist in image layers. For a secret needed during the build, use `RUN --mount=type=secret,id=<name>` with `docker build --secret id=<name>,src=<path>`. The secret is available at `/run/secrets/<name>` only for that step.
- Never write a secret literal into a Dockerfile, a committed Compose file, a command line, or a shell history. Use `<placeholder>` values in examples.
- Don't print `docker inspect` or `docker compose config` output wholesale into a transcript, since both can expand secret values from the environment.

## Compose rules

Read [compose](references/compose.md) before writing or restructuring a Compose file. The rules that matter most:

- Make startup order explicit with `depends_on` and `condition: service_healthy`, backed by a real `healthcheck` on the dependency. Plain `depends_on` waits only for the container to start.
- Publish only the ports the host needs. Bind dev databases to loopback (`"127.0.0.1:5432:5432"`) and omit `ports` for services reachable only from other services.
- Put services on custom networks when some must not reach others, such as a database that only the API talks to.
- Use named volumes for data that must survive `down`, and bind mounts only for dev source code.
- Keep dev-only settings in `compose.override.yaml` (auto-loaded) and production settings in a file selected with `-f`.
- Validate with `docker compose config --quiet` after every edit.

Compose suits a single host. When a workload needs several hosts, rolling updates, or self-healing, use an orchestrator (`infra:kubernetes`).

## Runtime hardening

For production services, add what the app can tolerate and test the app after each addition:

```yaml
services:
  app:
    read_only: true
    tmpfs: [/tmp]
    cap_drop: [ALL]
    security_opt: ["no-new-privileges:true"]
```

- `read_only` needs `tmpfs` or a volume for every path the app writes. A startup crash on a write is the signal to add one.
- `cap_drop: [ALL]` then `cap_add` only what is needed, such as `NET_BIND_SERVICE` for ports below 1024.
- Set memory and CPU limits so one container can't starve the host.
- Don't mount the Docker socket into an app container. Access to it is root on the host.

## Debugging

Start read-only and escalate only when needed.

```sh
docker compose ps
docker compose logs --tail=100 <service>
docker compose config --quiet            # validates and resolves the file
docker inspect --format '{{.State.ExitCode}} {{.State.OOMKilled}}' <container>
docker stats --no-stream
```

See [debugging](references/debugging.md) for build failures, networking and DNS, volume permission errors, and exit codes. These need the user's approval first because they change or delete state: `docker compose down -v` (deletes volumes), `docker system prune`, `docker rm`, and `docker compose up --build` on shared hosts.

## Review checklist

- [ ] Base image pinned, runtime stage minimal, build tools absent from the final image.
- [ ] Dependency layer precedes source copy; `.dockerignore` excludes `.git`, `.env*`, and build output.
- [ ] `USER` is non-root; `CMD` is exec form.
- [ ] No secret in `ENV`, `ARG`, a layer, or a committed Compose file.
- [ ] Healthchecks exist where `depends_on` or restart logic relies on them.
- [ ] Published ports, networks, and volumes are as narrow as the use case allows.
- [ ] `docker compose config --quiet` and `docker build` both succeed.

## References

- [dockerfiles](references/dockerfiles.md): read when writing a multi-stage Dockerfile for Node, Python, Go, or Java.
- [compose](references/compose.md): read when writing or changing a Compose stack, overrides, networking, or volumes.
- [debugging](references/debugging.md): read when a build fails, a container exits or restarts, or services can't reach each other.
