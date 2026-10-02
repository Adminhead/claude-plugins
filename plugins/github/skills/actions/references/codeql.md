# CodeQL

Read only when the task covers CodeQL setup or configuration, CodeQL SARIF, or a CodeQL build or analysis failure. Trigger, permission, and action-ref decisions come from the other references.

## Set the analysis boundary

1. Check the current [CodeQL code scanning docs](https://docs.github.com/en/code-security/code-scanning/introduction-to-code-scanning/about-code-scanning-with-codeql), [advanced setup](https://docs.github.com/en/code-security/code-scanning/setting-up-code-scanning/configuring-advanced-setup-for-code-scanning), and [`github/codeql-action`](https://github.com/github/codeql-action) releases before choosing syntax, languages, build modes, or versions.
2. Find what owns each language today: default setup, advanced setup, or a local CodeQL CLI. Don't add a second owner without a documented migration. `gh api repos/{owner}/{repo}/code-scanning/default-setup` shows default-setup state.
3. Inventory languages, source roots, generated and vendored dirs, build systems, and components. Use documented language ids and one build mode per analysis unit. Choose `none` build mode only when its coverage is acceptable. For compiled languages, the build runs after `init` and compiles the real production targets, not just a dependency restore or partial test target.

## Setup types

- **Default setup** is enabled in repository settings. GitHub picks languages and query suite, and it uses `none` build mode wherever the language supports it. Choose it when the repo needs no custom build, triggers, or queries.
- **Advanced setup** is a `.github/workflows/codeql.yml` file you own, for custom triggers, build commands, query suites, config files, or a language matrix.
- To move from default to advanced, switch default setup off first, then commit the workflow. Two owners for one language produce duplicate runs and conflicting categories.

## Languages and build modes

Use the documented language ids. `java-kotlin` covers Java, Kotlin, or both, and `javascript-typescript` covers JavaScript, TypeScript, or both.

| Language | `language:` value |
| --- | --- |
| C, C++ | `c-cpp` |
| C# | `csharp` |
| Go | `go` |
| Java, Kotlin | `java-kotlin` |
| JavaScript, TypeScript | `javascript-typescript` |
| Python | `python` |
| Ruby | `ruby` |
| Rust | `rust` |
| Swift | `swift` |
| GitHub Actions workflows | `actions` |

Check the live [supported languages](https://codeql.github.com/docs/codeql-overview/supported-languages-and-frameworks/) page, since Rust and others have moved between preview and general availability.

Build modes, set per language with `build-mode:` on `github/codeql-action/init`:

| Mode | Behavior | Languages |
| --- | --- | --- |
| `none` | Builds the database from source without a build | All interpreted languages, plus C/C++, C#, Java, and Rust |
| `autobuild` | CodeQL guesses the build and runs it | C/C++, C#, Go, Java, Kotlin, Swift |
| `manual` | You write the build steps between `init` and `analyze` | Same as `autobuild` |

Interpreted languages need no build. `none` can give less complete results for compiled code, for example when generated sources or unusual build flags matter, so choose it knowingly. Per-language `autobuild` behavior and runner needs are on the [build options page](https://docs.github.com/en/code-security/reference/code-scanning/codeql/build-options-for-compiled-languages). Set `dependency-caching: true` on `init` to cache restored dependencies where supported.

## Monorepo categories

Each analysis unit uploads under its own `category` on `analyze`, such as `/language:${{ matrix.language }}` or `/language:go/component:api`. The category must be stable across runs, because it is how GitHub matches new results to old alerts and closes fixed ones. Narrow the scanned paths with a `config-file` (`paths:`) rather than `paths-ignore` on the workflow trigger, since a trigger filter decides whether the workflow runs and not which files are analyzed.

## CodeQL CLI

Use the CLI for scanning outside GitHub Actions or when a build can't run there. Download the CodeQL bundle (CLI plus compatible queries) from the [`github/codeql-action` releases](https://github.com/github/codeql-action/releases) and verify the checksum from the release page rather than using an unpinned installer.

```bash
codeql database create <db-dir> --language=<id> --source-root=<dir> [--command='<build>']
codeql database analyze <db-dir> --format=sarif-latest --sarif-category=<category> --output=<file>.sarif -- <suite-or-pack>
codeql github upload-results --sarif=<file>.sarif --repository=<owner/repo> --ref=<ref> --commit=<sha>
```

`--command` supplies the build for compiled languages. Uploading needs a token with `security-events: write` access, passed on stdin with `--github-auth-stdin`, never on the command line or in the SARIF. Uploading creates alerts on the repo, so confirm the target repo, ref, and commit with the user first. Flags change between CLI releases, so check `codeql <command> --help` for the installed version.

## Configure and verify

- Keep init, build, analyze, and upload in the documented order inside the scan job. Don't fold unrelated CI or policy changes in.
- In a monorepo, make each unit's source scope and build explicit, and give each uploaded result set a stable, distinct `category`. Don't use path exclusions to hide a build gap.
- Treat SARIF as analysis output. Keep its category and ref/commit association, and check format, size, and result limits against the [SARIF support docs](https://docs.github.com/en/code-security/code-scanning/integrating-with-code-scanning/sarif-support-for-code-scanning). Never edit findings, fingerprints, or locations to make an upload pass.

## Diagnose

Start at the first failing CodeQL step. Record the workflow revision, event, ref and SHA, language, build mode, source scope, runner OS, and exact command. Then read the init, extraction, build, and upload messages to separate these causes:

- unsupported configuration
- a failed or incomplete build
- missing source coverage
- malformed or oversized SARIF
- upload authorization or association errors

Reproduce the build at the same revision when it's safe, and report which targets compiled and which roots were extracted. Don't change modes, exclusions, categories, or access as a blind workaround.
