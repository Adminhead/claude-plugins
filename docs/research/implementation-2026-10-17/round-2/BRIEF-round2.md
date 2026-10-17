# Round 2 addendum

Read `BRIEF.md` in this folder first; every rule there still applies. Additions for round 2:

- Round 1 is committed. 92 plugins now exist under `plugins/` (see the README catalog). Cross-references to them (for example `coding`, `planning`, `unit-testing`, `git-commit`, `terraform`, `postgres` once built) are valid; reference skills by plugin name and say "if installed" for anything outside your batch.
- Look at a finished round-1 plugin of the same type as a model before you start: skill `plugins/terraform/`, agent `plugins/debugger/`, mod `plugins/mcp-health/`, classic hook `plugins/check-bypass-guard/`.
- The read-only Bash gate (`readonly-agent-gate`) gates only `architect`, `reviewer`, `debugger` by default; users can add agents through its `extra_agents` option. If your agent should be read-only, give it no Edit/Write tools and say in your report that it is a candidate for `extra_agents`.
- Report file: `/tmp/claude-1000/-home-buck-Projects-adminhead-claude-plugins/4c97b4cf-6e6d-4d35-8d58-2530e2f3f2f4/scratchpad/impl2/<batch id>.md` (round 2 folder).
