# Batch aws (round 2)

## Plugins created

| Name | Type | Description (plugin.json) | Sources | Deps |
| --- | --- | --- | --- | --- |
| `aws-resource-query` | S | Read-only AWS CLI resource inspection: what exists in an account or region and how it is configured, with a deny-list for secret and data reads, --query projections, and changes only on request. | archive aws/skills/resource-query (seeded from awesome-copilot `aws-resource-query`, MIT) | none |
| `aws-cloudwatch` | S | AWS incident investigation from CloudWatch alarms, metrics, Logs Insights and CloudTrail: blast radius, change correlation, timeline and per-resource health, with mutating fixes only after approval. | archive aws/skills/cloudwatch-investigation (seeded from awesome-copilot `aws-cloudwatch-investigation`, `aws-resource-health-diagnose`, MIT) | none |
| `aws-well-architected` | S | AWS Well-Architected and cost review of a workload from its IaC and read-only live calls: per-pillar findings rated High, Medium or Low, plus right-sizing candidates backed by CloudWatch and Cost Explorer. | archive aws/skills/architecture-review (seeded from awesome-copilot `aws-well-architected-review`, `aws-cost-optimize`, MIT) | none |

Each plugin: `.claude-plugin/plugin.json`, `skills/<name>/SKILL.md` (114 / 86 / 54 lines), `references/` copied from the archive, `LICENSE` (awesome-copilot MIT text, "Copyright GitHub, Inc."), and `evals/`.

## Validation and tests

- `claude plugin validate --strict plugins/aws-resource-query` -> passed
- `claude plugin validate --strict plugins/aws-cloudwatch` -> passed
- `claude plugin validate --strict plugins/aws-well-architected` -> passed
- Frontmatter parsed with PyYAML; skill descriptions 337 / 324 / 329 chars.
- grep for codegraph, claude-mem, coding-core:, github:, Efficient, aws:<skill>, infra:, deploy:, observability:, sentry-core, MCP/aws-mcp/run_script: no hits (only `aws:SecureTransport`, a real IAM condition key, remains in pillars.md).
- Evals: not run (`claude plugin eval` not executed). No scripts or tests to run.

## Changes from the archive

- AWS MCP server dropped: removed `.mcp.json`, `references/aws-mcp.md`, and the "AWS MCP Server" sections in all three skills; well-architected's doc lookups now say Context7 or Exa, else label unconfirmed.
- resource-query: deny-list, "secrets in full output" table, output-expanding flag ban, Changes rules and read-only CLI contract kept verbatim.
- cloudwatch and well-architected used to say "follow aws:resource-query's deny list". Since they are now separate plugins that may be installed alone, I inlined a short deny-list and the `--query` projection rule into each, and kept "the aws-resource-query skill, if installed" as the fuller reference. well-architected also inlines the change rules (show command, dry-run, confirm destructive, verify) that it used to borrow.
- Cross-refs renamed: sentry-core:sentry -> `sentry-sdk`, observability:postmortem -> `postmortem`, deploy:production-readiness -> `production-readiness`, infra:terraform -> `terraform`, all "if installed". "Not for ..." lists moved from descriptions into bodies.
- Attribution: the archive had no attribution line, but archive/docs/research/third-party-skills-review.md rows 106, 107 and 133 record the awesome-copilot MIT seeds, so each SKILL.md gains an "Adapted from awesome-copilot ... (MIT, Copyright GitHub, Inc.)" line and a LICENSE file.
- Evals: ported `resource-query-routing` (grader now `aws-resource-query:aws-resource-query`, plus a negative on `aws-cloudwatch`), and added one routing case each for `aws-cloudwatch` and `aws-well-architected`. Old eval `results/` not carried over.
- CloudTrail rate limit now reads "two requests per second per region".

## Verified

- CloudWatch retention (1-min 15 days, 5-min 63 days, 1-hour 455 days) and GetMetricData max 100,800 datapoints: AWS GetMetricData API reference.
- CloudTrail lookup-events: 90 days of management events, 2 req/s per region (web sources; consistent with AWS docs).
- The other facts (Logs Insights syntax, metric namespaces) were checked against AWS docs at archive time and are unchanged here, not rechecked.

## TODO / follow-ups

- Run `claude plugin eval` on the three routing cases after the coordinator registers the plugins.
- `cloud-ops-guard` (iac-meta) enforces AWS verbs at the hook level; the skills' deny-lists are prose only. Consider recommending it alongside these skills.
- No aws-meta (per plan decision 3); direct installs.
