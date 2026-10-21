# Metals language server

Contents: what the plugin configures, prerequisites, first start, settings, troubleshooting, security.

The plugin's `.lsp.json` registers one server, `metals`, over stdio for `.scala` and `.sc` (language `scala`) and `.sbt` (language `sbt`). There is no installer, launcher or SessionStart hook: the `metals` binary must already be on the PATH that Claude Code inherits. Java files stay with a Java server (`jdtls-lsp`); the Metals docs recommend a separate one. `.mill` build files are not mapped.

## Prerequisites

Checked against the Metals docs on 2026-10-20 (latest stable 1.6.9, released 2026-09-14):

1. A JDK for the Metals server. The minimum is 11; the VS Code docs list 11, 17 and 21 with 17 as the default. Metals uses `JAVA_HOME` if set. The project's own JDK (what sbt and Mill use) is separate and also comes from `JAVA_HOME` unless the `javaHome` setting overrides it.
2. Coursier (`cs`), https://get-coursier.io.
3. Install Metals and put it on the PATH:

   ```sh
   cs install metals            # installs a `metals` launcher into the coursier bin dir
   cs bootstrap org.scalameta:metals_2.13:1.6.9 -o metals -f   # alternative: pin a version
   ```

   The coursier bin dir (`cs install` prints it; usually `~/.local/share/coursier/bin`) must be on the PATH of the shell that starts Claude Code. Check with `command -v metals`.
4. A buildable project: an sbt, Mill, Maven, Gradle or Bazel build, or Scala CLI files. Metals imports through Bloop (Mill: automatic via Bloop) or the build's own BSP support.

## First start

Metals imports the build and indexes it before diagnostics and symbol search work, so the first start in a project can take minutes (the plugin allows 120 seconds for startup). `statusBarProvider: "log-message"` makes Metals send its status to the log instead of the editor status bar. `isHttpEnabled` stays at its default (off).

Claude Code's LSP client does not implement `window/showMessageRequest`. Metals asks "New sbt workspace detected, would you like to import the build?" through that request, and the resulting error made Metals 1.6.9 abort its startup (`Unexpected error initializing server: ... Unhandled method window/showMessageRequest`, then shutdown). The plugin therefore sets `"settings": {"metals": {"autoImportBuilds": "all"}}` in `.lsp.json`; Claude Code pushes it with `workspace/didChangeConfiguration`, and Metals imports the build without asking (values `off`, `initial`, `all`; default `off`). Verified on 2026-10-21 with Metals 1.6.9, sbt 1.11.7 and Scala 3.3.6: the import ran (`sbt bloopInstall`), and a session received the type error (`Found: ("text" : String) Required: Int`) and the syntax errors from Bloop.

Notes from that test:

- Diagnostics from the compiler arrive only after the import and first compile finish (seconds to minutes). Until then Metals reports parser-only `scalameta` diagnostics, which can be wrong for Scala 3 syntax.
- Metals still sends two harmless prompts (start the HTTP server for the Doctor, and a "mis-configuration" warning). Claude Code answers them with an error; Metals carries on. They did not stop startup or diagnostics.
- The import needs `sbt` to run from the environment Claude Code inherits. A `mise` shim without an active version fails there; check `sbt --version` in the project directory first. A second sbt on the same machine can hold `~/.ivy2/.sbt.ivy.lock` and stall the import (`waiting for lock`).
- To import by hand instead (for example for a build that needs special flags), run `sbt -Dbloop.export-jar-classifiers=sources bloopInstall` once (needs the sbt-bloop plugin; checked against scalameta.org/metals/docs/build-tools/sbt on 2026-10-20) and Metals connects to Bloop on its next start.
- To disable the auto import, use a local copy of the plugin loaded with `claude --plugin-dir <path>`; edits to the installed copy are overwritten on the next plugin update.

## Troubleshooting

| Symptom | Check |
| --- | --- |
| LSP tool reports no server for `.scala` | `command -v metals` in the shell that launched Claude Code; fix the PATH and restart the session |
| `metals: command not found` in the plugin error | the coursier bin dir is missing from PATH |
| Starts, then no diagnostics | the build import has not finished or failed; run the build tool in the project and look at `.metals/metals.log` |
| Wrong Scala or Java | `JAVA_HOME`, `scalaVersion`, the `javaHome` setting |
| Crash loop | the plugin restarts Metals up to 3 times; delete `.metals/` and `.bloop/` in the project and retry |

Metals writes `.metals/`, `.bloop/` and `project/metals.sbt` into the project. Make sure they are in `.gitignore` before committing.

## Security

A build import runs sbt, Bloop or the project's other build tool, which executes the project's build definition (`build.sbt`, plugins, `build.mill`). Only open projects you trust, as with any IDE import. Claude Code also starts Metals itself as soon as it touches a `.scala` or `.sbt` file, so opening an untrusted repository with this plugin enabled can run its build definition or a `.bsp/*.json` build server command without any prompt. Enable the plugin only in projects you trust.
