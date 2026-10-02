# Multi-stage Dockerfiles by language

Version placeholders (`<version>`) stand for the version the project already uses. Match the repo's package manager and lockfile before copying a layout.

## Node

```dockerfile
FROM node:<version>-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM deps AS dev
COPY . .
CMD ["npm", "run", "dev"]

FROM deps AS build
COPY . .
RUN npm run build && npm prune --omit=dev

FROM node:<version>-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build --chown=node:node /app/dist ./dist
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/package.json ./
USER node
EXPOSE 3000
CMD ["node", "dist/server.js"]
```

- The official Node image ships a `node` user, so no `adduser` step is needed.
- `npm prune --omit=dev` after the build keeps dev dependencies out of the runtime copy.
- Alpine uses musl. If a native dependency misbehaves, switch the runtime to a `-slim` (Debian) tag.

## Python

```dockerfile
FROM python:<version>-slim AS build
WORKDIR /app
RUN python -m venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

FROM python:<version>-slim AS runtime
RUN useradd --system --uid 10001 --no-create-home app
COPY --from=build /opt/venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH" PYTHONUNBUFFERED=1
WORKDIR /app
COPY --chown=app:app . .      # .dockerignore must exclude .env*, secrets/, keys
USER app
CMD ["python", "-m", "myapp"]
```

- Build wheels or the virtualenv in the build stage so compilers stay out of the runtime image.
- For a uv project, copy `pyproject.toml` and `uv.lock` first and install from the lockfile, then copy source. See `efficient:python-packaging` if installed.

## Go

```dockerfile
FROM golang:<version> AS build
WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 go build -trimpath -o /out/app ./cmd/app

FROM gcr.io/distroless/static:nonroot AS runtime
COPY --from=build /out/app /app
USER nonroot:nonroot
ENTRYPOINT ["/app"]
```

- A static binary (`CGO_ENABLED=0`) runs on distroless `static`. Use `gcr.io/distroless/base` or `cc` when the binary needs libc.
- Distroless has no shell. Use exec-form entrypoints, and for a Docker-level healthcheck add a subcommand to the binary instead of calling `curl`.
- `scratch` works for a static binary too, but you must copy CA certificates and timezone data yourself.

## Java

```dockerfile
FROM eclipse-temurin:<jdk-version> AS build
WORKDIR /src
COPY . .
RUN ./mvnw -q -DskipTests package

FROM eclipse-temurin:<jre-version>-jre AS runtime
RUN useradd --system --uid 10001 app
COPY --from=build /src/target/app.jar /app/app.jar
USER app
ENTRYPOINT ["java", "-jar", "/app/app.jar"]
```

- Copy the build descriptor (`pom.xml`, `build.gradle*`) and resolve dependencies in their own layer when the build tool supports an offline-resolve goal, so source edits reuse them.
- Size the heap with container-aware JVM flags (`-XX:MaxRAMPercentage`) rather than a fixed `-Xmx`, and leave headroom under the container memory limit.

## Cross-cutting

- Add a `test` stage between `build` and `runtime` when CI should fail the build on test failure. `docker build --target test .` runs it, and the default build skips it when `runtime` doesn't depend on it.
- Use `ARG` for non-secret build-time values (versions, build flags) and `ENV` for runtime defaults. An `ARG` before `FROM` is visible only to `FROM` lines.
- Use BuildKit cache mounts (`RUN --mount=type=cache,target=<dir>`) for package-manager caches when rebuild speed matters. They keep caches out of image layers.
