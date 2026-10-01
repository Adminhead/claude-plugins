# claude-plugins

Claude Code plugin marketplace `adminhead`. It lists two plugins: `example`, a template to copy, and `secret-stash`, which keeps secrets out of API requests (see its [README](plugins/secret-stash/README.md)).

## Layout

```
.claude-plugin/
  marketplace.json        marketplace manifest; lists every plugin
plugins/
  <name>/
    .claude-plugin/
      plugin.json         name, version, description, author
    skills/<name>/SKILL.md
    agents/*.md
    commands/*.md
    hooks/hooks.json      e.g. { "modules": ["./register.ts"] }
    hooks/register.ts     hooks module
    .mcp.json
```

A plugin directory can hold any of `skills/`, `agents/`, `commands/`, `hooks/`, and `.mcp.json`. Only `plugin.json` is always present.

`plugins/example` has a `hello` skill and a function hooks module. `register.ts` exports `register(on, options)`, and each hook has the signature `($, e, next)`.

## Use the marketplace

| Task | Command |
| --- | --- |
| Add (local path) | `claude plugin marketplace add /path/to/claude-plugins` |
| Add (GitHub, once pushed) | `claude plugin marketplace add <owner>/claude-plugins` |
| Add (URL) | `claude plugin marketplace add <url>` |
| Install | `claude plugin install <plugin>@adminhead` |
| Refresh | `claude plugin marketplace update adminhead` |
| List marketplaces | `claude plugin marketplace list` |

## Add a plugin

1. Copy the template.
   ```
   cp -r plugins/example plugins/<name>
   ```
2. Set `name`, `version`, and `description` in `plugins/<name>/.claude-plugin/plugin.json`.
3. Delete the example skill and hooks you don't need, and add your own components.
4. Add an entry to `.claude-plugin/marketplace.json`.
   ```json
   {
     "name": "<name>",
     "source": "./plugins/<name>",
     "description": "...",
     "version": "0.1.0",
     "category": "development"
   }
   ```
5. Validate (see Checks).

The entry's `name` and `version` must match `plugin.json`.

## Plugins hosted elsewhere

An entry can point at another repository. No local directory is needed.

```json
{
  "name": "<name>",
  "source": { "source": "github", "repo": "owner/repo" },
  "description": "...",
  "version": "1.0.0",
  "category": "development"
}
```

## Checks

| Purpose | Command |
| --- | --- |
| Validate the marketplace | `claude plugin validate --strict .` |
| Validate one plugin | `claude plugin validate --strict plugins/<name>` |
| Inspect an installed plugin | `claude plugin details <name>` |

`--strict` turns warnings into errors. The plugin check also reports what each hooks module hooks and calls.

## Release

```
claude plugin tag plugins/<name>
```

This creates the git tag `<name>--v<version>`. It fails unless the `plugin.json` version matches the marketplace entry version, so bump both together. By default it also refuses a dirty working tree or an existing tag.

| Flag | Effect |
| --- | --- |
| `--dry-run` | Print the tag without creating it |
| `--push` | Push the tag after creating it |
| `--remote <name>` | Remote for `--push` (default `origin`) |
| `-m, --message <msg>` | Tag annotation; `%s` is the version |
| `-f, --force` | Skip the dirty-tree and existing-tag checks |

## Develop hooks locally

```
claude --plugin-dir plugins/<name>
```

This loads the plugin for that session without installing it.
