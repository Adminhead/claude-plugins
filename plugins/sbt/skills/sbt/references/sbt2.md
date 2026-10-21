# sbt 2 command line

Verified on 2026-10-20 against scala-sbt.org (sbt 2.x change summary, `sbt` reference, `sbt test` reference, sbt query). Items marked **observed** come from sanssushi/skills' sbt 2.0.3 runs and were not confirmed on the official pages. Re-check them when sbt moves on.

Read this file when a command errors or when a task runs, skips or reruns unexpectedly on sbt 2. Use `build.properties` to confirm the version first.

## Quoting and chaining

- A sequence of commands is one quoted, `;`-separated argument: `sbt "clean ; compile ; test"`. The bare form `sbt clean compile test` fails with `Expected whitespace character` and exits 1 (**observed**).
- `;` chaining is documented for the interactive prompt (`A ; B` runs B only if A succeeds). Use the same syntax inside the quotes on the system shell.
- Batch file: `sbt "< commands.txt"` runs one command per line; `#` lines are comments (**observed**).
- Quote anything containing `*` or `...`, or the system shell expands it.

## Slash syntax only

- `Test/compile`, `core/Test/compile`, `Compile/update`. The official change summary describes one unified slash syntax.
- `test:compile` is rejected with `Expected ID character` and `Not a valid command` (**observed**).

## Scoped keys do not delegate on the shell

- `sbt "Compile/update"` fails with `No such setting/task`. Official: "sbt 2.x disables the delegation of scoped tasks in the sbt shell."
- Subproject-axis resolution still works.
- Fix: use the key that is actually defined (`update`, `core/update`) or put the setting where the scope is defined.

## Test family

| Command | Behaviour |
| --- | --- |
| `test` | Incremental and cached. Runs suites that failed, never ran, or had a transitive dependency change. Official. |
| `test <names>` | Whitespace-separated suite names. Wildcards `...`, `*`, `**`; prefix `-` to exclude. Official. Still respects the cache. |
| `testFull` | Runs everything, uncached, like sbt 1's `test`. Official. Takes no filters: `testFull *Foo*` is a parse error (**observed**). |
| `testOnly <names>` | Force-runs the matched suites even when cached. At the root it fails when nothing matches (**observed**). |

Notes:
- `test` returns a `TestResult` rather than `Unit`, which matters only to build authors (**observed**).
- Log lines may still say `testQuick`, the internal id left over from the rename (**observed**).
- `IntegrationTest` and `it:test` are removed. Move those tests to a separate subproject. Official.

## Query (subproject axis)

Official form: `[query /] [Config /] [task /] key`.

- `foo.../test` runs suites in every subproject whose id starts with `foo`.
- `.../test` covers the whole aggregate.
- `...@scalaBinaryVersion=3/test` selects subprojects by that setting.
- The wildcard is `...`, not `*`; the official page says the choice is deliberate.

## Shell and server

- The `sbt` runner delegates to `sbtn`, a native thin client, when the build is sbt 2. The server is pinned per project through `project/build.properties`. Official.
- A running server stays up after your command. `shutdown` stops it and ends the session. `exit` or `quit` only leave the client; the server keeps running. Official.
- The server keeps the environment it started with. Later `SBT_OPTS`, `JAVA_OPTS` or `-D` flags do not reach it. Run `shutdown` first (**observed**).
- Auto-reload is on: after a `build.sbt` or `project/` change the next command reloads. Official.
- `run` and `console` fork a fresh JVM from the client (**observed**).
- `-Dsbt.ci=true` turns off supershell and colour (**observed**).
- JDK 17 or later runs sbt 2 (**observed**; the official pages checked do not state it).

## Caching

- sbt 2 has a machine-wide disk cache shared by all builds on the machine. Official. An optional remote cache exists.
- **Observed** on 2.0.3: after `sbt "clean ; compile"` the output can show `elapsed time: 0 s` with no `compiling` lines, because the result was restored from the cache. Check with `find target/out -name '*.class'`, not with the log.
- **Observed**: test success is keyed by content hashes, so `sbt "clean ; test"` still skips suites that passed. Use `testFull` to force a rerun.
- The official caching page checked here does not describe these test-level details.

## Layout and CI

- One `target/` per build: `target/out/jvm/scala-<ver>/<subproject>/classes`, `.../test-classes`, `.../test-reports/TEST-*.xml` (**observed**). Use `target/out/**/test-reports/*.xml` in CI artifact paths.
- Global settings move to `<global-base>/2`, typically `~/.config/sbt/2` (**observed**; official path resolution differs by OS).

Example CI step (one step, then free the server):

```bash
sbt "clean ; compile ; testFull ; shutdown"   # full run; plain test would skip cached green suites
sbt "testFull"                          # sbt 1-style full run
sbt -Dsbt.ci=true "compile ; testFull"  # non-interactive output
```

Multiple `sbt` invocations in one job reuse the first server and its environment. Set env at job level, or end each step with `shutdown`.
