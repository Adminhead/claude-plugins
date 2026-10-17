---
name: review
description: Review an MCP server before release with two passes: a static security review of the source (exposure and transport classification, baseline auth, session, rate-limit and schema controls, remote-code-execution vectors, OWASP MCP Top 10) and a release QA pass that runs one real protocol session and checks that source, runtime, metadata, and docs agree. Use when asked to review, audit, or release-check an MCP server or MCP client code. Security tests are described for the owner to run in a test environment, never run against live servers. Not for designing the tool surface (`mcp:design`), building the server (`mcp:build`), or generic code security review (`security-review`).
---

# Review an MCP server

A review has two independent passes. Run the one the request names, or both before a release.

| Pass | Evidence | Read |
| --- | --- | --- |
| Security review | Source code, config, Dockerfiles, CI | [security](references/security.md): read when judging auth, transport exposure, input handling, or dependencies |
| Release QA | A fresh local process of the candidate build | [release QA](references/release-qa.md): read when a release or install path needs proof that the server works and its published contract is true |

Findings from security review lean on code and config. Findings from release QA lean on observed protocol behavior. A schema that looks right and a unit test that passes are not runtime evidence.

## Safety rules

- Don't send attack payloads, fuzzing, or exploit probes to any running server, whether live, shared, staging, or the user's own local one. Describe each security test (the input, the expected safe result, and the unsafe result that would be a finding) so the owner can run it in an isolated test environment they control.
- Release QA starts only a fresh local process of the candidate build, with test configuration, and only after the user agrees. Its probes are protocol-conformance checks (malformed JSON, unknown method, missing argument), not exploit attempts.
- Never call a mutation-capable tool against production data. Use fixtures or a sandbox, or stop and name the missing safe environment.
- Redact secrets in everything you record: show environment variable names, not values, and never print tokens, cookies, or authorization headers.
- Reading source is always safe. Running package-manager audit commands (`npm audit`, `pip-audit`, `cargo audit`) sends dependency names to a registry, so say so and ask first.

## Procedure

1. Establish the target: server or client, language and SDK version, transports, protocol revision the code claims, and where it runs (local child process, container, hosted).
2. Run the pass or passes. Record evidence as `file:line` for source findings and as the exact command plus response for runtime findings.
3. Mark anything that depends on deployment config, identity-provider state, or logs you can't see as `NEEDS INVESTIGATION`, and name the artifact needed to settle it. Don't guess in either direction.
4. Report findings grouped by severity with the narrowest fix for each. Separate code findings from manual follow-ups. Don't edit the server unless the user asks for fixes.

## Sources

- <https://modelcontextprotocol.io/specification/2026-07-28/server/tools> (server security requirements)
- <https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization>
- <https://modelcontextprotocol.io/specification/2026-07-28/basic/transports/streamable-http>
- <https://owasp.org/www-project-mcp-top-10/>
