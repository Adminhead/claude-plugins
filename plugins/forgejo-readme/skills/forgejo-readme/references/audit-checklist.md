# README audit checklist

Score the README as it stands before you propose any rewrite. Back every check with evidence, such as a line number, a quoted sentence or a command's output. A check with no evidence is an opinion, and the user may reject it. Put the declared audience on the first line of the report (solo developer, company or procurement evaluator, or both), because several checks resolve differently depending on it.

## Band A: blocking checks (pass or fail)

A single failure means the README is not fit to publish.

- **A1 Identity in the first two lines.** The name and one plain sentence saying what the project is come before anything the reader must scroll past. Unusual terms are defined or linked. Fail if a badge wall, a screen-sized logo or insider jargon comes first.
- **A2 The first command runs.** Run the install command and the first usage example exactly as written, in a clean temp dir, venv or container. Fail on an undocumented prerequisite, an error, or output that contradicts the README. If you cannot execute, report A2 as **unverified**, never as pass, and ask the user to run it.
- **A3 Every claim is verifiable.** List each command, flag, default, env var, config key, endpoint, exported symbol, file path, version requirement, and each behavioural claim hidden in a verb ("retries three times", "case-insensitive"). Check each one against its source of truth: the argument parser, the definition site, the route table, the CI matrix, the changelog. A performance number, compatibility matrix or scale claim needs a benchmark, CI job or changelog entry in the repo. Report the count of unverifiable claims on its own line.
- **A4 Status stated honestly.** A reader can tell whether the project is experimental, maintained, feature-frozen or looking for a maintainer without opening the commit history. Fail if the README implies more stability than the history shows.
- **A5 Licence reachable.** The licence is named and linked to the `LICENSE` file, and it matches that file. Fail if it is missing or mismatched. Also fail if a non-permissive licence is buried at the bottom, because it is the fastest disqualifier for a commercial reader.

## Band B: scored checks (0, 1 or 2 each, 16 total)

- **B1 Differentiation.** Says why to pick this over the obvious alternative, without disparaging anyone. 2 for a concrete axis (a number, a platform difference, a named trade-off), 1 for vague "simple and fast", 0 if absent. Only about a quarter of READMEs have any (Prana et al., 2019), so this is usually the highest-value fix.
- **B2 Time to a copyable command.** 2 if a pasteable command appears in the first ~400 words, 1 if it comes after a long preamble, 0 if there is no code block.
- **B3 Runnable usage example.** Real code that shows its output or effect. 2 if the same snippet exists as a file in the repo. 0 for a bare list of signatures (that is reference material, not usage).
- **B4 Funnel order.** Identity, then proof and differentiation, then usage, then install, then detail, then background. 2 if the reader can stop anywhere without having missed something that would change their decision.
- **B5 Badge discipline.** 2 for four or fewer badges, each an assessment signal (CI, version, licence, supported runtimes, maintenance), 1 for a tolerable row, 0 for a badge wall or intent-only badges ("PRs welcome"). The evidence: adding badges does not raise popularity, and heavy badge use correlates with *lower* popularity among packages that are already popular (Trockman et al., ICSE 2018). The cap of four is a working default, not a published figure.
- **B6 Nothing critical trapped in an image.** Every image has alt text, and no command, instruction or decision fact exists only inside a screenshot, diagram or GIF.
- **B7 Links resolve everywhere.** Relative links resolve on the default branch (the script checks this). If the package is published to npm or PyPI, images and links also work on the registry page. 2 only if you actually checked that render.
- **B8 Overflow lives elsewhere.** Long reference material, tutorials, config tables and community-health content are linked, not inlined. More than about 12 sections needs a reason.

## Pass bar

All five Band A checks pass **and** Band B totals **at least 14 of 16**. This bar is a working default, not a published standard. Let the user move it for a stated reason and record that reason in the report.

## Fix order

Order fixes by value per hour, not by how easy or how visible they are. The default order:

`status line > install path > claim check > differentiation paragraph > badge row > full restructure`

- The badge row is the quickest fix and nearly the least valuable, so don't lead with it.
- Promote the restructure when readers answer the cold-reader questions wrong because they never scrolled far enough, or when a launch is the reason for the audit. Say that you are promoting it.
- A project with no install step (a spec, a dataset) drops that row rather than scoring it zero forever.
- For a company or procurement audience, add one line on trust signals, present or missing: support expectation, release cadence, `SECURITY.md`, named adopters (only with permission), governance and maintainer depth, supply-chain attestation.

## Cold-reader test

After a rewrite, give the README to a fresh subagent with no repo context, or to a person, and allow about 60 seconds. Ask:

1. What is this?
2. Why would I use it instead of the alternative I know?
3. Does it fit my language, platform and licence constraints?
4. What is the first command I would run?
5. Is this project alive?

Each wrong answer points at a check: Q1 at A1, Q2 at B1, Q3 at A5 and the install requirements, Q4 at B2, Q5 at A4. The five questions and the five-of-five bar are a convention, not a published protocol.

## Statistics policy

Quote only figures you can source: Prana et al. 2019 (393 repos; "why" content in 25.7%, status in 21.4%, median 7 sections), Trockman et al. ICSE 2018 (294,941 npm packages, badges), and the GitHub 2017 Open Source Survey (64% call a licence very important when choosing a project). Refuse widely repeated but unsourced claims, such as "detailed READMEs get 50% more contributions", "a star-history chart lifts stars 15%" or "62% of top repos have GIF demos". Promise a project that is easier to evaluate, never a percentage lift in stars or installs.

## Report format

```
README audit: owner/repo   (audience: solo developer)
Band A: A1 pass · A2 FAIL (needs Node >=20, undocumented) · A3 FAIL · A4 pass · A5 pass
Claim check: 2 unverifiable: "handles 10k req/s" (no benchmark), --watch not in parser
Band B: 11/16  (B1 0, B2 2, B3 1, B4 2, B5 0, B6 2, B7 2, B8 2)
Verdict: does not pass; A2 and A3 blocking; B1 returns the most per hour

Fix in this order:
1. Document the Node >=20 requirement and re-run the install from clean (A2)
2. Remove the throughput claim; drop --watch from the docs (A3)
3. Add three sentences on why this over <alternative> (B1)
4. Cut the badge row from 9 to 3 (B5)
```

## Reading the script output

`scripts/readme_audit.sh` prints facts for the checks above: `SHADOWED` (A-level drift risk: Forgejo shows the root README and ignores copies in `docs/`, `.forgejo/`, `.gitea/` and `.github/`), `SIZE` (truncation), `HEADINGS` and `SECTION COUNT` (B4, B8), `FIRST CODE BLOCK ... after N words` (B2), `BADGES` (B5), `IMAGES WITHOUT ALT TEXT` (B6), `RAW HTML TAGS` (B7, registry risk), `ALERTS` (more than two is noisy), `BROKEN RELATIVE LINKS` (B7), `CONTENT CATEGORIES` (a heading heuristic for what, why, how, status, licence), `PLACEHOLDERS` and `HAND-WRITTEN TOC`. Treat each as a question to answer, not a verdict: a missing "Why" heading can still have the content under another title.
