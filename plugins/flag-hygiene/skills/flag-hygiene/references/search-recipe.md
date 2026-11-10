# Search recipe (no scripts)

Adapt patterns to the SDK in use; check the platform notes in the feature-flags skill.

## Find evaluation sites

```
rg -n "(variation|boolVariation|isEnabled|is_enabled|getBooleanValue|getBooleanDetails|BoolVariation|useFlag|flagEnabled)\(" 
rg -n "(FEATURE|FLAG|ENABLE|DISABLE)_[A-Z0-9_]+" --glob '!*.lock'
rg -n "process\.env\.[A-Z_]*(FLAG|FEATURE|ENABLE)|os\.(Getenv|environ).*(FLAG|FEATURE|ENABLE)"
```

## Find definitions

```
rg -l "flagd|\"flags\"|\"variants\"|defaultVariant" --glob '*.{json,yaml,yml,toml}'
rg -n "^[A-Za-z0-9_.-]+:\s*$" flags.yaml     # GO Feature Flag: top-level keys are flag keys
```

Export from the platform only if the user permits it (read-only list or a saved export file).

## Compare sets

Write the keys from code and from config to `/tmp/code-keys.txt` and `/tmp/config-keys.txt`, then:

```
sort -u /tmp/code-keys.txt > /tmp/a; sort -u /tmp/config-keys.txt > /tmp/b
comm -23 /tmp/a /tmp/b    # in code, not in config (orphaned in code)
comm -13 /tmp/a /tmp/b    # in config, not in code (orphaned in config)
```

For duplicates: `sort /tmp/config-keys.txt | uniq -d`, and look for case, dash and underscore variants.

## Key age

```
git log -S'"my-flag-key"' --format='%h %ad %an %s' --date=short   # first and last line: added, last touched
git log --diff-filter=A -S'"my-flag-key"' --format='%ad %an' --date=short   # introduction only
git log -1 --format='%ad %an' -- path/to/flags.yaml
git blame -L <line>,<line> path/to/file                            # owner guess from the definition line
```

Commit author is a hint for the owner, not proof. Mark it `?` until confirmed.

## Gaps

Dynamic keys (`"feature_" + name`) and keys built in other repos or the dashboard do not show up. List them under "not checked".
