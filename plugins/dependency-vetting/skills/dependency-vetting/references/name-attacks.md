# Typosquatting and dependency confusion

Read this for step 2, and when recommending index or registry configuration.

## Typosquatting

### Normalize first

- PyPI: lowercase and collapse runs of `-`, `_` and `.` to `-` (PEP 503). `My_Package`, `my-package` and `my.package` are the same project, so compare normalized names.
- npm: names are lowercase; a scope (`@scope/name`) is part of the name. `@types/node` and `types-node` are different packages, and an unscoped copy of a scoped name is a common trick.

### Variants to check against the intended name

| Pattern | Example for `requests` / `lodash` |
| --- | --- |
| Omission | `reqests`, `lodas` |
| Transposition | `reqeusts`, `lodahs` |
| Duplication or insertion | `requestss`, `llodash` |
| Keyboard-adjacent substitution | `requesta`, `lidash` |
| Separator change | `python-dateutil` vs `python_dateutil` vs `pythondateutil` (npm only; PyPI normalizes separators) |
| Combosquat prefix or suffix | `python-requests`, `requests-toolkit`, `lodash-utils`, `requests2` |
| Scope confusion | `@lodash/lodash`, `lodash` re-published under a lookalike scope |
| Homoglyphs and lookalike words | `rn` for `m`, `l` for `1`, `colourama` for `colorama` |

### Signals that turn a similar name into a suspect

A similar name alone isn't proof; many legitimate packages have close names. Weigh it with metadata:

| Signal | Stronger when |
| --- | --- |
| Edit distance to a popular or already-used package | 1, or 2 with a plausible typo |
| Age | Created in the last 90 days, while the look-alike target is years old |
| Downloads | Under 1/1000 of the target's |
| Publisher | Different from the target's maintainers |
| Versions | One or two releases |
| Repository | Missing, or pointing at the target's repo (starjacking) |
| Description and README | Copied from the target |
| Install-time code | Any, in a package that shouldn't need it |

Three or more strong signals: report as suspicious without downloading. Suggest the legitimate package name.

## Dependency confusion

An attacker publishes a public package with the same name as an internal one, usually with a high version such as `99.0.0`. A resolver that merges a private and a public index and picks the highest version installs the attacker's copy.

### Detect

1. List internal package names: anything served from the private index, workspace members, and names in manifests that don't resolve publicly.
2. Probe the public registry for each:

   ```bash
   curl -s -o /dev/null -w '%{http_code}\n' https://registry.npmjs.org/@acme%2finternal-utils
   curl -s -o /dev/null -w '%{http_code}\n' https://pypi.org/pypi/acme-billing-sdk/json
   ```

   `200` means a public package of that name exists: if it isn't yours, it is a substitution risk now. `404` means the name is claimable: a risk once someone registers it.
3. Check how the project resolves (below). Safe resolution makes both cases harmless.

`confused` (visma-prodsec) automates step 2 for `package.json` and `requirements.txt`. With `-s '@acme/*'` it skips scopes you control.

### Resolution that prevents it

npm (`.npmrc`, committed):

```ini
@acme:registry=https://registry.example.com/npm/internal/
```

Every package in a scope you own resolves only from that registry. Keep internal npm packages scoped; an unscoped internal name has no such pin. If one registry proxy serves both internal and public packages, confirm the proxy prefers the internal copy and doesn't merge versions.

uv (`pyproject.toml`):

```toml
[[tool.uv.index]]
name = "internal"
url = "https://pypi.example.com/simple/"
explicit = true

[tool.uv.sources]
acme-billing-sdk = { index = "internal" }
```

uv's default `index-strategy = "first-index"` already stops a public version from outbidding a private one. Don't switch to `unsafe-best-match` to fix a resolution error.

pip (`pip.conf` or `PIP_INDEX_URL`): point `index-url` at one proxy that serves internal packages first and mirrors PyPI. Don't add the private index with `--extra-index-url`: pip treats every index as equal and takes the highest version from any of them. pip doesn't read index settings from `pyproject.toml`.

poetry: give the private source `priority = "explicit"` and set `source = "<name>"` on each internal dependency.

### Defensive registration

For an internal name that must stay unscoped, the owner can register a placeholder on the public registry. That is a publish action on the user's account; recommend it, don't do it.
