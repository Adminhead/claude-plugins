# Dependency audit

Read when asked to check dependencies, before a release, or after a security advisory. Adapted in part from decebals/claude-code-java `maven-dependency-audit` (MIT; see NOTICE).

## Workflow

1. **Outdated.** List available updates; read the versions and categorize them.
2. **Tree.** Find conflicts, duplicates and unused declarations.
3. **Vulnerabilities.** Scan the resolved dependencies.
4. **Report.** Prioritized list, with the exact commands that were run.

## 1. Outdated versions

```bash
mvn versions:display-dependency-updates
mvn versions:display-plugin-updates
```

Categorize each update:

| Category | Criteria | Action |
| --- | --- | --- |
| Security | Newer version fixes a known advisory | Update soon |
| Major | `x.0.0` change | Read the changelog and migration notes; test thoroughly |
| Minor | `x.y.0` change | Usually safe; run the tests |
| Patch | `x.y.z` change | Low risk; minimal testing |

Pre-release versions (`-rc`, `-M`, `-alpha`) appear in the output; do not adopt one without the user asking.

## 2. Tree and conflicts

- `mvn dependency:tree -Dverbose` shows omitted versions. Narrow it with `-Dincludes=<groupId>:<artifactId>`.
- Flag a library that appears at two versions in the runtime scope; that is the run-time risk.
- `mvn dependency:analyze` lists unused and undeclared dependencies. Verify before removing.

## 3. Vulnerabilities

Use at least one of these; say which one ran.

- **OSV-Scanner** against the repository (`osv-scanner scan source -r .`) reads `pom.xml` and reports advisories by package.
- **OWASP dependency-check** (`mvn org.owasp:dependency-check-maven:check`) needs the plugin declared with its current release from Maven Central and produces an HTML report in `target/`.
- **Dependabot or Renovate** alerts, if the repository host has them enabled.

Severity follows the CVSS score:

| CVSS | Severity | Action |
| --- | --- | --- |
| 9.0 to 10.0 | Critical | Update now |
| 7.0 to 8.9 | High | Update within days |
| 4.0 to 6.9 | Medium | Update within weeks |
| 0.1 to 3.9 | Low | Update when convenient |

Check whether the vulnerable code path is reachable before ranking a finding above its CVSS band.

## 4. Report format

```markdown
## Dependency audit

**Project:** <name>  **Date:** <date>  **Modules:** <count>

### Security
| Dependency | Current | Advisory | Severity | Fixed in |
| --- | --- | --- | --- | --- |

### Outdated
Major (review required): ...
Minor and patch (safe with tests): ...

### Conflicts
- <artifact>: <v1> vs <v2>, resolved to <v>

### Unused
- <artifact> (check before removing)

### Next steps
1. Immediate: ...
2. This sprint: ...
3. Plan: ...
```

## Applying updates

- Do not run `versions:use-latest-releases` or `use-latest-versions` without the user naming the level; they rewrite poms across the tree.
- Prefer managed versions in the parent. Use `versions:set-property` or a single property edit for a family.
- After updating, run `mvn verify` and the `dependency:tree` diff, and state which versions moved.
- Report versions and advisory IDs only; do not paste the scanner's raw JSON.

## Token use

- Use `-q` and `-Dincludes=` to keep output short.
- Summarize conflicts instead of pasting the whole tree.
