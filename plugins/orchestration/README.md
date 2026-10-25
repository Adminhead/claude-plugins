# orchestration

The main-session orchestrator agent. It plans work, routes it to the installed agents (the `agent-router` mod builds its routing table) and verifies what comes back.

## Install

```
/plugin install orchestration --marketplace Adminhead/claude-plugins
```

`orchestration-meta` installs it together with `agent-router`, the general agents and `readonly-agent-gate`.

## Start a session

The `claude-orchestrate` launcher appends the orchestration prompt to Claude Code's default system prompt, so the default tool and safety guidance stays in place:

```
claude-orchestrate [OPTIONS] [DIR] [CLAUDE_ARGS...]
claude-orchestrate ~/code/api --resume
claude-orchestrate -H ~/code/api -- --model opus
```

At each launch it writes `agents/orchestration.md` without its frontmatter to `${XDG_STATE_HOME:-~/.local/state}/claude-orchestrate/orchestration.md`, then runs `claude --append-system-prompt-file <that file>` in DIR (default: the current directory) with `CLAUDE_ORCHESTRATE=1` set. That variable tells `agent-router` to list the installed agents in the Agent tool's description. `-a AGENT` (or `CLAUDE_ORCHESTRATE_AGENT`) runs another agent through `--agent` instead, without the orchestration prompt or `CLAUDE_ORCHESTRATE`; `-p FILE` appends that file instead of the orchestration prompt, `--no-prompt` appends none, and `-n` prints the commands without running them. `claude-orchestrate -h` lists every option.

The plugin's SessionStart hook ([`scripts/link-launcher.sh`](scripts/link-launcher.sh)) links `~/.local/bin/claude-orchestrate` to the installed copy each time a session starts, so the link follows plugin updates. A regular file at that path is never replaced. Make sure `~/.local/bin` is on your `PATH`. Before the first session, run it from `<plugin root>/scripts/claude-orchestrate`.

`claude --agent orchestration:orchestration` or the `agent` setting also work, but the agent's prompt then replaces Claude Code's default system prompt.

### Agent shell

The launcher sets `CLAUDE_CODE_SHELL` to bash, so Claude's Bash tool doesn't load your zsh or fish config. It also sets `CLAUDE_ENV_FILE` to `~/.config/claude-orchestrate/agent.bashrc`, which runs before every command. The first launch copies [`templates/agent.bashrc`](templates/agent.bashrc) there. It turns off pagers, editors and credential prompts, sets a UTF-8 locale and `NO_COLOR`, adds the usual `~/.local/bin`, cargo, go and krew `PATH` entries, and activates mise shims. Edit your copy to add your own `PATH` and tool setup. Plugin updates never overwrite it. Don't set shell options such as `set -e` there, because they would apply to the agent's commands.

### herdr

[herdr](https://herdr.dev) is a terminal multiplexer that tracks agent state.

- **Inside a herdr pane** (`HERDR_ENV=1`), Claude runs in that pane and inherits `HERDR_ENV`, `HERDR_SOCKET_PATH` and `HERDR_PANE_ID`, which herdr's Claude hook needs. `-t` opens a new tab instead and starts Claude there with `herdr agent start`.
- **Outside herdr**, `-H` (or `CLAUDE_ORCHESTRATE_HERDR=1`) starts the herdr server if it isn't running, opens a workspace for DIR with the agent's environment, starts Claude in it, and attaches. `-d` skips the attach. `HERDR_SESSION=NAME` uses a named herdr session.
- The agent is named after the repo (`api`, then `api-2`, and so on) so `herdr agent` commands can target it.
- If Claude stops at a dialog on startup, such as the folder trust check, the launcher says so and you answer it after attaching.
- To let herdr resume Claude sessions after a restart, install its integration once with `herdr integration install claude`. The launcher reminds you while it is missing.
