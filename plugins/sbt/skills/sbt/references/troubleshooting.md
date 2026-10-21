# sbt troubleshooting

Read this file when an sbt command fails, hangs, or behaves stale. Match the symptom, check the cause, then run the narrowest command that proves the fix.

| Symptom | Likely cause | Check or fix |
| --- | --- | --- |
| `Expected whitespace character`, exit 1 | Several commands passed unquoted on sbt 2 | `sbt "clean ; compile ; test"` (one quoted string) |
| `Expected ID character` or `Not a valid command: test` after `test:compile` | Colon syntax on sbt 2 | `Test/compile` |
| `No such setting/task` for `Compile/update` or a scoped key on the shell | sbt 2 does not delegate scoped keys on the shell | Use the defined key (`update`); scope it in `build.sbt` |
| A test passes after `clean` and does not run | sbt 2 test success is cached machine-wide | `testFull`, or `testOnly <suite>` to force one |
| `compile` ends at `0 s` with no `compiling` lines | Cache restore (sbt 2) | `find target/out -name '*.class'`; this is not a failure |
| A `build.sbt` edit is ignored | sbt 1 needs `reload`; sbt 2 reloads on the next command | `reload` on sbt 1; on sbt 2 check for the `Reloading sbt` line |
| Old env var or `SBT_OPTS` still in effect | The running server keeps its start environment | `shutdown`, then rerun |
| `unresolved dependency` on `update` | Coordinate typo, missing resolver, wrong `%%` suffix | Check the coordinate, then `resolvers` |
| Two versions of one library on the classpath | Eviction picked one; the other is pinned transitively | `evicted`, then upgrade the library that pulls in the old version |
| `IntegrationTest` or `it:test` not found | Removed in sbt 2 | Move those tests to a subproject with normal tests |
| `testOnly` fails with `No tests match the patterns` at the root | Typo or wrong subproject (sbt 2 fails loudly on purpose) | Check the names printed under `Available tests` |
| CI cannot find test reports | sbt 2 layout | Use `target/out/**/test-reports/*.xml` |
| Build hangs at startup | Import, network or a waiting prompt | Check the log for a download or a prompt; `Ctrl-C`, then `shutdown` |
| Metals or an IDE sees a stale build | Server state out of date | `reload` (sbt 1) or `shutdown` and rerun (sbt 2) |

## Escalation

- If the failure is inside a plugin or a library's own build (not the project's), report the version and the exact error; do not patch the plugin's source.
- If the fix needs publishing or a release task, stop and ask. Do not run `publish`, `publishSigned` or `release` to test a change.
