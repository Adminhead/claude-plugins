# MCP dependency review

Read this when an `.mcp.json` (or a plugin's `.mcp.json`, or a hook) launches a server through a package runner or `docker run`. It classifies whether the configured reference can resolve to different code later, without running anything. Adapted from ECC `mcp-dependency-review` and awesome-copilot `mcp-security-audit` (both MIT).

## Never execute

Read the config as text. Don't run a `command` or `args` value, start a server, install or resolve a package, or query a registry to classify a selector. A registry lookup is a separate network step; do it only when the person asks. Stay in the requested scope: a repo review doesn't silently expand to `~/.claude.json` or other machine-wide config.

## Isolate the selector

| Launcher | Selector |
| --- | --- |
| `npx`, `bunx`, `npm exec`/`npm x`, `bun x`, `pnpm dlx`, `yarn dlx` | First positional argument, or every `-p`/`--package`/`--package=` value (then the positional is only the executable) |
| `uvx`, `uv tool run` | `--from SPEC` / `--from=SPEC`, else the first positional; review `--with` values too |
| `pipx run` | `--spec SPEC` / `--spec=SPEC`, else the first positional |
| `docker run`, `docker container run` | The image: the first positional after Docker options and their values (`-e X=Y`, `-v a:b`, `--name n`), not the in-container command |

`-y`/`--yes`, `--no` and `--quiet` take no value. Any other flag before the selector might take one, so an unknown flag means REVIEW, not a guess.

## Classify

| Selector | Result |
| --- | --- |
| `pkg@1.2.3`, `@scope/pkg@1.2.3`, `pkg==1.2.3`, `uvx pkg@1.2.3` | SAFE (direct selector only) |
| Image with `@sha256:<64 hex>`, with or without a tag | SAFE (direct image only) |
| Bare `pkg` or `@scope/pkg`; `@latest`, `@next`, `@beta` or any dist-tag | HIGH |
| Image with only a tag (even `:1.2.3`) or no tag | HIGH |
| `@^1.2.0`, `@~1.2.0`, `>=1.2,<2`, `~=1.2`, `==1.*`, `*`, `x` | MEDIUM |
| Local path, script, unknown binary, editable install, direct URL, git/VCS ref, `sh -c` wrapper | REVIEW |
| Ambiguous option boundaries or unsupported launcher | REVIEW |

A git ref that looks like a commit hash still needs REVIEW: don't infer integrity from a URL. Never omit a configured server from the report because its selector couldn't be isolated.

## Recommend

For a mutable selector, recommend pinning the exact version the team has actually reviewed, then updating it deliberately. Don't substitute today's latest registry version and call it fixed; if the reviewed version is unknown, say so. For images, recommend a digest pin.

## Report

```text
| Config | Server | Reference | Result | Why | Next step |
| .mcp.json | browser | example-browser-mcp@latest | HIGH | dist-tag can move without a config diff | pin the reviewed version |
```

Close with these boundaries:

- No MCP server was executed during the review.
- A mutable reference is a reproducibility and review signal, not evidence of a compromised package.
- SAFE covers only the direct selector or digest. It says nothing about transitive dependencies, provenance, authorization, prompt-injection resistance, or runtime isolation.
- A clean dependency result is not a complete MCP security review; the rest of the `.mcp.json` table in `SKILL.md` still applies.
