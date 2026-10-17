# Coverage and CRAP for .NET

Contents: pick the path, collecting Cobertura, reading coverage, target arithmetic, CRAP, HTML reports.

## Pick the smallest path

| Request | Do | Don't |
|---|---|---|
| Explain a pasted excerpt or percentage | Answer from it | Run tools or tests |
| Interpret an existing Cobertura file, or "why is coverage stuck?" | Read that file, reconcile totals, name the blocking members | Rerun tests, install tools, compute CRAP |
| Risk hotspots, CRAP, "is it safe to refactor X?" | Compute CRAP from real coverage (below) | Rank by coverage alone |
| Coverage needed but none exists | Collect once with the repo-compatible command, then analyze | Guess coverage |
| HTML/CSV report asked for | Give the direct answer first, then generate it | Generate files nobody asked for |

## Collect Cobertura

Use the repo's coverage script if there is one. Otherwise, from the detected mode:

| Provider | Command |
|---|---|
| `coverlet.collector`, VSTest | `dotnet test <tests.csproj> --collect:"XPlat Code Coverage" --results-directory artifacts/coverage` |
| Microsoft collector, VSTest | `dotnet test <tests.csproj> --collect "Code Coverage;Format=cobertura" --results-directory artifacts/coverage` |
| `Microsoft.Testing.Extensions.CodeCoverage`, VSTest-mode bridge | `dotnet test <tests.csproj> -- --coverage --coverage-output-format cobertura --coverage-output coverage.cobertura.xml` |
| Same, native MTP mode (SDK 10+) | `dotnet test --project <tests.csproj> --coverage --coverage-output-format cobertura --coverage-output coverage.cobertura.xml` |

Collectors often write into a GUID subfolder: `find artifacts/coverage -name '*.cobertura.xml'`. Test failures with exit code 1 may still produce valid coverage; continue and note the failures. A build failure stops collection.

Don't add coverage packages, edit project files or install global tools without the user's go-ahead; name the missing prerequisite and the command that would work. Classic (non-SDK) projects: use only a repo-provided command; otherwise ask for Cobertura XML. Never derive numbers from another assembly or from estimates.

Before using a report, check that it parses, has at least one class and method, and contains the target. An empty report or one missing the target is a failed collection or filter, not 0%.

## Reading coverage

- A hit line proves execution, not both branch outcomes. `condition-coverage="50% (1/2)"` says one outcome ran, not which; recommend a test that forces the other, and don't invent the predicate without the source.
- Overall line rate comes from the root `lines-covered` / `lines-valid`. Method line ranges overlap and omit class-level lines, so summing methods is not project truth.
- Name every below-threshold member you found; lead with the biggest blockers and summarize the rest. Never call one member "the whole gap" unless its distinct uncovered lines reconcile with the total.
- Compiler-generated names (`<RunAsync>d__4`, `<>c__DisplayClass`) map back to async methods, lambdas and local functions; check the source before presenting them.
- Default thresholds if the user gives none: 80% line, 70% branch.

## Target arithmetic

For target `T`: required covered lines = `ceil(lines-valid × T)`. Projected coverage = `(covered + newly covered distinct lines) / lines-valid`. When asked whether one member can reach the target, show its maximum projection and at least one concrete combination that suffices (or say none of the supplied ones does).

## CRAP

`CRAP(m) = complexity² × (1 − coverage)³ + complexity`, with coverage as a 0-1 ratio. Full coverage gives CRAP = complexity; zero coverage gives complexity² + complexity.

| CRAP | Risk |
|---|---|
| < 5 | Low |
| 5 to < 15 | Moderate |
| 15 to 30 | High |
| > 30 | Critical (default flag threshold) |

Complexity: prefer a machine value (the Cobertura `complexity` attribute when it maps to current source, or a code-metrics report). Otherwise count by hand and label it manual: start at 1, add 1 for each `if`, `else if`, `case`, `for`, `foreach`, `while`, `do`, `catch`, `&&`, `||`, `??`, `?.`, `?:`, and pattern-match arm.

Parse Cobertura without PowerShell, for example:

```bash
python3 - "$COBERTURA" <<'PY'
import sys, xml.etree.ElementTree as ET
root = ET.parse(sys.argv[1]).getroot()
rows = []
for cls in root.iter("class"):
    for m in cls.iter("method"):
        cx = float(m.get("complexity") or 1)
        cov = float(m.get("line-rate") or 0)
        rows.append((cx * cx * (1 - cov) ** 3 + cx, cls.get("name"), m.get("name"), cx, cov))
for crap, c, m, cx, cov in sorted(rows, reverse=True)[:10]:
    print(f"{crap:7.1f}  cx={cx:<4.0f} cov={cov:5.1%}  {c}.{m}")
PY
```

Report the top 3 hotspots by default (up to 10 on request), how many more exceed the threshold, and 1-3 priorities. Prefer complex uncovered critical paths (auth, payments, data access, error handling) over getters, generated code and migrations. Recommend test cases; writing them is a separate step. Never publish a CRAP number from assumed coverage.

## HTML/CSV reports

Only when asked, after the direct answer. Install ReportGenerator locally rather than globally:

```bash
dotnet tool install dotnet-reportgenerator-globaltool --tool-path artifacts/coverage/.tools
artifacts/coverage/.tools/reportgenerator \
  -reports:"artifacts/coverage/**/*.cobertura.xml" \
  -targetdir:artifacts/coverage/report \
  -reporttypes:"Html;TextSummary;MarkdownSummaryGithub;CsvSummary"
cat artifacts/coverage/report/Summary.txt
```

If the install fails (offline), keep the text answer and say the HTML report was skipped; don't retry in a loop.
