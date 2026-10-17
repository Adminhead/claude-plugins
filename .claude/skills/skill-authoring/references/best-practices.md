# Skill authoring best practices

Condensed on 2026-10-17 from:

- https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices (Anthropic, "Skill authoring best practices")
- https://agentskills.io/skill-creation/best-practices (Agent Skills, "Best practices for skill creators")
- https://agentskills.io/skill-creation/optimizing-descriptions
- https://agentskills.io/skill-creation/using-scripts
- https://agentskills.io/specification (progressive disclosure, file references)
- https://code.claude.com/docs/en/skills (content types, lifecycle, evaluation, troubleshooting)
- https://github.com/anthropics/skills/blob/main/skills/skill-creator/SKILL.md (Anthropic's skill-creator)
- Local, for the "Writing for agents" and "When to split" sections only: `3rd-party/mattpocock/skills/productivity/writing-for-agents/` and this repo's archived `archive/plugins/authoring/skills/create-skill/references/` (checked against the official docs; items that conflicted with them were dropped)

## Contents

- Start from real expertise
- Concise is key
- Progressive disclosure
- Degrees of freedom
- Writing the description
- Writing the body
- Writing for agents
- When to split
- Patterns that work
- Scripts
- Evaluation and iteration
- Anti-patterns
- Anthropic's pre-share checklist

## Start from real expertise

Asking a model to write a skill from general knowledge yields generic procedures ("follow best practices for authentication"). Feed it domain-specific material instead:

- A task just completed in conversation: the steps that worked, corrections made ("use X not Y", "check edge case Z"), input and output formats, context the agent lacked.
- Existing artifacts: runbooks, style guides, API specs and schemas, review comments and issue trackers, version-control history (fixes reveal recurring patterns), incident reports.

Scope a skill like a function: one coherent unit of work that composes with other skills. Too narrow forces several skills to load for one task; too broad is hard to trigger precisely. Querying a database and formatting results is one unit; adding database administration is probably two.

## Concise is key

The context window is shared with the system prompt, conversation, other skills' metadata and the request. Only metadata loads at startup, but once the body loads every token competes. Default assumption: Claude is already very smart. For each piece ask "would the agent get this wrong without this?" If not, cut it. Don't explain what a PDF is or how HTTP works.

Moderate detail beats exhaustive coverage. Overly comprehensive skills make the agent chase instructions that don't apply to the current task. Concise, stepwise guidance with one working example tends to win. Cover the edge cases the agent will get wrong; leave the rest to judgment.

Favor procedures over declarations: teach how to approach a class of problems, not the answer to one instance. Specific details are fine (templates, "never output PII", tool names) as long as the approach generalizes.

## Progressive disclosure

Three levels:

1. Metadata (`name` + `description`, about 100 tokens): always in context for every skill.
2. `SKILL.md` body (under 500 lines, under about 5,000 tokens): loaded when the skill activates.
3. Bundled resources (`scripts/`, `references/`, `assets/`): loaded or executed only when needed; scripts run without their source entering context.

Patterns:

- High-level guide with references: quick start inline; "Form filling: see FORMS.md", "API reference: see REFERENCE.md".
- Domain-specific organization: `references/finance.md`, `references/sales.md`; the body is a map plus a `grep -i` tip for finding a metric.
- Conditional details: basics inline, "For tracked changes: see REDLINING.md".

Rules:

- Keep references one level deep from SKILL.md. When a reference points at another reference, Claude tends to preview with `head -100` and read incomplete information.
- Tell the agent when to read each file: "Read `references/api-errors.md` if the API returns non-200" beats "see references/ for details".
- Give any reference over 100 lines a table of contents, so a partial read still shows the scope.
- Name files for their content (`form_validation_rules.md`, not `doc2.md`); organize directories by domain or feature.
- Bundle comprehensive material freely (full API docs, large examples); it costs nothing until read.
- Keep gotchas in SKILL.md itself: the agent must read them before it meets the situation, and may not recognize a trigger to load a separate file.

## Degrees of freedom

Match specificity to fragility. Claude is a robot on a path: a narrow bridge with cliffs needs exact instructions; an open field needs direction and trust.

- High freedom (prose heuristics): many valid approaches, context-dependent decisions. Code review: "check queries for SQL injection, verify auth on every endpoint, look for race conditions".
- Medium freedom (templates, scripts with parameters): a preferred pattern exists, some variation is fine.
- Low freedom (one exact script, few or no parameters): fragile, error-prone, order-sensitive. "Run exactly `python scripts/migrate.py --verify --backup`. Do not add flags."

Most skills mix these; calibrate each part independently. For flexible parts, explaining why often works better than a directive: an agent that understands the purpose makes better context-dependent decisions. Skill-creator's rule of thumb: if you find yourself writing ALWAYS or NEVER in capitals, reframe with the reason.

Provide defaults, not menus: "Use pdfplumber. For scanned PDFs needing OCR, use pdf2image with pytesseract" rather than listing four libraries as equals.

## Writing the description

The description carries the whole burden of triggering. Claude chooses among potentially 100+ skills from descriptions alone, and consults a skill only for tasks beyond what it can do directly: "read this PDF" may not trigger a PDF skill however good the description.

- Third person, injected into the system prompt: "Processes Excel files and generates reports", never "I can help you..." or "You can use this to...".
- Say both what it does and when to use it, with the keywords users type: "Extracts text and tables from PDF files, fills forms, merges documents. Use when working with PDF files or when the user mentions PDFs, forms, or document extraction."
- Focus on user intent, not internal mechanics.
- Be pushy: Claude under-triggers. List contexts where it applies, including when the user doesn't name the domain ("even if they don't explicitly mention 'CSV' or 'analysis'").
- Name the near-misses it is not for; that is what keeps a broad description precise.
- A few sentences to a short paragraph. Hard limit 1,024 characters (Claude Code lists 1,536 of description plus `when_to_use`). Key use case first.
- Avoid: "Helps with documents", "Processes data", "Does stuff with files".

Optimizing: build about 20 realistic queries, 8-10 should-trigger (varied phrasing, explicitness, length, complexity; some where the connection isn't obvious) and 8-10 should-not-trigger near-misses (shared keywords, different need; "write a fibonacci function" tests nothing). Include file paths, personal context, column names, typos. Run each several times for a trigger rate (3 runs, 0.5 threshold is a reasonable start). Split 60/40 into train and validation sets and pick the description by validation score. Generalize from failures; pasting a failed query's keywords into the description is overfitting. If stuck after a few iterations, try a structurally different description. Five iterations is usually enough.

## Writing the body

- Imperative form. State what to do.
- Reference content (conventions, patterns) runs inline alongside the conversation. Task content (deploy, commit, generate) is usually invoked directly and often gets `disable-model-invocation: true`.
- The rendered body stays in context across turns and is not re-read, so write standing instructions ("run the tests after every edit") rather than one-time steps. A rule that must hold every time belongs in a hook.
- After compaction only the first 5,000 tokens survive, so the most important instructions go at the top.
- Consistent terminology: always "API endpoint", always "field", always "extract"; don't rotate synonyms.
- No time-sensitive content ("before August 2025 use the old API"). Keep legacy behaviour in a collapsed "Old patterns" `<details>` block.
- Forward slashes only, even on Windows.
- Use fully qualified MCP tool names (`ServerName:tool_name`).
- Don't assume a package is installed; say how to install it, or declare the requirement.

## Writing for agents

Levers that apply to any document an agent consumes (a skill body, a CLAUDE.md, a reference reached through a pointer). From the local sources above; each item is consistent with the official guidance on conciseness, explaining reasons, and telling the agent when to load a file.

- A pointer (a description, or a line that names a reference) is a load contract: it states what the material is and the branches that should trigger reaching it. Its wording, not its target, decides whether Claude follows it. Sharpen a weak pointer before inlining the material.
- Two budgets: always-loaded text (descriptions, CLAUDE.md lines) costs context every turn; text behind a pointer costs only the pointer line; text with no pointer rides on the user's memory. Prune always-loaded text hardest.
- Inline what every branch of the task needs; push behind a pointer what only some branches reach. Reference material buried between steps makes attention to the steps a coin flip.
- Keep a concept's definition, rules and caveats under one heading so reading one part brings the rest.
- End each step with a completion criterion that is checkable and demanding ("every modified model accounted for" beats "produce a change list"). A fuzzy bound plus visible later steps invites finishing early.
- State the target behaviour before a prohibition; naming the forbidden behaviour alone makes it more available. Keep never-rules for costly or irreversible errors and pair each with the positive action.
- Plain imperatives with a reason where it is not obvious. Capitals and boosters (MUST, CRITICAL) tend to over-apply on current models.
- One meaning in one place. Duplication costs tokens and inflates that meaning's prominence.
- The environment is a source of truth: `--help` output, `package.json` scripts, config files and directory layout need no restating. Cache only what Claude cannot find by looking.
- Hunt no-ops sentence by sentence: an instruction the model already follows by default pays context to change nothing. Delete the sentence, not a few words of it. Settle a disagreement about a no-op by running the document.
- Prefer a compact concept the model already knows ("a tight loop", "a red test") over a sentence that gestures at the idea or a coined term that needs defining.

## When to split

Default to one file. Split a skill's content out of SKILL.md when one of these holds:

- Some invocations never need it and the request or repo shows which (a cloud provider, a database engine, an output format). SKILL.md keeps the shared steps and the choice; each variant gets a file.
- It is lookup data consulted by key (schemas, error tables, option matrices). SKILL.md keeps the verbs and decisions.
- A distinct edge case sits behind a sharp trigger (a rare input shape, a legacy format).

Splits that fail: by topic when tasks span topics (a testing skill split into unit, integration and mocks loads two or three files per task); to hit a line target (the files load together or never, and the pointers make the total longer); rare-but-critical content (a reference can be skipped, so anything that must happen stays in SKILL.md; rare plus critical often means two skills); cosmetic files named Examples, Notes or Tips with no load condition.

Decide with: can Claude detect the load condition from the request or the repo; does the split still save context after the pointer prose; is it data (can move) or sequence (usually stays); would a script do it better; how often would the file load across realistic runs (above roughly 80 percent, promote it into SKILL.md). Variant files that share most of their content merge back, and lookup data under about 50 lines is usually cheaper inline.

Split a skill into two skills when the workflows are independently useful and differ in triggers, safety boundary, tools or validation. Merge when triggers overlap heavily or the steps are normally used together. Aim for one to three plausible candidate skills per ordinary request; many near-identical descriptions hurt routing.

## Patterns that work

- Workflow with checklist: for multi-step work, give a checklist the agent copies into its response and ticks off; prevents skipped validation steps.
- Validation loop: do the work, run the validator (script, reference file or self-check), fix, repeat; only proceed when it passes.
- Plan-validate-execute: for batch or destructive operations, produce a structured plan file, validate it against a source of truth with a script, then execute, then verify. Verbose validator messages ("Field 'signature_date' not found. Available fields: ...") let the agent self-correct.
- Gotchas section: concrete corrections to assumptions the agent will otherwise make ("`users` uses soft deletes; filter `deleted_at IS NULL`"). Often the highest-value content. Add each correction the user makes.
- Output template: a concrete template beats prose; "ALWAYS use this exact template" for strict formats, "sensible default, adapt as needed" for flexible ones. Long or conditional templates go in `assets/`.
- Input/output examples: for style-sensitive output (commit messages, reports), two or three pairs convey the target better than description.
- Conditional workflow: "Creating new content? Follow the creation workflow. Editing? Follow the editing workflow." Large branches move to separate files the agent reads per task.
- Visual analysis: when inputs render as images, convert and let Claude look.

## Scripts

- Prefer a bundled script for deterministic or repeated operations: more reliable than generated code, saves tokens and time, consistent across runs. If every test run re-invents the same helper, that's the signal to bundle it.
- Solve, don't defer: handle missing files and permissions in the script instead of failing and leaving Claude to figure it out.
- No voodoo constants: justify each value in a comment (`REQUEST_TIMEOUT = 30  # typical HTTP completes in 30s; margin for slow links`).
- Say whether to run it ("Run `analyze_form.py` to extract fields") or read it ("See `analyze_form.py` for the algorithm"). Execution is the default.
- Agents work in non-interactive shells: never prompt for input; take flags, env vars or stdin, and fail with usage text when something is missing.
- Provide `--help` with a description, flags and examples; it's how the agent learns the interface. Keep it short.
- Error messages say what went wrong, what was expected and what to try (`--format must be one of: json, csv, table. Received: "xml"`).
- Structured output (JSON, CSV, TSV) on stdout, diagnostics on stderr.
- Reference scripts by path relative to the skill root (`scripts/validate.sh`); in Claude Code use `${CLAUDE_SKILL_DIR}/scripts/...` so the path survives a `cd`.
- Self-contained dependencies: PEP 723 inline metadata run with `uv run`, Deno `npm:` specifiers, Bun auto-install, Ruby `bundler/inline`. For one-off commands pin versions (`npx eslint@9.0.0`, `uvx ruff@0.8.0`) and state prerequisites (`compatibility` or a body line).
- Platform limits: claude.ai can install from npm, PyPI and GitHub; the API code-execution environment has no network and no runtime installs. List required packages.

## Evaluation and iteration

- Build evaluations first. Run Claude on representative tasks without the skill, note the specific failures, write about three scenarios that test them, measure the baseline, then write the minimum instructions that pass. Avoid documenting imagined problems.
- A triggered skill proves Claude found it, not that it did the job. Measure triggering and output quality separately.
- Test in a fresh session; authoring context masks gaps. Compare with-skill against without-skill (`skillOverrides` off for personal and project skills; `claude plugin eval` for plugin skills).
- Read the execution traces, not just the final output. Wasted steps mean instructions that are vague, inapplicable to the task, or a menu with no default.
- Two-Claude loop: Claude A drafts and refines the skill with you; Claude B (fresh instance) uses it on real tasks; bring B's misses back to A with specifics ("it forgot to filter test accounts for the regional report").
- Watch how Claude navigates: unexpected read order means the structure isn't intuitive; unfollowed references need clearer pointers; a file read every time belongs in the body; a file never read should be re-signaled or deleted.
- Test with every model you will use. Haiku: is there enough guidance? Sonnet: is it clear and efficient? Opus: does it avoid over-explaining?
- Gather team feedback: does it activate when expected, are the instructions clear, what's missing?
- Generalize from feedback. Fiddly, overfit changes and constricting MUSTs for a stubborn case rarely help; try a different metaphor or working pattern.

## Anti-patterns

- Windows-style paths.
- Offering several equal options instead of a default with an escape hatch.
- Explaining things Claude knows; verbose preambles.
- Vague or first-person descriptions; descriptions that omit when to use the skill.
- Nested reference chains; a body past 500 lines; references with no reading trigger.
- Time-sensitive instructions; inconsistent terminology.
- Scripts that defer errors to Claude, prompt interactively, print opaque errors or carry magic numbers.
- Assuming packages or tools exist.
- `context: fork` on guideline-only content (the subagent gets guidelines but no task and returns nothing useful).
- Rigid ALL-CAPS rules where a reason would do; rules tuned to the test examples rather than the class of task.

## Anthropic's pre-share checklist

Core quality:

- [ ] Description is specific and includes key terms
- [ ] Description includes both what the skill does and when to use it
- [ ] SKILL.md body is under 500 lines
- [ ] Additional details are in separate files (if needed)
- [ ] No time-sensitive information (or in an "old patterns" section)
- [ ] Consistent terminology throughout
- [ ] Examples are concrete, not abstract
- [ ] File references are one level deep
- [ ] Progressive disclosure used appropriately
- [ ] Workflows have clear steps

Code and scripts:

- [ ] Scripts solve problems rather than defer to Claude
- [ ] Error handling is explicit and helpful
- [ ] No voodoo constants (all values justified)
- [ ] Required packages listed and verified available
- [ ] Scripts have clear documentation
- [ ] No Windows-style paths
- [ ] Validation steps for critical operations
- [ ] Feedback loops for quality-critical tasks

Testing:

- [ ] At least three evaluations created
- [ ] Tested with Haiku, Sonnet and Opus
- [ ] Tested with real usage scenarios
- [ ] Team feedback incorporated (if applicable)
