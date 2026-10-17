---
name: godot-mcp-setup
description: Installs or updates the voidrot/godot-mcp editor addon in a Godot 4.7+ project, enables it, and connects Claude Code to the editor through a project `.mcp.json` `godot-editor` entry. Run as /godot-mcp-setup [godot-project-dir].
argument-hint: "[godot-project-dir]"
disable-model-invocation: true
allowed-tools: Bash(${CLAUDE_SKILL_DIR}/scripts/install-addon.sh --dry-run *)
---

# Godot MCP setup

Connect Claude Code to a running Godot editor through the godot_mcp addon (github.com/voidrot/godot-mcp, MIT). The addon is itself the MCP server: Streamable HTTP at `http://127.0.0.1:<port>/mcp`, with a bearer token it rewrites on every editor load to `<project>/.godot/godot_mcp/headers.json`. This skill installs the addon, enables it, writes the `.mcp.json` entry, and hands off to the addon's own agent skill. It holds no tool details; the addon's SKILL.md does.

Confirm with the user before every write: the addon copy, the `project.godot` edit, and the `.mcp.json` edit.

## Terms

- **Godot dir**: the folder holding `project.godot` (`$ARGUMENTS`, else the current directory, else ask).
- **Claude root**: the directory Claude Code was started in, where the project `.mcp.json` lives. Often the same as the Godot dir; in a monorepo the Godot dir is a subfolder.

## Steps

### 1. Check the host and project

- POSIX host (Linux or macOS). On Windows stop: the addon's `headersHelper` is a POSIX shell command and its setup refuses Windows.
- `project.godot` exists and `config/features` names `"4.7"` or later. The addon targets 4.7; on an older project stop and say so.
- A Godot binary: `$GODOT`, else `godot`, `godot4` or `godot-mono` on `PATH` (`<bin> --version`). Also coreutils `timeout` on `PATH`; the addon's job tools (`run_headless`, `import_assets`, `build_dotnet`) need it.
- `curl` and `tar` on `PATH`.

### 2. Install or update the addon

1. Preview: `${CLAUDE_SKILL_DIR}/scripts/install-addon.sh --dry-run <godot-dir>`. It prints `installed_version`, `new_version` and `commit` (key=value lines) and changes nothing.
2. Show the user the version change (or "fresh install") and that `addons/godot_mcp/` will be replaced wholesale. Get a yes.
3. Run `${CLAUDE_SKILL_DIR}/scripts/install-addon.sh <godot-dir>`. It downloads the default-branch tarball into a new temp dir, refuses archives with absolute or `..` paths and addons with symlinks or special files, and copies only `addons/godot_mcp/`. Nothing in the tarball runs.
4. Record `new_version` and `commit` for the final report.

### 3. Enable the plugin

In `project.godot`, add `"res://addons/godot_mcp/plugin.cfg"` to `enabled=PackedStringArray(...)` under `[editor_plugins]`, keeping existing entries. Create the section if it is missing:

```ini
[editor_plugins]

enabled=PackedStringArray("res://addons/godot_mcp/plugin.cfg")
```

Skip if it is already listed. If the editor has the project open right now, have the user enable "Godot MCP" in Project > Project Settings > Plugins instead: the editor rewrites `project.godot` on save and would drop a hand edit.

### 4. Get the port

Read `server/port` under `[godot_mcp]` in `project.godot` (the `godot_mcp/server/port` setting). The addon picks a free port from 6550 to 6649 on its first load and saves it there; never choose or pin one yourself.

If it is missing, the addon has not loaded yet. Either ask the user to open the project in the editor, or, with their OK and no editor open on it, load it once headless (a few seconds; `--quit-after` stops it after 100 frames, `timeout` is the backstop):

```sh
timeout 60 <godot-bin> --headless --editor --quit-after 100 --path <godot-dir> 2>&1 | grep 'godot_mcp'
```

Expect `godot_mcp: serving http://127.0.0.1:<port>/mcp`; any other `godot_mcp:` line is the error to report. Then read the port back from `project.godot`.

### 5. Write the `.mcp.json` entry

Build this entry (in `<claude-root>/.mcp.json`, under `mcpServers`):

```json
"godot-editor": {
  "type": "http",
  "url": "http://127.0.0.1:<port>/mcp",
  "headersHelper": "cat .godot/godot_mcp/headers.json",
  "timeout": 600000
}
```

- Claude Code runs a project `.mcp.json` `headersHelper` with the Claude root as its working directory, so the path is relative to the Claude root. When the Godot dir is a subfolder, use `cat <subdir>/.godot/godot_mcp/headers.json` (single-quote the path if it has spaces or shell characters). Refuse a path containing `${` or control characters: Claude Code expands `${...}` in the entry.
- Keep the server name `godot-editor`; the addon's skill and tool docs use it.
- Merge, never clobber: keep every other server and top-level key. Replace only an existing `godot-editor` entry.

Show the user a unified diff of `.mcp.json` (current file, or empty, against the proposed one) and write it only after they approve. Validate the result parses as JSON.

### 6. Install the addon's agent skill

The addon ships its own `SKILL.md`, matched to its version. Tell the user to run Project > Tools > "MCP: install agent skill / show config" in the editor, or, once connected (step 7), call the `install_agent_skill` tool. Either writes `<godot-dir>/.claude/skills/godot-mcp/SKILL.md`. Never copy that file by hand. Rerun this after every addon update.

If the Godot dir is a subfolder of the Claude root, that skill lands under the subfolder's `.claude/`, which Claude Code started at the root does not load. Tell the user, and offer to move it to `<claude-root>/.claude/skills/godot-mcp/` after they confirm.

### 7. Connect

1. The editor must be running with the plugin enabled; with no editor, no tools respond.
2. Restart Claude Code (or `/mcp` and reconnect), accept the project trust dialog, and approve the `godot-editor` project server. The `headersHelper` runs only once the folder is trusted.
3. Call `get_project_info`. It should return the project name and features.

### 8. Report and remind

Report: addon version and commit, port, the `.mcp.json` change, and what is left for the user (enable in the editor, install the agent skill, approve the server).

Remind them to commit `addons/godot_mcp/`, `.mcp.json` and `.claude/skills/godot-mcp/`, and to keep `.godot/` ignored (check `.gitignore`). The token lives in `.godot/godot_mcp/` and the addon writes a `*` `.gitignore` there too.

## Gotchas

- The bearer token is the only boundary. Tools run `@tool` scripts and property setters, i.e. project code. Use the addon only on trusted projects.
- The token rotates on every editor load. That is why the entry uses `headersHelper`, which Claude Code reruns on each connect and once after a 401 or 403; a static `headers` value goes stale.
- Two editors open at once get two ports. Each project keeps its own `.mcp.json` entry; do not reuse one port across projects.
- A 401 after an editor restart that does not clear on retry: reconnect with `/mcp`.
- This skill writes `.mcp.json` itself, after approval. The addon's own setup never does; it only shows an entry with an absolute token path. Both work; the relative path here survives moving the repo.
