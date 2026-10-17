# Compose patterns

## Dev stack

```yaml
services:
  app:
    build:
      context: .
      target: dev
    ports: ["3000:3000"]
    volumes:
      - .:/app                  # bind mount for hot reload
      - /app/node_modules       # anonymous volume keeps container-installed deps
    env_file: [.env]            # gitignored, excluded by .dockerignore
    depends_on:
      db:
        condition: service_healthy
    command: npm run dev

  db:
    image: postgres:<version>-alpine
    ports: ["127.0.0.1:5432:5432"]
    environment:
      POSTGRES_PASSWORD_FILE: /run/secrets/db_password
    secrets: [db_password]
    volumes: [pgdata:/var/lib/postgresql/data]
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres"]
      interval: 5s
      timeout: 3s
      retries: 5

secrets:
  db_password:
    file: ./secrets/db_password.txt   # gitignored; list secrets/ in .dockerignore so COPY . . can't bake it in

volumes:
  pgdata:
```

- Image-specific `*_FILE` variables (as in the official Postgres image) read a secret from a mounted file. Check the image's docs before relying on one.
- The anonymous `/app/node_modules` volume stops the bind mount from hiding dependencies installed in the image.

## Override files

`compose.override.yaml` is loaded automatically with `compose.yaml`. Put dev-only settings there (debug ports, verbose logging). Select production settings explicitly:

```sh
docker compose up                                              # base + override
docker compose -f compose.yaml -f compose.prod.yaml up -d      # base + prod, no override
```

`docker compose -f compose.yaml -f compose.prod.yaml config --quiet` validates the merged result. Run it before deploying, since merge rules differ for lists (appended) and scalars (replaced).

## Networking

- Services on the same network resolve each other by service name. `db` in `postgres://...@db:5432/app` is the service name, not a host.
- Compose creates a default network per project. Define named networks to partition services:

```yaml
services:
  proxy: { networks: [front] }
  api:   { networks: [front, back] }
  db:    { networks: [back] }        # reachable from api only
networks:
  front:
  back:
```

- `ports:` publishes to the host. Container-to-container traffic needs no published port. Prefix with `127.0.0.1:` so a dev service is not exposed on the LAN.

## Volumes

| Kind | Use for |
| --- | --- |
| Named volume | Data that outlives containers (databases, uploads) |
| Bind mount | Dev source trees and read-only config files |
| Anonymous volume | Keeping container-built directories (such as `node_modules`) from a bind mount |
| `tmpfs` | Scratch space for a `read_only` service |

Mount config files read-only (`./conf/app.yaml:/etc/app/app.yaml:ro`). `docker compose down` keeps named volumes. `down -v` deletes them, so confirm with the user first.

## Resource limits and restart

```yaml
services:
  app:
    restart: unless-stopped
    deploy:
      resources:
        limits: { cpus: "1.0", memory: 512M }
```

Set a restart policy on services that should survive a reboot. Without limits, one runaway container can take the whole host.
