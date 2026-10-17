# Round 3 addendum (.NET and Godot)

Read `BRIEF.md` in this folder first; every rule there still applies, including: create or edit only your assigned `plugins/<name>/` dirs; never run `scripts/plugins.py new`, `register`, `catalog` or `check`; never touch `.claude-plugin/marketplace.json`, metas, bundles, README, CLAUDE.md, scripts/ or docs/; no git state changes. Where a design doc says to run `plugins.py new` or `check`, create the plugin dir by hand instead (model it on a finished plugin such as `plugins/golang/`) and skip `check`; the coordinator registers everything.

Your design doc is in `docs/research/` (`design-dotnet.md` or `design-godot.md`). Follow its port notes for your plugins, with these user decisions applied:

- .NET: the C# LSP is `csharp-lsp@claude-plugins-official` (the coordinator wires it into `dotnet-meta`); refer to it generically as "the C# language server (csharp-ls)" where a skill mentions LSP navigation. MAUI and the Windows desktop set (winforms, winui, xaml-mvvm) are NOT ported. `roslyn-analyzers`, `aspire`, `dotnet-native-interop`, `dotnet-ai-apps` and `dotnet-template-authoring` ARE ported.
- Godot: `godot-csharp` and `godot-multiplayer` are direct installs; `/godot-mcp-setup` writes the project `.mcp.json` only after showing the diff and getting approval; the addon chooses its own port (read `godot_mcp/server/port` from project.godot); `game-assets` is ported.
- Every port's NOTICE records the upstream repo and the exact commit it was taken from (`git -C 3rd-party/<repo> rev-parse HEAD`), plus the upstream paths, in this exact line format so a helper can parse it: `Upstream: <repo url> @ <full commit sha>` followed by `Paths: <path>, <path>, ...`.

Report file: `/tmp/claude-1000/-home-buck-Projects-adminhead-claude-plugins/4c97b4cf-6e6d-4d35-8d58-2530e2f3f2f4/scratchpad/impl3/<batch id>.md`.
