---
name: adr-writing
description: Creates, reviews and maintains Markdown Architecture Decision Records, including status changes, deprecation and supersession. Use when a repo needs a durable record of a significant decision and its rationale ("write an ADR", "record this decision", "supersede ADR 0003", docs/adr/).
allowed-tools: Bash(python3 ${CLAUDE_SKILL_DIR}/scripts/new_adr.py *)
---

# ADR Writing

Record consequential, long-lived technical decisions. The default format is Michael Nygard's five-section ADR with a `Date:` line, at `<repo root>/docs/adr/NNNN-kebab-case-title.md`.

Not for task plans, implementation notes or temporary experiments, and not for project vocabulary (`domain-modeling`, if installed).

The three tests in step 2 are adapted from Matt Pocock's skills (github.com/mattpocock/skills) and the convention-matching rule from Addy Osmani's agent-skills (github.com/addyosmani/agent-skills), both MIT License; see `LICENSE`.

## One home for decisions

The repo's ADR directory (`docs/adr/` by default) is the only canonical home for decisions: it is versioned, reviewed and shared with everyone who clones the repo. The codebase-memory MCP server's `manage_adr` tool is something else. It keeps one architecture document per indexed project in the server's local cache (a SQLite sidecar beside the graph database, outside the repo), per machine and unversioned, edited whole (`update`) or by heading (`set_sections`). Never record a decision only through `manage_adr`. If the project also uses `manage_adr`, treat its document as a digest: after an ADR is accepted or superseded, update a section there with a one-line summary that names the ADR file (`set_sections` touches only that heading). When that document mentions a decision with no ADR, treat it as a lead: confirm it with the decision owner and write it up here.

The helper script is `${CLAUDE_SKILL_DIR}/scripts/new_adr.py` (below, `new_adr.py`). Run it with `python3` from anywhere inside the repo, or add `--repo-root /path/to/repo`. Every write command accepts `--dry-run`.

## Workflow

1. **Discover the record set.** Run `new_adr.py --list` to see each ADR's number, status, and title. The script picks the directory in this order: `--dir`, then an adr-tools `.adr-dir` file, then the one existing directory among `docs/adr/`, `docs/adrs/`, `doc/adr/`, `docs/decisions/`, and `docs/architecture/decisions/`, then `docs/adr/`. When ADRs live in several of those, it stops and names them. Ask which one is authoritative, or check CLAUDE.md, AGENTS.md, or CONTRIBUTING, then pass `--dir`.

2. **Decide whether an ADR is warranted.** Write one when the decision passes all three tests:
   - **Hard to reverse.** Changing course later has a meaningful cost. An easy reversal needs no record.
   - **Surprising without context.** A future reader would wonder why it was done this way.
   - **A real trade-off.** There were genuine alternatives and the choice rested on specific reasons.

   Typical qualifiers are architectural shape, integration patterns between components, technology choices with lock-in, ownership and scope boundaries, deliberate deviations from the obvious path, constraints invisible in the code, and rejected alternatives whose rejection is non-obvious. Don't write one for an implementation detail. If a test is unclear, summarize the decision, alternatives, and impact, and ask the decision owner whether to record it.

3. **Generate a proposed record.**

   ```sh
   python3 ${CLAUDE_SKILL_DIR}/scripts/new_adr.py --title "Use PostgreSQL for application data"
   ```

   The script only understands `NNNN-*.md` files. If the repo already numbers or formats ADRs another way (`ADR-004-title.rst`, `adr-0004.md`), follow that convention by hand: continue its sequence and filename pattern and don't start a second scheme.

   The script takes the number after the highest existing `NNNN-*.md`, refuses to overwrite or to write outside the repo, and prints the created path. Useful options:
   - `--date YYYY-MM-DD` when the decision date isn't today.
   - `--format madr` for a repo that has adopted MADR.
   - `--number N` to choose the number yourself. The script warns when its chosen number already exists on another local or remote branch. When it does, pick a free number so the two branches don't collide on merge.

4. **Write the proposal.** Keep the generated order: `# <title>`, `Date:`, `## Status`, `## Context`, `## Decision`, `## Consequences`.
   - **Context:** neutral forces, constraints, and the alternatives considered. Don't argue for the outcome here.
   - **Decision:** active voice and unambiguous ("We will …").
   - **Consequences:** positive, negative, and follow-up effects.
   - Leave the status at **Proposed** and ask the decision owner or relevant technical authority to review it.

5. **Record the outcome.** Change the status to **Accepted** only after approval. Use **Rejected** when a proposal is declined. Use **Deprecated** when an accepted decision is still historically true but shouldn't guide new work. Keep the original `Date:` unless the repo's convention says to update it.

6. **Supersede without rewriting history.** Pass `--supersedes NNNN` when creating the replacement. The new status reads `Proposed; supersedes [NNNN](NNNN-old-title.md)`, and the old ADR stays unchanged. Once the replacement is accepted, change its status to `Accepted; supersedes …` and set the old ADR's status to `Superseded by [MMMM](MMMM-new-title.md)`. When the replacement is already approved, create it with `--status Accepted --supersedes NNNN` and the script updates both records. Don't change an accepted ADR's rationale or outcome beyond non-substantive fixes such as typos or broken links.

7. **Check before finishing.** Confirm the title, date, filename, number (not reused), status, section order, relative links, and location. If the repo keeps an index, refresh it with `new_adr.py --list --write-index`. The script writes a table to `<dir>/README.md` between `<!-- adr-index:start -->` and `<!-- adr-index:end -->` markers and leaves the rest of the file alone. Then show the diff to the decision owner.

## Formats

Nygard is the default, and the generator emits its five sections plus a `Date:` line. MADR is a richer alternative for repos that explicitly adopt it. Don't blend MADR fields into a Nygard record.

- Read `references/nygard.md` when writing or reviewing a Nygard ADR in detail.
- Read `references/madr.md` only when the repo uses MADR or the user wants to compare formats.
