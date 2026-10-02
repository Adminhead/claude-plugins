# Debugging containers

Start with read-only commands. Ask the user before anything that stops, removes, or rebuilds on a host others use.

## Build fails

- Read the failing step and its output first. `docker build --progress=plain .` prints full step output instead of the collapsed view.
- A step that passes locally and fails in CI usually differs in build context. Check `.dockerignore`, and whether a needed file is excluded or a generated file is missing.
- A cache that hides a change: `docker build --no-cache` rebuilds every layer. Prefer `--no-cache-filter <stage>` when only one stage is suspect.
- `COPY` failed with "not found" means the path is outside the context or ignored.

## Container exits or restarts

```sh
docker compose ps -a
docker compose logs --tail=100 <service>
docker inspect --format '{{.State.ExitCode}} {{.State.OOMKilled}} {{.State.Error}}' <container>
```

| Exit code | Usual cause |
| --- | --- |
| 0 | The main process finished. A service that should stay up needs a foreground command. |
| 1 | Application error. Read the logs. |
| 126 / 127 | Command not executable or not found. Check `ENTRYPOINT`/`CMD`, line endings, and (on distroless) that the binary exists. |
| 137 | SIGKILL. With `OOMKilled=true` it is a memory limit. Otherwise a stop timed out. |
| 143 | SIGTERM handled as exit. Usually a normal stop. |

A container that exits with a read-only filesystem error needs a `tmpfs` or volume for the path it writes.

## Networking

```sh
docker compose exec <service> getent hosts <other-service>     # DNS inside the network
docker network ls
docker network inspect <project>_default
```

- Connection refused to a service name: the app inside the target binds `127.0.0.1` instead of `0.0.0.0`, or it isn't healthy yet. Add a healthcheck and `condition: service_healthy`.
- Name not resolving: the two services share no network. Check each service's `networks:`.
- `localhost` inside a container is the container itself. Use the service name for other services.

## Volume permissions

- A bind mount keeps the host's file ownership. A non-root container user that doesn't match the owner can't write. Match the UID, or use a named volume.
- Writes failing on a `read_only` service need `tmpfs` for that path.

## Inspecting a running container

```sh
docker compose exec <service> sh          # distroless has no shell: use a debug sidecar image sharing the namespace
docker compose top
docker stats --no-stream
```

`docker inspect` output includes environment values. Filter with `--format` for the fields you need instead of dumping it.
