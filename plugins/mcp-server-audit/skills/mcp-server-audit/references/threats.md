# Threats, tests and mappings

## Threat table

| Threat | What happens | How this skill detects it |
| --- | --- | --- |
| Tool poisoning | Hidden instructions in a tool's description or parameter text steer the model (read files, pass secrets in arguments, hide it from the user) | Step 3: raw surface plus `mcp_audit.py scan`, read by eye; Agent Scan `prompt_injection_tool_desc` |
| Tool shadowing | One server's descriptions change how the model uses another server's tools, or a server imitates a trusted one | `mentions-tool` and `shadows-tool` flags; duplicate server or tool names in the inventory |
| Rug pull | A tool's text or schema changes after approval, often through a floating package version | `mcp_audit.py pin` / `verify`; unpinned `npx`/`uvx`/`:latest` launch commands |
| Toxic flow | Tools that are safe alone combine into exfiltration (read private data + send to the web) | Map each server's tools to private-data sources and outbound sinks; Agent Scan `private_data` and `untrusted_content` |
| SSRF | A URL-fetching tool reaches internal targets from the server's network position | Test inputs below, owned local instance only |
| Unauthenticated exposure | An HTTP server answers `tools/list` or `tools/call` without credentials, or listens on all interfaces | Exposure checks below |
| Over-broad credentials | The server holds tokens with more scope than its tools need | Step 2 env and header review; ask for the token's scopes |

## SSRF tests (owned local test instance only)

For each tool that takes a URL, host or path and fetches it server-side, run these as tool arguments against a local test instance, with no production credentials, after the user agrees. For someone else's server, write the table up as tests for its owner.

| Input | A safe server | A finding |
| --- | --- | --- |
| `http://169.254.169.254/latest/meta-data/`, `http://metadata.google.internal/computeMetadata/v1/`, `http://100.100.100.200/` | Rejects before connecting | Returns metadata, or a timing or error difference that shows it connected |
| `http://127.0.0.1:<port>/`, `http://localhost:6379/`, `http://[::1]/` | Rejects loopback | Returns a local service's banner or response |
| `http://10.0.0.1/`, `http://192.168.1.1/` | Rejects private ranges unless it is documented as an internal tool | Reaches the private network |
| `file:///etc/passwd`, `gopher://`, `dict://` | Rejects non-http(s) schemes | Reads the file or speaks the protocol |
| A public URL that redirects to `http://127.0.0.1/` | Re-validates each redirect target, or doesn't follow | Follows the redirect inward |
| A hostname that resolves to a private address (DNS rebinding) | Validates the resolved IP at connect time | Validates the name only |

## Exposure checks

```bash
# What a local server listens on: 0.0.0.0 or [::] means every interface
ss -tlnp | grep -E 'node|python|uvx|npx|mcp'

# Does an HTTP endpoint answer without credentials? (owned servers only)
curl -s -i -X POST http://127.0.0.1:8000/mcp \
  -H 'Content-Type: application/json' -H 'Accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}' | head -n 20
```

A server meant to be private that returns a tool list here without a token is a finding. Public, intentionally anonymous read-only servers (a public code search, for example) are fine if the user accepts that. A remote server that needs auth should answer 401 with a `WWW-Authenticate` header pointing at its protected resource metadata, and a local one should bind `127.0.0.1` and check `Origin` (DNS rebinding). The 2026-07-28 revision drops the `initialize` handshake, so a modern server may also expect `MCP-Protocol-Version`, `Mcp-Method` and `_meta` on every request; a 400 for a missing header is not proof of auth.

## Mappings (for compliance-style reports)

| ID | Name | Applies to |
| --- | --- | --- |
| OWASP MCP03:2025 | Tool Poisoning | poisoning, shadowing, rug pull |
| OWASP MCP06:2025 | Prompt Injection via Contextual Payloads | poisoned descriptions, untrusted tool output |
| MITRE ATLAS AML.T0010 | ML Supply Chain Compromise | a poisoned third-party server |
| MITRE ATLAS AML.T0051.001 | LLM Prompt Injection: Indirect | descriptions as injected context |
| MITRE ATLAS AML.T0053 | LLM Plugin Compromise | MCP tools as the agent's plugins |
| MITRE ATLAS AML.T0057 | LLM Data Leakage | exfiltration payloads |
| NIST AI RMF MANAGE-2.2 | Sustaining deployed AI systems | recurring re-scans and pin checks |

OWASP's MCP Top 10 is at <https://owasp.org/www-project-mcp-top-10/>; IDs have moved between drafts, so confirm an ID there before citing it. ATLAS: <https://atlas.mitre.org/>.

## Sources

- Invariant Labs, tool poisoning disclosure: <https://invariantlabs.ai/blog/mcp-security-notification-tool-poisoning-attacks>
- Snyk Agent Scan: <https://github.com/snyk/agent-scan>
- MCP specification 2026-07-28, tools and transports security sections: <https://modelcontextprotocol.io/specification/2026-07-28/server/tools>
