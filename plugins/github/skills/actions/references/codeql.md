# CodeQL

Read only when the task covers CodeQL setup or configuration, CodeQL SARIF, or a CodeQL build or analysis failure. Trigger, permission, and action-ref decisions come from the other references.

## Set the analysis boundary

1. Check the current [CodeQL code scanning docs](https://docs.github.com/en/code-security/code-scanning/introduction-to-code-scanning/about-code-scanning-with-codeql), [advanced setup](https://docs.github.com/en/code-security/code-scanning/setting-up-code-scanning/configuring-advanced-setup-for-code-scanning), and [`github/codeql-action`](https://github.com/github/codeql-action) releases before choosing syntax, languages, build modes, or versions.
2. Find what owns each language today: default setup, advanced setup, or a local CodeQL CLI. Don't add a second owner without a documented migration. `gh api repos/{owner}/{repo}/code-scanning/default-setup` shows default-setup state.
3. Inventory languages, source roots, generated and vendored dirs, build systems, and components. Use documented language ids and one build mode per analysis unit. Choose `none` build mode only when its coverage is acceptable. For compiled languages, the build runs after `init` and compiles the real production targets, not just a dependency restore or partial test target.

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
