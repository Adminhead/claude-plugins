# Source state, target types, and attributes

Official documentation reviewed: [source-state attributes](https://www.chezmoi.io/reference/source-state-attributes/), [target types](https://www.chezmoi.io/reference/target-types/), [file types guide](https://www.chezmoi.io/user-guide/manage-different-types-of-file/), and [`chattr`](https://www.chezmoi.io/reference/commands/chattr/).

Source-state names are parsed into a target name, type, and attributes. A `dot_` prefix makes a target name begin with `.`, so `dot_config/foo` targets `~/.config/foo`.

## Common attributes

| Source pattern / attribute | Effect |
| --- | --- |
| `dot_foo` | target `.foo` |
| `symlink_foo` | target is a symlink; source contents are its link target |
| `template_foo` or `foo.tmpl` | render as a template |
| `encrypted_foo` | source representation is encrypted |
| `private_foo` | private permissions |
| `readonly_foo` | remove write permissions |
| `executable_foo` | executable permissions |
| `create_foo` | create only when target is absent; preserve existing content |
| `modify_foo` | transform existing target content (template or executable script) |
| `empty_foo` | preserve an empty target |
| `exact_dir/` | remove unmanaged children in that target directory |
| `remove_foo` | remove target during apply |
| `run_foo` | execute on every apply |
| `run_once_foo` | execute once for each successful unique content |
| `run_onchange_foo` | execute when content changes |

`before_` and `after_` place managed scripts before or after target updates. Prefix ordering is significant and varies by target type. Suffixes `.age` and `.asc` are normally recognized as encrypted-file suffixes. `literal_` or `.literal` prevents further attribute parsing.

## Safe management commands

```sh
chezmoi add --template ~/.gitconfig
chezmoi add --encrypt ~/.ssh/id_rsa
chezmoi add --create ~/.config/app/local-state
chezmoi add --exact ~/.config/managed-directory
chezmoi add --follow ~/.bashrc
chezmoi chattr +template ~/.zshrc
chezmoi chattr +private ~/.ssh/config
```

Use `chattr` to change attributes; it avoids incorrectly hand-encoding a filename. Do not apply `--exact` to a directory unless removal of every unmanaged child is intended. Use `--follow` to migrate a symlink-based manager when source state should contain the symlink target's file content.

Hidden source entries are ignored except `.chezmoi*` control entries. Do not create a source entry manually when an `add` or `chattr` command expresses the intent clearly.
