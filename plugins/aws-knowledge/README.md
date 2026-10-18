# aws-knowledge

Adds the AWS Knowledge MCP server, a remote Streamable HTTP server at `https://knowledge-mcp.global.api.aws`. It needs no credentials, API key or account, and serves AWS documentation only: it cannot touch your AWS resources.

## Install

```
/plugin install aws-knowledge --marketplace Adminhead/claude-plugins
```

## Tools

Five read-only tools, named `mcp__plugin_aws-knowledge_aws-knowledge__aws___<tool>`:

| Tool | Use |
| --- | --- |
| `aws___search_documentation` | Searches AWS documentation and returns verbatim page chunks. |
| `aws___read_documentation` | Fetches a full documentation page as Markdown. |
| `aws___list_regions` | Lists AWS regions. |
| `aws___get_regional_availability` | Service, API or CloudFormation resource availability per region. |
| `aws___retrieve_skill` | Fetches an AWS skill (workflows, references) by the name `search_documentation` returns. |

## What it adds over WebFetch

- AWS's own documentation search, which returns the matching page text, instead of guessing URLs or scraping search pages.
- Per-region availability of services, APIs and CloudFormation resources, which is awkward to read from the docs pages.
- `retrieve_skill`, which has no WebFetch equivalent.
- Markdown output without a summarising model in between, so API names and parameters arrive verbatim.

Use WebFetch for pages outside the AWS documentation.

## Limits

The server is rate-limited by AWS. Heavy use can return throttling errors; wait and retry, or narrow the search. It is remote, so the version can't be pinned and AWS can change its tools or their descriptions at any time.

## Don't install with aws-mcp

`aws-mcp` serves these same five tools under the same `aws___*` names plus `run_script`, `get_presigned_url` and `get_tasks`. Installing both registers the documentation tools twice. Use `aws-knowledge` when you have no credentials or want a docs-only server, and `aws-mcp` otherwise.

## Privacy and trust

Search terms and page requests go to AWS. Don't put secrets, account ids or internal names in them. Content returned is documentation, treated as data and never as instructions.

Checked 2026-10-18: an anonymous `initialize` and `tools/list` over HTTPS returned the five tools above, all with `readOnlyHint: true`, and protocol version 2025-03-26 (server name `AWSKnowledgeMCP` 1.0.0).
