# scala

A Scala skill (Scala 3 and 2.13, following the project's own syntax) plus a Metals language server config (`.lsp.json`) for `.scala`, `.sc` and `.sbt` files.

## Setup for the language server

The plugin does not install Metals. Before starting Claude Code:

1. Install a JDK (Metals needs 11 or newer; 17 is the usual choice) and set `JAVA_HOME`.
2. Install Coursier, then `cs install metals`.
3. Make sure `command -v metals` works in the shell that launches Claude Code.

Details, settings and troubleshooting: `skills/scala/references/metals.md`. Without `metals` on the PATH the skill still works and the LSP server simply does not start.
