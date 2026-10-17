# Release QA

Test the server users will run. A schema review or a passing unit test is not runtime evidence. This pass complements the security review: it covers protocol behavior, drift between the published contract and the code, transport correctness, and reproducible evidence.

## Rules

- Start a fresh local process built from the candidate revision, with test configuration, and only after the user agrees. Don't test a hosted, shared, or production endpoint.
- Don't call mutation-capable tools against production data. Use fixtures or a sandbox, or stop and name the missing safe test environment.
- Record exact commands and raw responses. Don't replace missing evidence with "looks correct."
- Derive the expected tool, resource, and prompt inventory from the candidate source on every run, not from memory or last release's docs.
- The failure-path probes below are protocol conformance checks. Security payloads stay in the security review as described tests.

## 1. Establish the release surface

Identify the candidate commit and build command, the entry point and transport (stdio or Streamable HTTP), the protocol revisions the server claims, the source files that register tools, resources, resource templates, and prompts, any generated catalogs, manifests, or README tables, the install instructions, and the repo's existing protocol or integration test commands. Prefer the repo's own commands (`package.json`, `pyproject.toml`, `Makefile`, CI workflows) over inventing a harness.

## 2. Start a clean server

Build the candidate and start the documented entry point. Capture the exact command, commit SHA, environment variable names (values redacted), stdout, stderr, exit status, and the endpoint or child-process transport the client used.

- For stdio, stdout carries only protocol messages. Logs, banners, and stack traces belong on stderr. Every stdout line must parse as a complete JSON-RPC message.
- For HTTP, record the status, relevant MCP headers, and how the server handles session identifiers (legacy revisions), without printing credentials.
- If the server can't start from its documented instructions, that is a release failure. Keep the startup error verbatim.

## 3. Exercise one complete session

First decide the protocol era under test. The Inspector's protocol-eras page (<https://modelcontextprotocol.io/docs/2026-07-28/tools/inspector/protocol-eras>) explains how its clients choose.

**Modern (revision 2026-07-28):** there is no `initialize` handshake. A client sends `server/discover` to learn supported versions, capabilities, and identity, and then every request carries its protocol version and client capabilities in `_meta`. Over HTTP, every POST also carries `MCP-Protocol-Version`, `Mcp-Method`, and (for `tools/call`, `resources/read`, `prompts/get`) `Mcp-Name`.

1. Discover: confirm the supported versions and advertised capabilities match what the code registers.
2. Call each discovery method the server supports: `tools/list`, `resources/list`, `resources/templates/list`, `prompts/list`.
3. Follow pagination until no cursor remains.
4. Exercise at least one representative read-only item from every advertised capability class.

**Legacy (revisions through 2025-11-25):** in one session, send `initialize` with a version the server claims to support, confirm the negotiated version and capabilities, send `notifications/initialized`, call `ping`, then run steps 2 to 4. Keep all of it in one process, because a new stdio process is a new session and one-shot requests test several incomplete sessions instead of one valid one.

Use an SDK client or the repo's integration harness for multi-step sequences. The Inspector CLI (`npx @modelcontextprotocol/inspector@2.11.0 --cli <server> --method tools/list`, needs Node 22.19 or later) runs one request per invocation, which suits stateless modern checks and can't test a legacy sequence. It exits with code 5 when a `tools/call` returns `isError: true`, so check the exit code in scripts.

## 4. Prove inventory parity

Build four inventories from current evidence:

| Surface | Evidence |
| --- | --- |
| Source | Registered tool, resource, template, and prompt definitions |
| Runtime | Results of the live discovery calls |
| Generated metadata | Catalogs, manifests, generated indexes |
| Documentation | README, reference pages, install output |

Compare by stable identifier and report source entries missing at runtime, runtime entries missing from metadata or docs, stale names, descriptions, arguments, URIs, or prompt parameters, and documented install commands that don't start the candidate. The tool list may vary with the credential presented but not per connection, so compare the list for a stated credential and say which one. Regenerate derived files with the repo's own build command in a scratch worktree or clean checkout of the candidate commit, not in the user's working tree (ask first if that isn't possible). Then fail if that checkout holds unexplained generated changes.

## 5. Check published contracts

For every discovered item, compare the runtime definition with its source.

- **Tools.** The name and description are stable and specific, and names are 1 to 128 characters from letters, digits, `_`, `-`, `.` (spec SHOULD). The `inputSchema` defines types, required fields, enums, and bounds, and rejects unknown properties when the contract is closed. Annotations (read-only, destructive, idempotent, open-world) match actual behavior. Successful results conform to `outputSchema` when one is published. Errors are tool results with `isError: true` or protocol errors, never leaked stack traces. The list order is deterministic (spec SHOULD).
- **Resources and templates.** URIs and MIME types match the registered definitions, static resources are readable, template parameters are validated before resolution, and a missing or forbidden resource fails explicitly.
- **Prompts.** Required and optional arguments match discovery, `prompts/get` returns usable messages for valid arguments, and a missing required argument or unknown prompt name fails explicitly.

## 6. Test failure paths

Probe each of these against the local candidate and verify the response has the right request ID, a useful message, and no successful side effect:

- Malformed JSON and an invalid JSON-RPC envelope.
- An unknown method (HTTP: 404 with `-32601`).
- An unsupported protocol version (modern HTTP: 400 with an unsupported-version error that lists supported versions).
- Modern HTTP: a missing or mismatched `MCP-Protocol-Version`, `Mcp-Method`, or `Mcp-Name` header (400 with `-32020`).
- Modern-only HTTP: `GET` or `DELETE` on the MCP endpoint (405).
- Legacy: a request before initialization completes, and repeated initialization.
- An unknown tool, resource, and prompt name.
- Missing, extra, wrong-type, and out-of-bounds arguments.
- A request at the documented size limit and one beyond it.
- A controlled internal failure, with credentials and stack traces redacted in the record.

For stdio, also confirm that every stdout line is a complete protocol message and that a healthy session leaves stderr quiet unless the server documents diagnostic output.

## 7. Smoke-test installation

When the project publishes an install command:

1. Create a temporary directory outside the source checkout.
2. Run the public install command exactly as documented. It downloads code, so show the command to the user first, and prefer a pinned version.
3. Start the installed artifact without relying on files from the source tree.
4. Repeat discovery and one read-only call.
5. Keep the command output, then remove the temporary directory.

An install string that was only read is unverified.

## 8. Report

```markdown
# MCP release QA: <server>

Candidate: <commit>   Transport: <stdio | Streamable HTTP>   Era tested: <modern | legacy | both>
Verdict: PASS | PASS WITH CAVEATS | FAIL

## Commands and results
- `<exact command>`: <exit status and result>

## Session transcript
- discovery: <result>
- representative calls: <result>
- negative paths: <result>

## Parity
| Identifier | Source | Runtime | Metadata | Docs | Result |
| --- | --- | --- | --- | --- | --- |

## Findings
| Severity | Evidence | Impact | Narrowest fix |
| --- | --- | --- | --- |

## Missing evidence
- <check that could not run, and why>
```

Verdicts:

- **FAIL**: the server can't start, can't complete a valid session, corrupts its transport stream, or accepts invalid input without a safe rejection.
- **PASS WITH CAVEATS**: bounded documentation or metadata drift that doesn't misrepresent a dangerous capability.
- **PASS**: everything else.

## Sources

- <https://modelcontextprotocol.io/specification/2026-07-28/basic/transports/streamable-http> (headers, status codes)
- <https://modelcontextprotocol.io/specification/2026-07-28/server/tools> (names, errors, ordering, list scope)
- <https://modelcontextprotocol.io/docs/2026-07-28/tools/inspector/cli> and `/protocol-eras`
