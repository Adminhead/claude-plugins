# Maven errors and their usual causes

Read when a `mvn` command fails. Match the first `[ERROR]` line, then check the cause before editing.

| Message (abridged) | Usual cause | Next step |
| --- | --- | --- |
| `NoSuchMethodError` or `NoClassDefFoundError` at run time, build green | Two versions of one library on the runtime classpath | `dependency:tree -Dverbose -Dincludes=...`; manage the version |
| `Could not find artifact X:Y:SNAPSHOT` with `-pl` | Sibling built from a remote repository, no `-am` | Run with `-pl <module> -am` from the root |
| `Non-resolvable parent POM` | Parent coordinates differ, wrong `relativePath`, or started inside a child | Compare `<parent>` with the parent's `groupId`, `artifactId`, `version` |
| `'dependencies.dependency.version' for X:jar is missing` | The version is meant to come from a BOM that is not imported | Import the BOM in `<dependencyManagement>` or add the managed entry |
| `Could not resolve dependencies ... was cached in the local repository` | A previous miss is cached | Re-run with `-U`; fix the mirror if it recurs |
| `Blocked mirror for repositories` or `http` URL refused | Plain-HTTP repository, blocked by default since Maven 3.8.1 | Switch the mirror to `https` |
| `401` or `403` when transferring an artifact | Missing or wrong server credentials | Check `${env.*}` variables are set; do not print `settings.xml` |
| `release version X not supported` or `invalid target release` | `maven.compiler.release` newer than the JDK running the build | Use `./mvnw` with the intended JDK; align `JAVA_HOME` |
| `package X does not exist` or `cannot find symbol` for generated code | Annotation processor not on `annotationProcessorPaths` | See `plugins.md` |
| `Plugin X or one of its dependencies could not be resolved` | Plugin repository unreachable, or plugin version missing | Check the mirror and pin the version in `pluginManagement` |
| `Failed to execute goal ... Tests run ... FAILURES` | A real test failure | Hand it to the test skill; do not change the build |
| `Some problems were encountered while building the effective model` | Deprecated or malformed pom element, or a missing version | Read the warnings list; fix the named element |
| `Unknown lifecycle phase` or `No plugin found for prefix` | Typo in the goal or a plugin not declared | Use `prefix:goal` with the plugin declared in the build |
| `The project X has cycles` | Modules depend on each other | Break the cycle; move the shared type to a lower module |

## Triage order

1. Confirm the Maven and JDK versions (`mvn -v`), with `./mvnw` if the project has one.
2. Reproduce with the narrowest command from the table's "next step".
3. Check the effective pom for the element named in the error.
4. Only then change a pom. A fix that makes one module build and changes another's runtime classpath needs `dependency:tree` before and after.

## Output hygiene

- Read the first `[ERROR]` block and stop there; the rest is repeats.
- Use `-q` for quiet runs, and `-e` only when the stack trace is needed.
- Never paste the full `-X` debug log into a report: it can include environment and repository details. Share the one failing block.
