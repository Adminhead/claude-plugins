---
name: devcontainer
description: Reviews and writes devcontainer.json, Dev Container Features and GitHub Codespaces config against sourced spec rules. Use when editing .devcontainer/ files or devcontainer-feature.json, debugging lifecycle commands or Feature install order, keeping secrets out of remoteEnv, or speeding up Codespaces startup, prebuilds and machine cost.
---

# Dev containers and Codespaces

Not for plain Dockerfiles or Compose stacks outside a dev container (the `docker` skill, if installed), Kubernetes (`kubernetes`), or GitHub Actions workflows (`gh-actions`), except where a CI job builds a dev container.

Adapted from github/awesome-copilot (`instructions/devcontainers.instructions.md` and `skills/github-codespaces-efficiency`), MIT; see `LICENSE`.

## Load what the task needs

- `references/rules.md`: twelve rules, each quoting the Dev Container spec, the reference CLI source or vendor docs (eleven spec-backed, one Claude Code-specific). Read it for any review or authoring of `devcontainer.json`, `devcontainer-feature.json` or a Feature's `install.sh`.
- `references/codespaces.md`: measure, guardrails, at most three fixes, verify. Read it when the goal is Codespaces startup time, spend, machine size, idle timeout or prebuild scope.

## How to review

1. Find the config: `.devcontainer/devcontainer.json`, `.devcontainer.json`, or `.devcontainer/<name>/devcontainer.json`, plus any Dockerfile, Compose file, `devcontainer-lock.json`, Features under `.devcontainer/` and CI or prebuild config that builds it.
2. Note each lifecycle hook's form (string runs through `/bin/sh`, array runs with no shell, object entries run in parallel) before applying the other rules.
3. Apply `rules.md`. Every rule is a reading task; none needs a build.
4. Respect the two **Do not report** guards: a `remoteEnv` value that is a `${localEnv:...}` or `${containerEnv:...}` reference is the fix, not a leak, and an absent `updateRemoteUserUID` is the correct default.
5. Remember the image label merge: a value present in the file wins, but a value absent from it may still come from the image's `devcontainer.metadata` label. Don't report an absent lifecycle command, `remoteUser` or env block as proof the behaviour is missing.

## How to write one

- Start minimal: an image or Dockerfile, the Features the project needs, `customizations.vscode` for extensions and settings (never top-level `extensions`/`settings`), and `forwardPorts` rather than `appPort`.
- Put cacheable installs (`npm ci`, `pip install`, `go mod download`) in `onCreateCommand` or `updateContentCommand` so Codespaces prebuilds and `devcontainer up --prebuild` cache them; keep `postCreateCommand` for work that needs the user's own credentials.
- `waitFor` takes only `initializeCommand`, `onCreateCommand`, `updateContentCommand` (default), `postCreateCommand` or `postStartCommand`.
- Set a non-root `remoteUser`, and `chown` any named volume mounted under it.
- Declare needed secrets under `secrets` and pass values at run time (Codespaces secrets, `--secrets-file` kept outside the repo). Never commit a literal credential in `remoteEnv`, `containerEnv` or `build.args`; those land in the image label, a layer or the image history.
- Commit `devcontainer-lock.json` to pin Feature versions.
- Validate with `devcontainer build` or `devcontainer up` when the CLI is available, since the CLI does not check the JSON Schema; otherwise say the review was static.

## Facts checked

On 2026-10-17 these were re-read at their sources: the `userEnvProbe`, `updateRemoteUserUID`, `waitFor` default, `onCreateCommand`/`updateContentCommand`, `workspaceMount`/`workspaceFolder` and 🏷️ label rows at containers.dev/implementors/json_reference; the prebuild lifecycle sentence at docs.github.com (Codespaces prebuilds); and the root, `CLAUDE_CONFIG_DIR` and `NET_ADMIN`/`NET_RAW` statements at code.claude.com/docs/en/devcontainer. The other quotes carry upstream's 2026-09-01 check and were not re-read.

## Report

List findings per rule with the file, the key, what the file states, where the image label could still change it, and the fix. Separate spec findings from the Claude Code rule and from Codespaces cost advice. Attach no severity or confidence numbers; none were measured.
