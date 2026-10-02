---
name: adr-writing
description: Create, review, and maintain Markdown Architecture Decision Records (ADRs), including status changes, deprecation, and supersession. Use when a repo needs a durable record of a significant architectural decision and its rationale ("write an ADR", "record this decision", "supersede ADR 0003", docs/adr/). Not for task plans, implementation notes, or temporary experiments.
allowed-tools: Bash(python3 ${CLAUDE_SKILL_DIR}/scripts/new_adr.py *)
---

# ADR Writing

Record consequential, long-lived technical decisions. The default format is Michael Nygard's five-section ADR with a `Date:` line, at `<repo root>/docs/adr/NNNN-kebab-case-title.md`.

The helper script is `${CLAUDE_SKILL_DIR}/scripts/new_adr.py` (below, `new_adr.py`). Run it with `python3` from anywhere inside the repo, or add `--repo-root /path/to/repo`. Every write command accepts `--dry-run`.

## Workflow

1. **Discover the record set.** Run `new_adr.py --list` to see each ADR's number, status, and title. The script picks the directory in this order: `--dir`, then an adr-tools `.adr-dir` file, then the one existing directory among `docs/adr/`, `docs/adrs/`, `doc/adr/`, `docs/decisions/`, and `docs/architecture/decisions/`, then `docs/adr/`. When ADRs live in several of those, it stops and names them. Ask which one is authoritative, or check CLAUDE.md, AGENTS.md, or CONTRIBUTING, then pass `--dir`.

2. **Decide whether an ADR is warranted.** Write one for a decision that constrains future work, has real alternatives or trade-offs, or would otherwise need rediscovery. Don't write one for an implementation detail. If unsure, summarize the decision, alternatives, and impact, and ask the decision owner whether to record it.

3. **Generate a proposed record.**

   ```sh
   python3 ${CLAUDE_SKILL_DIR}/scripts/new_adr.py --title "Use PostgreSQL for application data"
   ```

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
