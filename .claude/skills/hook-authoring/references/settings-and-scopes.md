# Where hooks live, precedence, plugin schema, debugging

Sources, fetched 2026-10-17: https://code.claude.com/docs/en/hooks (Configuration, Hook locations, Disable or remove hooks, Debug hooks), https://code.claude.com/docs/en/hooks-guide (Configure hook location, Limitations and troubleshooting), https://code.claude.com/docs/en/plugins-reference (`hooks` field, Environment variables, Standard layout), https://code.claude.com/docs/en/settings (Settings files, Settings precedence, When edits take effect).

## Configuration shape

Three levels: event name, matcher group, handler list.

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash",
        "hooks": [
          { "type": "command", "command": "${CLAUDE_PROJECT_DIR}/.claude/hooks/guard.sh", "args": [], "timeout": 10, "onFailure": "block" }
        ]
      }
    ]
  }
}
```

Settings files are strict JSON: no comments, no trailing commas. A broken file is a Settings Error at startup (interactive) or skipped (`-p`); an unknown hook event name is a Settings Warning and that entry is skipped. `$schema: "https://json.schemastore.org/claude-code-settings.json"` gives editor validation; it can lag the CLI.

## Locations and scope

| Location | Scope | Shared? | Notes |
| :- | :- | :- | :- |
| `~/.claude/settings.json` | you, every project on this machine | no | Not read by cloud sessions. `%USERPROFILE%\.claude` on Windows; `CLAUDE_CONFIG_DIR` relocates it |
| `.claude/settings.json` | everyone in the project | yes, commit it | Read from the session's primary working directory. Hooks here wait for workspace trust in interactive sessions |
| `.claude/settings.local.json` | you, this project | no | Claude Code adds `**/.claude/settings.local.json` to your global git excludes when it first writes the file; gitignore it yourself if you create it by hand. Kept at the git repo root (v2.1.211+) |
| Managed settings (`managed-settings.json`, MDM, claude.ai console) | organization | admin | Can't be disabled from below. `allowManagedHooksOnly` blocks user/project/local/plugin hooks (force-enabled plugins exempt) |
| `--settings '<json or file>'` | this session | no | Sits above local/project/user, below managed. `--settings '{"disableAllHooks": true}'` turns hooks off for one run |
| Plugin `hooks/hooks.json` | while the plugin is enabled | yes, with the plugin | Optional top-level `description`. Merges with user/project hooks |
| Skill frontmatter `hooks:` | rest of the session once the skill is invoked | yes | `once: true` removes a hook after its first success; only honored here |
| Subagent frontmatter `hooks:` | while that subagent runs | yes | `Stop` is converted to `SubagentStop`. Project agent hooks need workspace trust (v2.1.218+) |

Hooks from settings files, managed settings and plugins also run inside subagents; the input carries `agent_id`/`agent_type`.

## Precedence and merging

Settings precedence for a single key, highest first: managed, `--settings`, `.claude/settings.local.json`, `.claude/settings.json`, `~/.claude/settings.json`. Hooks don't follow override semantics: hook entries **merge** across levels, so each file adds its own without removing another's. The same handler defined in more than one settings file runs once; a plugin's or skill's copy stays separate.

`disableAllHooks` does follow precedence: Claude Code reads the resolved value, so `false` in `.claude/settings.json` overrides `true` in user settings, and only a managed-level `disableAllHooks` can disable managed hooks. There is no way to disable one hook while keeping it configured; delete its entry.

HTTP hook allowlists apply to every source: `allowedHttpHookUrls` (when set at any level, an `http` hook runs only if its URL matches the merged list) and `httpHookAllowedEnvVars` (only listed vars interpolate into headers).

## Cloud sessions

A cloud session reads the clone's `.claude/settings.json` (single-repo sessions only) and server-managed settings. It never reads `~/.claude/settings.json` or `.claude/settings.local.json`, and plugins declared in the repo don't load there. `$CLAUDE_CODE_REMOTE` is `"true"` in remote environments.

## Workspace trust

Interactive sessions hold back hooks from every settings file, including your own user settings, until you accept the trust dialog for the folder. `-p` and SDK sessions never show the dialog and treat the folder as trusted, so a repo's committed `.claude/settings.json` hooks run. Before scripting `claude -p` over an unfamiliar repo, inspect `.claude/`, use `--bare`, or pass `--settings '{"disableAllHooks": true}'`. Skill-frontmatter hooks in a project follow the settings-file rule; project subagent frontmatter hooks are stricter.

## Plugin hooks

Standard layout puts hook config at `hooks/hooks.json` under the plugin root (never inside `.claude-plugin/`). Scripts conventionally live in `scripts/`. The file wraps the event map in a top-level `"hooks"` key; a file with only the event map fails to load. In this repo the same file also carries `"modules"` for mods.

```json
{
  "description": "Automatic code formatting",
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "Write|Edit",
        "hooks": [
          { "type": "command", "command": "${CLAUDE_PLUGIN_ROOT}/scripts/format.sh", "args": [], "timeout": 30 }
        ]
      }
    ]
  }
}
```

`plugin.json` may also declare `"hooks"` as a `.json` path (with the `"hooks"` wrapper), an inline event map (no wrapper), or an array mixing both; these merge with `hooks/hooks.json`. Every manifest path is relative to the plugin root, starts with `./`, must exist and must stay inside the root. A marketplace entry's `hooks` replace the manifest's matchers for the same event (strict mode default) and only load inline when the plugin has no `plugin.json`.

Path variables, resolved anywhere in `command` and `args`, and exported to the hook process as env vars:

| Variable | Resolves to | Use for |
| :- | :- | :- |
| `${CLAUDE_PLUGIN_ROOT}` | the plugin's installed version directory; changes on every update | bundled scripts and config |
| `${CLAUDE_PLUGIN_DATA}` | `~/.claude/plugins/data/<id>/`, created on first reference, kept across updates, deleted on last uninstall unless `--keep-data` | `node_modules`, caches, state |
| `${CLAUDE_PROJECT_DIR}` | project root where the session started (stays put in worktrees; read `cwd` from input for Claude's current dir) | project-local scripts |

Plus `CLAUDE_PLUGIN_OPTION_<KEY>` for each `userConfig` option. `${user_config.KEY}` substitutes in exec-form `args` only; a shell-form `command` that references it fails with an error. These variables are not in the env of Bash commands Claude runs, nor in a mod's `$.process.run` env.

Exec form vs shell form: `args` present means Claude Code resolves `command` on `PATH` and spawns it directly, each `args` element one argument, placeholders substituted as plain strings. `args` absent means `sh -c` (Git Bash or PowerShell on Windows) parses `command`; quote placeholders (`"\"${CLAUDE_PLUGIN_ROOT}\"/scripts/x.sh"`). `claude plugin validate` warns about an unquoted placeholder in shell form. On Windows, exec form needs a real executable; run `node` with the script path rather than a `.cmd` shim.

A plugin's `SessionStart` hook that returns `initialUserMessage` or `sessionTitle` is ignored if the plugin finished installing after those hooks ran. Timeouts on plugin-provided `SessionEnd` hooks don't raise the 1.5 s budget. Marketplace-installed plugins get eligible Node dependencies installed automatically when cached; otherwise install into `${CLAUDE_PLUGIN_DATA}` from a hook that checks for `node_modules` first, because `Setup` doesn't run on normal launches.

Validate with `claude plugin validate --strict plugins/<name>`; mods additionally use `claude plugin test`, which loads every `*.test.*` file as a mod test, so hook-side script specs are `*.spec.ts` run with `bun test`.

## When edits take effect

Claude Code watches settings files and reloads `hooks` (and `permissions`, credential helpers) in the running session, firing `ConfigChange` per detected change. A file created mid-session loads if its folder existed at start (the project `.claude/` folder is loaded even if created in-session). If `/hooks` doesn't show a change after a few seconds, restart the session. MDM and console-managed settings arrive on a schedule, not on save.

## Debugging checklist

1. `/hooks`: is the hook listed under the right event, from the expected source? "Only hooks from managed settings run here" means `allowManagedHooksOnly`.
2. Run the script by hand: `echo '{"hook_event_name":"PreToolUse","tool_name":"Bash","tool_input":{"command":"ls"}}' | ./hook.sh; echo $?`. Check `jq` is installed and the script is executable.
3. `claude --debug-file /tmp/claude.log`, trigger the event, `grep -n 'Hooks:\|Hook output\|unrecognized keys' /tmp/claude.log`. `Hooks: <Event>:<match> [cmd] finished with status N (Nms)` confirms it ran (v2.1.296+); `timed out after`, `cancelled`, `failed to start` name the failure. `/debug` enables logging mid-session. `CLAUDE_CODE_DEBUG_LOG_LEVEL=verbose` adds matcher counts.
4. `Ctrl+O` transcript view: success shows nothing; a blocking error shows the reason; a non-blocking error shows `<hook name> hook error` with the first stderr line or a JSON parse/validation message.
5. "Hook JSON has no effect": either something printed before the `{` (shell profile echo; wrap profile output in `[[ $- == *i* ]]`) or a field is at the wrong level (`permissionDecision`/`additionalContext` belong inside `hookSpecificOutput`).
6. Stop hook loops: check `stop_hook_active`; the 8-block cap is `CLAUDE_CODE_STOP_HOOK_BLOCK_CAP`.
7. Windows: `blocking because Git Bash wasn't found` means a shell-form hook ran under PowerShell; install Git for Windows, set `CLAUDE_CODE_GIT_BASH_PATH`, or add `"shell": "powershell"` with `"onFailure": "block"`.
8. `claude doctor` lists settings entries Claude Code rejected; `/status` shows which settings files loaded.
