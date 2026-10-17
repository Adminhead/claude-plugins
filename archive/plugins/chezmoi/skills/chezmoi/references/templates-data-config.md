# Templates, data, and configuration

Official documentation reviewed: [templating guide](https://www.chezmoi.io/user-guide/templating/), [template reference](https://www.chezmoi.io/reference/templates/), [template variables](https://www.chezmoi.io/reference/templates/variables/), [configuration file](https://www.chezmoi.io/reference/configuration-file/), [`.chezmoidata`](https://www.chezmoi.io/reference/special-directories/chezmoidata/), and [`.chezmoiignore`](https://www.chezmoi.io/reference/special-files/chezmoiignore/).

## Templates

chezmoi templates use Go `text/template`, Sprig, and chezmoi functions. A source file is a template when it ends in `.tmpl`, has the template attribute, or is below `.chezmoitemplates/`.

```sh
chezmoi add --template ~/.config/tool/config.toml
chezmoi execute-template '{{ .chezmoi.hostname }}'
chezmoi execute-template < dot_config/tool/config.toml.tmpl
```

Use `execute-template` to test rendering without changing targets. The built-in `.chezmoi` object includes machine information such as OS and hostname. Keep template conditions deterministic and use `.chezmoiignore` to exclude targets that should not exist on a machine.

## Data precedence

Later sources override earlier ones:

1. built-in `.chezmoi` data;
2. `.chezmoidata.json`, `.jsonc`, `.toml`, or `.yaml` files, in alphabetical order;
3. config-file `[data]` values.

Run `chezmoi data` to inspect the effective data. Shared, versioned values belong in `.chezmoidata.*`; per-machine values normally belong in the local config. Do not store plaintext secrets in either unless that file is intentionally protected.

## Init config templates

A `.chezmoi.toml.tmpl` (or JSON/YAML equivalent) in source state is rendered during `chezmoi init` to generate local configuration. Prompt functions are intended for this initialization configuration, not routine target templates. Prefer `promptStringOnce`, `promptBoolOnce`, and other `*Once` forms so an existing value is reused.

Test an init config template without writing it:

```sh
chezmoi execute-template --init --promptString 'Email address=me@example.com' \
  < .chezmoi.toml.tmpl
```

Supported config formats are TOML, YAML, JSON, and JSONC. Multiple config files with the same basename are an error.

## Modify targets

`modify_` targets transform existing content. A template receives the current content at `.chezmoi.stdin`; an executable modify script reads stdin and writes replacement content. Keep transformations idempotent, narrow, and independently testable.
