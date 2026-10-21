# scala

A Scala skill (Scala 3 and 2.13, following the project's own syntax) plus a Metals language server config (`.lsp.json`) for `.scala`, `.sc` and `.sbt` files.

## Setup for the language server

The plugin does not install Metals. Before starting Claude Code:

1. Install a JDK (Metals needs 11 or newer; 17 is the usual choice) and set `JAVA_HOME`.
2. Install Coursier, then `cs install metals`.
3. Make sure `command -v metals` works in the shell that launches Claude Code.
4. Make sure the build tool (`sbt --version` for sbt) runs in the project directory. The plugin sets `autoImportBuilds` to `initial`, so Metals imports the build once without a prompt (Claude Code cannot answer Metals' import prompt, and Metals aborts startup if it asks). Later build changes are not re-imported, so the imported build goes stale: re-import by running the import by hand (see `metals.md`) and restarting the session.

   The import runs the project's build definition outside Claude Code's permission system: it is triggered by reading or editing a `.scala` or `.sbt` file, not by Bash, so Bash rules, prompts and the sandbox do not apply. Enable the plugin only in projects you trust. Installing `scala` at user scope, rather than via `scala-meta` at project scope, applies this to every repository.

Details, settings and troubleshooting: `skills/scala/references/metals.md`. Without `metals` on the PATH the skill still works and the LSP server simply does not start.
