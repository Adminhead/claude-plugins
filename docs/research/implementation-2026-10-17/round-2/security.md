# Batch: security (round 2)

## Plugins created

| Name | Type | Description (= plugin.json) | Sources | Deps |
| --- | --- | --- | --- | --- |
| security-scan | skill (manual, `disable-model-invocation`) | Manual security audit of a branch: gitleaks, semgrep, trivy, govulncheck and pip-audit in one script, subagent verification, a ranked findings table, plus CI and supply-chain trust checks and SBOM guidance. | archive security/skills/audit (+scripts, tests, fixtures); Anthropic-Cybersecurity-Skills generating-and-analyzing-sboms (Apache-2.0) -> references/sbom.md; awesome-copilot security-and-owasp.instructions.md (MIT) -> anti-pattern list in references/vuln-categories.md + 3 lines in language-patterns.md; crew security-auditor checklist -> new references/ci-supply-chain.md | none |
| threat-model | skill | STRIDE threat modeling from the code: trust boundaries, data-flow diagram, verified findings tiered by exploitability, attack trees, testable security requirements and mapped controls. | archive security/skills/threat-model; wshobson security-scanning attack-tree-construction -> references/attack-trees.md; threat-mitigation-mapping + security-requirement-extraction -> references/requirements-and-controls.md; stride-analysis-patterns -> recurring-threats + boundary-ranking sections in stride-elements.md (all MIT) | none |
| privacy-review | skill | Privacy and data-handling review: inventories personal data, traces where it flows and rests, and checks minimization, retention, erasure, export, and PII in URLs and logs. | archive security/skills/privacy-review | none |
| security-auditor | agent (read-only) | A read-only security review subagent for diffs and code areas: taint tracing, auth, injection, secrets, supply chain, CI and IaC trust, returning severity-ranked findings with attack paths. | archive crew/agents/security-auditor.md | none |

Licensing: security-scan ships LICENSE (Apache-2.0 text + awesome-copilot MIT) and NOTICE (files modified). threat-model ships LICENSE (wshobson MIT with an attribution header). Each adapted reference has an "Adapted from ..." line.

## Validation and tests

- `claude plugin validate --strict plugins/{security-scan,threat-model,privacy-review,security-auditor}`: all pass.
- `.claude/skills/skill-authoring/scripts/validate_skill.py` on the three skills: all valid.
- security-scan scripts: `uvx --from pytest==8.4.2 pytest -q -p no:cacheprovider tests` -> 36 passed (system python has no pytest). Caches removed.
- Grep for codegraph, claude-mem, coding-core:, github:, Efficient, security:, auth:auth, review:, sentry-core, crew, coder-high/max, Prompt Defense: none left.

## Changes and deviations

- Script review (scan.py, scanners.py, normalize.py read line by line): `go run govulncheck@latest` and unpinned `uvx pip-audit` now pinned (`govulncheck@v1.9.0`, `pip-audit@2.10.1`, both latest as of 2026-10-17, checked against proxy.golang.org and PyPI). Test fake_run updated to strip `@version` from the key. Documented in Gotchas that pip-audit installs requirements into a temp venv (sdist build code runs) and that semgrep fetches p/default.
- security-scan description no longer carries the "Not for" list (moved to the body); invocation is `/security-scan:security-scan [base-ref]`. Auth cross-ref -> `app-auth` (if installed); added `gh-actions` for CI fixes.
- security-auditor: no Edit/Write; gets Bash, so it is a **candidate for readonly-agent-gate `extra_agents`**. It does NOT preload security-scan, because a skill with `disable-model-invocation: true` cannot be preloaded (agent-authoring frontmatter reference); instead it recommends `/security-scan:security-scan` to the caller and loads `threat-model` via the Skill tool for design-level requests. Not preloading threat-model either, to keep diff reviews lean. Dropped codegraph/context7/exa/old consult tool names; uses codebase-memory tools and `mcp__consult__consult`; second-opinion referenced by plugin name. Fix owners now coder/devops/dba. Model kept at opus/high as in the archive.
- awesome-copilot: only missing anti-patterns lifted as one-line pattern/safe-form entries with OWASP 2025 ids; no regexes or code samples copied. OWASP Top 10:2025 list verified at top10.owasp.org.
- wshobson: Python template libraries not ported; the concepts (OR/AND roll-up, choke points, coverage, Mermaid shapes, requirement patterns per STRIDE, control types/layers) were rewritten as prose. Compliance clause numbers from upstream (PCI DSS 3.2.1, ASVS 4 numbering) deliberately dropped in favour of "look up the current version".
- sbom.md: verified with Context7 (/sigstore/cosign, /anchore/grype): keyless is default (COSIGN_EXPERIMENTAL removed), keyless verify needs --certificate-identity and --certificate-oidc-issuer, new bundle format via OCI referrers is the attest default, Grype --fail-on returns exit 2. Upstream install-script `curl | sh` lines and agent.py dropped.

## Unverified / TODO

- Syft source prefixes and `-o fmt=file` syntax taken from upstream, not rechecked against current Syft docs.
- zizmor/actionlint named as optional read-only tools without checking their current CLI flags (no flags are given).
- The claim that `github.actor` can differ from the PR author on re-runs is stated generally; worth a doc check if precision matters.
- No trigger evals came with the archived skills; none written.

## Suggested follow-ups

- Coordinator: add security-auditor to readonly-agent-gate docs as an `extra_agents` example.
- Consider evals for threat-model and privacy-review routing (near-misses: security-scan, /security-review).
- A small script to bump the pinned scanner versions would keep security-scan current.
