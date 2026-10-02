# Custom actions

Read when creating or changing `action.yml` or `action.yaml`. The metadata, inputs, outputs, and release behavior form the action's public contract. Action refs inside it follow the version policy in SKILL.md.

## Choose and define

1. **Pick the narrowest type.** Composite for transparent orchestration of existing steps. JavaScript for portable logic, API calls, structured validation, or pre/post hooks. Docker only when the toolchain needs a container. A reusable workflow when sharing whole jobs.
   - [About custom actions](https://docs.github.com/en/actions/concepts/workflows-and-actions/custom-actions)

2. **Extract with restraint.** Put a stable, repeated step sequence in `.github/actions/<name>/action.yml` only when that cuts duplication. Keep inputs minimal. Prefer job-scoped env vars for secrets, and don't widen a secret's scope for convenience.

3. **Make the metadata complete.** Use `action.yml` with `name`, `description`, and `runs`. Give every input and output a stable id and a description. Set a default only when it's safe for every caller. For JavaScript actions, check `runs.using` against the live metadata reference (it listed `node20` and `node24` at review time; don't freeze either).
   - [Metadata syntax](https://docs.github.com/en/actions/reference/workflows-and-actions/metadata-syntax)

4. **Validate inputs in code.** `required: true` documents an input but doesn't fail on omission. Reject missing, empty, or malformed values before any side effect. In a composite action, read `inputs.*`; don't assume `INPUT_*` env vars exist. Pass input-derived shell values through `env:` and quote them.

5. **Use supported runner channels.** Step outputs go to `GITHUB_OUTPUT`, later-step env to `GITHUB_ENV`, and pre/post state to `GITHUB_STATE`. Outputs aren't a secret channel. Check size and multiline rules before sending large data.
   - [Workflow commands](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-commands)

6. **Package deliberately.** A published JavaScript action bundles its runtime dependencies. Docker and composite actions include every script they call, with executable bits preserved. Docker container actions on self-hosted runners need Linux with Docker. Callers must check out the repo before `uses: ./path`. Document supported runners, permissions, inputs, outputs, side effects, and failure behavior, and claim only portability you have tested.
   - [JavaScript action](https://docs.github.com/en/actions/tutorials/create-actions/create-a-javascript-action), [composite action](https://docs.github.com/en/actions/sharing-automations/creating-actions/creating-a-composite-action), [Docker action](https://docs.github.com/en/actions/sharing-automations/creating-actions/creating-a-docker-container-action)

## Verify the contract

- Check paths, entrypoints, inputs, outputs, and type against the live metadata reference.
- Exercise success, missing and invalid input, expected failure, outputs, and cleanup on each OS and runtime the action claims. Otherwise state what's untested.
- Test from a minimal calling workflow or the repo's action test setup, so metadata-to-runtime wiring is covered.
- Debug with `core.debug` and error annotations, without printing inputs that could hold secrets.
  - [Testing and debugging actions](https://docs.github.com/en/actions/sharing-automations/creating-actions/testing-and-debugging-your-actions)

Sources reviewed 2026-09-06.
