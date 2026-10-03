# Migration hazard catalog

Read this when red-teaming a phase (SKILL step 7). Each hazard is predictable per ecosystem and still routinely missed in a first draft. For each phase, ask whether it triggers the hazard, run the detection probe, fold the plan action into the phase, and record the hazards you cleared as well as those that fired.

The examples cover Node, Python, Go, and Postgres, and the classes apply to any stack.

## H1. Incomplete removal set

**Trigger.** You remove, quarantine, or cut over a whole family of dependencies (a dead framework, a removed API, an end-of-life library) but only touch some modules.

**Risk.** A module you didn't list still depends on the removed artifact, so the default build fails after cutover, often in code the plan never mentioned.

**Probe.** Search for the artifact in every manifest and import site, not just the ones you are editing.

**Action.** List the full set of dependents up front and decide each one's fate in the same phase. State the build target after cutover.

**Examples.**
- Node: dropping a deprecated HTTP client means finding every `require` and `import` of it, plus transitive uses in workspaces.
- Python: removing a package with a C extension means checking every import, every extra in `pyproject.toml`, and every optional requirements file.
- Go: removing a module means `go mod why` and a search across all `go.mod` files in the repo, including tools and test modules.

## H2. Mechanical changes forced by a major bump

**Trigger.** A major version change of a language, framework, or platform.

**Risk.** The plan treats "bump the version" as one task and misses the tree-wide changes it forces: renamed or removed APIs, a different module system, a changed test runner, renamed config keys. The build fails before your own logic is involved.

**Probe.** Read the target version's upgrade or migration guide. Search the tree for the old API surface to size the change. Check whether a codemod tool exists.

**Action.** Make each mechanical migration its own task, and prefer an automated tool on large trees. A small tree can be safer by hand. Include the test framework migration, which is the one most often forgotten.

**Examples.**
- Node: CommonJS to ES modules, with `jscodeshift` as a codemod runner.
- Python: syntax and idiom upgrades with `pyupgrade`, and a move from `setup.py` to `pyproject.toml` metadata.
- Go: a module path with a `/v2` suffix, and removed or deprecated standard-library APIs flagged by the compiler and `go vet`.
- Postgres: removed or changed behavior listed in the target release notes, which the schema and queries must be checked against.

## H3. Runtime bump without its deployment surface

**Trigger.** You bump the language runtime used to build or run the app.

**Risk.** The build uses the new runtime while a base image, CI runner, buildpack, or serverless setting still pins the old one. The app builds green and then fails to run, often only in a smoke test or in production.

**Probe.** List every place the runtime version is pinned and compare each to the target.

**Action.** Move every pin in the same phase as the build bump, and run the smoke path against the new artifacts.

**Examples.**
- Node: `.nvmrc`, the `engines` field (with npm, `engines` is advisory unless `engine-strict` is set), Dockerfile base images, CI `setup-node` versions.
- Python: `requires-python` in `pyproject.toml`, container base images, CI matrix, and virtualenv creation scripts.
- Go: the `go` line in `go.mod` (the minimum version, which can make the go command fetch a newer toolchain when `GOTOOLCHAIN` allows it), the optional `toolchain` line, and builder images and CI `setup-go` versions.

## H4. Traffic classes dropped in an edge or auth rewrite

**Trigger.** You rewrite a gateway, an identity layer, or any routing or security boundary.

**Risk.** The plan covers the authenticated happy path and drops other traffic: anonymous flows (signup, password reset, public assets), service-to-service calls, health and metrics scrapes, webhooks and callbacks.

**Probe.** Enumerate the route classes the boundary must serve (anonymous, user, service-to-service, infrastructure, webhook) and confirm each has an explicit rule in the new config.

**Action.** Make the route-class table a deliverable of the phase. Give service-to-service calls narrow scopes rather than one broad grant, and keep scrape endpoints reachable.

## H5. Stateful data store major upgrade treated as a tag bump

**Trigger.** You bump the major version of a database, cache, broker, or search index that holds persisted data.

**Risk.** A new major version generally can't use the previous major's data directory directly. The server fails to start, behaves differently depending on local volume state, or the data is damaged.

**Probe.** Check whether persisted volumes exist, whether the data is durable or disposable, and what the engine documents as supported upgrade paths.

**Action.** Choose one path and write it down: an in-place or dump-and-restore upgrade with steps and rollback, or an explicit decision to reset disposable data. Keep the old version available for rollback.

**Example.** Postgres documents three major-upgrade paths (a logical dump and restore with `pg_dumpall`, `pg_upgrade`, and logical replication to a new server), and states that file-system-level copies don't work across majors. Postgres refuses to start a data directory from an incompatible version. See `efficient-db:postgres`, if installed, for the database side.

## H6. A temporary weak state that outlives its phase

**Trigger.** A phase deliberately introduces a weakened state to stay runnable: a permissive security shim, a disabled check, an open endpoint, a placeholder secret.

**Risk.** Scanners and reviewers flag it on every pass, creating churn, and a shim meant to be temporary ships because nobody tracked what closes it.

**Probe.** For each weakening, ask which scanner will flag it, which later phase closes it, and whether it is scoped as tightly as possible.

**Action.** Keep a register of temporary weak states: why it exists, the closing phase, the residual risk, and a note for reviewers that it is intentional until that phase. Never leave a real secret in one.

## H7. Stacked branches and a stalled trunk

**Trigger.** A multi-phase migration where each phase builds on the one before and each lives on its own branch.

**Risk.** If phase N+1 branches from phase N and phase N never reaches trunk, the branches merge into each other and trunk falls phases behind. A repo with two default-like branches adds the risk of targeting the wrong one.

**Probe.** Before starting a phase, check that the previous phase is merged to trunk and that the new branch starts from trunk. Confirm the trunk's real name.

**Action.** Merge each phase to trunk before the next begins. If stacking is unavoidable, plan a reconciliation merge and note the residual risk.

## H8. Documentation drift

**Trigger.** A phase changes topology: module membership, removed services, renamed branches, changed commands, or new endpoints.

**Risk.** Only the plan's status gets updated, so the instruction files, README, and module lists go stale and mislead the next person or agent.

**Probe.** After any topology change, compare the change against every document that describes topology.

**Action.** Update `CLAUDE.md`, the README, and module or service lists in the same change as the topology change, and treat them as part of the phase's exit criteria.

## Pre-flight checklist (per phase)

- [ ] H1. Searched the removed artifact across all manifests and import sites, and listed the full set
- [ ] H2. Listed the mechanical migrations, including the test framework, and picked a tool or manual approach
- [ ] H3. Moved every runtime pin together with the build runtime
- [ ] H4. Gave every traffic class an explicit rule
- [ ] H5. Chose an upgrade or reset path with rollback for each stateful store
- [ ] H6. Registered each temporary weak state with its closing phase
- [ ] H7. Merged the previous phase to trunk and branched from trunk
- [ ] H8. Updated every document that describes topology
