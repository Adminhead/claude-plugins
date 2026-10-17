# Technology evaluation

Read this when the question is which technology, library, framework, or tool to adopt, or how to compare several. It adds axes to the normal flow in `SKILL.md`. It doesn't change the depth rules or require a report file.

Before researching, check whether the repo already contains a suitable utility or dependency, and whether an earlier decision (an ADR or a research note) already covers the question. Searching the repo (codebase-memory `search_graph` or `search_code` when the project is indexed, grep otherwise) costs less than any web search.

## Axes

Take the axes that bear on the decision and drop the rest. Each is an independent subquestion, so spread them across parallel subagents only when each needs its own reading.

| Axis | Questions |
| --- | --- |
| Landscape | What approaches and tools exist, and who maintains them? |
| Benchmarks and their gaps | What do published benchmarks show, and which scenarios do they miss or flatter? |
| Maturity and security history | Release cadence, last major release, open and recent CVEs, how quickly past ones were fixed |
| Integration | Language and runtime support, fit with the existing stack, protocol compatibility |
| License and cost | License terms, commercial tiers, and whether they conflict with the project |
| Lock-in and migration | What adopting it commits you to, how hard it is to leave, and whether the data is portable |
| Pitfalls | Version quirks and configuration traps reported in issues, post-mortems, and migration write-ups |

For pitfalls, read the issue tracker and release notes directly. They carry the failures that marketing pages omit.

## Decision matrix

Compare the shortlist (usually two to five options) against the user's criteria, not a generic list. Weight a criterion only when the user's situation justifies it.

| Option | Fit to need | Maturity | Integration | License | Lock-in | Evidence |
| --- | --- | --- | --- | --- | --- | --- |
| | | | | | | source and accessed date |

Each cell should rest on a source you read, with an accessed date for web pages. Mark a cell unknown when you couldn't establish it. Benchmarks written by a vendor about its own product are leads, and a second independent measurement is what supports a performance claim.

## Close the evaluation

- State the recommendation, the criterion that decided it, and what would change it.
- In deep mode, run the red-team pass from `workflows.md` against the recommendation: what the strongest case for the runner-up is, and what failure would make this choice wrong.
- Reuse over novelty. If an existing dependency or the standard library covers the need, say so before recommending anything new.
