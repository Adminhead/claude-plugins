# Reactor and multi-module builds

Read when a multi-module build fails to resolve a sibling or a parent, or when choosing which modules to build.

## Selecting modules

- `-pl <module>` builds only the named module. `-am` (also make) adds the modules it depends on. `-amd` (also make dependents) adds the modules that depend on it.
- `-pl api -am test` builds `core` from the reactor, then `api`.
- `-pl api install` without `-am` resolves `core:1.4.0-SNAPSHOT` from a remote repository. If that SNAPSHOT is not published, the build fails with "could not find artifact". Fix the command, not the version.
- Run from the root so the reactor sees every module. Running inside `api/` sees only `api`, and the parent comes from `relativePath`.
- Resume with `-rf :<artifactId>` after a failure only when the earlier modules were built from this same tree.

## Parent resolution

- Each child names its parent with `<parent>` (`groupId`, `artifactId`, `version`). `relativePath` defaults to `../pom.xml`.
- "Non-resolvable parent POM" means the coordinates differ from the parent's, the path is wrong, or the parent is not installed and the build did not start from the root.
- Put the aggregator (`<packaging>pom</packaging>`) at the root with `<modules>`. A module listed in `<modules>` must have a pom at the given path.

## Reactor order

- Maven sorts modules by declared dependencies, not by the order in `<modules>`. A cycle fails the whole build.
- `install` in a reactor puts every module into the local repository. Prefer `verify` for a check, and `install` only when another build outside the reactor needs the artifacts.

## Versions across modules

- Keep one version per family in the parent `<properties>` or `<dependencyManagement>`.
- Use `${revision}` with the Flatten plugin only if the project already does; it changes how `install` and `deploy` name artifacts.
- Do not hard-code a sibling's version in a child. Use the parent's coordinates or a managed entry.

## Offline and stale state

- `-o` forces offline resolution; use it to test whether a failure is a network or mirror problem.
- `-U` forces update checks for SNAPSHOTs and missing releases. A cached "not found" stays until `-U` or until the `.lastUpdated` marker expires.
- Delete a single cached artifact directory under `~/.m2/repository` only after the user agrees, and name the path you intend to remove.
